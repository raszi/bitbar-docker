/*jshint esversion: 6 */
/*eslint no-console: ["error", { allow: ["error"] }] */

const os = require('os');
const osascript = require('node-osascript');

const Helpers = require('./helpers');

module.exports.start = (args) => {
  var [, , encodedParams] = args;
  var params = Helpers.decodeArgs(encodedParams);

  var script = [
    'global command',
    'tell application "Terminal"',
    'do script command',
    'activate',
    'end tell'
  ].join(os.EOL);

  osascript.execute(script, { command: params.join(' ') }, (err) => {
    if (err) {
      console.error(err);
      process.exit(1);
    }

    setTimeout(process.exit, 2000);
  });
};
