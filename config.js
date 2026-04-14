module.exports = {
    // Nama folder penyimpanan sesi login
    sessionName: 'auth_info_baileys',
    
    // Nomor WhatsApp bot (format internasional tanpa +, contoh: 6281234567890)
    // Bisa dikosongkan, nanti akan diminta saat bot dijalankan
    botNumber: '',
    
    // Delay typing (milidetik)
    typingDelay: { min: 2000, max: 4000 },
    
    // Delay sebelum membalas chat (milidetik)
    replyDelay: { min: 1000, max: 2500 },
    
    // Cooldown per user (detik)
    userCooldown: 10,
    
    // Path folder gambar
    imagePaths: {
        'paling_murah': './images/murah.jpg',
        'tebus_heboh': './images/heboh.jpg',
        'hemat_minggu_ini': './images/hemat.jpg',
        'beli_banyak': './images/banyak.jpg'
    },
    
    // Teks menu utama
    menuText: `🛍️ *PROMO SPESIAL HARI INI* 🛍️

Silakan pilih kategori promo yang Anda inginkan:`,
    
    // Caption saat mengirim gambar
    imageCaption: {
        'paling_murah': '🔥 *PALING MURAH* 🔥\nHarga termurah se-Indonesia! Buruan cek.',
        'tebus_heboh': '⚡ *TEBUS HEBOH* ⚡\nDiskon besar-besaran! Jangan sampai ketinggalan.',
        'hemat_minggu_ini': '📅 *HEMAT MINGGU INI* 📅\nPromo terbatas hanya minggu ini.',
        'beli_banyak': '🛒 *BELI BANYAK LEBIH HEMAT* 🛒\nMakin banyak beli, makin murah harganya!'
    },
    
    // Teks tanya lagi setelah kirim gambar
    askAgainText: '✨ Mau lihat promo apa lagi? ✨\nKetik *menu* atau pilih dari tombol di bawah.'
};
