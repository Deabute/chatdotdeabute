const Metalsmith = require('metalsmith');
const markdown = require('metalsmith-markdown');
const inplace = require('metalsmith-in-place');
const permalinks = require('metalsmith-permalinks');
const layouts = require('metalsmith-layouts');

Metalsmith(__dirname)
  .metadata({
    title: 'Deabute Chat',
    description: 'A place to talk one on one over mutual interest',
    url: process.env.SITE_URL,
    socketserver: process.env.SOCKET_SERVER,
    accountServer: process.env.ACCOUNT_SERVER,
    testing: process.env.TESTING,
  })
  .source('./src')
  .destination('./build')
  .clean(false)
  .use(markdown())
  .use(permalinks())
  .use(layouts())
  .use(
    inplace({
      pattern: '**/*.njk',
      engineOptions: {
        path: __dirname + '/src',
      },
    })
  )
  .build((error, files) => {
    if (error) {
      throw error;
    }
  });

// if (process.env.TESTING === 't') {
//   require('./monolithic_server.js')();
// } // run static server if testing
