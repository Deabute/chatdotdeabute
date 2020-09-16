// boilerplate.js ~ Copyright 2019-2020 Paul Beaudet ~ MIT License
const MongoClient = require('mongodb').MongoClient;
const ObjectID = require('mongodb').ObjectID;
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

const mongo = {
  db: process.env.DB_NAME,
  pool: 'rtcpool',
  channel: 'channels',
  user: 'users',
  answer: 'answers',
  connect: (onConnect, issueCallback, collection) => {
    MongoClient.connect(
      process.env.MONGODB_URI,
      {
        useNewUrlParser: true,
        // Using unified topology blocks connections to mongodb
        // useUnifiedTopology: true,
      },
      (connectionError, client) => {
        if (client) {
          onConnect(
            client.db(mongo.db).collection(collection ? collection : 'users'),
            client
          );
        } else {
          issueCallback(connectionError);
        }
      }
    );
  },
  newOid: () => {
    return new ObjectID();
  },
  stream: (cursor, issue, stream, finish) => {
    cursor.next((error, doc) => {
      if (doc) {
        stream(doc);
        // action for each doc in stream
        mongo.stream(cursor, issue, stream, finish);
        // recursively move through all members in collection
      } else {
        if (error) {
          issue(error);
        } else {
          finish();
        }
      }
    });
  },
  removeFromPool: providedClient => {
    if (providedClient) {
      return connectionId => {
        providedClient
          .db(process.env.DB_NAME)
          .collection(mongo.pool)
          .deleteOne(
            {
              wss: connectionId,
            },
            (deleteError, result) => {
              if (result) {
                console.log(connectionId + ' removed from pool');
              } else {
                console.log('Issue removing dud ' + deleteError);
              }
            }
          );
      };
    } else {
      return connectionId => {
        mongo.connect(
          (db, client) => {
            db.deleteOne({ wss: connectionId }, (deleteError, result) => {
              if (result) {
                console.log(connectionId + '/ removed from pool');
              } else {
                console.log('Issue removing dud ' + deleteError);
              }
              client.close();
            });
          },
          () => {},
          mongo.pool
        );
      };
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

module.exports.mongo = mongo;
module.exports.socket = socket;
module.exports.parseBody = parseBody;
