// ws.js Copyright 2020 Paul Beaudet MIT License

const ws = {
  active: false,
  instance: null,
  // placeholder for websocket object
  server: document.getElementById('socketserver').innerHTML,
  init: onConnection => {
    if (ws.instance) {
      // makes it so that init function can be called liberally
      //  to assure that we are maintaining connection
      if (onConnection) {
        onConnection();
      }
    } else {
      ws.instance = new WebSocket(ws.server);
      ws.instance.onopen = () => {
        ws.active = true;
        ws.instance.onmessage = ws.incoming;
        ws.instance.onclose = () => {
          ws.instance = null;
        };
        if (onConnection) {
          onConnection();
        }
      };
    }
  },
  handlers: [
    {
      action: 'msg',
      func: req => {
        console.log(req.msg);
      },
    },
  ],
  on: (action, func) => {
    ws.handlers.push({ action: action, func: func });
  },
  incoming: event => {
    // handle incoming socket messages
    let req = { action: null };
    try {
      req = JSON.parse(event.data);
    } catch (error) {
      console.log(error);
    }
    // if error we don't care there is a default object
    for (let h = 0; h < ws.handlers.length; h++) {
      if (req.action === ws.handlers[h].action) {
        ws.handlers[h].func(req);
        return;
      }
    }
    if (req.message === 'Internal server error') {
      console.log('Oops something when wrong: ' + JSON.stringify(req));
      return;
    }
    console.log('no handler ' + event.data);
  },
  send: msg => {
    try {
      msg = JSON.stringify(msg);
    } catch (error) {
      msg = '{"action":"error","error":"failed stringify"}';
    }
    ws.init(() => {
      ws.instance.send(msg);
    });
  },
  msg: (action, json) => {
    json = json ? json : {};
    json.action = action;
    ws.send(json);
  },
};

export default ws;
