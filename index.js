const {
    makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    generateWAMessageFromContent,
    Browsers,
    fetchLatestBaileysVersion
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
                        buttons: buttons.map((btn) => ({
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
    
    // Ambil versi terbaru Baileys (opsional)
    const { version } = await fetchLatestBaileysVersion();
    
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
        version,
        auth: state,
        browser: Browsers.ubuntu('Termux Bot'),
        printQRInTerminal: false, // Kita pakai pairing code dulu
        markOnlineOnConnect: true,
    });

    // Minta pairing code jika belum terdaftar
    if (!sock.authState.creds.registered) {
        console.log('\n🔐 Meminta kode pairing...');
        try {
            const code = await sock.requestPairingCode(phoneNumber);
            console.log('\n✅ Kode pairing Anda: *' + code + '*');
            console.log('📲 Buka WhatsApp di HP Anda, lalu:');
            console.log('   1. Buka menu "Perangkat Tertaut"');
            console.log('   2. Ketuk "Tautkan Perangkat"');
            console.log('   3. Pilih "Tautkan dengan nomor telepon"');
            console.log('   4. Masukkan kode 8 digit di atas\n');
            console.log('⏳ Menunggu konfirmasi...\n');
        } catch (err) {
            console.log('⚠️ Gagal meminta kode pairing, menggunakan QR code sebagai fallback.');
            console.log('   Scan QR code yang muncul di bawah:\n');
            sock.ev.off('connection.update'); // Matikan listener sementara agar QR bisa tampil
            // Recreate socket dengan QR enabled
            const sockQR = makeWASocket({
                version,
                auth: state,
                browser: Browsers.ubuntu('Termux Bot'),
                printQRInTerminal: true,
                markOnlineOnConnect: true,
            });
            // Tunggu koneksi
            sockQR.ev.on('connection.update', (update) => {
                const { connection, qr } = update;
                if (qr) {
                    require('qrcode-terminal').generate(qr, { small: true });
                }
                if (connection === 'open') {
                    console.log('\n🎉 Bot berhasil terhubung via QR!');
                    // Lanjutkan dengan socket QR
                    setupMessageHandlers(sockQR);
                }
            });
            sockQR.ev.on('creds.update', saveCreds);
            return; // Hentikan eksekusi lebih lanjut di fungsi ini
        }
    }

    // Handle event connection update
    sock.ev.on('connection.update', (update) => {
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
            setupMessageHandlers(sock);
        }
    });

    sock.ev.on('creds.update', saveCreds);
};

// ==================== SETUP MESSAGE HANDLER ====================
function setupMessageHandlers(sock) {
    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];
        if (!msg.message || msg.key.fromMe) return;
        
        const sender = msg.key.remoteJid;
        const isGroup = sender.endsWith('@g.us');
        if (isGroup) return;
        
        const messageContent = msg.message;
        const textMessage = messageContent.conversation || 
                           messageContent.extendedTextMessage?.text || 
                           messageContent.imageMessage?.caption || '';
        
        // Cek cooldown user
        const now = Date.now();
        const cooldownEnd = userCooldowns.get(sender);
        if (cooldownEnd && now < cooldownEnd) {
            return;
        }

        // Cek tombol interaktif
        const buttonResponse = messageContent.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson;
        let selectedOption = null;
        if (buttonResponse) {
            try {
                const parsed = JSON.parse(buttonResponse);
                selectedOption = parsed.id;
            } catch (e) {}
        }

        userCooldowns.set(sender, now + config.userCooldown * 1000);
        setTimeout(() => userCooldowns.delete(sender), config.userCooldown * 1000);

        if (selectedOption) {
            await handleCategorySelection(sock, sender, selectedOption);
        } else {
            await sendMainMenu(sock, sender);
        }
    });
}

// ==================== MENU & KATEGORI ====================
const sendMainMenu = async (sock, jid) => {
    await sleep(randomDelay(config.replyDelay.min, config.replyDelay.max));
    await sock.sendPresenceUpdate('composing', jid);
    await sleep(randomDelay(config.typingDelay.min, config.typingDelay.max));
    
    const buttons = [
        { displayText: '🔥 Paling Murah', id: 'paling_murah' },
        { displayText: '⚡ Tebus Heboh', id: 'tebus_heboh' },
        { displayText: '📅 Hemat Minggu Ini', id: 'hemat_minggu_ini' },
        { displayText: '🛒 Beli Banyak', id: 'beli_banyak' }
    ];
    
    await sendInteractiveButtons(sock, jid, config.menuText, buttons);
    await sock.sendPresenceUpdate('paused', jid);
};

const handleCategorySelection = async (sock, jid, categoryId) => {
    const folderPath = config.imagePaths[categoryId];
    if (!folderPath) {
        await sock.sendMessage(jid, { text: '❌ Kategori tidak valid.' });
        return;
    }

    await sock.sendPresenceUpdate('composing', jid);
    await sleep(randomDelay(1500, 2500));
    
    const imagePath = getRandomImageFromFolder(folderPath);
    if (!imagePath) {
        await sock.sendMessage(jid, { text: `⚠️ Maaf, gambar untuk kategori ${categoryId.replace(/_/g, ' ')} belum tersedia.` });
        await sock.sendPresenceUpdate('paused', jid);
        await sleep(1000);
        await askForMore(sock, jid);
        return;
    }

    const caption = config.imageCaption[categoryId] || 'Promo spesial!';
    const imageBuffer = await fs.readFile(imagePath);
    
    await sock.sendMessage(jid, {
        image: imageBuffer,
        caption: caption,
        mimetype: 'image/jpeg'
    });
    
    await sock.sendPresenceUpdate('paused', jid);
    await sleep(2000);
    await askForMore(sock, jid);
};

const askForMore = async (sock, jid) => {
    await sock.sendPresenceUpdate('composing', jid);
    await sleep(1500);
    await sock.sendMessage(jid, { text: config.askAgainText });
    await sock.sendPresenceUpdate('paused', jid);
    await sleep(1000);
    await sendMainMenu(sock, jid);
};

// ==================== START BOT ====================
startBot().catch(err => console.error('Error:', err));
