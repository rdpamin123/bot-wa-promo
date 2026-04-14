const {
    makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    proto,
    generateWAMessageFromContent,
    Browsers
} = require('@whiskeysockets/baileys');
const fs = require('fs-extra');
const path = require('path');
const readline = require('readline');
const config = require('./config');

// ==================== HELPER FUNCTIONS ====================
const randomDelay = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Cooldown user
const userCooldowns = new Map();

// Dapatkan gambar random dari folder
const getRandomImageFromFolder = (folderPath) => {
    try {
        if (!fs.existsSync(folderPath)) return null;
        const files = fs.readdirSync(folderPath).filter(file => {
            const ext = path.extname(file).toLowerCase();
            return ['.jpg', '.jpeg', '.png'].includes(ext);
        });
        if (files.length === 0) return null;
        const randomFile = files[Math.floor(Math.random() * files.length)];
        return path.join(folderPath, randomFile);
    } catch (err) {
        console.error('Error membaca folder:', err);
        return null;
    }
};

// Input dari terminal
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});
const question = (text) => new Promise(resolve => rl.question(text, resolve));

// Kirim pesan tombol interaktif (4 pilihan)
const sendInteractiveButtons = async (sock, jid, text, buttons) => {
    const msg = generateWAMessageFromContent(jid, {
        viewOnceMessage: {
            message: {
                interactiveMessage: {
                    body: { text },
                    nativeFlowMessage: {
                        buttons: buttons.map((btn, index) => ({
                            name: "quick_reply",
                            buttonParamsJson: JSON.stringify({
                                display_text: btn.displayText,
                                id: btn.id
                            })
                        }))
                    }
                }
            }
        }
    }, {});
    await sock.relayMessage(jid, msg.message, { messageId: msg.key.id });
};

