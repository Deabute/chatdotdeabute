// lobby.js ~ copyright 2019 ~ Paul Beaduet

var lobby = {
    address: document.getElementById('lobby'),
    init: function(){
        var addressArray =  window.location.href.split('/');
        if(addressArray.length === 4){
            var route = addressArray[3];
            if(route){
                lobby.address.innerHTML = 'Welcome to the route ' + route;
                ws.init(function(){
                    console.log('connected to server');
                });
            } else {console.log('no route');}
        } else { console.log('address too long to be a route');}
    }
};

lobby.init();
