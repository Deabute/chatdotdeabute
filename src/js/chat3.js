// rtctest.js ~ copyright 2019 Paul Beaudet ~ MIT License
// rtcSignal version - 1.0.28
// This test requires at least two browser windows, to open a data connection between two peer
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

var ws = {
    active: false,
    instance: null,                                // placeholder for websocket object
    server: document.getElementById('socketserver').innerHTML,
    init: function(onConnection){
        ws.instance = new WebSocket(ws.server);
        ws.instance.onopen = function(event){
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
    saveAnswer: function(){
        localStorage.answers = JSON.stringify(persistence.answers);
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

var DAY_OF_WEEK = 0;
var HOUR_OF_DAY = 12;
var CONSENT_MINUTE = 11;
var OPEN_MINUTE = CONSENT_MINUTE - 10;
var CONFLUENCE_MINUTE = CONSENT_MINUTE;
var CONSENT_SECOND = 3600 - (CONSENT_MINUTE * 60 + TIME_FOR_CONSENT);
var CONFLUENCE_SECOND = 3600 - (CONFLUENCE_MINUTE * 60 + 50);
var serviceTime = {
    DEBUG: false,
    begin: new Date(),
    countDown: 0,
    box: document.getElementById('timebox'),
    WINDOW: document.getElementById('serviceWindow').innerHTML,
    sessionInd: document.getElementById('sessionInd'),
    test: function(){
        if(serviceTime.WINDOW === 't'){
            var date = new Date();
            DAY_OF_WEEK = date.getDay();
            HOUR_OF_DAY = date.getHours() + 1;
            OPEN_MINUTE = 0;
        }
    },
    testOnConnect: function(){
        if(serviceTime.WINDOW === 't'){
            var date = new Date();
            CONSENT_MINUTE = date.getMinutes();
            CONFLUENCE_MINUTE = CONSENT_MINUTE;
            CONSENT_SECOND = 3600 - (CONSENT_MINUTE * 60 + TIME_FOR_CONSENT);
            CONFLUENCE_SECOND = 3600 - (CONFLUENCE_MINUTE * 60 + 50);
        }
    },
    closed: function(millisTill){
        serviceTime.begin.setHours(HOUR_OF_DAY, 0);     // set back to true begin time, always on hour
        app.outsideService();
        app.timeouts = setTimeout(serviceTime.open, millisTill); // open in upcoming window
    },
    outside: function(username){
        serviceTime.test();
        var dayNow = serviceTime.begin.getDay();
        var dateNow = serviceTime.begin.getDate();
        var timeNow = serviceTime.begin.getTime();
        var endTime = new Date();
        serviceTime.begin.setDate(dateNow + (DAY_OF_WEEK - dayNow));
        serviceTime.begin.setHours(HOUR_OF_DAY - 1, OPEN_MINUTE, 0, 0); // open window x minutes before actual begin
        var millisBegin = serviceTime.begin.getTime();
        endTime.setDate(dateNow + (DAY_OF_WEEK - dayNow));
        endTime.setHours(HOUR_OF_DAY + 1, 0, 0, 0);
        if(millisBegin > timeNow){                              // if begin is in future
            if(endTime.getTime(endTime.getDate() - 7) > timeNow){serviceTime.closed(millisBegin - timeNow);} // if last window ending is past, outside of window
            else{serviceTime.open();}
        } else {                                                            // if begin time is in past
            if(endTime.getTime() < timeNow){                                // if this window ending has passed, outside of window
                serviceTime.begin.setDate(serviceTime.begin.getDate() + 7); // set begin date to next week
                serviceTime.closed(serviceTime.begin.getTime() - timeNow);  // reflect millis begining in future
            } else {serviceTime.open();}
        }
        serviceTime.box.innerHTML = serviceTime.begin.toLocaleString();  // display true begin time
    },
    open: function(){
        serviceTime.begin.setHours(HOUR_OF_DAY, 0);             // set back to true begin time, always on hour
        serviceTime.test();
        app.proposition(); // ask about name and microphone to start getting set up
        ws.onConnection = serviceTime.onWSConnect;
    },
    onWSConnect: function(){
        serviceTime.testOnConnect();
        app.waiting();
        currentTime = new Date().getTime();
        var startTime = serviceTime.begin.getTime();
        if(currentTime < startTime){ // this is the case where we are counting down
            var diff = startTime - currentTime;
            var firstTimeout = diff;
            if(diff > 1000){
                serviceTime.countDown = Math.floor(diff / 1000);
                firstTimeout = diff % 1000;
            }
            if(serviceTime.countDown < CONSENT_SECOND){       // time to consent has passed
                app.consent();                                // given we past concent second
                serviceTime.countDown = TIME_FOR_CONSENT - 1; // give time for someone to actually consent before confluence
            }
            app.timeouts = setTimeout(serviceTime.downCount, firstTimeout);
        } else {
            app.consent();
            serviceTime.box.innerHTML = 'Currently matching users';
        }
    },
    downCount: function(){
        app.timeouts = setTimeout(function nextSecond(){
            if(serviceTime.countDown){
                serviceTime.box.innerHTML = Math.floor(serviceTime.countDown / 60) + ' minutes and ' + serviceTime.countDown % 60 + ' seconds remaining';
                serviceTime.countDown--;
                if(serviceTime.countDown === CONSENT_SECOND)        {app.consent();}
                else if(serviceTime.countDown === CONFLUENCE_SECOND){dataPeer.onConfluence();}
                serviceTime.downCount();
            } else {
                serviceTime.box.innerHTML = 'Currently matching users';  // display true begin time
                serviceTime.box.innerHTML = 0;
                serviceTime.countDown = 0; // TODO setTimeout for next window
            }
        }, 1000); // minue one for last second id in array
    }
};

var app = {
    setupInput: document.getElementById('setupInput'),
    setupButton: document.getElementById('setupButton'),
    connectButton: document.getElementById('connectButton'),
    discription: document.getElementById('discription'),
    timeouts: 0,
    clearTimeouts: function(){
        if(app.timeouts > 0){while(app.timeouts--){clearTimeout(app.timeouts + 1);}}
        serviceTime.sessionInd.hidden = true;
    },
    outsideService: function(){
        app.setupButton.hidden = true;
        app.setupInput.hidden = true;
        app.discription.innerHTML = 'Please wait till our next scheduled matching to participate';
    },
    proposition: function(){
        app.setupButton.hidden = false;
        app.setupInput.hidden = false;
        if(localStorage.username !== 'Anonymous'){
            app.setupButton.innerHTML = 'Allow microphone';
            app.discription.innerHTML = 'Welcome back ' + localStorage.username;
            app.setupInput.value = localStorage.username;
        } else { app.setupButton.innerHTML = 'Enter name, allow microphone'; }
    },
    issue: function(issue){
        console.log(issue);
        app.discription.innerHTML = 'Sorry maybe, Unmute, remove restriction of microphone in address bar and try again, reload, or use chrome/firefox?';
        app.setupButton.hidden = false;
    },
    setup: function(){
        app.setupButton.hidden = true;
        app.discription.innerHTML = 'Please allow Microphone, in order to connect';
        localStorage.username = app.setupInput.value;
        app.setupInput.hidden = true;
        media.init(function onMic(issue, mediaStream){
            if(issue){app.issue(issue);}
            else if(mediaStream){
                ws.init(function(){
                    ws.send({action: 'connected', oid: localStorage.oid});
                    serviceTime.onWSConnect();
                });
            } else {app.issue('No media stream present');}
        });
    },
    disconnect: function(human){
        media.switchAudio(false);
        prompt.create(prompt.nps, function whenAnswered(){ // closes rtc connection, order important
            ws.repool();
            app.consent();
        });
        dataPeer.disconnect(human); // NOTE closing connetion will remove id that was passed to prompt
        app.discription.innerHTML = '';
        app.connectButton.hidden = true;
    },
    consent: function(){
        dataPeer.clientReady = false;
        app.discription.innerHTML = 'Are you ready to chat?';
        app.connectButton.innerHTML = 'Ready to talk';
        app.connectButton.onclick = function oneClientReady(){
            app.discription.innerHTML = 'Waiting for peer';
            app.connectButton.hidden = true;
            dataPeer.readySignal();
        };
        app.connectButton.hidden = false;
    },
    whenConnected: function(){
        app.clearTimeouts();
        app.discription.innerHTML = 'connected to ' + dataPeer.peerName;
        app.connectButton.onclick = function(){app.disconnect(true);};
        app.connectButton.innerHTML = 'Disconnect';
        app.connectButton.hidden = false;
    },
    waiting: function(){
        app.discription.innerHTML = 'Waiting for session to start';
        app.connectButton.hidden = true;
    }
};

document.addEventListener('DOMContentLoaded', function(){       // wait till dom is loaded before manipulating it
    persistence.init(function onLocalRead(capible){
        if(capible){
            window.addEventListener("beforeunload", function(event){
                event.returnValue = '';
                if(ws.instance){dataPeer.close();ws.reduce(false);}
                app.clearTimeouts();
            });
            serviceTime.outside();
        } else {app.discription.innerHTML = 'Incompatible browser';}
    });
});

rtc.signalIce = function(){ws.send({action: 'ice', oid: localStorage.oid, candidates: rtc.candidates, gwid: rtc.connectionGwid});};
rtc.offerSignal = function(){
    ws.send({action: 'offer', oid: localStorage.oid, sdp: rtc.peer.localDescription}); // send offer to connect
    console.log('making offer');
};
rtc.answerSignal = function(oidFromOffer, gwidOfPartner){
    console.log('sending answer to ' + oidFromOffer);
    ws.send({action: 'answer', oid: localStorage.oid, sdp: rtc.peer.localDescription, peerId: oidFromOffer, gwid: gwidOfPartner});
};

dataPeer.on('disconnect', app.disconnect);
dataPeer.onClose = function(talking){rtc.close(talking);};
dataPeer.inactiveOnConfluence = function(){
    ws.reduce(true);
    app.connectButton.onclick = function(){
        dataPeer.clientReady = true;
        dataPeer.setReconsentInactive();
    };
};
dataPeer.onDisconnect = function(){ws.send({action: 'pause', oid: localStorage.oid});};
dataPeer.onReady = function(){
    console.log('about to turn on microphone');
    media.switchAudio(true); // switch audio on
    ws.reduce(false);        // reduce from connection pool
    app.whenConnected();     // change app to look like connected
};
dataPeer.setReconsentInactive = function(){
    ws.repool();
    app.timeouts = setTimeout(app.consent, TIME_FOR_CONSENT * 1000);
};
dataPeer.setReconsentActive = function(){
    if(pool.count > 1){ws.send({action: 'unmatched', oid: localStorage.oid});} // let server know we can be rematched
    app.timeouts = setTimeout(app.consent, TIME_FOR_CONSENT * 1000);
};
ws.on('offer', function(req){
    rtc.init(function(dataChannel){
        dataPeer.channel = rtc.createDataChannel(dataPeer.newChannel);
        rtc.giveAnswer(req.sdp, req.id, req.gwid);
    }, media.stream);
});
ws.on('answer', rtc.onAnswer);
ws.on('ice', rtc.recieveIce);
ws.on('makeOffer', function(req){
    if(req.pool){pool.onSet(req);}
    rtc.init(function(dataChannel){
        dataPeer.channel = rtc.createDataChannel(dataPeer.newChannel);
        rtc.createOffer();
    }, media.stream);
    prompt.caller = true; // defines who instigator is, to split labor
});
ws.on('setPool', pool.onSet);
ws.on('pool', pool.onIncrement);
