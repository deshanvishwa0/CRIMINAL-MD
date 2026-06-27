const { 
    downloadMediaMessage, 
    generateWAMessageFromContent, 
    proto 
} = require('dct-dev-private-baileys');
const express = require('express');
const app = express();
__path = process.cwd()
const bodyParser = require("body-parser");
const PORT = process.env.PORT || 5000;
let code = require('./pair'); 

require('events').EventEmitter.defaultMaxListeners = 500;

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.use('/code', code);
app.use('/pair', async (req, res, next) => {
    res.sendFile(__path + '/pair.html')
});
app.use('/dashboard', async (req, res, next) => {
    res.sendFile(__path + '/dashboard.html')
});
app.use('/', async (req, res, next) => {
    res.sendFile(__path + '/main.html')
});

const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`
KEZU KOLLA ON FIRE ! 🫡


Server running on http://localhost:` + PORT)
});

server.keepAliveTimeout = 120000;
server.headersTimeout = 125000;

setInterval(() => {
    const http = require('http');
    const req = http.get(`http://localhost:${PORT}/code/ping`, (res) => {
        res.resume();
    });
    req.on('error', () => {});
    req.end();
}, 4 * 60 * 1000);

module.exports = app;
