// rtc.js Copyright 2020 Paul Beaudet MIT License

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

export { dataPeer, media };
export default rtc;
