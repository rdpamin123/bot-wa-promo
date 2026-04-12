const { default: makeWASocket, useSingleFileAuthState } = require("@whiskeysockets/baileys")
const fs = require("fs")
const P = require("pino")

const { state, saveState } = useSingleFileAuthState("./session.json")

let cooldown = {}

async function startBot() {
    const sock = makeWASocket({
        logger: P({ level: "silent" }),
        auth: state,
        printQRInTerminal: true
    })

    sock.ev.on("creds.update", saveState)

    sock.ev.on("messages.upsert", async ({ messages }) => {
        const msg = messages[0]
        if (!msg.message) return

        const sender = msg.key.remoteJid

        const text =
            msg.message.conversation ||
            msg.message.extendedTextMessage?.text ||
            ""

        if (cooldown[sender]) return
        cooldown[sender] = true
        setTimeout(() => delete cooldown[sender], 15000)

        await sock.sendPresenceUpdate("composing", sender)

        const delayTime = Math.floor(Math.random() * 5000) + 5000
        await new Promise(r => setTimeout(r, delayTime))

        if (text !== "1" && text !== "2" && text !== "3") {
            await sock.sendMessage(sender, {
                text: `Halo 👋

Pilih promo:

1. Paling Murah
2. Tebus Heboh
3. Beli Banyak Lebih Hemat

Ketik 1 / 2 / 3`
            })
        }

        if (text === "1") {
            await sock.sendMessage(sender, {
                image: fs.readFileSync("./images/murah.jpg"),
                caption: "Promo Paling Murah"
            })
        }

        if (text === "2") {
            await sock.sendMessage(sender, {
                image: fs.readFileSync("./images/tebus.jpg"),
                caption: "Tebus Heboh"
            })
        }

        if (text === "3") {
            await sock.sendMessage(sender, {
                image: fs.readFileSync("./images/hemat.jpg"),
                caption: "Beli Banyak Lebih Hemat"
            })
        }
    })
}

startBot()
