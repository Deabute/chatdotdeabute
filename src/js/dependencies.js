// dependencies.js ~ copyright 2019-2020 ~ Paul Beaudet
const rtc = {
  // stun servers in config allow client to introspect a communication path
  // to offer a remote peer
  config: {
    iceServers: [
      { urls: 'stun:stun.stunprotocol.org:3478' },
      { urls: 'stun:stun.l.google.com:19302' },
    ],
  },
  peer: null,
  // placeholder for parent webRTC object instance
  connectionId: '',
  // oid of peer we are connected w/
  lastPeer: '',
  connectionGwid: '',
  candidates: [],
  onIce: event => {
    // on address info being introspected (after local description is set)
    if (event.candidate) {
      // candidate property denotes data as multiple candidates can resolve
      rtc.candidates.push(event.candidate);
    } else {
      if (rtc.connectionGwid) {
        rtc.signalIce();
        rtc.candidates = []; // remove it once we send it
      } else {
        setTimeout(() => {
          rtc.onIce(event);
        }, 50);
      }
    }
  }, // Note that sdp is going to be negotiated first
  // regardless of any media being involved. its faster to resolve, maybe?
  receiveIce: req => {
    console.log('getting ice from host');
    for (let i = 0; i < req.candidates.length; i++) {
      rtc.peer.addIceCandidate(req.candidates[i]);
    }
  },
  init: (onSetupCB, stream) => {
    // verify media stream before calling
    rtc.peer = new RTCPeerConnection(rtc.config);
    // create new instance for local client
    stream.getTracks().forEach(track => {
      rtc.peer.addTrack(track, stream);
    });
    rtc.peer.ontrack = event => {
      document.getElementById('mediaStream').srcObject = event.streams[0];
    }; // behavior upon receiving track
    rtc.peer.onicecandidate = rtc.onIce;
    // Handle ice candidate at any random time they decide to come
    onSetupCB();
    // create and offer or answer depending on what initiated
  },
  createDataChannel: onCreation => {
    const dataChannel = rtc.peer.createDataChannel('chat');
    rtc.peer.ondatachannel = onCreation;
    // creates data endpoints for remote peer on rtc connection
    return dataChannel;
  },
  createOffer: () => {
    // extend offer to client so they can send it to remote
    rtc.peer
      .createOffer({ offerToReceiveAudio: 1, offerToReceiveVideo: 0 })
      .then(desc => {
        // get sdp data to show user & share w/ friend
        return rtc.peer.setLocalDescription(desc);
        // note what sdp data self will use
      })
      .then(rtc.offerSignal);
  },
  giveAnswer: (sdp, oidFromOffer, gwidOfPartner) => {
    rtc.peer.setRemoteDescription(sdp);
    rtc.connectionId = oidFromOffer;
    rtc.connectionGwid = gwidOfPartner;
    rtc.peer
      .createAnswer()
      .then(answer => {
        // create answer to remote peer that offered
        return rtc.peer.setLocalDescription(answer);
        // set that offer as our local description
      })
      .then(() => {
        rtc.answerSignal(oidFromOffer, gwidOfPartner);
      });
  },
  onAnswer: req => {
    rtc.connectionId = req.id;
    rtc.connectionGwid = req.gwid;
    rtc.peer.setRemoteDescription(req.sdp);
  },
  close: () => {
    if (rtc.peer) {
      // clean up pre existing rtc connection if
      rtc.peer.close();
      rtc.peer = null;
    }
    rtc.lastPeer = rtc.connectionId;
    rtc.connectionId = '';
    rtc.connectionGwid = '';
  },
};

