// dependencies.js ~ copyright 2019 ~ Paul Beaudet
// Sigletons that form base of deabute services that have little to no interdependence
var TIME_FOR_CONSENT = 30;
var rtc = { // stun servers in config allow client to introspect a communication path to offer a remote peer
    config: {'iceServers': [ {'urls': 'stun:stun.stunprotocol.org:3478'}, {'urls': 'stun:stun.l.google.com:19302'} ]},
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
                rtc.signalIce();
                rtc.candidates = []; // remove it once we send it
            } else {setTimeout(function(){rtc.onIce(event);}, 50);}
        }
    }, // Note that sdp is going to be negotiated first regardless of any media being involved. its faster to resolve, maybe?
    recieveIce: function(req){ console.log('getting ice from host');
        for(var i = 0; i < req.candidates.length; i++){rtc.peer.addIceCandidate(req.candidates[i]);}
    },
    init: function(onSetupCB, stream){                                  // varify mediastream before calling
        rtc.peer = new RTCPeerConnection(rtc.config);           // create new instance for local client
        stream.getTracks().forEach(function(track){rtc.peer.addTrack(track, stream);});
        rtc.peer.ontrack = function(event){document.getElementById('mediaStream').srcObject = event.streams[0];}; // behavior upon reciving track
        rtc.peer.onicecandidate = rtc.onIce;                    // Handle ice canidate at any random time they decide to come
        onSetupCB();                                            // create and offer or answer depending on what intiated
    },
    createDataChannel: function(onCreation){
        var datachannel = rtc.peer.createDataChannel('chat');
        rtc.peer.ondatachannel = onCreation;           // creates data endpoints for remote peer on rtc connection
        return datachannel;
    },
    createOffer: function(){                                    // extend offer to client so they can send it to remote
        rtc.peer.createOffer({offerToReceiveAudio: 1, offerToReceiveVideo: 0}).then( function onOffer(desc){// get sdp data to show user & share w/ friend
            return rtc.peer.setLocalDescription(desc);                        // note what sdp data self will use
        }).then(rtc.offerSignal);
    },
    giveAnswer: function(sdp, oidFromOffer, gwidOfPartner){
        rtc.peer.setRemoteDescription(sdp);
        rtc.connectionId = oidFromOffer;
        rtc.connectionGwid = gwidOfPartner;
        rtc.peer.createAnswer().then(function onAnswer(answer){ // create answer to remote peer that offered
            return rtc.peer.setLocalDescription(answer);        // set that offer as our local discripion
        }).then(function onOfferSetDesc(){rtc.answerSignal(oidFromOffer, gwidOfPartner);});
    },
    onAnswer: function(req){
        rtc.connectionId = req.id;
        rtc.connectionGwid = req.gwid;
        rtc.peer.setRemoteDescription(req.sdp);
    },
    close: function(talking){
        if(rtc.peer){  // clean up pre existing rtc connection if
            rtc.peer.close();
            rtc.peer = null;
        }
        rtc.lastPeer = rtc.connectionId;
        rtc.connectionId = '';
        rtc.connectionGwid = '';
    }
};

