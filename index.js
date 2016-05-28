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
  this.process = undefined;
}
inherits(Fzf, EventEmitter);

Fzf.prototype.start = function () {
  let stdout;
  this.process = childProcess
    .spawn('fzf', this.options, { stdio: ['pipe', 'pipe', process.stderr] });
  this.process.stdout.on('data', (buffer) => {
    // Get stdout
    stdout = buffer.toString();
  });
  this.process.on('close', (code) => {
    this.emit('exit', code, stdout);
  });
};

Fzf.prototype.kill = function () {
  this.process.kill();
};

Fzf.prototype.printList = function (items) {
  this.process.stdin.write(items.join('\n'));
  this.process.stdin.end();
};


/**
 * Searcher
 * @constructor
 */
function Search() {
  this.options = undefined;
  this.result  = undefined;
}

Search.prototype.asyncRun = function () {
  let promise;
  switch (this.options.site) {
    case 'google': promise = this.google();         break;
    case 'stack':  promise = this.stackrOverflow(); break;
  }
  return promise;
};

Search.prototype.google = function () {

  const url = 'https://www.google.com/search';
  const qs  = {
    q:     this.options.query,
    num:   this.options.resultsPerPage,
    start: (this.options.pageNum - 1) * this.options.resultsPerPage,
    ie:    'UTF-8',
    oe:    'UTF-8'
  };

  return new Promise((resolve, reject) => {
    request({ url, qs }, (error, response, body) => {
      if (!error && response.statusCode === 200) {

        const $ = cheerio.load(body);
        const result = [];
        $('.g > .r > a').each((index, element) => {
          const a = $(element);
          result.push({
            title: a.text(),
            url: querystring.parse(a.attr('href'))['/url?q']
          });
        });
        this.result = result;
        resolve();

      } else {
        const msg = error
          ? error.message
          : response.statusCode + ' ' + response.statusMessage;
        reject(new Error(`Cannot get search result: ${msg}`));
      }
    });
  });
};

Search.prototype.stackrOverflow = function () {

  const url = 'https://api.stackexchange.com/2.2/search/excerpts';
  const qs  = {
    q:        this.options.query,
    page:     this.options.pageNum,
    pagesize: this.options.resultsPerPage,
    sort:     'relevance',
    site:     'stackoverflow'
  };

  return new Promise((resolve, reject) => {
    request({ url, qs, json: true, gzip: true }, (error, response, body) => {
      if (!error && response.statusCode === 200) {

        const result = [];
        body.items.forEach((item) => {
          result.push({
            title: item.title,
            url: 'http://stackoverflow.com/questions/' + item.question_id
          });
        });
        this.result = result;
        resolve();

      } else {
        const msg = error
          ? error.message
          : response.statusCode + ' ' + response.statusMessage;
        reject(new Error(`Cannot get search result: ${msg}`));
      }
    });
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

const search = new Search();
search.options = {
  query:          argv._.join(' '),
  site:           argv.s || 'google',
  resultsPerPage: argv.l || 30,
  pageNum:        1
};

function fzfInterface() {
  const fzf = new Fzf(['--no-sort', '--reverse',
                       '--expect=ctrl-n,ctrl-p', '--prompt=fzsearch> ']);
  fzf.start();

  search.asyncRun()
    .catch((error) => {
      fzf.kill();
      console.error(error);
    })
    .then(() => {
      const titles = [];
      search.result.forEach((item, index) => {
        titles.push(`[${index}] ${item.title}`);
      });
      fzf.printList(titles);
    });

  return new Promise((resolve, reject) => {
    fzf.on('exit', (_, stdout) => {
      stdout ? resolve(stdout) : reject();
    });
  })
    .then((stdout) => {
      stdout = stdout.split('\n');
      const result = { keyInput: stdout[0], selectedItem: stdout[1] };

      switch (result.keyInput) {
        case 'ctrl-n':
          search.options.pageNum += 1;
          return fzfInterface();
        case 'ctrl-p':
          if (search.options.pageNum > 1) search.options.pageNum -= 1;
          return fzfInterface();
      }
      return result;
    });
}

fzfInterface()
  .catch(() => {
    // fzf exited with empty stdout
    process.exit(1);
  })
  .then((result) => {
    var index = result.selectedItem.match(/^\[(\d+)\]/)[1];
    console.log(search.result[index].url);
  });