const dataPeer = {
  channel: null,
  ready: false,
  // other human is ready
  clientReady: false,
  // I, human am ready
  talking: false,
  // WE, humans are talking
  peerName: '',
  consent: () => {},
  close: () => {
    rtc.close(dataPeer.talking);
    dataPeer.talking = false;
    dataPeer.ready = false;
    dataPeer.peerName = '';
  },
  newChannel: event => {
    const receiveChannel = event.channel;
    // receive channel events handlers created on connection
    dataPeer.on('terminate', dataPeer.close);
    dataPeer.on('ready', dataPeer.whenReady);
    dataPeer.on('connect', req => {
      dataPeer.peerName = req.username;
      console.log('connected to ' + req.username);
      dataPeer.consent(req.username);
      if (dataPeer.clientReady) {
        dataPeer.readySignal();
      } // client may already be ready if reconnecting
    });
    receiveChannel.onmessage = dataPeer.incoming;
    // handle events upon opening connection
    receiveChannel.onopen = () => {
      dataPeer.send({ action: 'connect', username: localStorage.username });
    };
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
    dataPeer.handlers.push({ action: action, func: func });
  },
  incoming: event => {
    // handle incoming rtc messages
    let req = { action: null }; // request default
    try {
      req = JSON.parse(event.data);
    } catch (error) {
      console.log(error);
    } // probably should be wrapped in error handler
    for (let h = 0; h < dataPeer.handlers.length; h++) {
      if (req.action === dataPeer.handlers[h].action) {
        dataPeer.handlers[h].func(req);
        return;
      }
    }
  },
  send: sendObj => {
    if (dataPeer.channel) {
      try {
        sendObj = JSON.stringify(sendObj);
      } catch (error) {
        console.log(error);
        return;
      }
      dataPeer.channel.send(sendObj);
    }
  },
  disconnect: human => {
    if (human) {
      dataPeer.send({ action: 'disconnect' });
    } // tell friend we are done
    dataPeer.clientReady = false; // no longer ready
    dataPeer.onDisconnect();
    dataPeer.close();
  },
  readySignal: () => {
    dataPeer.clientReady = true;
    if (dataPeer.peerName) {
      dataPeer.send({ action: 'ready', username: localStorage.username });
      dataPeer.whenReady();
    } else {
      dataPeer.setReconsentActive();
    }
  },
  whenReady: () => {
    if (dataPeer.ready) {
      dataPeer.talking = true;
      dataPeer.ready = false; // "we" are ready
      dataPeer.onReady();
    } else {
      dataPeer.ready = true;
    }
  },
  onConfluence: () => {
    // happens at confluence time
    if (!dataPeer.talking) {
      // given conversation is a dud
      if (dataPeer.peerName) {
        dataPeer.send({ action: 'terminate' });
      } // this needs more explanation
      if (dataPeer.clientReady) {
        dataPeer.setReconsentActive();
      } // active client doesn't know,
      // but may need to be gauged for attention if takes too long
      else {
        dataPeer.inactiveOnConfluence();
      } // this client is doing something other than paying attention
      dataPeer.close();
      // connection closes in this case so candidates can move on
    }
  },
};

const pool = {
  indicator: document.getElementById('poolInd'),
  display: document.getElementById('pool'),
  onOwner: () => {},
  count: 0,
  // assume peer is counted in pool
  onIncrement: req => {
    if (req.owner) {
      pool.onOwner();
    }
    pool.count = pool.count + req.count;
    pool.display.innerHTML = pool.count;
  },
  onSet: req => {
    pool.count = req.pool;
    pool.display.innerHTML = pool.count;
  },
};

const media = {
  stream: null,
  init: onMedia => {
    // get user permission to use media
    const onMediaCallback = onMedia ? onMedia : () => {};
    navigator.mediaDevices
      .getUserMedia({ audio: true, video: false })
      .then(mediaStream => {
        console.log('got media');
        media.stream = mediaStream;
        const audioTracks = mediaStream.getAudioTracks();
        if (audioTracks.length) {
          if (audioTracks[0].enabled) {
            onMediaCallback(null, mediaStream);
            audioTracks[0].enabled = false;
          } else {
            onMediaCallback('Microphone muted', null);
          }
        } else {
          onMediaCallback('woah! no audio', null);
        }
      })
      .catch(error => {
        onMediaCallback(error, null);
      });
  },
  switchAudio: on => {
    const audioTracks = media.stream.getAudioTracks();
    if (audioTracks.length) {
      if (on) {
        audioTracks[0].enabled = true;
      } else {
        audioTracks[0].enabled = false;
      }
    }
  },
};

const prompt = {
  caller: false,
  field: document.getElementById('promptField'),
  form: document.getElementById('promptForm'),
  nps: {
    id: 'usernps',
    question:
      'How did it go? If you knew them better, or you do know them, would you introduce them to another friend?',
    answers: ['definitely not', 'no', 'meh', 'yes', 'definitely'],
  },
  review: {
    id: 'review',
    question: 'How did the conversation go?',
    answers: [
      'There was a general app issue',
      'There was a signal issue, could only clearly hear one or neither side',
      'Other person was difficult to talk to',
      'Conversation was "okay"',
      'Worked well, conversation was good',
      'That was great, would talk to someone like that again',
    ],
  },
  answers: document.getElementById('formAnswers'),
  create: (questionObj, onAnswer) => {
    if (!prompt.form.hidden) {
      return;
    } // prevent one prompt from being created on top of other
    // by only creating prompt from shown form state
    prompt.form.hidden = false;
    // Show prompt form
    prompt.field.innerHTML = questionObj.question;
    const answerBundle = document.createElement('div');
    answerBundle.id = 'answerBundle';
    prompt.answers.appendChild(answerBundle);
    const halfway = Math.floor(questionObj.answers.length / 2);
    // figure middle answer index
    for (let i = 0; i < questionObj.answers.length; i++) {
      const radioLabel = document.createElement('label');
      const radioOption = document.createElement('input');
      if (i === halfway) {
        radioOption.checked = true;
      } // set default selection
      radioLabel.for = 'answer' + i;
      radioLabel.innerHTML = questionObj.answers[i];
      radioOption.id = 'answer' + i;
      radioOption.type = 'radio';
      radioOption.name = 'answer';
      radioOption.value = i;
      answerBundle.appendChild(radioOption);
      answerBundle.appendChild(radioLabel);
      // append option and label
      answerBundle.appendChild(document.createElement('br'));
    }
    prompt.form.addEventListener(
      'submit',
      event => {
        event.preventDefault();
        const radios = document.getElementsByName('answer');
        const unifiedIndex = 4 - halfway;
        // determines relative start value from universal middle value
        for (let entry = 0; entry < radios.length; entry++) {
          // for all possible current question answers
          if (radios[entry].checked) {
            // find checked entry
            const answer = {
              oid: rtc.lastPeer,
              score: unifiedIndex + entry,
              id: questionObj.id,
            };
            for (let peer = 0; peer < persistence.answers.length; peer++) {
              // for existing user answer entries
              if (
                persistence.answers[peer].oid === rtc.lastPeer &&
                persistence.answers.id === questionObj.id
              ) {
                // overwrite existing entries
                persistence.answers[peer].score = unifiedIndex + entry;
                // add property to entry
                persistence.answers[peer].id = questionObj.id;
                prompt.onSubmit(onAnswer, answer);
                return; // save and end function
              }
            }

            persistence.answers.push(answer);
            // if peer not found push as new entry
            prompt.onSubmit(onAnswer, answer);
            return;
            // save and end function
          }
        }
      },
      false
    );
  },
  onSubmit: (whenDone, answer) => {
    localStorage.answers = JSON.stringify(persistence.answers);
    // save any recorded answer
    prompt.caller = false;
    prompt.answers.innerHTML = '';
    prompt.form.hidden = true;
    prompt.field.innerHTML = '';
    whenDone(answer);
  },
};

