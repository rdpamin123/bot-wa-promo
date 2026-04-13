const { default: makeWASocket, useSingleFileAuthState, delay } = require("@adiwajshing/baileys")
const fs = require("fs")
const axios = require("axios")

const { state, saveState } = useSingleFileAuthState("./session.json")

const config = require("./config.json")

function randomDelay() {
    const min = config.delay_min
    const max = config.delay_max
    return Math.floor(Math.random() * (max - min + 1)) + min
}

async function startBot() {
    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: true
    })

    sock.ev.on("creds.update", saveState)

    sock.ev.on("messages.upsert", async (msg) => {
        try {
            const m = msg.messages[0]
            if (!m.message) return
            const from = m.key.remoteJid

            // status typing
            await sock.sendPresenceUpdate("composing", from)

            await delay(randomDelay())

            // menu
            const text = `
Halo kak 👋

Pilih promo:
1. Paling Murah
2. Tebus Heboh
3. Beli Banyak Lebih Hemat

Ketik angka ya 😊
            `
            await sock.sendMessage(from, { text })

            // kirim gambar
            await delay(randomDelay())

            await sock.sendMessage(from, {
                image: { url: config.github_raw + "images/murah.jpg" },
                caption: "🔥 Paling Murah"
            })

            await delay(randomDelay())

            await sock.sendMessage(from, {
                image: { url: config.github_raw + "images/tebus.jpg" },
                caption: "🎉 Tebus Heboh"
            })

            await delay(randomDelay())

            await sock.sendMessage(from, {
                image: { url: config.github_raw + "images/hemat.jpg" },
                caption: "💰 Beli Banyak Lebih Hemat"
            })

        } catch (err) {
            console.log(err)
        }
    })
}

startBot()
