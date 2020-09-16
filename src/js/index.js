// chat3.js ~ copyright 2019-2020 Paul Beaudet ~ MIT License
import persistence from './persistence.js';
import pool from './pool.js';
import prompt from './prompt.js';
import rtc, { dataPeer, media } from './rtc.js';
import ws from './ws.js';

const TIME_FOR_CONSENT = 30;
let DAY_OF_WEEK = 1;
let HOUR_OF_DAY = 12;
const CONSENT_MINUTE = 58;
const OPEN_MINUTE = CONSENT_MINUTE - 10;
const CONFLUENCE_MINUTE = CONSENT_MINUTE;
const CONSENT_SECOND = 3600 - (CONSENT_MINUTE * 60 + TIME_FOR_CONSENT);
const CONFLUENCE_SECOND = 3600 - (CONFLUENCE_MINUTE * 60 + 50);
const serviceTime = {
  DEBUG: false,
  begin: new Date(),
  countDown: 0,
  box: document.getElementById('timeBox'),
  WINDOW: document.getElementById('serviceWindow').innerHTML,
  sessionInd: document.getElementById('sessionInd'),
  closed: millisTill => {
    serviceTime.begin.setUTCHours(HOUR_OF_DAY, 0);
    // set back to true begin time, always on hour
    app.outsideService();
    app.timeouts = setTimeout(serviceTime.open, millisTill);
    // open in upcoming window
  },
  outside: (day, utcHour) => {
    DAY_OF_WEEK = typeof day === 'undefined' ? DAY_OF_WEEK : day;
    HOUR_OF_DAY = typeof utcHour === 'undefined' ? HOUR_OF_DAY : utcHour;
    serviceTime.sessionInd.hidden = false;
    const dayNow = serviceTime.begin.getDay();
    const dateNow = serviceTime.begin.getDate();
    const timeNow = serviceTime.begin.getTime();
    const endTime = new Date();
    serviceTime.begin.setDate(dateNow + (DAY_OF_WEEK - dayNow));
    serviceTime.begin.setUTCHours(HOUR_OF_DAY - 1, OPEN_MINUTE, 0, 0);
    // open window x minutes before actual begin
    const millisBegin = serviceTime.begin.getTime();
    endTime.setDate(dateNow + (DAY_OF_WEEK - dayNow));
    endTime.setUTCHours(HOUR_OF_DAY + 1, 0, 0, 0);
    if (millisBegin > timeNow) {
      // if begin is in future
      if (endTime.getTime(endTime.getDate() - 7) > timeNow) {
        serviceTime.closed(millisBegin - timeNow);
      } // if last window ending is past, outside of window
      else {
        serviceTime.open();
      }
    } else {
      // if begin time is in past
      if (endTime.getTime() < timeNow) {
        // if this window ending has passed, outside of window
        serviceTime.begin.setDate(serviceTime.begin.getDate() + 7);
        // set begin date to next week
        serviceTime.closed(serviceTime.begin.getTime() - timeNow);
        // reflect millis beginning in future
      } else {
        serviceTime.open();
      }
    }
    serviceTime.box.innerHTML = serviceTime.begin.toLocaleString();
    // display true begin time
  },
  open: () => {
    serviceTime.begin.setUTCHours(HOUR_OF_DAY, 0);
    // set back to true begin time, always on hour
    app.proposition('Matching about to occur for this channel');
    // ask about name and microphone to start getting set up
  },
  onWSConnect: () => {
    app.waiting();
    const currentTime = new Date().getTime();
    const startTime = serviceTime.begin.getTime();
    if (currentTime < startTime) {
      // this is the case where we are counting down
      const diff = startTime - currentTime;
      let firstTimeout = diff;
      if (diff > 1000) {
        serviceTime.countDown = Math.floor(diff / 1000);
        firstTimeout = diff % 1000;
      }
      if (serviceTime.countDown < CONSENT_SECOND) {
        // time to consent has passed
        app.triggerConsent();
        // trigger concent dialog if connected to peer
        serviceTime.countDown = TIME_FOR_CONSENT - 1;
        // give time for someone to actually consent before confluence
      }
      app.timeouts = setTimeout(serviceTime.downCount, firstTimeout);
    } else {
      serviceTime.box.innerHTML = 'Currently matching users';
    }
  },
  downCount: () => {
    app.timeouts = setTimeout(() => {
      if (serviceTime.countDown) {
        serviceTime.box.innerHTML =
          Math.floor(serviceTime.countDown / 60) +
          ' minutes and ' +
          (serviceTime.countDown % 60) +
          ' seconds remaining';
        serviceTime.countDown--;
        if (serviceTime.countDown === CONSENT_SECOND) {
          app.triggerConsent();
        } else if (serviceTime.countDown === CONFLUENCE_SECOND) {
          dataPeer.onConfluence();
        }
        serviceTime.downCount();
      } else {
        serviceTime.box.innerHTML = 'Currently matching users';
        // display true begin time
        serviceTime.box.innerHTML = 0;
        serviceTime.countDown = 0;
        // TODO setTimeout for next window
      }
    }, 1000); // minute one for last second id in array
  },
};

