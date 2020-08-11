// rtc.js ~ Copyright 2019 Paul Beaudet ~ MIT License
var path = require('path');
var mongo = require(path.join(__dirname, 'boilerplate.js')).mongo;
var socket = require(path.join(__dirname, 'boilerplate.js')).socket;

var rtc = {
    ice: function(event, context, callback){
        try{event.body = JSON.parse(event.body);}catch(parseError){socket.cb(callback, parseError);}
        if(event.body && event.body.candidates && event.body.gwid){
            socket.send(event, event.body.gwid, {action: 'ice', candidates: event.body.candidates},
                function unresponsive(matchId){
                    mongo.removeFromPool()(matchId);
                    socket.response(event, {action: 'lostCon'}, mongo.removeFromPool());
                    socket.cb(callback, null, 'lostCon');
                },
                function sent(){socket.cb(callback, null, 'iced');}
            );
        } else {socket.cb(callback, 'invalid');}
    },
    answer: function(event, context, callback){
        try{event.body = JSON.parse(event.body);}catch(parseError){socket.cb(callback, parseError);}
        if(event.body && event.body.sdp && event.body.oid && event.body.gwid){
            socket.send(event, event.body.gwid, {action: 'answer', id: event.body.oid, sdp: event.body.sdp, gwid: event.requestContext.connectionId},
                function unresponsive(matchId){
                    mongo.removeFromPool()(matchId);
                    socket.response(event, {action: 'lostCon'}, mongo.removeFromPool());
                    socket.cb(callback, null, 'lostCon');
                },
                function sent(){socket.cb(callback, null, 'answered');}
            );
        } else {socket.cb(callback, 'invalid');}
    },
    updateConnections: function(db, event, matchOid, issue, success){
        db.updateOne({oid: event.body.oid}, {$set: {con: matchOid }}, function(error, result){
            if(result){
                db.updateOne({oid: matchOid}, {$set: {con: event.body.oid }}, function(err, rslt){
                    if(rslt){success('matched user');}
                    else    {issue('failed second update');}
                });
            } else {issue('failed update');}
        });
    },
    findMatch: function(db, event, matches, issue, success){
        return function(){
            var res = {action: 'nomatch'};
            if(matches.length){
                var index = Math.floor(Math.random() * (matches.length));
                var match = matches[index];
                socket.send(event, match.wss,
                    {action: 'offer', sdp: event.body.sdp, id: event.body.oid, gwid: event.requestContext.connectionId},
                    function failedToSend(matchId){
                        matches.splice(index, 1);
                        rtc.findMatch(db, event, matches, issue, success);
                        mongo.removeFromPool(event.clientD)(matchId);
                    },
                    function onSend(){
                        rtc.updateConnections(db, event, match.oid, function onFailedUpdates(msg){
                            socket.response(event, {action: 'nomatch'}, mongo.removeFromPool(event.clientD));
                            issue(msg);
                        }, function onUpdates(msg){
                            socket.response(event, {action: 'match'}, mongo.removeFromPool(event.clientD)); // TODO if no response, stop match?
                            success(msg);
                        });
                    }
                );
            } else {issue('no matches');}
        };
    },
    offer: function(event, context, callback){ // TODO add last match behaviour
        try{event.body = JSON.parse(event.body);}catch(parseError){socket.cb(callback, parseError);}
        if(event.body && event.body.sdp && event.body.oid){
            var channel = pool.channel(event.body);
            var query = {con: {$eq: ''}, active: true, oid: {$ne: event.body.oid }, channel: channel};
            mongo.connect(function onConnet(db, client){
                var issue = socket.issue(callback, client);
                event.clientD = client;
                var matches = [];
                mongo.stream(db.find(query, {limit: 10}), issue,
                    function onStream(doc){matches.push(doc);},
                    rtc.findMatch(db, event, matches, issue, socket.success(callback, client))
                );
            }, function(){socket.cb(callback, 'db connection issue');}, mongo.pool);
        } else {socket.cb(callback, 'validation issue');}
    }
};

var prompt = {
    recordAnswer: function(client, event, success, issue){
        if(event.body.answer){ // not passed for intial connection
            event.body.answer._id = mongo.newOid();
            event.body.answer.from = event.body.oid;
            client.db(mongo.db).collection(mongo.answer).insertOne(event.body.answer, function(error, result){
                if(error){issue(error);}
                else{success();}
            });
        }
    }
};

