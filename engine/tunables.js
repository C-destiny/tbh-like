/**
 * 可调数值层 (Tunables)
 * ---------------------------------------------------------------------------
 * 最终数值 = 内置 config.js  <被>  DB 里的 overrides 覆盖。
 * GM 面板改的只是 overrides，不动源码，所以随时可以"恢复默认"。
 */

const baseConfig = require('./data/config');

let overrides = {};
let cache = null;

function setOverrides(obj) {
  overrides = obj && typeof obj === 'object' ? obj : {};
  cache = null;
  return get();
}

function getOverrides() {
  return JSON.parse(JSON.stringify(overrides));
}

function get() {
  if (!cache) {
    const { deepMerge } = require('./util');
    cache = deepMerge(baseConfig, overrides);
  }
  return cache;
}

/** 用点路径读一个值，例如 get('loot.chestChancePerWave') */
function getAt(path) {
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), get());
}

/**
 * 用点路径写一个值，返回新的 overrides。
 * GM 面板与 gm.js 指令都走这里，保证只写 overrides 不污染源配置。
 */
function setAt(path, value) {
  const keys = path.split('.');
  const next = getOverrides();
  let cur = next;
  for (let i = 0; i < keys.length - 1; i++) {
    if (typeof cur[keys[i]] !== 'object' || cur[keys[i]] === null) cur[keys[i]] = {};
    cur = cur[keys[i]];
  }
  cur[keys[keys.length - 1]] = value;
  setOverrides(next);
  return getOverrides();
}

function resetAt(path) {
  const next = getOverrides();
  const keys = path.split('.');
  let cur = next;
  for (let i = 0; i < keys.length - 1; i++) {
    if (cur == null || typeof cur[keys[i]] !== 'object') return getOverrides();
    cur = cur[keys[i]];
  }
  delete cur[keys[keys.length - 1]];
  setOverrides(next);
  return getOverrides();
}

/**
 * 列出所有"可热改"的数值，供 GM 面板自动生成表单。
 * 格式：{ path, label, value, default, type }
 */
function listTunables() {
  const cur = get();
  const def = baseConfig;
  const groups = {
    combat: '战斗', hero: '英雄成长', economy: '经济', idle: '离线',
    loot: '掉落', cube: '魔方', balance: '难度曲线', difficulty: '难度', limits: '上限'
  };
  const labels = {
    'combat.tickMs': '模拟步长(ms)', 'combat.critBaseDmg': '暴击基础倍率',
    'combat.defK': '减伤系数', 'combat.lifestealCap': '吸血上限',
    'combat.reviveSeconds': '复活冷却(秒)', 'combat.waveGapSeconds': '波次间隔(秒)',
    'combat.failRetrySeconds': '失败重试等待(秒)',
    'hero.expBase': '升级经验基数', 'hero.expPow': '升级经验指数',
    'hero.maxLevel': '等级上限', 'hero.baseSlots': '初始阵容槽',
    'economy.goldPerKillBase': '每杀基础金币', 'economy.goldLevelScale': '关卡金币成长',
    'economy.expLevelScale': '关卡经验成长',
    'idle.offlineCapHours': '离线封顶(小时)', 'idle.offlineGoldRate': '离线金币效率',
    'idle.offlineExpRate': '离线经验效率',
    'loot.chestChancePerWave': '每波宝箱概率', 'loot.chestCapacityBase': '宝箱容量',
    'cube.synthesisInputs': '合成所需件数', 'cube.alchemyGoldMul': '炼金金币倍率',
    'cube.removalCost': '移除插槽费用', 'cube.craftCostBase': '制作基础费用',
    'limits.maxInventory': '背包上限',
    'balance.hpPerStage': '每关怪物血量倍率', 'balance.atkPerStage': '每关怪物攻击倍率',
    'balance.defPerStage': '每关怪物防御倍率', 'balance.wavesBase': '基础波数',
    'balance.waveSizeBase': '每波怪物数', 'balance.eliteFromStage': '精英起始关',
    'balance.tierMul.normal': '普通怪倍率', 'balance.tierMul.elite': '精英倍率',
    'balance.tierMul.boss': '关卡Boss倍率', 'balance.tierMul.actBoss': '幕末Boss倍率'
  };

  // tierMul 是嵌套对象，单独摊平
  const balanceOut = [];
  for (const [k, v] of Object.entries(cur.balance?.tierMul || {})) {
    balanceOut.push({
      group: '难度曲线', path: `balance.tierMul.${k}`, label: labels[`balance.tierMul.${k}`],
      value: v, default: def.balance?.tierMul?.[k], type: 'number'
    });
  }

  const diffKeys = ['hpMul', 'atkMul', 'goldMul', 'expMul', 'rarityShift'];
  const diffLabels = { hpMul: '怪物血量', atkMul: '怪物攻击', goldMul: '金币', expMul: '经验', rarityShift: '稀有度偏移' };

  const out = [];
  for (const [grp, zh] of Object.entries(groups)) {
    if (grp === 'difficulty') continue;
    for (const [k, v] of Object.entries(cur[grp] || {})) {
      if (v && typeof v === 'object') continue;
      const path = `${grp}.${k}`;
      out.push({
        group: zh, path, label: labels[path] || k,
        value: v, default: def[grp]?.[k],
        type: typeof v === 'boolean' ? 'bool' : 'number'
      });
    }
  }
  out.push(...balanceOut);

  for (const [dk, dv] of Object.entries(cur.difficulty || {})) {
    for (const k of diffKeys) {
      if (!(k in dv)) continue;
      const path = `difficulty.${dk}.${k}`;
      out.push({
        group: `难度-${dv.label || dk}`, path, label: diffLabels[k] || k,
        value: dv[k], default: def.difficulty?.[dk]?.[k], type: 'number'
      });
    }
  }
  return out;
}

module.exports = { get, setOverrides, getOverrides, setAt, resetAt, getAt, listTunables, baseConfig };
