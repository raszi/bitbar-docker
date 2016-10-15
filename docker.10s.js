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

const _ = require('lodash');
const bitbar = require('bitbar');
const async = require('async');
const Docker = require('dockerode');
const Handlebars = require('handlebars');

const states = ["running", "created", "restarting", "paused", "exited", "dead"];

var firstTag = (img) => {
  return _.last(_.get(img, 'RepoTags[0]', '').split('/'));
};

var getNames = (cnt) => {
  return _.map(cnt.Names, (name) => { return name.replace(/^\//, ''); });
};

Handlebars.registerHelper('shortId', (cnt) => {
  return _.get(cnt, 'Id', '').slice(0, 12);
});

Handlebars.registerHelper('simpleName', (cnt) => {
  return _.head(getNames(cnt));
});

Handlebars.registerHelper('firstTag', firstTag);

Handlebars.registerHelper('autoName', (img) => {
  var baseName = _.head(firstTag(img).split(':', 2));
  var takenNames = _.flatMap(img.containers, getNames);

  var name = baseName;

  for(var i = 1; _.includes(takenNames, name); i++) {
    name = baseName + '-' + i;
  }

  return name;
});

var t = (template) => { return Handlebars.compile(template); };

const menuLabels = _.mapValues({
  main:      "⬆ {{running}} ⬇ {{stopped}}",
  container: "{{simpleName this}}/{{shortId this}} ({{Status}})",
  image:     "{{firstTag this}}"
}, t);

function action() {
  var [command, ...parameters] = arguments;
  var opts = (typeof _.last(parameters) === 'object') ? parameters.pop() : {};

  var cmd = t(command);
  var params = _.chain(parameters)
      .castArray()
      .map((param, i) => { return ["param" + (i + 1), t(param)]; })
      .fromPairs()
      .value();

  return (props) => {
    var eParams = _.mapValues(params, (param) => { return param(props); });
    return _.merge({ bash: cmd(props) }, eParams, opts);
  };
}

const containerActions = {
  logs:    action("/usr/local/bin/docker", "logs", "-f", "--tail 100", "-t", "{{Id}}"),
  console: action("/usr/local/bin/docker", "exec", "-t", "-i", "{{Id}}", "/bin/sh"),
  kill:    action("/usr/local/bin/docker", "kill", "{{Id}}", { terminal: false, refresh: true }),
  start:   action("/usr/local/bin/docker", "start", "-a", "-i", "{{Id}}"),
  restart: action("/usr/local/bin/docker", "restart", "{{Id}}", { terminal: false, refresh: true }),
  remove:  action("/usr/local/bin/docker", "rm", "{{Id}}", { terminal: false, refresh: true })
};

const imageActions = {
  run: action("/usr/local/bin/docker", "run", "-t", "-i", "--name {{autoName this}}", "{{Id}}", { refresh: true })
};

var docker = new Docker();

var initAction = (actions, item) => {
  return (action) => {
    return _.merge(actions[action](item), { text: action });
  };
};

var isRunning = (container) => {
  return container.State == 'running';
};

var initContainerActions = (container) => {
  return _.chain(["logs"])
    .concat((isRunning(container)) ? ["console", "restart", "kill"] : ["star", "remove"])
    .map(initAction(containerActions, container))
    .value();
};

var mapContainer = (container) => {
  return {
    text:    menuLabels.container(container),
    submenu: initContainerActions(container)
  };
};

var hostWithOrg = (image) => {
  var imageName = _.get(image, 'RepoTags[0]', '');
  var slashIndex = imageName.lastIndexOf('/');
  return slashIndex == -1 ? 'docker' : imageName.substr(0, slashIndex);
};

var initImageActions = (image) => {
  return _.map(_.keys(imageActions), initAction(imageActions, image));
};

var mapImage = (containers) => {
  return (image) => {
    return {
      text:    menuLabels.image(image),
      submenu: initImageActions(_.merge({ containers: containers }, image))
    };
  };
};

var mapMenuItems = ([key, values]) => {
  return _.concat(bitbar.sep, { text: key }, bitbar.sep, values);
};

var sortStates = ([state, ]) => {
  return _.findIndex(states, state);
};

var mapToMenu = (input, map, sortBy) => {
  return _.chain(input)
    .mapValues(_.partial(_.map, _, map))
    .toPairs()
    .sortBy(sortBy)
    .flatMap(mapMenuItems)
    .value();
};

var parseResults = (err, results) => {
  // TODO handle errors

  var containers = _.groupBy(results.containers, 'State');
  var images = _.groupBy(results.images, hostWithOrg);

  var runningCount = (containers.running || []).length;
  var stoppedCount = results.containers.length - runningCount;

  var topItem = {
    text:     menuLabels.main({ running: runningCount, stopped: stoppedCount }),
    dropdown: false
  };

  bitbar(_.concat(
    topItem,
    bitbar.sep,
    mapToMenu(containers, mapContainer, sortStates),
    mapToMenu(images, mapImage(results.containers), 0)
  ));
};

var tasks = {
  containers: _.bind(_.partial(docker.listContainers, { all: true }), docker),
  images:     _.bind(docker.listImages, docker)
};

async.parallel(tasks, parseResults);
