// gateway.js ~ Copyright 2019-2020 Paul Beaudet

const gatewayWSS = {
  connect: (event, context, callback) => {
    callback(null, { statusCode: 200 });
  },
  disconnect: (event, context, callback) => {
    callback(null, { statusCode: 200 });
  },
  default: (event, context, callback) => {
    console.log(event);
    callback(null, { statusCode: 200 });
  },
};

module.exports.connect = gatewayWSS.connect;
module.exports.disconnect = gatewayWSS.disconnect;
module.exports.default = gatewayWSS.default;