// ==================== FUNGSI LOGIN DENGAN PAIRING CODE ====================
const startBot = async () => {
    const { state, saveCreds } = await useMultiFileAuthState(config.sessionName);
    
    // Minta nomor HP jika belum ada di config
    let phoneNumber = config.botNumber;
    if (!phoneNumber) {
        console.log('\n📱 Masukkan nomor WhatsApp untuk bot:');
        console.log('   (Format internasional tanpa +, contoh: 6281234567890)');
        phoneNumber = await question('   Nomor: ');
    }
    
    // Bersihkan nomor
    phoneNumber = phoneNumber.replace(/[^0-9]/g, '');
    
    const sock = makeWASocket({
        auth: state,
        browser: Browsers.ubuntu('Termux Bot'),
        printQRInTerminal: false, // Tidak perlu QR
        mobile: true, // Gunakan mobile API untuk pairing code
        markOnlineOnConnect: true,
    });

    // Minta pairing code
    if (!sock.authState.creds.registered) {
        console.log('\n🔐 Meminta kode pairing...');
        const code = await sock.requestPairingCode(phoneNumber);
        console.log('\n✅ Kode pairing Anda: *' + code + '*');
        console.log('📲 Buka WhatsApp di HP Anda, lalu:');
        console.log('   1. Buka menu "Perangkat Tertaut"');
        console.log('   2. Ketuk "Tautkan Perangkat"');
        console.log('   3. Pilih "Tautkan dengan nomor telepon"');
        console.log('   4. Masukkan kode 8 digit di atas\n');
        console.log('⏳ Menunggu konfirmasi...\n');
    }

    // Handle event connection update
    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;
        
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('⚠️ Koneksi terputus, mencoba reconnect...', shouldReconnect);
            if (shouldReconnect) {
                startBot();
            } else {
                console.log('❌ Logout terdeteksi. Hapus folder auth_info_baileys untuk login ulang.');
                process.exit(1);
            }
        } else if (connection === 'open') {
            console.log('\n🎉 *Bot berhasil terhubung!*');
            console.log('   Nomor aktif:', sock.user.id.split(':')[0]);
            console.log('   Bot siap menerima chat.\n');
        }
    });

    // Simpan kredensial saat update
    sock.ev.on('creds.update', saveCreds);

    // ==================== HANDLE PESAN MASUK ====================
    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];
        if (!msg.message || msg.key.fromMe) return;
        
        const sender = msg.key.remoteJid;
        const isGroup = sender.endsWith('@g.us');
        if (isGroup) return; // Bot hanya respon chat pribadi
        
        const messageContent = msg.message;
        const textMessage = messageContent.conversation || 
                           messageContent.extendedTextMessage?.text || 
                           messageContent.imageMessage?.caption || '';
        
        // Cek cooldown user
        const now = Date.now();
        const cooldownEnd = userCooldowns.get(sender);
        if (cooldownEnd && now < cooldownEnd) {
            const remaining = Math.ceil((cooldownEnd - now) / 1000);
            console.log(`User ${sender} dalam cooldown ${remaining} detik`);
            return;
        }

        // Cek apakah pesan adalah respons dari tombol (interactive)
        const buttonResponse = messageContent.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson;
        let selectedOption = null;
        if (buttonResponse) {
            try {
                const parsed = JSON.parse(buttonResponse);
                selectedOption = parsed.id;
            } catch (e) {}
        }

        // Set cooldown user
        userCooldowns.set(sender, now + config.userCooldown * 1000);
        setTimeout(() => userCooldowns.delete(sender), config.userCooldown * 1000);

        // Proses perintah
        if (selectedOption) {
            await handleCategorySelection(sock, sender, selectedOption);
        } else if (textMessage.toLowerCase().includes('menu') || !selectedOption) {
            await sendMainMenu(sock, sender);
        }
    });

    // ==================== KIRIM MENU UTAMA ====================
    const sendMainMenu = async (sock, jid) => {
        // Delay sebelum reply
        await sleep(randomDelay(config.replyDelay.min, config.replyDelay.max));
        
        // Typing effect
        await sock.sendPresenceUpdate('composing', jid);
        await sleep(randomDelay(config.typingDelay.min, config.typingDelay.max));
        
        // Buttons
        const buttons = [
            { displayText: '🔥 Paling Murah', id: 'paling_murah' },
            { displayText: '⚡ Tebus Heboh', id: 'tebus_heboh' },
            { displayText: '📅 Hemat Minggu Ini', id: 'hemat_minggu_ini' },
            { displayText: '🛒 Beli Banyak', id: 'beli_banyak' }
        ];
        
        await sendInteractiveButtons(sock, jid, config.menuText, buttons);
        await sock.sendPresenceUpdate('paused', jid);
    };

    // ==================== HANDLE PILIHAN KATEGORI ====================
    const handleCategorySelection = async (sock, jid, categoryId) => {
        const categoryKey = categoryId;
        const folderPath = config.imagePaths[categoryKey];
        
        if (!folderPath) {
            await sock.sendMessage(jid, { text: '❌ Kategori tidak valid.' });
            return;
        }

        // Typing
        await sock.sendPresenceUpdate('composing', jid);
        await sleep(randomDelay(1500, 2500));
        
        // Cari gambar random
        const imagePath = getRandomImageFromFolder(folderPath);
        if (!imagePath) {
            await sock.sendMessage(jid, { text: `⚠️ Maaf, gambar untuk kategori ${categoryKey.replace(/_/g, ' ')} belum tersedia.` });
            await sock.sendPresenceUpdate('paused', jid);
            // Tanya lagi
            await sleep(1000);
            await askForMore(sock, jid);
            return;
        }

        // Kirim gambar dengan caption
        const caption = config.imageCaption[categoryKey] || 'Promo spesial!';
        const imageBuffer = await fs.readFile(imagePath);
        
        await sock.sendMessage(jid, {
            image: imageBuffer,
            caption: caption,
            mimetype: 'image/jpeg'
        });
        
        await sock.sendPresenceUpdate('paused', jid);
        
        // Delay sebentar lalu tanya lagi
        await sleep(2000);
        await askForMore(sock, jid);
    };

    // ==================== TANYA LAGI SETELAH KIRIM GAMBAR ====================
    const askForMore = async (sock, jid) => {
        // Kirim pesan teks tanya dulu
        await sock.sendPresenceUpdate('composing', jid);
        await sleep(1500);
        await sock.sendMessage(jid, { text: config.askAgainText });
        await sock.sendPresenceUpdate('paused', jid);
        
        // Kirim ulang menu tombol
        await sleep(1000);
        await sendMainMenu(sock, jid);
    };

    // ==================== CLEANUP ====================
    rl.on('close', () => {
        console.log('Bot dimatikan.');
        process.exit(0);
    });
};

// Jalankan bot
startBot().catch(err => console.error('Error:', err));
