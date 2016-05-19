#!/usr/bin/env node
'use strict';

const childProcess  = require('child_process');
const querystring   = require('querystring');
const yargs         = require('yargs');
const request       = require('request');
const cheerio       = require('cheerio');

// Class
function Fzf(options) {
  this.options = options;
  this.process = undefined;
  this.onClose = undefined;
}

Fzf.prototype.start = function() {
  var stdout;
  this.process = childProcess
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
};

Fzf.prototype.printList = function(items) {
  this.process.stdin.write(items.join('\n'));
  this.process.stdin.end();
};

function getSearchResult(site, query, callback) {
  var url = `https://www.google.com/search?q=${query}&num=30&ie=UTF-8&oe=UTF-8`;
  request(url, (error, response, body) => {
    if (!error && response.statusCode === 200) {

      var $ = cheerio.load(body);
      var result = [];
      $('.g > .r > a').each((index, element) => {
        var a = $(element);
        result.push({
          title: a.text(),
          url: querystring.parse(a.attr('href'))['/url?q']
        });
      });
      callback(result);

    } else {
      var msg = error ? error : response.statusMessage;
      throw new Error(`Cannot get search result: ${msg}`);
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

var fzf = new Fzf(['--no-sort', '--reverse', '--prompt=fzsearch> ']);
fzf.start();

getSearchResult('google', argv._.join(' '), (result) => {
  var titles = [];
  result.forEach((item, index) => {
    titles.push(`[${index}] ${item.title}`);
  });
  fzf.printList(titles);

  // Now ready to get stdout data.
  fzf.onClose = function(stdout) {
    var index = stdout.match(/^\[(\d+)\]/)[1];
    console.log(result[index].url);
  };
});
