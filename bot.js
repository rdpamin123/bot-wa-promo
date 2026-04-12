const { default: makeWASocket, useMultiFileAuthState } = require("@whiskeysockets/baileys")
const P = require("pino")
const axios = require("axios")
const fs = require("fs")

const repo = "https://raw.githubusercontent.com/rdpamin/bot-wa-promo/main/"

let localVersion = 1
const userCooldown = {}

function delay(ms){
return new Promise(resolve => setTimeout(resolve, ms))
}

function randomDelay(){
return Math.floor(Math.random() * (10000 - 5000 + 1)) + 5000
}

// AUTO UPDATE BOT

async function checkUpdate(){

try{

const res = await axios.get(repo + "version.json")

if(res.data.version > localVersion){

console.log("Update bot ditemukan")

const script = await axios.get(repo + "bot.js")

fs.writeFileSync("bot.js", script.data)

console.log("Bot diperbarui")

process.exit()

}

}catch(e){

console.log("cek update gagal")

}

}

setInterval(checkUpdate,300000)

// FUNGSI MENU

async function sendMenu(sock, from){

const buttons=[

{buttonId:"murah",buttonText:{displayText:"Paling Murah"},type:1},

{buttonId:"tebus",buttonText:{displayText:"Tebus Heboh"},type:1},

{buttonId:"hemat",buttonText:{displayText:"Beli Banyak Hemat"},type:1}

]

const buttonMessage={

text:"Silakan pilih kategori promo",

buttons:buttons,

headerType:1

}

await sock.sendMessage(from,buttonMessage)

}

// START BOT

async function startBot(){

const { state, saveCreds } = await useMultiFileAuthState("session")

const sock = makeWASocket({

logger:P({level:"silent"}),

auth:state

})

sock.ev.on("creds.update", saveCreds)

sock.ev.on("messages.upsert", async ({messages}) => {

const msg = messages[0]

if(!msg.message) return

const from = msg.key.remoteJid

const text = msg.message.conversation || msg.message.extendedTextMessage?.text

if(!text) return

// COOLDOWN USER

const now = Date.now()

if(userCooldown[from] && now - userCooldown[from] < 15000){
return
}

userCooldown[from] = now

// STATUS MENGETIK

await sock.sendPresenceUpdate("composing", from)

// DELAY RANDOM

await delay(randomDelay())

// JIKA BUKAN PILIHAN MENU

if(text != "murah" && text != "tebus" && text != "hemat"){

await sendMenu(sock, from)

return

}

// PALING MURAH

if(text=="murah"){

await sock.sendMessage(from,{
image:{url:repo+"paling-murah.jpg"},
caption:"Promo Paling Murah"
})

}

// TEBUS HEBOH

if(text=="tebus"){

await sock.sendMessage(from,{
image:{url:repo+"tebus-heboh.jpg"},
caption:"Promo Tebus Heboh"
})

}

// BELI BANYAK HEMAT

if(text=="hemat"){

await sock.sendMessage(from,{
image:{url:repo+"beli-banyak.jpg"},
caption:"Beli Banyak Lebih Hemat"
})

}

})

}

startBot()
