// lobby.js ~ copyright 2019 ~ Paul Beaduet

var lobby = {
    address: document.getElementById('lobby'),
    init: function(){
        var addressArray =  window.location.href.split('/');
        console.log(addressArray);
        var route = addressArray[3];
        if(route){
            lobby.address.innerHTML = 'Welcome to the route ' + route;
        } else {console.log('no route');}
    }
};

lobby.init();