var dataPeer = {
    channel: null,
    ready: false,       // other human is ready
    clientReady: false, // I, human am ready
    talking: false,     // WE, humans are talking
    peerName: '',
    close: function(){
        rtc.close(dataPeer.talking);
        dataPeer.talking = false;
        dataPeer.ready = false;
        dataPeer.peerName = '';
    },
    newChannel: function(event){
        receiveChannel = event.channel;                      // recieve channel events handlers created on connection
        dataPeer.on('terminate', dataPeer.close);
        dataPeer.on('ready', dataPeer.whenReady);
        dataPeer.on('connect', function(req){
            dataPeer.peerName = req.username; console.log('connected to ' + req.username);
            if(dataPeer.clientReady){dataPeer.readySignal();} // client may already be ready if reconnecting
        });
        receiveChannel.onmessage = dataPeer.incoming;        // handle events upon opening connection
        receiveChannel.onopen = function onOpen(){dataPeer.send({action: 'connect', username: localStorage.username});};
    },
    handlers: [{action: 'msg', func: function(req){console.log(req.msg);}},],
    on: function(action, func){dataPeer.handlers.push({action: action, func: func});},
    incoming: function(event){                              // handle incoming rtc messages
        var req = {action: null};                             // request defualt
        try {req = JSON.parse(event.data);}catch(error){}   // probably should be wrapped in error handler
        for(var h=0; h < dataPeer.handlers.length; h++){
            if(req.action === dataPeer.handlers[h].action){
                dataPeer.handlers[h].func(req);
                return;
            }
        }
    },
    send: function(sendObj){
        if(dataPeer.channel){
            try{sendObj = JSON.stringify(sendObj);} catch(error){console.log(error);return;}
            dataPeer.channel.send(sendObj);
        }
    },
    disconnect: function(human){
        if(human){dataPeer.send({action: 'disconnect'});} // tell friend we are done
        dataPeer.clientReady = false;        // no longer ready
        dataPeer.onDisconnect();
        dataPeer.close();
    },
    readySignal: function(){
        dataPeer.clientReady = true;
        if(dataPeer.peerName){
            dataPeer.send({action:'ready', username: localStorage.username});
            dataPeer.whenReady();
        } else { dataPeer.setReconsentActive();}
    },
    whenReady: function(){
        if(dataPeer.ready){
            dataPeer.talking = true;
            dataPeer.ready = false;           // "we" are ready
            dataPeer.onReady();
        } else {dataPeer.ready = true;}
    },
    onConfluence: function(){       // happens at confluence time
        if(!dataPeer.talking){      // given conversation is a dud
            if(dataPeer.peerName){dataPeer.send({action: 'terminate'});} // this needs more explaination
            if(dataPeer.clientReady){dataPeer.setReconsentActive();}   // active client doesn't know, but may need to be gauged for attention if takes too long
            else                    {dataPeer.inactiveOnConfluence();} // this client is eating pie or doing something other than paying attention
            dataPeer.close();                                          // connection closes in this case so canidates can move on
        }
    }
};

var pool = {
    display: document.getElementById('pool'),
    count: 0, // assume peer is counted in pool
    onIncrement: function(req){
        pool.count = pool.count + req.count;
        pool.display.innerHTML = pool.count;
    },
    onSet: function(req){
        pool.count = req.pool;
        pool.display.innerHTML = pool.count;
    }
};

var media = {
    stream: null,
    init: function(onMedia){ // get user permistion to use media
        var onMediaCallback = onMedia ? onMedia : function noSoupForYou(){};
        navigator.mediaDevices.getUserMedia({audio: true, video: false}).then(function gotMedia(mediaStream){
            console.log('got media');
            media.stream = mediaStream;
            var audioTracks = mediaStream.getAudioTracks();
            if(audioTracks.length){
                if(audioTracks[0].enabled){onMediaCallback(null, mediaStream); audioTracks[0].enabled = false;}
                else                      {onMediaCallback('Microphone muted', null);}
            } else {onMediaCallback('woah! no audio', null);}
        }).catch(function onNoMedia(error){onMediaCallback(error, null);});
    },
    switchAudio: function(on){
        var audioTracks = media.stream.getAudioTracks();
        if(audioTracks.length){
            if(on){audioTracks[0].enabled = true;}
            else  {audioTracks[0].enabled = false;}
        }
    }
};

