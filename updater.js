const { exec } = require("child_process")

setInterval(() => {
    exec("git pull", (err, stdout) => {
        if (stdout) console.log("Update:", stdout)
    })
}, 60000) // cek tiap 1 menit
