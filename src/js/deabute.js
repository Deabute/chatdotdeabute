// deabute.js ~ copyright 2019 ~ Paul Beaduet
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

var wsDeabute = {
    active: false,
    instance: null,                                // placeholder for websocket object
    onConnection: function(){console.log('huh');}, // default to waiting for connections to pool dialog
    server: document.getElementById('accountserver').innerHTML,
    init: function(onConnection){
        wsDeabute.instance = new WebSocket(wsDeabute.server);
        wsDeabute.instance.onopen = function(event){
            wsDeabute.active = true;
            wsDeabute.instance.onmessage = wsDeabute.incoming;
            wsDeabute.onclose = function onSocketClose(){wsDeabute.instance = false;};
            onConnection = onConnection ? onConnection : wsDeabute.onConnection;
            onConnection();
        };
    },
    handlers: [{action: 'msg', func: function(req){console.log(req.msg);}},],
    on: function(action, func){wsDeabute.handlers.push({action: action, func: func});},
    incoming: function(event){           // handle incoming socket messages
        var req = {action: null};          // request
        try {req = JSON.parse(event.data);}catch(error){}
        for(var h=0; h < wsDeabute.handlers.length; h++){
            if(req.action === wsDeabute.handlers[h].action){
                wsDeabute.handlers[h].func(req);
                return;
            }
        }
        if(req.message === 'Internal server error'){lobby.info = 'Opps something when wrong';return;}
        console.log('no handler ' + event.data);
    },
    send: function(msg){
        try{msg = JSON.stringify(msg);} catch(error){msg = {action:'error', error: error};}
        if(wsDeabute.instance){wsDeabute.instance.send(msg);}
    }
};

var deabute = {
    signupButton: document.getElementById('signup'),
    loginButton: document.getElementById('login'),
    username: document.getElementById('username'),
    password: document.getElementById('password'),
    accountOptions: document.getElementById('accountOptions'),
    credBox: document.getElementById('credBox'),
    status: document.getElementById('accountStatus'),
    accountAction: 'signup',
    login: function(){deabute.display('login');},
    signup: function(){deabute.display('signup');},
    display: function(action){
        deabute.accountAction = action;
        deabute.accountOptions.hidden = true;
        if(wsDeabute.instance){
            deabute.status.hidden = false;
            deabute.credBox.hidden = false; // show sign up box
        } else {
            deabute.status.innerHTML = 'sorry, issue communicating: reload page';
        }
    },
    submit: function(){
        var regex = /^[a-z]+$/;                                         // make sure there are only lowercase a-z to the last letter
        if(deabute.username.value && deabute.password.value){
            if(regex.test(deabute.username.value)){
                deabute.credBox.hidden = true;
                wsDeabute.send({action: deabute.accountAction, username: deabute.username.value, password: deabute.password.value, oid: localStorage.oid});
            } else {deabute.status.innerHTML = 'Username must be lowercase letters';}
        } else {deabute.status.innerHTML = 'Missing information';}
    },
    init: function(){
        if(localStorage.token && localStorage.oid && localStorage.username){
            deabute.status.innerHTML = '';
        }
        wsDeabute.on('loggedin', deabute.onLogin);
        wsDeabute.on('signedup', deabute.onSignup);
        wsDeabute.on('reject', deabute.rejected);
        wsDeabute.on('fail', deabute.onFail);
    },
    onUser: function(mine, lobbyname, username){
        if(mine){deabute.status.innerHTML = 'Hey ' + username + '! Welcome to your lobby';}
        else    {deabute.status.innerHTML = 'Hey ' + username + '! Welcome to ' + lobbyname + '\'s lobby';}
        deabute.status.hidden = false;
    },
    onLogin: function(req){
        if(req.token && req.oid){
            localStorage.oid = req.oid;
            localStorage.username = deabute.username.value;
            localStorage.token = req.token;
            deabute.onUser(lobby.mine, lobby.name, localStorage.username);
        } else {lobby.info = 'Opps something when wrong';}
    },
    onSignup: function(req){
        deabute.status.innerHTML = req.msg + ' login now';
        deabute.accountAction = 'login';
        deabute.credBox.hidden = false;
    },
    rejected: function(req){
        console.log('on rejected');
        deabute.status.innerHTML = req.msg;
        deabute.credBox.hidden = false;
    },
    onFail: function(req){deabute.status.innerHTML = req.msg;}
};