var prompt = {
    caller: false,
    feild: document.getElementById('promptFeild'),
    form: document.getElementById('promptForm'),
    nps: {
        id: 'usernps',
        question: 'How did it go? If you knew them better, or you do know them, would you introduce them to another friend?',
        answers: ['definitely not', 'no', 'meh', 'yes', 'definitely']
    },
    answers: document.getElementById('formAnswers'),
    create: function(questionObj, onAnswer){
        prompt.form.hidden = false;
        prompt.feild.innerHTML = questionObj.question;
        var answerBundle = document.createElement('div'); answerBundle.id = 'answerBundle';
        prompt.answers.appendChild(answerBundle);
        var halfway = Math.floor(questionObj.answers.length/2); // figure middle answer index
        for(var i = 0; i < questionObj.answers.length; i++){
            var radioLabel = document.createElement('label');
            var radioOption = document.createElement('input');
            if(i === halfway){radioOption.checked = true;}      // set default selection
            radioLabel.for = 'answer' + i; radioLabel.innerHTML = questionObj.answers[i];
            radioOption.id = 'answer' + i; radioOption.type = 'radio'; radioOption.name = 'answer'; radioOption.value = i;
            answerBundle.appendChild(radioOption); answerBundle.appendChild(radioLabel); // append option and label
            answerBundle.appendChild(document.createElement('br'));
        }
        prompt.form.addEventListener('submit', function submitAnswer(event){
            event.preventDefault();
            var radios = document.getElementsByName('answer');
            var unifiedIndex = 4 - halfway; // determines relitive start value from universal middle value
            for(var entry = 0; entry < radios.length; entry++){                   // for all posible current question answers
                if(radios[entry].checked){                                        // find checked entry
                    for(var peer = 0; peer < persistence.answers.length; peer++){ // for existing user answer entries
                        if(persistence.answers[peer].oid === rtc.lastPeer){       // if an existing entry matches this peer
                            persistence.answers[peer].nps = unifiedIndex;         // add property to entry
                            prompt.onSubmit(onAnswer); return;                    // save and end function
                        }
                    }
                    persistence.answers.push({oid: rtc.lastPeer, nps: unifiedIndex}); // if peer not found push as new entry
                    prompt.onSubmit(onAnswer); return;                                // save and end function
                }
                unifiedIndex++; // count up from relitive start value. relitive to universal middle value (4)
            }
        }, false);
    },
    onSubmit: function(whenDone){
        localStorage.answers = JSON.stringify(persistence.answers); // save any recorded answer
        prompt.caller = false;
        prompt.answers.innerHTML = '';
        prompt.form.hidden = true;
        prompt.feild.innerHTML = '';
        whenDone();
    }
};

var persistence = {
    answers: [],
    init: function(onStorageLoad){
        if(localStorage){
            if(!localStorage.oid){localStorage.oid = persistence.createOid();}
            if(!localStorage.username){localStorage.username = 'Anonymous';}
            if(localStorage.answers){persistence.answers = JSON.parse(localStorage.answers);}
            else                    {localStorage.answers = JSON.stringify(persistence.answers);}
            onStorageLoad(true);
        } else { onStorageLoad(false); }
    },
    saveAnswer: function(){localStorage.answers = JSON.stringify(persistence.answers);},
    createOid: function(){
        var increment = Math.floor(Math.random() * (16777216)).toString(16);
        var pid = Math.floor(Math.random() * (65536)).toString(16);
        var machine = Math.floor(Math.random() * (16777216)).toString(16);
        var timestamp =  Math.floor(new Date().valueOf() / 1000).toString(16);
        return '00000000'.substr(0, 8 - timestamp.length) + timestamp + '000000'.substr(0, 6 - machine.length) + machine +
               '0000'.substr(0, 4 - pid.length) + pid + '000000'.substr(0, 6 - increment.length) + increment;
    },
};

var ws = {
    active: false,
    instance: null,                                // placeholder for websocket object
    server: document.getElementById('socketserver').innerHTML,
    init: function(onConnection){
        ws.instance = new WebSocket(ws.server);
        ws.instance.onopen = function(){
            ws.active = true;
            ws.instance.onmessage = ws.incoming;
            ws.onclose = function onSocketClose(){ws.instance = null;};
            if(onConnection){onConnection();}
        };
    },
    reduce: function(pause){
        if(ws.active){ws.send({action:'reduce', oid: localStorage.oid, pause: pause});}
        ws.active = false;
    },
    repool: function(){
        if(!ws.active){ws.send({action: 'repool', oid: localStorage.oid});} // let server know we can be rematched
        ws.active = true;
    },
    handlers: [{action: 'msg', func: function(req){console.log(req.msg);}},],
    on: function(action, func){ws.handlers.push({action: action, func: func});},
    incoming: function(event){                            // handle incoming socket messages
        var req = {action: null};                           // request
        try {req = JSON.parse(event.data);}catch(error){} // if error we don't care there is a default object
        for(var h=0; h < ws.handlers.length; h++){
            if(req.action === ws.handlers[h].action){
                ws.handlers[h].func(req);
                return;
            }
        }
        if(req.message === 'Internal server error'){console.log('Opps something when wrong: ' + JSON.stringify(req));return;}
        console.log('no handler ' + event.data);
    },
    send: function(msg){
        try{msg = JSON.stringify(msg);} catch(error){msg = "{\"action\":\"error\",\"error\":\"failed stringify\"}";}
        if(ws.instance){ws.instance.send(msg);}
    }
};
