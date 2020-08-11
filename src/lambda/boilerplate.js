// boilerplate.js ~ Copyright 2019 Paul Beaudet ~ MIT License
var MongoClient = require('mongodb').MongoClient;
var ObjectID = require('mongodb').ObjectID;
var AWS = require('aws-sdk');
require('aws-sdk/clients/apigatewaymanagementapi'); // make apigateway namespace available

var socket = {
    cb: function (callback, error, body) {
        if (error) { console.log(error); }
        callback(null, { statusCode: error ? 500 : 200, body: error ? error : body });
    },
    issue: function (callback, dbClient) { // function where we are expected to close db connection as part of process
        return function (issueMsg) {
            dbClient.close();
            socket.cb(callback, issueMsg);
        };
    },
    success: function (callback, dbClient) { // function where we are expected to close db connection as part of process
        return function (successMsg) {
            dbClient.close();
            socket.cb(callback, null, successMsg);
        };
    },
    response: function (event, jsonData, unresponsive, onSend) { event.resD = true; socket.send(event, event.requestContext.connectionId, jsonData, unresponsive, onSend); },
    send: function (event, connectionId, jsonData, unresponsiveCB, success) {
        if (!success) { success = function () { }; }
        if (event.deabute) {
            if (event.resD) {
                if (event.deabute.response(jsonData)) { success(); }
                else { unresponsiveCB(connectionId); }
            } else {
                if (event.deabute.sendTo(connectionId, jsonData)) { success(); }
                else { unresponsiveCB(connectionId); }
            }
        } else {
            var gateway = new AWS.ApiGatewayManagementApi({
                apiVersion: "2018-11-29",
                endpoint: event.requestContext.domainName + '/signal'
            });
            gateway.postToConnection({ ConnectionId: connectionId, Data: JSON.stringify(jsonData) }, function (error, data) {
                if (error) {
                    // console.log('depooling client cause: ');console.log(JSON.stringify(error));
                    unresponsiveCB(connectionId);
                } else { success(); }
            });
        }
    }
};

var mongo = {
    db: process.env.DB_NAME,
    pool: 'rtcpool',
    channel: 'channels',
    user: 'users',
    answer: 'answers',
    connect: function (onConnect, issueCallback, collection) {
        MongoClient.connect(process.env.MONGODB_URI, { useNewUrlParser: true }, function whenConnected(connectionError, client) {
            if (client) { onConnect(client.db(mongo.db).collection(collection ? collection : 'users'), client); }
            else { issueCallback(connectionError); }
        });
    },
    newOid: function () { return new ObjectID(); },
    stream: function (cursor, issue, stream, finish) {
        cursor.next(function onDoc(error, doc) {
            if (doc) {
                stream(doc);                                  // action for each doc in stream
                mongo.stream(cursor, issue, stream, finish);  // recursively move through all members in collection
            } else {
                if (error) { issue(error); }
                else { finish(); }
            }
        });
    },
    removeFromPool: function (providedClient) {
        if (providedClient) {
            return function removeCon(connectionId) {
                providedClient.db(process.env.DB_NAME).collection(mongo.pool).deleteOne({ wss: connectionId }, function deleteCB(deleteError, result) {
                    if (result) { console.log(connectionId + ' removed from pool'); }
                    else { console.log('Issue removing dud ' + deleteError); }
                });
            };
        } else {
            return function (connectionId) {
                mongo.connect(function (db, client) {
                    db.deleteOne({ wss: connectionId },
                        function deleteCB(deleteError, result) {
                            if (result) { console.log(connectionId + '/ removed from pool'); }
                            else { console.log('Issue removing dud ' + deleteError); }
                            client.close();
                        }
                    );
                }, function issue() { }, mongo.pool);
            };
        }
    }
};

module.exports.mongo = mongo;
module.exports.socket = socket;
