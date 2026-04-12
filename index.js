const { default: makeWASocket, useMultiFileAuthState, delay } = require("@whiskeysockets/baileys")
const P = require("pino")
const fs = require("fs")

const config = require("./config.json")

let cooldown = {}

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState("session")

    const sock = makeWASocket({
        logger: P({ level: "silent" }),
        auth: state
    })

    sock.ev.on("creds.update", saveCreds)

    sock.ev.on("messages.upsert", async ({ messages }) => {
        let msg = messages[0]
        if (!msg.message) return

        let sender = msg.key.remoteJid

        // cooldown anti spam
        if (cooldown[sender]) return
        cooldown[sender] = true

        setTimeout(() => {
            delete cooldown[sender]
        }, 15000) // 15 detik

        // typing simulation
        await sock.sendPresenceUpdate("composing", sender)

        // delay random 5-10 detik
        let randomDelay = Math.floor(Math.random() * 5000) + 5000
        await delay(randomDelay)

        // menu otomatis
        let text = `
Halo 👋

Silakan pilih promo:

1️⃣ Paling Murah  
2️⃣ Tebus Heboh  
3️⃣ Beli Banyak Lebih Hemat  

Ketik angka 1 / 2 / 3
`

        await sock.sendMessage(sender, { text })
    })

    sock.ev.on("messages.upsert", async ({ messages }) => {
        let msg = messages[0]
        if (!msg.message?.conversation) return

        let text = msg.message.conversation
        let sender = msg.key.remoteJid

        await sock.sendPresenceUpdate("composing", sender)
        await delay(3000)

        if (text === "1") {
            await sock.sendMessage(sender, {
                image: fs.readFileSync("./images/murah.jpg"),
                caption: "🔥 Promo Paling Murah"
            })
        }

        if (text === "2") {
            await sock.sendMessage(sender, {
                image: fs.readFileSync("./images/tebus.jpg"),
                caption: "🎉 Tebus Heboh"
            })
        }

        if (text === "3") {
            await sock.sendMessage(sender, {
                image: fs.readFileSync("./images/hemat.jpg"),
                caption: "💰 Beli Banyak Lebih Hemat"
            })
        }
    })
}

startBot()
