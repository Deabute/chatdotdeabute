// dropin.js ~ copyright 2019 ~ Paul Beaduet

var lobby = {
    info: document.getElementById('lobby'),
    startButton: document.getElementById('readyButton'),
    name: 'Deabute',
    type: 'user',
    mine: false,
    init: function(inLobby){
        var addressArray =  window.location.href.split('/');
        if(addressArray.length === 4){
            var route = addressArray[3];
            var regex = /^[a-z]+$/;                                         // make sure there are only lowercase a-z to the last letter
            if(regex.test(route)){
                lobby.name = route;
                inLobby(true);
            } else { // console.log('route has to be lower case letters');
                inLobby(false);
            }
        } else { // console.log('address too long to be a route');
            inLobby(false);
        }
    },
    status: function(req){
        if(req.isLobby){
            if(req.lobbytype){lobby.type = req.lobbytype;}
            if(localStorage.token && localStorage.oid && localStorage.username){
                if(lobby.name === localStorage.username){lobby.mine = true;}
                deabute.onUser(lobby.mine, lobby.name, localStorage.username);
                if(lobby.mine){ // probably need to use a token to confirm this at one point
                    lobby.startButton.hidden = false;
                    lobby.info.hidden = true;
                } else {lobby.info.innerHTML = lobby.name + ' is ' + req.status;}
            } else {
                lobby.info.innerHTML = lobby.name + ' is ' + req.status;
                if(req.status === 'ready'){lobby.startButton.hidden = false;}
            }
        } else {lobby.info.innerHTML = 'Sorry, not much is here. Aside from this text';}
    },
    ready: function(){ // requires rtcsignals.js
        lobby.startButton.hidden = true;
        media.init(function onGotMedia(error, stream){
            if(stream){
                var token = '';
                if(lobby.name === localStorage.username){token = localStorage.token;}
                ws.init(function onGotConnection(){ // todo add channel information into payload
                    ws.send({action: 'connected', oid: localStorage.oid, type: lobby.type, link: lobby.name, token: token});
                });
            } else {console.log('no steam: ' + error);}
        });
        dataPeer.app = dapp;
    }
};

var dapp = {
    connectButton: lobby.startButton, // this should be attached to a button
    timeouts: 0,
    onPeer: function(peer){dapp.consent(peer);},
    clearTimeouts: function(){
        if(dapp.timeouts > 0){while(dapp.timeouts--){clearTimeout(dapp.timeouts + 1);}}
    },
    whenConnected: function(){
        dapp.clearTimeouts();
        lobby.info.innerHTML = 'connected to ' + dataPeer.peerName;
        lobby.startButton.onclick = function(){dapp.disconnect(true);};
        lobby.startButton.innerHTML = 'Disconnect';
        lobby.startButton.hidden = false;
    },
    consent: function(peer){
        lobby.info.hidden = false;
        dataPeer.clientReady = false;
        var greet = 'Are you ready to chat?';
        if(lobby.mine){greet = peer + ' would like to talk with you?';}
        lobby.info.innerHTML = greet;
        lobby.startButton.innerHTML = 'Ready to talk';
        lobby.startButton.onclick = function oneClientReady(){
            lobby.info.innerHTML = 'Waiting for ' + peer;
            lobby.startButton.hidden = true;
            dataPeer.readySignal();
        };
        lobby.startButton.hidden = false;
    },
    disconnect: function(human){
        media.switchAudio(false);
        dapp.consent();
        ws.repool();
        dataPeer.disconnect(human); // NOTE closing connetion will remove id that was passed to prompt
        lobby.info.innerHTML = '';
        lobby.startButton.hidden = true;
    }
};


persistence.init(function(localPersistence){
    if(localPersistence){
        lobby.init(function(inLobby){
            wsDeabute.init(function(){ // set up connection with
                deabute.init();
                if(inLobby){
                    wsDeabute.send({action: 'status', lobby: lobby.name});
                    wsDeabute.handlers.push({action: 'status', func: lobby.status});
                }
            });
        });
    } else {console.log('no local persistence');}
});
