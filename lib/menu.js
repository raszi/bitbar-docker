/*jshint esversion: 6 */

const _ = require('lodash');
const async = require('async');
const bitbar = require('bitbar');
const Docker = require('dockerode');
const Handlebars = require('handlebars');

const Helpers = require('./helpers');

const states = ['running', 'created', 'restarting', 'paused', 'exited', 'dead'];

Handlebars.registerHelper('shortId', (cnt) => {
  return _.get(cnt, 'Id', '').slice(0, 12);
});

Handlebars.registerHelper('simpleName', (cnt) => {
  return _.head(Helpers.getNames(cnt));
});

Handlebars.registerHelper('firstTag', Helpers.firstTag);

var t = (x) => { return _.isFunction(x) ? x : Handlebars.compile(x); };

const menuLabels = _.mapValues({
  main:      '{{running}}/{{stopped}}',
  container: '{{simpleName this}}/{{shortId this}} ({{Status}})',
  image:     '{{firstTag this}}'
}, t);

function action() {
  var [...parameters] = arguments;
  var opts = (typeof _.last(parameters) === 'object') ? parameters.pop() : {};

  var params = _.chain(parameters)
      .castArray()
      .map(t)
      .value();

  return (props) => {
    var args = _.chain(params)
        .map((paramFunction) => { return paramFunction(props); })
        .flatten()
        .value();

    var options = _.extend({}, opts);

    if (opts.terminal === false) {
      return _.extend(options, {
        bash: '/usr/local/bin/docker',
        args: args.join('__')
      });
    } else {
      args.unshift('/usr/local/bin/docker');

      return _.extend(options, {
        bash: process.argv[0],
        param1:  process.argv[1],
        param2: Helpers.encodeArgs(args),
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

var initAction = (actions, item) => {
  return (action) => {
    return _.merge(actions[action](item), { text: action });
  };
};

var isRunning = (container) => {
  return container.State == 'running';
};

var initContainerActions = (container) => {
  return _.chain(['logs'])
    .concat((isRunning(container)) ? ['console', 'restart', 'kill'] : ['start', 'remove'])
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
  return _.concat(bitbar.sep, { text: key }, values);
};

var sortStates = ([state, ]) => {
  return states.indexOf(state);
};

var mapToMenu = (input, map, sortBy) => {
  return _.chain(input)
    .mapValues(_.partial(_.map, _, map))
    .toPairs()
    .sortBy(sortBy)
    .flatMap(mapMenuItems)
    .value();
};

var listImages = (docker) => {
  return (cb) => {
    docker.listImages((err, images) => {
      if (err) return cb(err);

      async.parallel(_.map(images, (image) => {
        var dockerImage = docker.getImage(image.Id);
        return _.bind(dockerImage.inspect, dockerImage);
      }), cb);
    });
  };
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

module.exports.display = () => {
  var docker = new Docker();

  var tasks = {
    containers: _.bind(_.partial(docker.listContainers, { all: true }), docker),
    images:     listImages(docker)
  };

  async.parallel(tasks, parseResults);
};
