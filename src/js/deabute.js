// deabute.js ~ copyright 2019 ~ Paul Beaduet
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
    incoming: function(event){           // handle incoming socket messages
        console.log(event.data);
        var req = {action: null};          // request
        try {req = JSON.parse(event.data);}catch(error){}
        if(req.action === 'msg'){
            console.log('incomming socket message: ' + req.msg);
        } else if(req.action === 'fail'){
            // don't do the thing
        }
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
    signupButton: document.getElementById('signup'),
    loginButton: document.getElementById('login'),
    username: document.getElementById('username'),
    password: document.getElementById('password'),
    accountOptions: document.getElementById('accountOptions'),
    credBox: document.getElementById('credBox'),
    accountAction: 'signup',
    login: function(){deabute.connecte('login');},
    signup: function(){deabute.connect('signup');},
    connect: function(action){
        deabute.accountAction = action;
        accountOptions.hidden = true;
        wsDeabute.init(function(){
            deabute.credBox.hidden = false; // show sign up box
        });
    },
    submit: function(){
        var username = deabute.username.value;
        var password = deabute.password.value;
        if(username && password){
            deabute.credBox.hidden = true;
            wsDeabute.send({action: deabute.accountAction, username: username, password: password});
        } else {console.log('missing creds');}
    }
};
