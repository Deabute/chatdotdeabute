// monolithic_server.js ~ Copyright 2020 Paul Beaudet ~ MIT License
const express = require('express')
const app = express()
const path = require('path')
const WebSocket = require('ws')
const yaml = require('js-yaml') // read serverless.yml file
const fs = require('fs')        // built in file system library

const socket = {
    server: null,
    connections: [],
    createOid: function () {
        const increment = Math.floor(Math.random() * (16777216)).toString(16)
        const pid = Math.floor(Math.random() * (65536)).toString(16)
        const machine = Math.floor(Math.random() * (16777216)).toString(16)
        const timestamp = Math.floor(new Date().valueOf() / 1000).toString(16)
        return '00000000'.substr(0, 8 - timestamp.length) + timestamp + '000000'.substr(0, 6 - machine.length) + machine +
            '0000'.substr(0, 4 - pid.length) + pid + '000000'.substr(0, 6 - increment.length) + increment;
    },
    init: function (server) {
        socket.server = new WebSocket.Server({
            server: server,
            autoAcceptConnections: false
        })
        socket.server.on('connection', function connection(ws) {
            ws.on('message', function incoming(message) {                          // handle incoming request
                const connectionId = socket.createOid()
                const sendFunc = socket.send(ws)
                socket.connections.push({ connectionId: connectionId, sendFunc: sendFunc })
                socket.incoming(message, sendFunc, connectionId)
            });
        });
    },
    send: function (ws) {
        return function (msgObj) {
            let msg = ''
            try { msg = JSON.stringify(msgObj); } catch (err) { console.log(error); }
            console.log('response from server ' + msg)
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(msg)
                return true
            } else { return false }
        };
    },
    sendTo: function (oid, msgObj) {
        let msg = ''
        try { msg = JSON.stringify(msgObj) } catch (err) { console.log(error) }
        console.log('response from server ' + msg)
        for (var i = 0; i < socket.connections.length; i++) {
            if (socket.connections[i].connectionId === oid) {
                if (socket.connections[i].sendFunc(msgObj)) { return true }
                else { return false }
            }
        }
        return false
    },
    on: function (action, func) { socket.handlers.push({ action: action, func: func }) },
    handlers: [{ action: 'msg', func: function (req) { console.log(req.msg) } }],
    incoming: function (event, sendFunc, connectionId) {                       // handle incoming socket messages
        let req = { action: null }
        try { req = JSON.parse(event) } catch (error) { console.log(error) } // if error we don't care there is a default object
        function apiGWCallback(firstArg, secondArg) { console.log(JSON.stringify(secondArg)) }
        for (var h = 0; h < socket.handlers.length; h++) {
            if (req.action === socket.handlers[h].action) {
                apiGWEvent = { body: event, deabute: { sendTo: socket.sendTo, response: sendFunc }, requestContext: { connectionId: connectionId } }
                socket.handlers[h].func(apiGWEvent, {}, apiGWCallback)
                return
            }
        }
        if (req.message === 'Internal server error') { console.log('Oops something when wrong: ' + JSON.stringify(req)); return; }
        console.log('no handler ' + event);
    }
}

const serverless = {
    read: function (onFinish) {
        fs.readFile('serverless.yml', 'utf8', function (err, data) {
            onFinish(yaml.safeLoad(data))   // pass env vars and call next thing to do
        });
    },
    forFunctions: function (on) {
        return function (config) {
            if (config.functions) {
                for (let key in config.functions) {
                    const handler = config.functions[key].handler.split('.')
                    const funcName = handler[1]
                    const mod = require(path.join(__dirname, handler[0]))
                    on(config.functions[key].events[0].websocket.route, mod[funcName])
                }
            } else { console.log('not the serverless we are looking for or the one we need') }
        }
    }
}

module.exports = function serve() {
    app.use(express.static('build'))
    const router = express.Router()
    router.get('/:erm', function (req, res) {
        res.status(200)
        res.sendFile(path.join(__dirname + '/build/index.html'))
    })
    app.use(router)
    const web_server = app.listen(process.env.PORT)
    socket.init(web_server); // set up socket server and related event handlers
    serverless.read(serverless.forFunctions(socket.on))
}

if (!module.parent) { serve() } // run server if called stand alone
