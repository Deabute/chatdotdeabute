// gateway.js ~ Copyright 2019 Paul Beaudet

var gatewayWSS = {
    connect: function(event, context, callback){callback(null, {statusCode: 200});},
    disconnect: function(event, context, callback){callback(null, {statusCode: 200});},
    default: function(event, context, callback){
        console.log(event);
        callback(null, {statusCode: 200});
    }
};

module.exports.connect = gatewayWSS.connect;
module.exports.disconnect = gatewayWSS.disconnect;
module.exports.default = gatewayWSS.default;
