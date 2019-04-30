// dropin.js ~ copyright 2019 ~ Paul Beaduet

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
