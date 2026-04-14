import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  makeInMemoryStore,
  delay,
  fetchLatestBaileysVersion,
  Browsers
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import pino from 'pino';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Konfigurasi logger (bisa dimatikan jika terlalu banyak log)
const logger = pino({ level: 'silent' });

// Folder session
const AUTH_FOLDER = './auth_info_baileys';

// Folder gambar
const IMAGE_DIR = path.join(__dirname, 'images');
const imageMap = {
  '1': 'murah.jpg',
  '2': 'tebus.jpg',
  '3': 'hemat.jpg',
  '4': 'banyak.jpg'
};

// Delay acak antara 0.5 - 2.5 detik (dalam milidetik)
function randomDelay() {
  return Math.floor(Math.random() * 2000) + 500;
}

// Fungsi untuk mengirim pesan dengan efek mengetik dan delay
async function sendWithTyping(sock, jid, content, options = {}) {
  await sock.presenceSubscribe(jid);
  await delay(500);
  await sock.sendPresenceUpdate('composing', jid);
  await delay(randomDelay());
  await sock.sendPresenceUpdate('paused', jid);
  
  if (typeof content === 'string') {
    return await sock.sendMessage(jid, { text: content }, options);
  } else {
    // content berupa object Message (misal image)
    return await sock.sendMessage(jid, content, options);
  }
}

// Fungsi utama
async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_FOLDER);
  const { version, isLatest } = await fetchLatestBaileysVersion();
  
  const sock = makeWASocket({
    version,
    logger,
    printQRInTerminal: false,
    auth: state,
    browser: Browsers.ubuntu('Chrome'),
    markOnlineOnConnect: true,
    generateHighQualityLinkPreview: true
  });

  // Simpan kredensial saat diperbarui
  sock.ev.on('creds.update', saveCreds);

  // Event saat koneksi terhubung
  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;
    
    if (qr) {
      console.log('Scan QR Code ini di WhatsApp Web:');
      console.log(qr);
    }
    
    if (connection === 'close') {
      const shouldReconnect = (lastDisconnect?.error instanceof Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
      console.log('Koneksi terputus, mencoba reconnect...', shouldReconnect);
      if (shouldReconnect) {
        startBot();
      } else {
        console.log('Logout. Hapus folder auth_info_baileys untuk login ulang.');
      }
    } else if (connection === 'open') {
      console.log('✅ Bot WhatsApp siap! Nomor:', sock.user.id.split(':')[0]);
    }
  });

  // Event menerima pesan
  sock.ev.on('messages.upsert', async (m) => {
    const msg = m.messages[0];
    if (!msg.message) return;
    if (msg.key.fromMe) return; // abaikan pesan sendiri
    
    const from = msg.key.remoteJid;
    const messageType = Object.keys(msg.message)[0];
    
    // Hanya proses pesan teks (conversation atau extendedText)
    let text = '';
    if (messageType === 'conversation') {
      text = msg.message.conversation;
    } else if (messageType === 'extendedTextMessage') {
      text = msg.message.extendedTextMessage.text;
    } else {
      return;
    }
    
    // Kirim balasan dengan menu 4 kategori (apapun teksnya)
    const menuText = `👋 Halo! Silakan pilih kategori promo kami:\n\n` +
                     `1️⃣ *Paling Murah*\n` +
                     `2️⃣ *Tebus Heboh*\n` +
                     `3️⃣ *Hemat Minggu Ini*\n` +
                     `4️⃣ *Beli Banyak*\n\n` +
                     `Balas dengan angka 1, 2, 3, atau 4 ya.`;
    
    await sendWithTyping(sock, from, menuText);
  });

  // Event saat ada balasan (reply) dari user yang memilih angka
  sock.ev.on('messages.upsert', async (m) => {
    const msg = m.messages[0];
    if (!msg.message) return;
    if (msg.key.fromMe) return;
    
    const from = msg.key.remoteJid;
    const messageType = Object.keys(msg.message)[0];
    let text = '';
    if (messageType === 'conversation') {
      text = msg.message.conversation;
    } else if (messageType === 'extendedTextMessage') {
      text = msg.message.extendedTextMessage.text;
    } else {
      return;
    }
    
    // Cek apakah pesan adalah pilihan angka 1-4
    const choice = text.trim();
    if (!['1','2','3','4'].includes(choice)) return;
    
    const imageFile = imageMap[choice];
    if (!imageFile) return;
    
    const imagePath = path.join(IMAGE_DIR, imageFile);
    
    // Cek apakah file gambar ada
    if (!fs.existsSync(imagePath)) {
      await sendWithTyping(sock, from, '❌ Maaf, gambar untuk kategori ini belum tersedia.');
      return;
    }
    
    // Kirim gambar dengan caption singkat
    const captionMap = {
      '1': '🛒 *Paling Murah* - Harga spesial hanya untuk kamu!',
      '2': '🔥 *Tebus Heboh* - Diskon gila-gilaan!',
      '3': '📅 *Hemat Minggu Ini* - Promo mingguan terbatas.',
      '4': '📦 *Beli Banyak* - Makin banyak makin hemat!'
    };
    
    const imageBuffer = fs.readFileSync(imagePath);
    
    // Kirim efek mengetik
    await sock.presenceSubscribe(from);
    await delay(500);
    await sock.sendPresenceUpdate('composing', from);
    await delay(randomDelay());
    await sock.sendPresenceUpdate('paused', from);
    
    // Kirim gambar
    await sock.sendMessage(from, {
      image: imageBuffer,
      caption: captionMap[choice],
      mimetype: 'image/jpeg'
    });
  });
}

// Jalankan bot
startBot().catch(err => console.error('Error:', err));
