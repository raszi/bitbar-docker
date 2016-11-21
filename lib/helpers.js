/*jshint esversion: 6 */

const _ = require('lodash');

var Helpers = {};

Helpers.firstTag = (img) => {
  const fallbackId = img.Id.replace(/^sha256:/, '').substr(0, 12);
  return _.last(_.get(img, 'RepoTags[0]', fallbackId).split('/'));
};

Helpers.getNames = (cnt) => {
  return _.map(cnt.Names, (name) => { return name.replace(/^\//, ''); });
};

Helpers.autoName = (img) => {
  var baseName = _.head(Helpers.firstTag(img).split(':', 2));
  var takenNames = _.flatMap(img.containers, Helpers.getNames);

  var name = baseName;

  for(var i = 1; _.includes(takenNames, name); i++) {
    name = baseName + '-' + i;
  }

  return name;
};

Helpers.autoNameParam = (img) => {
  return '--name ' + Helpers.autoName(img);
};

Helpers.publishAllPortParams = (img) => {
  var exposedPorts = _.get(img, 'Config.ExposedPorts', {});

  return _.map(exposedPorts, (_opts, port) => {
    var portNumber = parseInt(port, 10);
    return '-p ' + portNumber + ':' + port;
  });
};

Helpers.encodeArgs = (args) => {
  return Buffer.from(JSON.stringify(args)).toString('base64');
};

Helpers.decodeArgs = (data) => {
  return JSON.parse(Buffer.from(data, 'base64').toString('ascii'));
};

module.exports = Helpers;
