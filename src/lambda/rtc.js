// rtc.js ~ Copyright 2019-2020 Paul Beaudet ~ MIT License
const { mongo } = require('./interface/mongo');
const { socket, parseBody } = require('./interface/socket');

const rtc = {
  ice: (event, context, callback) => {
    event.body = parseBody(event.body, callback);
    if (event.body && event.body.candidates && event.body.gwid) {
      socket.send(
        event,
        event.body.gwid,
        {
          action: 'ice',
          candidates: event.body.candidates,
        },
        matchId => {
          mongo.removeFromPool()(matchId);
          socket.response(
            event,
            {
              action: 'lostCon',
            },
            mongo.removeFromPool()
          );
          socket.cb(callback, null, 'lostCon');
        },
        () => {
          socket.cb(callback, null, 'iced');
        }
      );
    } else {
      socket.cb(callback, 'invalid');
    }
  },
  answer: (event, context, callback) => {
    event.body = parseBody(event.body, callback);
    if (event.body && event.body.sdp && event.body.oid && event.body.gwid) {
      socket.send(
        event,
        event.body.gwid,
        {
          action: 'answer',
          id: event.body.oid,
          sdp: event.body.sdp,
          gwid: event.requestContext.connectionId,
        },
        matchId => {
          mongo.removeFromPool()(matchId);
          socket.response(
            event,
            {
              action: 'lostCon',
            },
            mongo.removeFromPool()
          );
          socket.cb(callback, null, 'lostCon');
        },
        () => {
          socket.cb(callback, null, 'answered');
        }
      );
    } else {
      socket.cb(callback, 'invalid');
    }
  },
  updateConnections: (db, event, matchOid, issue, success) => {
    db.updateOne(
      {
        oid: event.body.oid,
      },
      {
        $set: { con: matchOid },
      },
      (error, result) => {
        if (result) {
          db.updateOne(
            { oid: matchOid },
            {
              $set: {
                con: event.body.oid,
              },
            },
            (err, rslt) => {
              if (rslt) {
                success('matched user');
              } else {
                issue('failed second update');
              }
            }
          );
        } else {
          issue('failed update');
        }
      }
    );
  },
  findMatch: (db, event, matches, issue, success) => {
    return () => {
      if (matches.length) {
        const index = Math.floor(Math.random() * matches.length);
        const match = matches[index];
        socket.send(
          event,
          match.wss,
          {
            action: 'offer',
            sdp: event.body.sdp,
            id: event.body.oid,
            gwid: event.requestContext.connectionId,
          },
          matchId => {
            matches.splice(index, 1);
            rtc.findMatch(db, event, matches, issue, success);
            mongo.removeFromPool(event.clientD)(matchId);
          },
          () => {
            rtc.updateConnections(
              db,
              event,
              match.oid,
              msg => {
                socket.response(
                  event,
                  {
                    action: 'nomatch',
                  },
                  mongo.removeFromPool(event.clientD)
                );
                issue(msg);
              },
              msg => {
                // TODO if no response, stop match?
                socket.response(
                  event,
                  {
                    action: 'match',
                  },
                  mongo.removeFromPool(event.clientD)
                );
                success(msg);
              }
            );
          }
        );
      } else {
        issue('no matches');
      }
    };
  },
  offer: (event, context, callback) => {
    // TODO add last match behaviour
    try {
      event.body = JSON.parse(event.body);
    } catch (parseError) {
      socket.cb(callback, parseError);
    }
    if (event.body && event.body.sdp && event.body.oid) {
      const channel = pool.channel(event.body);
      const query = {
        con: { $eq: '' },
        active: true,
        oid: { $ne: event.body.oid },
        channel: channel,
      };
      mongo.connect(
        (db, client) => {
          const issue = socket.issue(callback, client);
          event.clientD = client;
          let matches = [];
          mongo.stream(
            db.find(query, { limit: 10 }),
            issue,
            doc => {
              matches.push(doc);
            },
            rtc.findMatch(
              db,
              event,
              matches,
              issue,
              socket.success(callback, client)
            )
          );
        },
        () => {
          socket.cb(callback, 'db connection issue');
        },
        mongo.pool
      );
    } else {
      socket.cb(callback, 'validation issue');
    }
  },
};

