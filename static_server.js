var express = require('express');
var app = express();
var path = require('path');

module.exports = function serve(){
    app.use(express.static('build'));
    var router = express.Router();
    router.get('/:erm', function(req, res){
        res.status(200);
        res.sendFile(path.join(__dirname + '/build/redirect.html'));
    });
    app.use(router);

    app.listen(process.env.PORT);
};

if(!module.parent){serve();} // run server if called stand alone
