/*jshint esversion: 6 */

const _ = require('lodash');
const fs = require('fs');
const path = require('path');
const async = require('async');
const bitbar = require('bitbar');
const Docker = require('dockerode');
const Handlebars = require('handlebars');

const Helpers = require('./helpers');

const states = ['running', 'created', 'restarting', 'paused', 'exited', 'dead'];

Handlebars.registerHelper('shortId', (cnt) => _.get(cnt, 'Id', '').slice(0, 12));
Handlebars.registerHelper('simpleName', (cnt) => _.head(Helpers.getNames(cnt)));
Handlebars.registerHelper('firstTag', Helpers.firstTag);

var t = (x) => _.isFunction(x) ? x : Handlebars.compile(x);

const menuLabels = _.mapValues({
  main:      '{{running}}/{{stopped}}',
  container: '{{simpleName this}}/{{shortId this}} ({{Status}})',
  image:     '{{firstTag this}}'
}, t);

function action() {
  var [command, ...parameters] = arguments;
  var opts = (typeof _.last(parameters) === 'object') ? parameters.pop() : {};

  var params = _.chain(parameters)
      .castArray()
      .map(t)
      .value();

  return (props, extraArgs) => {
    var args = _.chain(params)
        .map((paramFunction) => paramFunction(props))
        .flatten()
        .value();

    var allArgs = _.compact(_.concat([command], extraArgs, args));
    var options = _.extend({}, opts);

    if (opts.terminal === false) {
      return _.extend(options, {
        bash: '/usr/local/bin/docker',
        args: allArgs.join('__')
      });
    } else {
      args.unshift('/usr/local/bin/docker');

      return _.extend(options, {
        bash:     process.argv[0],
        param1:   process.argv[1],
        param2:   Helpers.encodeArgs(allArgs),
        terminal: false
      });
    }
  };
}

const containerActions = {
  logs:    action('logs', '-f', '--tail 100', '-t', '{{Id}}'),
  console: action('exec', '-t', '-i', '{{Id}}', '/bin/sh'),
  kill:    action('kill', '{{Id}}', { terminal: false, refresh: true }),
  start:   action('start', '-a', '-i', '{{Id}}'),
  restart: action('restart', '{{Id}}', { terminal: false, refresh: true }),
  remove:  action('rm', '{{Id}}', { terminal: false, refresh: true })
};

const imageActions = {
  run: action('run', '-t', '-i', Helpers.publishAllPortParams, Helpers.autoNameParam, '{{Id}}', { refresh: true })
};

var initAction = (config, actions, item) => (action) => {
  var tags = item.RepoTags;
  var extraArgs = _.compact(_.map(config, (extraArgs, filter) => {
    if (_.find(tags, (tag) => tag.match(filter))) {
      return extraArgs[action];
    }
  }));

  return _.merge(actions[action](item, extraArgs), { text: action });
};

var isRunning = (container) => container.State == 'running';

var initContainerActions = (config, container) => {
  return _.chain(['logs'])
    .concat((isRunning(container)) ? ['console', 'restart', 'kill'] : ['start', 'remove'])
    .map(initAction(config, containerActions, container))
    .value();
};

var mapContainer = (config) => (container) => ({
  text: menuLabels.container(container),
  submenu: initContainerActions(config, container)
});

var hostWithOrg = (image) => {
  var imageName = _.get(image, 'RepoTags[0]', '');
  var slashIndex = imageName.lastIndexOf('/');
  return slashIndex == -1 ? 'docker' : imageName.substr(0, slashIndex);
};

var initImageActions = (config, image) => _.map(_.keys(imageActions), initAction(config, imageActions, image));

var mapImage = (config, containers) => (image) => ({
  text:    menuLabels.image(image),
  submenu: initImageActions(config, _.merge({ containers: containers }, image))
});

var mapMenuItems = ([key, values]) => _.concat(bitbar.sep, { text: key }, values);

var sortStates = ([state, ]) => states.indexOf(state);

var mapToMenu = (input, map, sortBy) => {
  return _.chain(input)
    .mapValues(_.partial(_.map, _, map))
    .toPairs()
    .sortBy(sortBy)
    .flatMap(mapMenuItems)
    .value();
};

var listImages = (docker) => (cb) => {
  docker.listImages((err, images) => {
    if (err) return cb(err);

    async.parallel(_.map(images, (image) => {
      var dockerImage = docker.getImage(image.Id);
      return _.bind(dockerImage.inspect, dockerImage);
    }), cb);
  });
};

var setRepoTagsToContainers = (containers, images) => {
  var imagesObj = _.keyBy(images, 'Id');
  return _.map(containers, (container) => _.extend({ RepoTags: imagesObj[container.ImageID].RepoTags }, container));
};

var parseResults = (err, results) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }

  var sourceContainers = setRepoTagsToContainers(results.containers, results.images);

  var config = results.config || {};
  var containers = _.groupBy(sourceContainers, 'State');
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
    mapToMenu(containers, mapContainer(config), sortStates),
    mapToMenu(images, mapImage(config, results.containers), 0)
  ));
};

var readConfig = (file) => (cb) => async.waterfall([
  (cb) => fs.exists(file, (exists) => cb(null, exists)),
  (exists, cb) => exists ? fs.readFile(file, 'utf8', cb) : cb(null, '{}'),
  (data, cb) => cb(null, JSON.parse(data))
], cb);

module.exports.display = () => {
  var docker = new Docker();

  var tasks = {
    config:     readConfig(path.join(process.env.HOME, '.bitbar-docker.json')),
    containers: _.bind(_.partial(docker.listContainers, { all: true }), docker),
    images:     listImages(docker)
  };

  async.parallel(tasks, parseResults);
};
