#!/usr/bin/env node
'use strict';

const child_process = require('child_process');
const yargs         = require('yargs');
const request       = require('request');

// Class
function Fzf(options) {
  this.options = options;
  this.process = undefined;
  this.onClose = undefined;
}

Fzf.prototype.start = function() {
  var stdout;
  this.process = child_process
    .spawn('fzf', this.options, { stdio: ['pipe', 'pipe', process.stderr] });
  this.process.stdout.on('data', (buffer) => {
    // Get stdout
    stdout = buffer.toString();
  });
  this.process.on('close', (code) => {
    // fzf close without error, stdout exists,
    // And if onClose function exists, call it.
    if (code === 0 && stdout && this.onClose) {
      this.onClose(stdout);
    } else {
      // If fzf closed too early
      process.exit(1);
    }
  });
}

Fzf.prototype.printList = function(items) {
  this.process.stdin.write(items.join('\n'));
  this.process.stdin.end();
}

function getSearchResult(site, query, callback) {
return [
    { title: 'one', url: 'http://one.net' },
    { title: 'two', url: 'http://two.net' }
  ];

  var url = `https://www.google.com/search?q=${query}`;
  request(url, (error, response, body) => {
    if (!error && response.statusCode === 200) {
      callback(body);
    }
  });
}

const argv = yargs
  .usage('Usage: $0 [options] <query>')
  .help('h', 'Show this help').alias('h', 'help')
  .options({
    g: {
      alias: 'google',
      desc: 'Use Google as search engine',
      type: 'boolean'
    }
  }).argv;

var fzf = new Fzf(['--no-sort', '--tac', '--prompt=fzsearch> ']);
fzf.start();

var searchResult = getSearchResult();

var titles = [];
searchResult.forEach((item, index) => {
  titles.push(`[${index}] ${item.title}`);
})
fzf.printList(titles);

// Now ready to get stdout data.
fzf.onClose = function(stdout) {
  var index = stdout.match(/^\[(\d+)\]/)[1];
  console.log(searchResult[index].url);
}

//getSearchResult('', 'test', (body) => {
//  console.log(body);
//});
