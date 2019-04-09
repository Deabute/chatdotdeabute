// rtctest.js ~ copyright 2019 Paul Beaudet ~ MIT License
// rtcSignal version - 1.0.28
// This test requires at least two browser windows, to open a data connection between two peer
var persistence = {
    init: function(onStorageLoad){
        if(localStorage){
            if(!localStorage.oid){localStorage.oid = persistence.createOid();}
            if(!localStorage.username){localStorage.username = 'Anonymous';}
            onStorageLoad(true);
        } else { onStorageLoad(false); }
    },
    createOid: function(){
        var increment = Math.floor(Math.random() * (16777216)).toString(16);
        var pid = Math.floor(Math.random() * (65536)).toString(16);
        var machine = Math.floor(Math.random() * (16777216)).toString(16);
        var timestamp =  Math.floor(new Date().valueOf() / 1000).toString(16);
        return '00000000'.substr(0, 8 - timestamp.length) + timestamp + '000000'.substr(0, 6 - machine.length) + machine +
               '0000'.substr(0, 4 - pid.length) + pid + '000000'.substr(0, 6 - increment.length) + increment;
    },
};

var rtc = { // stun servers in config allow client to introspect a communication path to offer a remote peer
    config: {'iceServers': [ {'urls': 'stun:stun.stunprotocol.org:3478'}, {'urls': 'stun:stun.l.google.com:19302'} ]},
    lastMatches: [''],
    peer: null,                                                 // placeholder for parent webRTC object instance
    connectionId: '',                                           // oid of peer we are connected w/
    lastPeer: '',
    connectionGwid: '',
    candidates: [],
    onIce: function(event){  // on address info being introspected (after local discription is set)
        if(event.candidate){ // canididate property denotes data as multiple candidates can resolve
            rtc.candidates.push(event.candidate);
        } else {
            if(rtc.connectionGwid){
                ws.send({action: 'ice', oid: localStorage.oid, candidates: rtc.candidates, gwid: rtc.connectionGwid});
                rtc.candidates = []; // remove it once we send it
            } else {setTimeout(function(){rtc.onIce(event);}, 50);}
        }
    }, // Note that sdp is going to be negotiated first regardless of any media being involved. its faster to resolve, maybe?
    init: function(onSetupCB){                                  // varify mediastream before calling
        rtc.peer = new RTCPeerConnection(rtc.config);           // create new instance for local client
        media.stream.getTracks().forEach(function(track){rtc.peer.addTrack(track, media.stream);});
        rtc.peer.ontrack = media.ontrack;                       // behavior upon reciving track
        dataPeer.channel = rtc.peer.createDataChannel('chat');  // Creates data endpoint for client's side of connection
        rtc.peer.onicecandidate = rtc.onIce;                    // Handle ice canidate at any random time they decide to come
        rtc.peer.ondatachannel = dataPeer.newChannel;           // creates data endpoints for remote peer on rtc connection
        onSetupCB();                                            // create and offer or answer depending on what intiated
    },
    createOffer: function(){                                    // extend offer to client so they can send it to remote
        rtc.peer.createOffer({offerToReceiveAudio: 1, offerToReceiveVideo: 0}).then( function onOffer(desc){// get sdp data to show user & share w/ friend
            return rtc.peer.setLocalDescription(desc);                        // note what sdp data self will use
        }).then( function onSet(){
            ws.send({action: 'offer', oid: localStorage.oid, sdp: rtc.peer.localDescription, lastMatches: rtc.lastMatches}); // send offer to connect
            console.log('making offer');
        });
    },
    giveAnswer: function(sdp, oidFromOffer, gwidOfPartner){
        rtc.peer.setRemoteDescription(sdp);
        rtc.connectionId = oidFromOffer;
        rtc.connectionGwid = gwidOfPartner;
        rtc.peer.createAnswer().then(function onAnswer(answer){ // create answer to remote peer that offered
            return rtc.peer.setLocalDescription(answer);        // set that offer as our local discripion
        }).then(function onOfferSetDesc(){
            console.log('sending answer to ' + oidFromOffer);
            ws.send({action: 'answer', oid: localStorage.oid, sdp: rtc.peer.localDescription, peerId: oidFromOffer, gwid: gwidOfPartner}); // send offer to friend
        });                                                     // note answer is shown to user in onicecandidate event above once resolved
    },
    close: function(talking){
        if(rtc.peer){  // clean up pre existing rtc connection if
            rtc.peer.close();
            rtc.peer = null;
        }
        if(talking){
            if(rtc.lastMatches.unshift(rtc.connectionId) > 3){rtc.lastMatches.pop();}
            localStorage.lastMatches = JSON.stringify(rtc.lastMatches);
        }
        rtc.lastPeer = rtc.connectionId;
        rtc.connectionId = '';
        rtc.connectionGwid = '';
    }
};

