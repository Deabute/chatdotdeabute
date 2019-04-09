// deabute.js ~ copyright 2019 ~ Paul Beaduet
var lobby = {
    address: document.getElementById('lobby'),
    startButton: document.getElementById('readyButton'),
    name: '',
    type: 'user',
    init: function(onDetermine){
        var addressArray =  window.location.href.split('/');
        if(addressArray.length === 4){
            var route = addressArray[3];
            var regex = /^[a-z]+$/;                                         // make sure there are only lowercase a-z to the last letter
            if(regex.test(route)){
                lobby.name = route;
                onDetermine();
            } else {console.log('route has to be lower case letters');}
        } else { console.log('address too long to be a route');}
    },
    status: function(req){
        if(req.isLobby){
            if(req.lobbytype){lobby.type = req.lobbytype;}
            if(localStorage.token && localStorage.oid && localStorage.username){
                deabute.onUser(lobby.name, localStorage.username);
                if(lobby.name === localStorage.username){ // probably need to use a token to confirm this at one point
                    lobby.startButton.hidden = false;
                    lobby.address.hidden = true;
                } else {
                    lobby.address.innerHTML = lobby.name + ' is ' + req.status;
                }
            } else {
                lobby.address.innerHTML = lobby.name + ' is ' + req.status;
                if(req.status === 'ready'){
                    lobby.startButton.hidden = false;
                }
            }
        } else {lobby.address.innerHTML = 'Sorry, not much is here. Aside from this text';}
    },
    ready: function(){ // requires rtcsignals.js
        media.init(function onGotMedia(error, stream){
            if(stream){
                var token = '';
                if(lobby.name === localStorage.username){token = localStorage.token;}
                ws.init(function onGotConnection(){ // todo add channel information into payload
                    ws.send({action: 'connected', oid: localStorage.oid, type: lobby.type, link: lobby.name, token: token});
                });
            } else {console.log('no steam: ' + error);}
        });
    }
};

var wsDeabute = {
    active: false,
    instance: null,                                // placeholder for websocket object
    connected: false,                              // set to true when connected to server
    onConnection: function(){console.log('huh');}, // default to waiting for connections to pool dialog
    server: document.getElementById('accountserver').innerHTML,
    init: function(onConnection){
        wsDeabute.instance = new WebSocket(wsDeabute.server);
        wsDeabute.instance.onopen = function(event){
            wsDeabute.active = true;
            wsDeabute.connected = true;
            wsDeabute.instance.onmessage = wsDeabute.incoming;
            wsDeabute.onclose = function onSocketClose(){wsDeabute.connected = false;};
            onConnection = onConnection ? onConnection : wsDeabute.onConnection;
            onConnection();
        };
    },
    handlers: [
        {action: 'msg', func: function(req){console.log(req.msg);}},
    ],
    incoming: function(event){           // handle incoming socket messages
        console.log(event.data);
        var req = {action: null};          // request
        try {req = JSON.parse(event.data);}catch(error){}
        for(var h=0; h < wsDeabute.handlers.length; h++){
            if(req.action === wsDeabute.handlers[h].action){
                wsDeabute.handlers[h].func(req);
                return;
            }
        }
        if(req.message === 'Internal server error'){lobby.address = 'Opps something when wrong';return;}
        console.log('no handler ' + event.data);
    },
    send: function(msg){
        try{msg = JSON.stringify(msg);} catch(error){msg = {action:'error', error: error};}
        if(wsDeabute.connected){
            wsDeabute.instance.send(msg);
            return true;
        } else { return false; }
    }
};

var deabute = {
    token: '',
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
        accountOptions.hidden = true;
        if(wsDeabute.connected){
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
        wsDeabute.handlers.push({action: 'loggedin', func: deabute.onLogin});
        wsDeabute.handlers.push({action: 'signedup', func: deabute.onSignup});
        wsDeabute.handlers.push({action: 'fail', func: deabute.onFail});
    },
    onUser: function(lobbyname, username){
        if(username === lobbyname){deabute.status.innerHTML = 'Hey ' + username + '!, welcome to your lobby';}
        else                      {deabute.status.innerHTML = 'Hey ' + username + '!, Welcome to ' + lobbyname + '\'s lobby';}
        deabute.status.hidden = false;
    },
    onLogin: function(req){
        if(req.token && req.oid){
            localStorage.oid = req.oid;
            localStorage.username = deabute.username.value;
            localStorage.token = req.token;
            deabute.onUser(lobby.name, localStorage.username);
        } else {lobby.address = 'Opps something when wrong';}
        deabute.token = req.token;
    },
    onSignup: function(req){
        deabute.status.innerHTML = req.msg + ' login now';
        deabute.accountAction = 'login';
        deabute.credBox.hidden = false;
    },
    onFail: function(req){
        deabute.status.innerHTML = req.msg;
    }
};

persistence.init(function(localPersistence){
    if(localPersistence){
        lobby.init(function(){
            wsDeabute.init(function(){ // set up connection with
                deabute.init();
                wsDeabute.send({action: 'status', lobby: lobby.name});
                wsDeabute.handlers.push({action: 'status', func: lobby.status});
            });
        });
    } else {console.log('no local persistence');}
});