var pool = {
    channel: function(data){ // todo deprecate in favor of figuring this server side
        if(data.link && data.type){return data.type + '/' + data.link;}
        else                      {return 'deabute';}
    },
    update: function(db, event, success, issue){
        db.updateOne({oid: event.body.oid},
            {$set: {wss: event.requestContext.connectionId, channel: event.body.channel, con: '', active: true, oid: event.body.oid}},
            {upsert: true},
            function(error, result){
                if(result){success();}
                else      {issue('update fail');}
            }
        );
    },
    notifyAddtion: function(db, event, success, issue){
        var poolSize = 0;
        var free = 0;
        var duds = [];
        var docCount = 0;
        var docFinished = 0;
        var streamFinish = false;
        function finalFunc(){ // can be called before or after steam end depending on which callback gets called last
            if(streamFinish && docCount === docFinished){
                if(duds.length){ // if duds are removed in stream it will distroy topology (lose correct index in array by removing an element)
                    duds.forEach(function(dud){mongo.removeFromPool(event.clientd)(dud);});
                }
                poolSize++; free++;
                success(free, poolSize);
            }
        }
        function finish(){ // note to asnc streaming callbacks that total stream is finished
            streamFinish = true;
            finalFunc();
        }
        var poolChange = {action: 'pool', count: 1, owner: false};
        if(event.body.owner){poolChange.owner = true;} // this is insecure, malicious actor could claim ownership of channels since this occurs in multi and single cases
        mongo.stream(db.find({channel: event.body.channel, oid: {$ne: event.body.oid}}), issue, function stream(connection){
            docCount++;
            socket.send(event, connection.wss, poolChange,
                function onCantSend(id){
                    docFinished++;
                    duds.push(id);
                    finalFunc();
                },
                function onSend(){
                    if(connection.active){poolSize++;}
                    if(connection.con === ''){free++;}
                    docFinished++;
                    finalFunc();
                }
            );
        }, finish);
    },
    ownerUpdate: function(status, client, event, success, issue){
        // TODO validate token
        client.db(mongo.db).collection(mongo.channel).updateMany( {$and: [{owner: event.body.oid}, {multiUser: false}]}, {$set: {status: status}},
            function(error, result){
                if(result){success(result);}
                else      {issue(error);}
            }
        );
    },
    add: function(event, context, callback){
        try{event.body = JSON.parse(event.body);}catch(parseError){socket.cb(callback, parseError);}
        if(event.body){
            event.body.channel = pool.channel(event.body);
            if(event.body.oid){
                mongo.connect(function onConnet(db, client){
                    var issue = socket.issue(callback, client);
                    event.clientd = client;
                    function addToPool(){
                        pool.update(db, event, function onUpdate(){
                            pool.notifyAddtion(db, event, function notified(free, poolSize){
                                var resType = 'setPool';
                                if(free % 2 === 0){resType = 'makeOffer'; console.log('telling client to make offer');}
                                socket.response(event, {action: resType, pool: poolSize},
                                    function unresponsive(){
                                        mongo.removeFromPool(client)();
                                        issue('unresponsive');
                                    },
                                    function onSend(){prompt.recordAnswer(client, event, socket.success(callback, client), issue);} // on records error if response
                                );
                            }, issue);
                        }, issue);
                    }
                    if(event.body.token && event.body.owner){pool.ownerUpdate('ready', client, event, addToPool, issue);}
                    else{addToPool();}
                }, function(){socket.cb(callback, 'db connection issue');}, mongo.pool);
            } else {socket.cb(callback, 'validation issue');}
        }
    },
    updateReduce: function(client, event, success, issue){
        var done = event.body.pause ? 'done' : '';
        client.db(mongo.db).collection(mongo.pool).updateOne({oid: event.body.oid}, {$set: {active: false, con: done }},
            function(error, result){
                if(result){
                    if(event.body.owner && event.body.token){
                        pool.ownerUpdate('busy', client, event, success, issue);
                    } else {success();}
                } else {issue('update fail');}
            }
        );
    },
    notifyReduce: function(client, event, success, issue){
        var duds = [];
        var docCount = 0;
        var docFinished = 0;
        var streamFinish = false;
        function finalFunc(){
            if(streamFinish && docFinished === docCount){
                if(duds.length){
                    duds.forEach(function(dud){mongo.removeFromPool(event.clientd)(dud);});
                }
                success();
            }
        }
        function finish(){
            streamFinish = true;
            finalFunc();
        }
        mongo.stream(client.db(mongo.db).collection(mongo.pool).find({channel: event.body.channel}), console.log, function stream(connection){
            docCount++;
            socket.send(event, connection.wss, {action: 'pool', count: -1},
                function onCantSend(id){
                    docFinished++;
                    duds.push(id);
                    finalFunc();
                },
                function onSend(){
                    docFinished++;
                    finalFunc();
                }
            );
        }, finish);
    },
    reduce: function(event, context, callback){
        try{event.body = JSON.parse(event.body);}catch(parseError){socket.cb(callback, parseError);}
        if(!event.body.channel){event.body.channel = 'default';}
        if(event.body && event.body.oid){
            mongo.connect(function onConnet(db, client){
                event.clientd = client;
                var issue = socket.issue(callback, client);
                pool.updateReduce(client, event, function onUpdate(){
                    pool.notifyReduce(client, event, socket.success(callback, client), issue);
                }, issue);
            }, function(){socket.cb(callback, 'db connection issue');}, mongo.pool);
        } else {socket.cb(callback, 'validation issue');}
    }
};

