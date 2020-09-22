// mongo.js ~ Copyright 2019-2020 Paul Beaudet ~ MIT License
const { MongoClient, ObjectID } = require('mongodb');

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

module.exports.mongo = mongo;
