/** 引擎统一出口 */
const T = require('./tunables');
const util = require('./util');
const gear = require('./gear');
const hero = require('./hero');
const rune = require('./rune');
const combat = require('./combat');
const loot = require('./loot');
const progress = require('./progress');
const save = require('./save');
const game = require('./game');

const data = {
  config: T.baseConfig,
  classes: require('./data/classes'),
  items: require('./data/items'),
  runes: require('./data/runes'),
  monsters: require('./data/monsters'),
  progress: require('./data/progress')
};

module.exports = { T, util, gear, hero, rune, combat, loot, progress, save, game, data };