const DEFAULT_CHANNEL_NAME = 'deabute';
const channel = {
  name: DEFAULT_CHANNEL_NAME,
  mine: false,
  type: 'multi',
  multi: true,
  init: inChannel => {
    const addressArray = window.location.href.split('/');
    if (addressArray.length === 4) {
      const route = addressArray[3];
      const regex = /^[a-z]+$/;
      // make sure there are only lowercase a-z to the last letter
      if (regex.test(route)) {
        channel.name = route;
        inChannel(route);
        return;
      }
    }
    inChannel(channel.name);
  },
  visitor: req => {
    if (req.status === 'ready') {
      app.proposition(channel.name + ' is ' + req.status);
    } else {
      app.description.innerHTML = channel.name + ' is ' + req.status;
    }
  },
  status: req => {
    if (req.exist) {
      if (req.multi) {
        channel.multi = true;
        pool.indicator.hidden = false;
        serviceTime.outside(req.day, req.utcHour);
      } else {
        channel.multi = false;
        if (localStorage.token && localStorage.oid && localStorage.username) {
          if (req.owner) {
            channel.mine = true;
          }
          deabute.onUser(channel.mine, channel.name, localStorage.username);
          if (channel.mine) {
            // probably need to use a token to confirm this at one point
            app.proposition('Allow microphone to broadcast status');
          } else {
            channel.visitor(req);
          }
        } else {
          channel.visitor(req);
        }
      }
    } else {
      app.description.innerHTML =
        'Sorry, not much is here. Aside from this text';
    }
  },
};

