#!/usr/bin/env /usr/local/bin/node

// <bitbar.title>Docker Controller</bitbar.title>
// <bitbar.version>v1.0</bitbar.version>
// <bitbar.author>KARASZI István</bitbar.author>
// <bitbar.author.github>raszi</bitbar.author.github>
// <bitbar.desc>Manages the running Docker containers</bitbar.desc>
// <bitbar.image></bitbar.image>
// <bitbar.abouturl>https://github.com/whitepages/bitbar-docker/blob/master/README.md</bitbar.abouturl>
// <bitbar.dependencies>node, npm/lodash, npm/bitbar, npm/async, npm/dockerode, npm/handlebars</bitbar.dependencies>

/*jshint esversion: 6 */

if (process.argv.length > 2) {
  const command = require('../lib/command');
  command.start(process.argv);
} else {
  const menu = require('../lib/menu');
  menu.display();
}