const prompt = {
  recordAnswer: (client, event, success, issue) => {
    // not passed for initial connection
    if (event.body.answer) {
      event.body.answer._id = mongo.newOid();
      event.body.answer.from = event.body.oid;
      client
        .db(mongo.db)
        .collection(mongo.answer)
        .insertOne(event.body.answer, error => {
          if (error) {
            issue(error);
          } else {
            success();
          }
        });
    }
  },
};

const pool = {
  channel: data => {
    // todo deprecate in favor of figuring this server side
    if (data.link && data.type) {
      return data.type + '/' + data.link;
    } else {
      return 'deabute';
    }
  },
  update: (db, event, success, issue) => {
    db.updateOne(
      { oid: event.body.oid },
      {
        $set: {
          wss: event.requestContext.connectionId,
          channel: event.body.channel,
          con: '',
          active: true,
          oid: event.body.oid,
        },
      },
      { upsert: true },
      (error, result) => {
        if (result) {
          success();
        } else {
          issue(`update fail: ${error}`);
        }
      }
    );
  },
  notifyAddition: (db, event, success, issue) => {
    let poolSize = 0;
    let free = 0;
    let duds = [];
    let docCount = 0;
    let docFinished = 0;
    let streamFinish = false;
    // can be called before or after steam end
    // depending on which callback gets called last
    const finalFunc = () => {
      if (streamFinish && docCount === docFinished) {
        // if duds are removed in stream it will destroy topology
        // in other words: lose correct index in array by removing an element
        if (duds.length) {
          duds.forEach(dud => {
            mongo.removeFromPool(event.clientd)(dud);
          });
        }
        poolSize++;
        free++;
        success(free, poolSize);
      }
    };
    // note to async streaming callbacks that total stream is finished
    const finish = () => {
      streamFinish = true;
      finalFunc();
    };
    const poolChange = {
      action: 'pool',
      count: 1,
      // this is insecure, malicious actor could claim ownership of channels
      // since this occurs in multi and single cases
      owner: event.body.owner ? true : false,
    };
    mongo.stream(
      db.find({
        channel: event.body.channel,
        oid: { $ne: event.body.oid },
      }),
      issue,
      connection => {
        docCount++;
        socket.send(
          event,
          connection.wss,
          poolChange,
          id => {
            docFinished++;
            duds.push(id);
            finalFunc();
          },
          () => {
            if (connection.active) {
              poolSize++;
            }
            if (connection.con === '') {
              free++;
            }
            docFinished++;
            finalFunc();
          }
        );
      },
      finish
    );
  },
  ownerUpdate: (status, client, event, success, issue) => {
    // TODO validate token
    client
      .db(mongo.db)
      .collection(mongo.channel)
      .updateMany(
        {
          $and: [{ owner: event.body.oid }, { multiUser: false }],
        },
        { $set: { status: status } },
        (error, result) => {
          if (result) {
            success(result);
          } else {
            issue(error);
          }
        }
      );
  },
  add: (event, context, callback) => {
    event.body = parseBody(event.body);
    if (event.body) {
      event.body.channel = pool.channel(event.body);
      if (event.body.oid) {
        mongo.connect(
          (db, client) => {
            const issue = socket.issue(callback, client);
            event.clientd = client;
            const addToPool = () => {
              pool.update(
                db,
                event,
                () => {
                  pool.notifyAddition(
                    db,
                    event,
                    (free, poolSize) => {
                      let resType = 'setPool';
                      if (free % 2 === 0) {
                        resType = 'makeOffer';
                        console.log('telling client to make offer');
                      }
                      socket.response(
                        event,
                        { action: resType, pool: poolSize },
                        () => {
                          mongo.removeFromPool(client)();
                          issue('unresponsive');
                        },
                        () => {
                          prompt.recordAnswer(
                            client,
                            event,
                            socket.success(callback, client),
                            issue
                          );
                        } // on records error if response
                      );
                    },
                    issue
                  );
                },
                issue
              );
            };
            if (event.body.token && event.body.owner) {
              pool.ownerUpdate('ready', client, event, addToPool, issue);
            } else {
              addToPool();
            }
          },
          () => {
            socket.cb(callback, 'db connection issue');
          },
          mongo.pool
        );
      } else {
        socket.cb(callback, 'validation issue');
      }
    }
  },
  updateReduce: (client, event, success, issue) => {
    const done = event.body.pause ? 'done' : '';
    client
      .db(mongo.db)
      .collection(mongo.pool)
      .updateOne(
        { oid: event.body.oid },
        {
          $set: { active: false, con: done },
        },
        (error, result) => {
          if (result) {
            if (event.body.owner && event.body.token) {
              pool.ownerUpdate('busy', client, event, success, issue);
            } else {
              success();
            }
          } else {
            issue('update fail');
          }
        }
      );
  },
  notifyReduce: (client, event, success) => {
    let duds = [];
    let docCount = 0;
    let docFinished = 0;
    let streamFinish = false;
    const finalFunc = () => {
      if (streamFinish && docFinished === docCount) {
        if (duds.length) {
          duds.forEach(dud => {
            mongo.removeFromPool(event.clientd)(dud);
          });
        }
        success();
      }
    };
    const finish = () => {
      streamFinish = true;
      finalFunc();
    };
    mongo.stream(
      client
        .db(mongo.db)
        .collection(mongo.pool)
        .find({ channel: event.body.channel }),
      console.log,
      connection => {
        docCount++;
        socket.send(
          event,
          connection.wss,
          { action: 'pool', count: -1 },
          id => {
            docFinished++;
            duds.push(id);
            finalFunc();
          },
          () => {
            docFinished++;
            finalFunc();
          }
        );
      },
      finish
    );
  },
  reduce: (event, context, callback) => {
    event.body = parseBody(event.body, callback);
    if (!event.body.channel) {
      event.body.channel = 'default';
    }
    if (event.body && event.body.oid) {
      mongo.connect(
        (db, client) => {
          event.clientd = client;
          const issue = socket.issue(callback, client);
          pool.updateReduce(
            client,
            event,
            () => {
              pool.notifyReduce(
                client,
                event,
                socket.success(callback, client),
                issue
              );
            },
            issue
          );
        },
        () => {
          socket.cb(callback, 'db connection issue');
        },
        mongo.pool
      );
    } else {
      socket.cb(callback, 'validation issue');
    }
  },
};

