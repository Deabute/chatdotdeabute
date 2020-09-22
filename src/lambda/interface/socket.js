// socket.js ~ Copyright 2019-2020 Paul Beaudet ~ MIT License
const AWS = require('aws-sdk');
// make apigateway namespace available
require('aws-sdk/clients/apigatewaymanagementapi');

const socket = {
  cb: (callback, error, body) => {
    if (error) {
      console.log(error);
    }
    callback(null, {
      statusCode: error ? 500 : 200,
      body: error ? error : body,
    });
  },
  issue: (callback, dbClient) => {
    // function where we are expected to close db connection as part of process
    return issueMsg => {
      dbClient.close();
      socket.cb(callback, issueMsg);
    };
  },
  success: (callback, dbClient) => {
    // function where we are expected to close db connection as part of process
    return successMsg => {
      dbClient.close();
      socket.cb(callback, null, successMsg);
    };
  },
  response: (event, jsonData, unresponsive, onSend) => {
    event.resD = true;
    socket.send(
      event,
      event.requestContext.connectionId,
      jsonData,
      unresponsive,
      onSend
    );
  },
  send: (event, connectionId, jsonData, unresponsiveCB, success) => {
    if (!success) {
      success = () => {};
    }
    if (event.deabute) {
      if (event.resD) {
        if (event.deabute.response(jsonData)) {
          success();
        } else {
          unresponsiveCB(connectionId);
        }
      } else {
        if (event.deabute.sendTo(connectionId, jsonData)) {
          success();
        } else {
          unresponsiveCB(connectionId);
        }
      }
    } else {
      const gateway = new AWS.ApiGatewayManagementApi({
        apiVersion: '2018-11-29',
        endpoint: event.requestContext.domainName + '/signal',
      });
      gateway.postToConnection(
        {
          ConnectionId: connectionId,
          Data: JSON.stringify(jsonData),
        },
        error => {
          if (error) {
            unresponsiveCB(connectionId);
          } else {
            success();
          }
        }
      );
    }
  },
};

const parseBody = (body, callback) => {
  try {
    const jsonBody = JSON.parse(body);
    return jsonBody;
  } catch (parseError) {
    socket.cb(callback, parseError);
    return null;
  }
};

module.exports.socket = socket;
module.exports.parseBody = parseBody;
