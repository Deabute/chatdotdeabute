var Metalsmith  = require('metalsmith');
var markdown    = require('metalsmith-markdown');
var inplace     = require('metalsmith-in-place');
var permalinks  = require('metalsmith-permalinks');
var layouts     = require('metalsmith-layouts');

Metalsmith(__dirname)
  .metadata({
      title: "Hiking Buddies",
      description: "A place to find hiking partners",
      url: process.env.SITE_URL,
      socketserver: process.env.SOCKET_SERVER,
      testing: process.env.TESTING,
  })
  .source('./src')
  .destination('./build')
  .clean(false)
  .use(markdown())
  .use(permalinks())
  .use(layouts())
  .use(inplace({
      pattern: '**/*.njk',
      engineOptions: {
        path: __dirname + '/src'
      }
  }))
  .build(function(error, files){if(error){throw error;}});