var TIME_FOR_CONSENT = 30;
var dataPeer = {
    channel: null,
    connected: false,   // WE, two computer peers are connected
    ready: false,       // other human is ready
    clientReady: false, // I, human am ready
    talking: false,     // WE, humans are talking
    peerName: '',
    app: {},
    close: function(){
        rtc.close(dataPeer.talking);
        dataPeer.talking = false;
        dataPeer.connected = false;
        dataPeer.ready = false;
        dataPeer.peerName = '';
    },
    newChannel: function(event){
        receiveChannel = event.channel;                      // recieve channel events handlers created on connection
        receiveChannel.onmessage = dataPeer.incoming;        // handle events upon opening connection
        receiveChannel.onopen = function onOpen(){
            dataPeer.connected = true;
            dataPeer.send({action: 'connect', username: localStorage.username});
        };
    },
    incoming: function(event){                              // handle incoming rtc messages
        var req = {action: null};                             // request defualt
        try {req = JSON.parse(event.data);}catch(error){}   // probably should be wrapped in error handler
        if(req.action === 'disconnect'){                      // recieved when peer ends
            dataPeer.app.disconnect();
        } else if(req.action === 'terminate'){
            dataPeer.close();
        } else if(req.action === 'ready'){
            dataPeer.whenReady();
        } else if(req.action === 'connect'){
            dataPeer.peerName = req.username; console.log('connected to ' + req.username);
            if(dataPeer.clientReady){dataPeer.readySignal();}
        }
    },
    disconnect: function(human){
        if(human){dataPeer.send({action: 'disconnect'});} // tell friend we are done
        dataPeer.clientReady = false;        // no longer ready
        ws.send({action: 'pause', oid: localStorage.oid});
        dataPeer.close();
    },
    send: function(sendObj){
        try{sendObj = JSON.stringify(sendObj);} catch(error){sendObj = {action: 'error', error: error};}
        if(dataPeer.connected){
            dataPeer.channel.send(sendObj);
            return true;
        } else { return false;}
    },
    readySignal: function(){
        dataPeer.clientReady = true;
        if(dataPeer.peerName){
            dataPeer.send({action:'ready', username: localStorage.username});
            dataPeer.whenReady();
        } else { dataPeer.setReconsentTime(false);}
    },
    setReconsentTime: function(inactive){
        if(inactive){ws.repool();}
        else if(pool.count > 1){ws.send({action: 'unmatched', oid: localStorage.oid});} // let server know we can be rematched
        dataPeer.app.timeouts = setTimeout(dataPeer.app.consent, TIME_FOR_CONSENT * 1000);
    },
    whenReady: function(){
        if(dataPeer.ready){
            dataPeer.talking = true;
            dataPeer.ready = false;           // "we" are ready
            media.switchAudio(true);
            ws.reduce(false);
            dataPeer.app.whenConnected();
        } else {dataPeer.ready = true;}
    },
    onConfluence: function(){       // happens at confluence time
        if(!dataPeer.talking){      // given conversation is a dud
            if(dataPeer.peerName){dataPeer.send({action: 'terminate'});}
            if(dataPeer.clientReady){
                dataPeer.setReconsentTime(false);
            } else {
                ws.reduce(true);
                dataPeer.app.connectButton.onclick = dataPeer.payingAttentionAgain;
            } // this client is eating pie or doing something other than paying attention
            dataPeer.close();
        }
    },
    payingAttentionAgain: function(){
        dataPeer.clientReady = true;
        dataPeer.setReconsentTime(true);
    }
};