const connection = {
  pause: (event, context, callback) => {
    event.body = parseBody(event.body, callback);
    if (event.body && event.body.oid) {
      mongo.connect(
        (db, client) => {
          db.updateOne(
            { oid: event.body.oid },
            { $set: { con: 'done' } },
            (error, result) => {
              if (result) {
                socket.success(callback, client)('paused user');
              } else {
                socket.issue(callback, client)('update issue');
              }
            }
          );
        },
        () => {
          socket.cb(callback, 'db connection issue');
        },
        mongo.pool
      );
    } else {
      socket.cb(callback, 'validation issue');
    }
  },
  rematch: (event, context, callback) => {
    event.body = parseBody(event.body, callback);
    if (!event.body.channel) {
      event.body.channel = 'default';
    }
    if (event.body && event.body.oid) {
      mongo.connect(
        (db, client) => {
          const issue = socket.issue(callback, client);
          db.updateOne(
            {
              oid: event.body.oid,
            },
            {
              $set: { con: '' },
            },
            (error, result) => {
              if (result) {
                let free = 1;
                mongo.stream(
                  db.find({
                    channel: event.body.channel,
                    oid: { $ne: event.body.oid },
                  }),
                  issue,
                  doc => {
                    if (doc.con === '') {
                      free++;
                    }
                  },
                  () => {
                    if (free % 2 === 0) {
                      socket.response(
                        event,
                        {
                          action: 'makeOffer',
                        },
                        () => {
                          mongo.removeFromPool(client)();
                          issue('unresponsive');
                        },
                        () => {
                          socket.success(callback, client)('rematch user');
                        }
                      );
                    }
                  }
                );
              } else {
                issue('update issue');
              }
            }
          );
        },
        () => {
          socket.cb(callback, 'db connection issue');
        },
        mongo.pool
      );
    } else {
      socket.cb(callback, 'validation issue');
    }
  },
  remove: (event, context, callback) => {
    event.body = parseBody(event.body, callback);
    mongo.connect(
      (db, client) => {
        db.deleteOne({ oid: event.body.oid }, (deleteError, result) => {
          if (result) {
            if (event.body.owner && event.body.token) {
              pool.ownerUpdate(
                'offline',
                client,
                event,
                socket.success(callback, client),
                socket.issue(callback, client)
              );
            } else {
              socket.success(callback, client)('removed');
            }
          } else {
            socket.issue(callback, client)(deleteError);
          }
          client.close();
        });
      },
      () => {
        socket.cb(callback, 'db connection issue');
      },
      mongo.pool
    );
  },
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
