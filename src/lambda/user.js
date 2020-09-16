// user.js ~ functions for users to sign up and login ~ Copyright 2019 Paul Beaudet MIT license
const path = require('path');
const bcrypt = require('bcryptjs');
const { mongo, socket, parseBody } = require(path.join(
  __dirname,
  'boilerplate.js'
));

const login = {
  findUser: (event, db, success, issue) => {
    db.findOne({ username: event.body.username }, (findError, doc) => {
      if (findError) {
        issue(findError);
      } else if (doc) {
        success(doc);
      } else {
        issue('no user');
      }
    });
  },
  compareHash: (event, user, success, issue) => {
    bcrypt.compare(
      event.body.password,
      user.passhash,
      (compareError, result) => {
        if (result) {
          success();
        } else {
          issue('wrong password');
        }
      }
    );
  },
  assignToken: (event, user, db, success, issue) => {
    const token = mongo.newOid().toString();
    db.updateOne(
      {
        _id: user._id,
      },
      {
        $set: { token },
      },
      (err, result) => {
        if (result) {
          socket.response(event, {
            action: 'loggedin',
            username: user.username,
            token,
            oid: user.originId,
            paid: 'true',
          }); // TODO spell out actual paid logic
          success('logged in');
        } else {
          issue('no token assigned');
        }
      }
    );
  },
  lambda: (event, context, callback) => {
    event.body = parseBody(event.body);
    if (event.body) {
      mongo.connect(
        (db, client) => {
          const fail = socket.issue(callback, client);
          const issue = msg => {
            socket.response(event, {
              action: 'reject',
              msg: 'Try something different',
            });
            fail(msg);
          };
          login.findUser(
            event,
            db,
            userDoc => {
              login.compareHash(
                event,
                userDoc,
                () => {
                  login.assignToken(
                    event,
                    userDoc,
                    db,
                    socket.success(callback, client),
                    issue
                  );
                },
                issue
              );
            },
            issue
          );
        },
        () => {
          socket.cb(callback, 'db connection issue');
        }
      );
    } else {
      socket.cb(callback, 'validation issue');
    }
  },
};

const signup = {
  checkExisting: (event, db, success, issue) => {
    db.findOne({ username: event.body.username }, (error, doc) => {
      if (error) {
        issue(error);
      } else if (doc) {
        // socket.response(event, {action: 'fail', msg: 'username taken'})
        issue('username taken');
      } else {
        success();
      } // no user found is success case
    });
  },
  getHash: (password, success, issue) => {
    bcrypt.hash(password, 10, (hashError, hash) => {
      if (hash) {
        success(hash);
      } else {
        issue(hashError);
      }
    });
  },
  insertNew: (hash, event, db, success, issue) => {
    db.insertOne(
      {
        _id: mongo.newOid(),
        username: event.body.username,
        passhash: hash,
        token: '',
        signalWSid: '',
        originId: event.body.oid,
      },
      (insertError, result) => {
        if (result) {
          socket.response(event, {
            action: 'signedup',
            msg: 'signed up',
          });
          success('signed up');
        } else if (insertError) {
          issue(insertError);
        }
      }
    );
  },
  lambda: (event, context, callback) => {
    event.body = parseBody(event.body);
    if (event.body && event.body.password && event.body.username) {
      mongo.connect(
        (db, client) => {
          const fail = socket.issue(callback, client);
          const issue = msg => {
            socket.response(event, {
              action: 'reject',
              msg: 'Try something different',
            });
            fail(msg);
          };
          signup.checkExisting(
            event,
            db,
            () => {
              signup.getHash(
                event.body.password,
                hash => {
                  signup.insertNew(
                    hash,
                    event,
                    db,
                    socket.success(callback, client),
                    issue
                  );
                },
                issue
              );
            },
            issue
          );
        },
        () => {
          socket.cb(callback, 'db connection issue');
        }
      );
    } else {
      socket.cb(callback, 'validation issue');
    }
  },
};

const status = {
  checkOwnership: (event, client, success, issue) => {
    client
      .db(mongo.db)
      .collection(mongo.user)
      .findOne(
        {
          originId: event.body.channelDoc.owner,
          token: event.body.token,
        },
        (error, doc) => {
          if (error) {
            issue(error);
          } else if (doc) {
            // let client know its okay to think of this channel as "theirs"
            event.body.channelDoc.yours = true;
            success(event.body.channelDoc);
          } else {
            success(event.body.channel.Doc);
          }
        }
      );
  },
  // pool candidates that are waiting for a single user account
  updateWaiting: (event, client, success, issue) => {
    client
      .db(mongo.db)
      .collection(mongo.pool)
      .updateOne(
        { oid: event.body.oid },
        {
          $set: {
            wss: event.requestContext.connectionId,
            channel: 'single/' + event.body.channel,
            con: 'waiting',
            active: false,
            oid: event.body.oid,
          },
        },
        { upsert: true },
        (error, result) => {
          if (result) {
            success(event.body.channelDoc);
          } else {
            issue('update fail');
          }
        }
      );
  },
  checkExisting: (event, client, success, issue) => {
    client
      .db(mongo.db)
      .collection(mongo.channel)
      .findOne({ name: event.body.channel }, (error, doc) => {
        if (error) {
          issue(error);
        } else if (doc) {
          event.body.channelDoc = doc;
          if (
            !doc.multiUser &&
            event.body.token &&
            event.body.oid === doc.owner
          ) {
            status.checkOwnership(event, client, success, issue);
          } else {
            // visitor case
            if (doc.multiUser || doc.status === 'ready') {
              success(doc);
            } else {
              status.updateWaiting(event, client, success, issue);
            }
          }
        } else {
          success();
        } // no lobby found is also a valid case
      });
  },
  lambda: (event, context, callback) => {
    event.body = parseBody(event.body);
    if (event.body && event.body.channel) {
      mongo.connect(
        (db, client) => {
          const issue = socket.issue(callback, client);
          status.checkExisting(
            event,
            client,
            doc => {
              let sigResponse = { action: 'status', exist: false };
              if (doc) {
                sigResponse.exist = true;
                sigResponse.status = doc.status;
                sigResponse.owner = doc.yours ? true : false;
                sigResponse.multi = doc.multiUser;
                sigResponse.utcHour = doc.hourUTC;
                sigResponse.day = doc.day;
              }
              socket.response(event, sigResponse);
              socket.success(callback, client)('gotStatus');
            },
            issue
          );
        },
        () => {
          socket.cb(callback, 'db connection issue');
        }
      );
    } else {
      socket.cb(callback, 'validation issue');
    }
  },
};

module.exports.login = login.lambda;
module.exports.signup = signup.lambda;
module.exports.status = status.lambda;
