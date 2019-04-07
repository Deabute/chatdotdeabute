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
    signupBox: document.getElementById('signupBox'),
    loginBox: document.getElementById('loginBox'),
    susername: document.getElementById('susername'),
    spassword: document.getElementById('spassword'),
    lusername: document.getElementById('lusername'),
    lpassword: document.getElementById('lpassword'),
    loginSel: function(){
        deabute.loginButton.hidden = true;       // hide pressed button
        wsDeabute.init(function(){
            deabute.loginBox.hidden = false; // show login box
        });
    },
    signupSel: function(){
        deabute.signupButton.hidden = true;      // hide pressed button
        wsDeabute.init(function(){
            deabute.signupBox.hidden = false; // show sign up box
        });
    },
    login: function(){
        var username = deabute.lusername.value;
        var password = deabute.lpassword.value;
        if(username && password){
            deabute.loginBox.hidden = true;
            wsDeabute.send({action: 'login', username: username, password: password});
        } else {console.log('missing shit');}
    },
    signup: function(){
        var username = deabute.susername.value;
        var password = deabute.spassword.value;
        if(username && password){
            deabute.signupBox.hidden = true;
            wsDeabute.send({action: 'signup', username: username, password: password});
        } else {console.log('missing shit');}
    }
};