var ws = {
    active: false,
    instance: null,                                // placeholder for websocket object
    connected: false,                              // set to true when connected to server
    onConnection: function(){console.log('huh');}, // default to waiting for connections to pool dialog
    server: document.getElementById('socketserver').innerHTML,
    init: function(onConnection){
        ws.instance = new WebSocket(ws.server);
        ws.instance.onopen = function(event){
            ws.active = true;
            ws.connected = true;
            ws.instance.onmessage = ws.incoming;
            ws.onclose = function onSocketClose(){ws.connected = false;};
            onConnection = onConnection ? onConnection : ws.onConnection;
            onConnection();
        };
    },
    reduce: function(pause){
        if(ws.active){ws.send({action:'reduce', oid: localStorage.oid, pause: pause});}
        ws.active = false;
    },
    repool: function(){
        if(!ws.active){ws.send({action: 'repool', oid: localStorage.oid, lastMatches: rtc.lastMatches});} // let server know we can be rematched
        ws.active = true;
    },
    handlers: [],
    incoming: function(event){           // handle incoming socket messages
        var req = {action: null};          // request
        try {req = JSON.parse(event.data);} // probably should be wrapped in error handler
        catch(error){}                   // if error we don't care there is a default object
        if(req.action === 'offer'){
            rtc.init(function onInit(){rtc.giveAnswer(req.sdp, req.id, req.gwid);});
        } else if(req.action === 'answer'){
            rtc.connectionId = req.id;
            rtc.connectionGwid = req.gwid;
            rtc.peer.setRemoteDescription(req.sdp);
        } else if(req.action === 'ice'){
            for(var i = 0; i < req.candidates.length; i++){rtc.peer.addIceCandidate(req.candidates[i]);}
        } else if(req.action === 'makeOffer'){
            rtc.init(rtc.createOffer);
        } else if(req.action === 'setPool'){
            console.log(req.pool);
        } else if(req.action === 'pool'){
            console.log(req.count);
        } else {
            for(var h=0; h < ws.handlers.length; h++){
                if(req.action === ws.handlers[h].action){
                    ws.handlers[h].func(req);
                    break;
                }
            }
        }
    },
    send: function(msg){
        try{msg = JSON.stringify(msg);} catch(error){msg = {action:'error', error: error};}
        if(ws.connected){
            ws.instance.send(msg);
            return true;
        } else { return false; }
    }
};

var media = {
    output: document.getElementById('mediaStream'),
    stream: null,
    init: function(onMedia){ // get user permistion to use media
        var onMediaCallback = onMedia ? onMedia : function noSoupForYou(){};
        navigator.mediaDevices.getUserMedia({audio: true, video: false}).then(function gotMedia(mediaStream){
            media.stream = mediaStream;
            var audioTracks = mediaStream.getAudioTracks();
            if(audioTracks.length){
                if(audioTracks[0].enabled){onMediaCallback(null, mediaStream); audioTracks[0].enabled = false;}
                else                      {onMediaCallback('Microphone muted', null);}
            } else {onMediaCallback('woah! no audio', null);}
        }).catch(function onNoMedia(error){onMediaCallback(error, null);});
    },
    ontrack: function(event){media.output.srcObject = event.streams[0];},
    switchAudio: function(on){
        var audioTracks = media.stream.getAudioTracks();
        if(audioTracks.length){
            if(on){audioTracks[0].enabled = true;}
            else  {audioTracks[0].enabled = false;}
        }
    }
};