const app = {
  setupInput: document.getElementById('setupInput'),
  setupButton: document.getElementById('setupButton'),
  connectButton: document.getElementById('connectButton'),
  description: document.getElementById('description'),
  entered: false, // flags true when microphone is allowed
  timeouts: 0,
  clearTimeouts: () => {
    if (app.timeouts > 0) {
      while (app.timeouts--) {
        clearTimeout(app.timeouts + 1);
      }
    }
    serviceTime.sessionInd.hidden = true;
  },
  outsideService: () => {
    app.setupButton.hidden = true;
    app.setupInput.hidden = true;
    app.description.innerHTML =
      'Please wait till our next scheduled matching to participate';
  },
  proposition: welcomeMsg => {
    if (!app.entered) {
      app.setupButton.hidden = false;
      app.setupInput.hidden = false;
      app.description.innerHTML = welcomeMsg;
      if (localStorage.username !== 'Anonymous') {
        app.setupButton.innerHTML = 'Allow microphone';
        app.setupInput.value = localStorage.username;
      } else {
        app.setupButton.innerHTML = 'Enter name, allow microphone';
      }
    }
  },
  issue: issue => {
    console.log(issue);
    app.proposition(
      'Sorry maybe, Unmute, remove restriction of microphone in address bar and try again, reload, or use chrome/firefox?'
    );
  },
  setup: () => {
    app.setupButton.hidden = true;
    app.description.innerHTML = 'Please allow Microphone, in order to connect';
    localStorage.username = app.setupInput.value;
    app.setupInput.hidden = true;
    media.init((issue, mediaStream) => {
      if (issue) {
        app.issue(issue);
      } else if (mediaStream) {
        app.description.innerHTML = 'Waiting for potential connections... ';
        ws.init(() => {
          // ws.init will have likely already been called to get status
          // connections can timeout in 2 minutes, needing a second init
          if (channel.multi) {
            channel.type = 'multi';
            serviceTime.onWSConnect();
          } else {
            channel.type = 'single';
          }
          dataPeer.consent = peer => {
            app.consent(peer);
          };
          app.entered = true;
          ws.send({
            action: 'connected',
            oid: localStorage.oid,
            type: channel.type,
            link: channel.name,
            owner: localStorage.paid === 'true' ? true : false,
            token: localStorage.token,
          });
        });
      } else {
        app.issue('No media stream present');
      }
    });
  },
  disconnect: human => {
    media.switchAudio(false);
    prompt.create(prompt.review, answer => {
      // closes rtc connection, order important
      lifecycle.repool(answer);
      app.description.innerHTML = 'Waiting for potential connections... ';
    });
    dataPeer.disconnect(human);
    // NOTE closing connection will remove id that was passed to prompt
    app.description.innerHTML = '';
    app.connectButton.hidden = true;
  },
  triggerConsent: () => {},
  consent: peer => {
    peer = peer ? peer : 'peer';
    dataPeer.clientReady = false;
    if (serviceTime.countDown >= CONSENT_SECOND) {
      app.triggerConsent = () => {
        app.consent(peer);
        app.triggerConsent = () => {};
        // reset trigger to an empty function
      };
      return;
      // given serviceTime is in countdown wait until it triggers consent
    }
    let greet = 'Are you ready to chat?';
    if (channel.mine) {
      greet = peer + ' would like to talk with you?';
    }
    app.description.innerHTML = greet;
    app.connectButton.innerHTML = 'Ready to talk';
    app.connectButton.onclick = () => {
      app.description.innerHTML = 'Waiting for ' + peer;
      app.connectButton.hidden = true;
      dataPeer.readySignal();
    };
    app.connectButton.hidden = false;
  },
  whenConnected: () => {
    app.clearTimeouts();
    app.description.innerHTML = 'connected to ' + dataPeer.peerName;
    app.connectButton.onclick = () => {
      app.disconnect(true);
    };
    app.connectButton.innerHTML = 'Disconnect';
    app.connectButton.hidden = false;
  },
  waiting: () => {
    app.description.innerHTML = 'Waiting for session to start';
    app.connectButton.hidden = true;
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
  rejected: req => {
    console.log('on rejected');
    deabute.status.innerHTML = req.msg;
    deabute.credBox.hidden = false;
  },
  onFail: req => {
    deabute.status.innerHTML = req.msg;
  },
};

const authFlow = {
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
};

const setup = {
  // methods that are interconnected and intertwined with dependencies
  ws: () => {
    ws.on('offer', req => {
      rtc.init(() => {
        dataPeer.channel = rtc.createDataChannel(dataPeer.newChannel);
        rtc.giveAnswer(req.sdp, req.id, req.gwid);
      }, media.stream);
    });
    ws.on('answer', rtc.onAnswer);
    ws.on('ice', rtc.receiveIce);
    ws.on('makeOffer', req => {
      if (req.pool) {
        pool.onSet(req);
      }
      rtc.init(() => {
        dataPeer.channel = rtc.createDataChannel(dataPeer.newChannel);
        rtc.createOffer();
      }, media.stream);
      prompt.caller = true; // defines who instigator is, to split labor
    });
    ws.on('setPool', pool.onSet);
    ws.on('pool', pool.onIncrement);
    ws.on('loggedin', authFlow.onLogin);
    ws.on('signedup', authFlow.onSignup);
    ws.on('reject', deabute.rejected);
    ws.on('fail', deabute.onFail);
    ws.on('status', channel.status);
  },
  dataPeer: () => {
    dataPeer.on('disconnect', app.disconnect);
    dataPeer.onClose = talking => {
      rtc.close(talking);
    };
    dataPeer.inactiveOnConfluence = () => {
      lifecycle.reduce(true);
      app.connectButton.onclick = () => {
        dataPeer.clientReady = true;
        dataPeer.setReconsentInactive();
      };
    };
    dataPeer.onDisconnect = () => {
      ws.send({ action: 'pause', oid: localStorage.oid });
    };
    dataPeer.onReady = () => {
      console.log('about to turn on microphone');
      media.switchAudio(true); // switch audio on
      lifecycle.reduce(false); // reduce from connection pool
      app.whenConnected(); // change app to look like connected
    };
    dataPeer.setReconsentInactive = () => {
      lifecycle.repool();
      app.timeouts = setTimeout(app.consent, TIME_FOR_CONSENT * 1000);
    };
    dataPeer.setReconsentActive = () => {
      if (pool.count > 1) {
        ws.send({ action: 'unmatched', oid: localStorage.oid });
      } // let server know we can be rematched
      app.timeouts = setTimeout(app.consent, TIME_FOR_CONSENT * 1000);
    };
  },
  rtc: () => {
    rtc.signalIce = () => {
      ws.send({
        action: 'ice',
        oid: localStorage.oid,
        candidates: rtc.candidates,
        gwid: rtc.connectionGwid,
      });
    };
    rtc.offerSignal = () => {
      ws.send({
        action: 'offer',
        oid: localStorage.oid,
        sdp: rtc.peer.localDescription,
        type: channel.type,
        link: channel.name,
      }); // send offer to connect
      console.log('making offer');
    };
    rtc.answerSignal = (oidFromOffer, gwidOfPartner) => {
      console.log('sending answer to ' + oidFromOffer);
      ws.send({
        action: 'answer',
        oid: localStorage.oid,
        sdp: rtc.peer.localDescription,
        peerId: oidFromOffer,
        gwid: gwidOfPartner,
      });
    };
  },
  pool: () => {
    pool.onOwner = () => {
      app.proposition(channel.name + ' is ready now');
    };
  },
};

const lifecycle = {
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
};

persistence.init(capable => {
  if (capable) {
    window.addEventListener('beforeunload', event => {
      event.returnValue = '';
      // TODO should do next two only when in app
      ws.msg('remove', {
        owner: localStorage.paid === 'true' ? true : false,
        token: localStorage.token,
        oid: localStorage.oid,
      });
      dataPeer.close();
      app.clearTimeouts();
    });
    channel.init(channelName => {
      ws.init(() => {
        const statusMsg = { channel: channelName, oid: localStorage.oid };
        if (localStorage.token && localStorage.username) {
          deabute.status.innerHTML = '';
          statusMsg.token = localStorage.token;
        }
        ws.msg('status', statusMsg);
      });
    });
  } else {
    app.description.innerHTML = 'Incompatible browser';
  }
});

setup.rtc();
setup.ws();
setup.dataPeer();
setup.pool();

document.querySelector('#authSubmit').addEventListener('click', deabute.submit);
document.querySelector('#authSignup').addEventListener('click', deabute.signup);
document.querySelector('#authLogin').addEventListener('click', deabute.login);
document.querySelector('#setupButton').addEventListener('click', app.setup);
