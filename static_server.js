var express = require('express');
var app = express();

module.exports = function serve(){
    app.use(express.static('build'));
    app.listen(process.env.PORT);
};

if(!module.parent){serve();} // run server if called stand alone
