// monolithic_server.js ~ Copyright 2019-2020 Paul Beaudet ~ MIT License
const express = require('express');
const app = express();
const path = require('path');
const WebSocket = require('ws');
const yaml = require('js-yaml'); // read serverless.yml file
const fs = require('fs'); // built in file system library

const socket = {
  server: null,
  connections: [],
  createOid: () => {
    const increment = Math.floor(Math.random() * 16777216).toString(16);
    const pid = Math.floor(Math.random() * 65536).toString(16);
    const machine = Math.floor(Math.random() * 16777216).toString(16);
    const timestamp = Math.floor(new Date().valueOf() / 1000).toString(16);
    return (
      '00000000'.substr(0, 8 - timestamp.length) +
      timestamp +
      '000000'.substr(0, 6 - machine.length) +
      machine +
      '0000'.substr(0, 4 - pid.length) +
      pid +
      '000000'.substr(0, 6 - increment.length) +
      increment
    );
  },
  init: server => {
    socket.server = new WebSocket.Server({
      server,
      autoAcceptConnections: false,
    });
    socket.server.on('connection', ws => {
      // handle incoming request
      ws.on('message', message => {
        const connectionId = socket.createOid();
        const sendFunc = socket.send(ws);
        socket.connections.push({
          connectionId,
          sendFunc,
        });
        socket.incoming(message, sendFunc, connectionId);
      });
    });
  },
  send: ws => {
    return msgObj => {
      let msg = '';
      try {
        msg = JSON.stringify(msgObj);
      } catch (err) {
        console.log(error);
      }
      console.log('response from server ' + msg);
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(msg);
        return true;
      } else {
        return false;
      }
    };
  },
  sendTo: (oid, msgObj) => {
    let msg = '';
    try {
      msg = JSON.stringify(msgObj);
    } catch (error) {
      console.log(error);
    }
    console.log('response from server ' + msg);
    for (let i = 0; i < socket.connections.length; i++) {
      if (socket.connections[i].connectionId === oid) {
        const sent = socket.connections[i].sendFunc(msgObj);
        return sent ? true : false;
      }
    }
    return false;
  },
  on: (action, func) => {
    socket.handlers.push({ action: action, func: func });
  },
  handlers: [
    {
      action: 'msg',
      func: req => {
        console.log(req.msg);
      },
    },
  ],
  // handle incoming socket messages
  incoming: (event, sendFunc, connectionId) => {
    let req = { action: null };
    // if error we don't care there is a default object
    try {
      req = JSON.parse(event);
    } catch (error) {
      console.log(error);
    }
    const apiGWCallback = (firstArg, secondArg) => {
      console.log(JSON.stringify(secondArg));
    };
    for (let h = 0; h < socket.handlers.length; h++) {
      if (req.action === socket.handlers[h].action) {
        apiGWEvent = {
          body: event,
          deabute: {
            sendTo: socket.sendTo,
            response: sendFunc,
          },
          requestContext: {
            connectionId,
          },
        };
        socket.handlers[h].func(apiGWEvent, {}, apiGWCallback);
        return;
      }
    }
    if (req.message === 'Internal server error') {
      console.log('Oops something when wrong: ' + JSON.stringify(req));
      return;
    }
    console.log('no handler ' + event);
  },
};

const serverless = {
  read: onFinish => {
    fs.readFile('serverless.yml', 'utf8', (err, data) => {
      // pass env vars and call next thing to do
      onFinish(yaml.safeLoad(data));
    });
  },
  forFunctions: on => {
    return config => {
      if (config.functions) {
        for (let key in config.functions) {
          const handler = config.functions[key].handler.split('.');
          const funcName = handler[1];
          const mod = require(path.join(__dirname, handler[0]));
          on(config.functions[key].events[0].websocket.route, mod[funcName]);
        }
      } else {
        console.log('not the serverless we are looking for or the one we need');
      }
    };
  },
};

const serve = () => {
  app.use(express.static(path.join(__dirname + '/build/')));
  const router = express.Router();
  router.get('/:erm', (req, res) => {
    res.status(200);
    res.sendFile(path.join(__dirname + '/build/index.html'));
  });
  app.use(router);
  const web_server = app.listen(process.env.PORT);
  socket.init(web_server);
  // set up socket server and related event handlers
  serverless.read(serverless.forFunctions(socket.on));
};

module.exports = serve;
if (!module.parent) {
  serve();
} // run server if called stand alone
