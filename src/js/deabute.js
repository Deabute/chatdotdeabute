// deabute.js ~ copyright 2019 ~ Paul Beaduet

var lobby = {
    address: document.getElementById('lobby'),
    name: '',
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
            lobby.address.innerHTML = lobby.name + ' is ' + req.status;
        }
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
            console.log('connected to account server');
            wsDeabute.active = true;
            wsDeabute.connected = true;
            wsDeabute.instance.onmessage = wsDeabute.incoming;
            wsDeabute.send({action: 'connected', oid: localStorage.oid, lastMatches: rtc.lastMatches});
            wsDeabute.onclose = function onSocketClose(){wsDeabute.connected = false;};
            onConnection = onConnection ? onConnection : wsDeabute.onConnection;
            onConnection();
        };
    },
    handlers: [
        {action: 'msg', func: function(req){console.log(req.msg);}},
    ],
    incoming: function(event){           // handle incoming socket messages
        var req = {action: null};          // request
        try {req = JSON.parse(event.data);}catch(error){}
        for(var h=0; h < wsDeabute.handlers.length; h++){
            if(req.action === wsDeabute.handlers[h].action){
                wsDeabute.handlers[h].func(req);
                return;
            }
        }
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
                wsDeabute.send({action: deabute.accountAction, username: deabute.username.value, password: deabute.password.value});
            } else {deabute.status.innerHTML = 'Username must be lowercase letters';}
        } else {deabute.status.innerHTML = 'Missing information';}
    },
    init: function(){
        wsDeabute.handlers.push({action: 'loggedin', func: deabute.onLogin});
        wsDeabute.handlers.push({action: 'signedup', func: deabute.onSignup});
        wsDeabute.handlers.push({action: 'fail', func: deabute.onFail});
    },
    onLogin: function(req){
        if(deabute.username.value === lobby.name){
            deabute.status.innerHTML = deabute.username.value + ' welcome to your lobby';
        } else {
            deabute.status.innerHTML = deabute.username.value + ' Welcome to ' + lobby.name + '\'s lobby';
        }
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

lobby.init(function(){
    wsDeabute.init(function(){
        wsDeabute.send({action: 'status', lobby: lobby.name});
    });
    wsDeabute.handlers.push({action: 'status', func: lobby.status});
    deabute.init();
});