const persistence = {
  answers: [],
  init: onStorageLoad => {
    if (localStorage) {
      if (!localStorage.oid) {
        localStorage.oid = persistence.createOid();
      }
      if (!localStorage.token) {
        localStorage.token = '';
      }
      if (!localStorage.paid) {
        localStorage.paid = false;
      }
      if (!localStorage.username) {
        localStorage.username = 'Anonymous';
      }
      if (localStorage.answers) {
        persistence.answers = JSON.parse(localStorage.answers);
      } else {
        localStorage.answers = JSON.stringify(persistence.answers);
      }
      onStorageLoad(true);
    } else {
      onStorageLoad(false);
    }
  },
  saveAnswer: () => {
    localStorage.answers = JSON.stringify(persistence.answers);
  },
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
};

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
  reduce: pause => {
    if (ws.active) {
      ws.send({
        action: 'reduce',
        oid: localStorage.oid,
        pause: pause,
        owner: localStorage.paid === 'true' ? true : false,
        token: localStorage.token,
      });
    }
    ws.active = false;
  },
  repool: answer => {
    if (!ws.active) {
      const msg = {
        oid: localStorage.oid,
        owner: localStorage.paid === 'true' ? true : false,
        token: localStorage.token,
        answer: answer,
        type: channel.type,
        link: channel.name,
      };
      ws.msg('repool', msg);
    } // let server know we can be rematched
    ws.active = true;
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

const deabute = {
  signupButton: document.getElementById('signup'),
  loginButton: document.getElementById('login'),
  username: document.getElementById('username'),
  password: document.getElementById('password'),
  accountOptions: document.getElementById('accountOptions'),
  credBox: document.getElementById('credBox'),
  status: document.getElementById('accountStatus'),
  accountAction: 'signup',
  login: () => {
    deabute.display('login');
  },
  signup: () => {
    deabute.display('signup');
  },
  display: action => {
    deabute.accountAction = action;
    deabute.accountOptions.hidden = true;
    deabute.status.hidden = false;
    deabute.credBox.hidden = false;
    // show sign up box
  },
  submit: () => {
    const regex = /^[a-z]+$/;
    // make sure there are only lowercase a-z to the last letter
    if (deabute.username.value && deabute.password.value) {
      if (regex.test(deabute.username.value)) {
        deabute.credBox.hidden = true;
        ws.send({
          action: deabute.accountAction,
          username: deabute.username.value,
          password: deabute.password.value,
          oid: localStorage.oid,
        });
      } else {
        deabute.status.innerHTML = 'Username must be lowercase letters';
      }
    } else {
      deabute.status.innerHTML = 'Missing information';
    }
  },
  onUser: (mine, channelName, username) => {
    if (mine) {
      deabute.status.innerHTML =
        'Hey ' + username + '! Welcome to your channel';
    } else {
      deabute.status.innerHTML =
        'Hey ' + username + '! Welcome to ' + channelName + "'s channel";
    }
    deabute.status.hidden = false;
  },
  onLogin: req => {
    if (req.token && req.oid) {
      localStorage.oid = req.oid;
      localStorage.username = req.username;
      localStorage.token = req.token;
      localStorage.paid = req.paid;
      deabute.onUser(channel.mine, channel.name, localStorage.username);
    } else {
      deabute.status.innerHTML = 'Oops something when wrong';
    }
  },
  onSignup: () => {
    deabute.onUser(channel.mine, channel.name, deabute.username.value);
    deabute.credBox.hidden = true;
  },
  rejected: req => {
    console.log('on rejected');
    deabute.status.innerHTML = req.msg;
    deabute.credBox.hidden = false;
  },
  onFail: req => {
    deabute.status.innerHTML = req.msg;
  },
};
