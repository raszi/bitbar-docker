#!/usr/bin/env /usr/local/bin/node

// <bitbar.title>Docker Controller</bitbar.title>
// <bitbar.version>v0.0.2</bitbar.version>
// <bitbar.author>KARASZI István</bitbar.author>
// <bitbar.author.github>raszi</bitbar.author.github>
// <bitbar.desc>Manages the Docker images and containers</bitbar.desc>
// <bitbar.image>https://github.com/whitepages/bitbar-docker/wiki/images/sample00.png</bitbar.image>
// <bitbar.abouturl>https://github.com/whitepages/bitbar-docker/blob/master/README.md</bitbar.abouturl>

/*jshint esversion: 6 */

if (process.argv.length > 2) {
  const command = require('../lib/command');
  command.start(process.argv);
} else {
  const menu = require('../lib/menu');
  menu.display();
}
