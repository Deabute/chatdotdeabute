var express = require('express');
var app = express();
// app.use(function(req, res, next){
//     res.set({
//         'Content-Type': 'application/javascript; charset=utf-8'
//     });
//     return next();
// });
app.use(express.static('build'));
app.listen(process.env.PORT);
