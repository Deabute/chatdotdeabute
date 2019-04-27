// rtctest.js ~ copyright 2019 Paul Beaudet ~ MIT License
// rtcSignal version - 1.0.28
// This test requires at least two browser windows, to open a data connection between two peer
var DAY_OF_WEEK = 6;
var HOUR_OF_DAY = 14;
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
        // ws.onConnection = serviceTime.onWSConnect;
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

var app = { //requires media, ws, dataPeer, serviceTime,
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
            else if (mediaStream){
                ws.init(function(){
                    ws.send({action: 'connected', oid: localStorage.oid, lastMatches: rtc.lastMatches});
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

// set up app
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
// instantiate interdependent functions
ws.on('offer', function(req){
    rtc.init(function(dataChannel){
        dataPeer.channel = rtc.createDataChannel(dataPeer.newChannel);
        rtc.giveAnswer(req.sdp, req.id, req.gwid);
    }, media.stream);
});
ws.on('answer', rtc.onAnswer);
ws.on('ice', rtc.onIce);
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
rtc.signalIce = function(){ws.send({action: 'ice', oid: localStorage.oid, candidates: rtc.candidates, gwid: rtc.connectionGwid});};
dataPeer.on('disconnect', app.disconnect);
rtc.offerSignal = function(){
    ws.send({action: 'offer', oid: localStorage.oid, sdp: rtc.peer.localDescription, lastMatches: rtc.lastMatches}); // send offer to connect
    console.log('making offer');
};
rtc.answerSignal = function(oidFromOffer, gwidOfPartner){
    console.log('sending answer to ' + oidFromOffer);
    ws.send({action: 'answer', oid: localStorage.oid, sdp: rtc.peer.localDescription, peerId: oidFromOffer, gwid: gwidOfPartner});
};
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