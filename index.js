#!/usr/bin/env node
'use strict';

const childProcess  = require('child_process');
const querystring   = require('querystring');
const EventEmitter  = require('events');
const inherits      = require('util').inherits;

const yargs         = require('yargs');
const request       = require('request');
const cheerio       = require('cheerio');


/**
 * Represents fzf command
 * @constructor
 * @extends EventEmitter
 * @param {Object} options - fzf command arguments
 */
function Fzf(options) {
  EventEmitter.call(this);
  this.options = options;
}
inherits(Fzf, EventEmitter);

Fzf.prototype.start = function () {
  let stdout;
  this._process = childProcess
    .spawn('fzf', this.options, { stdio: ['pipe', 'pipe', process.stderr] });
  this._process.stdout.on('data', (buffer) => {
    // Get stdout
    stdout = buffer.toString();
  });
  this._process.on('close', (code) => {
    this.emit('exit', code, stdout);
  });
};

Fzf.prototype.kill = function () {
  this._process.kill();
};

Fzf.prototype.stdinWrite = function (string) {
  this._process.stdin.write(string + '\n');
};

Fzf.prototype.stdinClose = function () {
  this._process.stdin.end();
};


/**
 * Searcher
 * @constructor
 * @param {Object} options - Search options
 */
function Search(options) {
  this.options = options;
}

Search.savedResults = [];

Search.prototype.asyncRun = function () {
  let promise;
  switch (this.options.site) {
    case 'google': promise = this._google();         break;
    case 'stack':  promise = this._stackrOverflow(); break;
  }
  return promise;
};

Search.prototype._google = function () {

  const url = 'https://www.google.com/search';
  const qs  = {
    q:     this.options.query,
    num:   this.options.resultsPerPage,
    start: (this.options.pageNum - 1) * this.options.resultsPerPage,
    ie:    'UTF-8',
    oe:    'UTF-8'
  };

  return new Promise((resolve, reject) => {
    // Use saved result if exists
    if (this.constructor.savedResults[this.options.pageNum]) {
      resolve(this.constructor.savedResults[this.options.pageNum]);
      return;
    }
    request({ url, qs }, (error, response, body) => {
      if (!error && response.statusCode === 200) {

        const resultForPage = [];
        const $ = cheerio.load(body);
        $('.g > .r > a').each((index, element) => {
          const a = $(element);
          resultForPage.push({
            title: a.text(),
            url: querystring.parse(a.attr('href'))['/url?q']
          });
        });
        this.constructor.savedResults[this.options.pageNum] = resultForPage;
        resolve(resultForPage);

      } else {
        const msg = error
          ? error.message
          : response.statusCode + ' ' + response.statusMessage;
        reject(new Error(`Cannot get search result: ${msg}`));
      }
    });
  });
};

Search.prototype._stackrOverflow = function () {

  const url = 'https://api.stackexchange.com/2.2/search/excerpts';
  const qs  = {
    q:        this.options.query,
    page:     this.options.pageNum,
    pagesize: this.options.resultsPerPage,
    sort:     'relevance',
    site:     'stackoverflow'
  };

  return new Promise((resolve, reject) => {
    if (this.constructor.savedResults[this.options.pageNum]) {
      resolve(this.constructor.savedResults[this.options.pageNum]);
      return;
    }
    request({ url, qs, json: true, gzip: true }, (error, response, body) => {
      if (!error && response.statusCode === 200) {

        const resultForPage = [];
        body.items.forEach((item) => {
          resultForPage.push({
            title: item.title,
            url: 'http://stackoverflow.com/questions/' + item.question_id
          });
        });
        this.constructor.savedResults[this.options.pageNum] = resultForPage;
        resolve(resultForPage);

      } else {
        const msg = error
          ? error.message
          : response.statusCode + ' ' + response.statusMessage;
        reject(new Error(`Cannot get search result: ${msg}`));
      }
    });
  });
};


function Fzsearch(argv) {
  this.options = {
    query:          argv._.join(' '),
    site:           argv.s || 'google',
    pageNum:        1,
    resultsPerPage: argv.l || 30
  };

  this.run();
}

Fzsearch.prototype.run = function () {
  const fzf = new Fzf(['--no-sort', '--reverse',
                       '--expect=ctrl-n,ctrl-p', '--prompt=fzsearch> ']);
  const searcher = new Search(this.options);

  fzf.start();
  searcher.asyncRun()
    .catch((error) => {
      fzf.kill();
      console.error(error);
    })
    .then((result) => {
      result.forEach((item, index) => {
        fzf.stdinWrite(`[${index}] ${item.title}`);
      });
      fzf.stdinClose();
    });

  fzf.on('exit', (_, stdout) => {
    if (!stdout) process.exit(1);

    stdout = stdout.split('\n');
    const keyInput       = stdout[0];
    const selectedString = stdout[1];

    switch (keyInput) {
      case 'ctrl-n':
        this.options.pageNum++;
        this.run(); return;
      case 'ctrl-p':
        if (this.options.pageNum > 1) this.options.pageNum--;
        this.run(); return;
      default: {
        const searchResult = Search.savedResults[this.options.pageNum];
        const index = selectedString.match(/^\[(\d+)\]/)[1];
        console.log(searchResult[index]); return;
      }
    }
  });
};


const argv = yargs
  .usage('Usage: $0 [options] <query>')
  .options({
    s: {
      alias: 'site',
      desc: `Search in Google or Stack Overflow, default is Google
             Value can be 'google' or 'stack'`,
      choices: ['google', 'stack']
    },
    l: {
      alias: 'length',
      desc: 'Set number of results to display, default is 30',
      type: 'number'
    }
  })
  .help('h', 'Show this help')
  .alias('h', 'help')
  .example("$0 -s google -n 50 'Node.js'", "  Search 'Node.js' in Google")
  .argv;

new Fzsearch(argv);