var connection = {
    pause: function(event, context, callback){
        try{event.body = JSON.parse(event.body);}catch(parseError){socket.cb(callback, parseError);}
        if(event.body && event.body.oid){
            mongo.connect(function onConnet(db, client){
                db.updateOne({oid: event.body.oid}, {$set: {con: 'done' }},
                    function(error, result){
                        if(result){socket.success(callback, client)('paused user');}
                        else      {socket.issue(callback, client)('update issue');}
                    }
                );
            }, function(){socket.cb(callback, 'db connection issue');}, mongo.pool);
        } else {socket.cb(callback, 'validation issue');}
    },
    rematch: function(event, context, callback){
        try{event.body = JSON.parse(event.body);}catch(parseError){socket.cb(callback, parseError);}
        if(!event.body.channel){event.body.channel = 'default';}
        if(event.body && event.body.oid){
            mongo.connect(function onConnet(db, client){
                var issue = socket.issue(callback, client);
                db.updateOne({oid: event.body.oid}, {$set: {con: '' }},
                    function(error, result){
                        if(result){
                            var free = 1;
                            mongo.stream(db.find({channel: event.body.channel, oid: {$ne: event.body.oid}}), issue, function stream(doc){
                                if(doc.con === ''){free++;}
                            }, function onFinish(){
                                if(free % 2 === 0){
                                    socket.response(event, {action: 'makeOffer'},
                                        function unresponsive(){
                                            mongo.removeFromPool(client)();
                                            issue('unresponsive');
                                        },
                                        function onSend(){socket.success(callback, client)('rematch user');}
                                    );
                                }
                            });
                        } else {issue('update issue');}
                    }
                );
            }, function(){socket.cb(callback, 'db connection issue');}, mongo.pool);
        } else {socket.cb(callback, 'validation issue');}
    },
    remove: function(event, context, callback){
        try{event.body = JSON.parse(event.body);}catch(parseError){socket.cb(callback, parseError);}
        mongo.connect(function(db, client){
            db.deleteOne({oid: event.body.oid},
                function deleteCB(deleteError, result){
                    if(result){
                        if(event.body.owner && event.body.token){
                            pool.ownerUpdate('offline', client, event, socket.success(callback, client), socket.issue(callback, client));
                        } else {socket.success(callback, client)('removed');}
                    } else {socket.issue(callback, client)(deleteError);}
                    client.close();
                }
            );
        }, function issue(){socket.cb(callback, 'db connection issue');}, mongo.pool);
    }
};

module.exports.ice = rtc.ice;
module.exports.answer = rtc.answer;
module.exports.offer = rtc.offer;
module.exports.repool = pool.add;
module.exports.connected = pool.add;
module.exports.reduce = pool.reduce;
module.exports.pause = connection.pause;
module.exports.unmatched = connection.rematch;
module.exports.remove = connection.remove;
