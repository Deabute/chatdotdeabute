// lobby.js ~ copyright 2019 ~ Paul Beaduet

var lobby = {
    address: document.getElementById('lobby'),
    name: '',
    init: function(){
        var addressArray =  window.location.href.split('/');
        if(addressArray.length === 4){
            var route = addressArray[3];
            var regex = /^[a-z]+$/;                                         // make sure there are only lowercase a-z to the last letter
            if(regex.test(route)){
                lobby.name = route;
                lobby.address.innerHTML = lobby.name;
                // ws.handlers.push(lobby.status);
                // ws.init(function(){
                //     ws.send({action: 'getstatus', lobby: route});
                // });
            } else {console.log('route has to be lower case letters');}
        } else { console.log('address too long to be a route');}
    },
    status: {
        type: 'status',
        func: function(req){
            lobby.address.innerHTML = lobby.name + ' is ' + req.status;
        }
    }
};

lobby.init();
