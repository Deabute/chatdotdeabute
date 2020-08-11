// user.js ~ functions for users to sign up and login ~ Copyright 2019 Paul Beaudet MIT license
var path = require('path');
var bcrypt = require('bcryptjs');
var mongo = require(path.join(__dirname, 'boilerplate.js')).mongo;
var socket = require(path.join(__dirname, 'boilerplate.js')).socket;

var login = {
    findUser: function(event, db, success, issue){
        db.findOne({username: event.body.username}, function onFind(findError, doc){
            if(findError){issue(findError);}
            else if(doc) {success(doc);}
            else         {issue('no user');}
        });
    },
    compareHash: function(event, user, success, issue){
        bcrypt.compare(event.body.password, user.passhash, function(compareError, result){
            if(result){success();}
            else      {issue('wrong password');}
        });
    },
    assignToken: function(event, user, db, success, issue){
        var token = mongo.newOid().toString();
        db.updateOne({_id: user._id}, {$set: {token: token}}, function onUpdate(err, result){
            if(result){
                socket.response(event, {action: 'loggedin', username: user.username, token: token, oid: user.originId, paid: 'true'}); // TODO spell out actual paid logic
                success('logged in');
            } else {issue('no token assigned');}
        });
    },
    lambda: function(event, context, callback){
        try{event.body = JSON.parse(event.body);}catch(parseError){socket.cb(callback, parseError);}
        if(event.body){
            mongo.connect(function(db, client){
                var fail = socket.issue(callback, client);
                var issue = function(msg){
                    socket.response(event, {action: 'reject', msg: 'Try something different'});
                    fail(msg);
                };
                login.findUser(event, db, function(userDoc){
                    login.compareHash(event, userDoc, function(){
                        login.assignToken(event, userDoc, db, socket.success(callback, client), issue);
                    }, issue);
                }, issue);
            }, function(){socket.cb(callback, 'db connection issue');});
        } else {socket.cb(callback, 'validation issue');}
    }
};

var signup = {
    checkExisting: function(event, db, success, issue){
        db.findOne({username: event.body.username}, function onFoundOne(error, doc){
            if(error){issue(error);}
            else if(doc){
                // socket.response(event, {action: 'fail', msg: 'username taken'});
                issue('username taken');
            } else {success();} // no user found is success case
        });
    },
    getHash: function(password, success, issue){
        bcrypt.hash(password, 10, function onHash(hashError, hash){
            if(hash){success(hash);}
            else    {issue(hashError);}
        });
    },
    insertNew: function(hash, event, db, success, issue){
        db.insertOne( {_id: mongo.newOid(), username: event.body.username, passhash: hash, token: '', signalWSid: '', originId: event.body.oid},
            function onInsert(insertError, result){
                if(result){
                    socket.response(event, {action: 'signedup', msg: 'signed up'});
                    success('signed up');
                } else if(insertError){issue(insertError);}
            }
        );
    },
    lambda: function(event, context, callback){
        try{event.body = JSON.parse(event.body);}catch(parseError){socket.cb(callback, parseError);}
        if(event.body && event.body.password && event.body.username){
            mongo.connect(function(db, client){
                var fail = socket.issue(callback, client);
                var issue = function(msg){
                    socket.response(event, {action: 'reject', msg: 'Try something different'});
                    fail(msg);
                };
                signup.checkExisting(event, db, function noExisting(){
                    signup.getHash(event.body.password, function gotHash(hash){
                        signup.insertNew(hash, event, db, socket.success(callback, client), issue);
                    }, issue);
                }, issue);
            }, function(){socket.cb(callback, 'db connection issue');});
        } else {socket.cb(callback, 'validation issue');}
    }
};

var status = {
    checkOwnership: function(event, client, success, issue){
        client.db(mongo.db).collection(mongo.user).findOne({originId: event.body.channelDoc.owner, token: event.body.token}, function(error, doc){
            if(error){issue(error);}
            else if(doc){
                event.body.channelDoc.yours = true; // let client know its okay to think of this channel as "theirs"
                success(event.body.channelDoc);
            } else {success(event.body.channel.Doc);}
        });
    },
    updateWaiting: function(event, client, success, issue){ // pool candidates that are waiting for a single user account
        client.db(mongo.db).collection(mongo.pool).updateOne({oid: event.body.oid},
            {$set: {wss: event.requestContext.connectionId, channel: 'single/' + event.body.channel, con: 'waiting', active: false, oid: event.body.oid}},
            {upsert: true},
            function(error, result){
                if(result){success(event.body.channelDoc);}
                else      {issue('update fail');}
            }
        );
    },
    checkExisting: function(event, client, success, issue){
        client.db(mongo.db).collection(mongo.channel).findOne({name: event.body.channel}, function onFoundOne(error, doc){
            if(error){issue(error);}
            else if(doc){
                event.body.channelDoc = doc;
                if(!doc.multiUser && event.body.token && event.body.oid === doc.owner){
                    status.checkOwnership(event, client, success, issue);
                } else { // visitor case
                    if(doc.multiUser || doc.status === 'ready'){success(doc);}
                    else {status.updateWaiting(event, client, success, issue);}
                }
            } else {success();}    // no lobby found is also a valid case
        });
    },
    lambda: function(event, context, callback){
        try{event.body = JSON.parse(event.body);}catch(parseError){socket.cb(callback, parseError);}
        if(event.body && event.body.channel){
            mongo.connect(function(db, client){
                var issue = socket.issue(callback, client);
                status.checkExisting(event, client, function onDetermine(doc){
                    var sigResponse = {action: 'status', exist: false};
                    if(doc){
                        sigResponse.exist = true;
                        sigResponse.status = doc.status;
                        sigResponse.owner = doc.yours ? true : false;
                        sigResponse.multi = doc.multiUser;
                        sigResponse.utcHour = doc.hourUTC;
                        sigResponse.day = doc.day;
                    }
                    socket.response(event, sigResponse);
                    socket.success(callback, client)('gotStatus');
                }, issue);
            }, function(){socket.cb(callback, 'db connection issue');});
        } else {socket.cb(callback, 'validation issue');}
    }
};

module.exports.login = login.lambda;
module.exports.signup = signup.lambda;
module.exports.status = status.lambda;
