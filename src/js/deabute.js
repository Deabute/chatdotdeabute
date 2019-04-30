// deabute.js ~ copyright 2019 ~ Paul Beaduet
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
            // deabute.onUser(lobby.mine, lobby.name, localStorage.username); // TODO figure out how to renable this
        } else {deabute.status.innerHTML = 'Opps something when wrong';}
    },
    onSignup: function(req){
        deabute.status.innerHTML = req.msg + ', login now';
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
