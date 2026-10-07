/**
 * 符文树
 * ---------------------------------------------------------------------------
 * 8 个方向（与 TBH 一致）：core / south 成长 / northwest 财富 / north 便利 /
 * northeast 宝箱 / southeast 战斗 / southwest 经验。
 * 用 chain() 生成链式节点：同一分支内前一个点完才能点下一个，省掉手写依赖。
 */

const BRANCHES = {
  core:      { zh: '核心',   color: '#f59e0b' },
  south:     { zh: '成长',   color: '#4caf50' },
  northwest: { zh: '财富',   color: '#facc15' },
  north:     { zh: '便利',   color: '#06b6d4' },
  northeast: { zh: '宝箱',   color: '#a855f7' },
  southeast: { zh: '战斗',   color: '#ef4444' },
  southwest: { zh: '经验',   color: '#3f8cff' }
};

let _n = 0;
/**
 * 链式生成一串符文节点
 * @param {string} branch 分支 key
 * @param {string} prefix 节点 id 前缀
 * @param {Array} defs [{name, cost, effects, note}]
 */
function chain(branch, prefix, defs) {
  let prev = null;
  return defs.map((d, i) => {
    const id = `${prefix}_${i + 1}`;
    const node = {
      id, branch, name: d.name, cost: d.cost,
      requires: prev ? [prev] : [],
      effects: d.effects || {},
      note: d.note || '',
      // 给前端画树用：分支内的第几个 + 一个稳定的分支内偏移角
      ring: i + 1,
      angle: d.angle !== undefined ? d.angle : branchAngle(branch)
    };
    prev = id;
    _n++;
    return node;
  });
}

function branchAngle(b) {
  return ({
    core: 0, south: 90, northwest: 225, north: 270,
    northeast: 315, southeast: 45, southwest: 135
  })[b] ?? 0;
}

// 各分支的起始依赖：除 core 外都要先点 war_1
const RUNES = [
  // ---- 核心：解锁符文树 ----
  { id: 'war_1', branch: 'core', name: '战争符文', cost: 100, requires: [],
    effects: {}, note: '解锁符文树', ring: 0, angle: 0 },

  // ---- 正南：成长 / 阵容槽位（新手第一优先）----
  ...chain('south', 'cmd', [
    { name: '统帅 I',  cost: 5000,    effects: { partySlot: 1 }, note: '解锁第 3 个阵容槽位' },
    { name: '统帅 II', cost: 150000,  effects: { partySlot: 1 }, note: '解锁第 4 个阵容槽位' },
    { name: '觉醒',    cost: 50000,   effects: { skillSlot: 1 },  note: '解锁第 2 主动技能槽' },
    { name: '生命之树',cost: 80000,   effects: { partyHpPct: 0.10 } },
    { name: '壁垒',    cost: 180000,  effects: { partyDefPct: 0.12 } },
    { name: '共鸣',    cost: 420000,  effects: { partyAtkPct: 0.12 } },
    { name: '不灭',    cost: 1200000, effects: { partyHpPct: 0.20, partyDefPct: 0.10 } },
    { name: '统御',    cost: 5000000, effects: { partyAtkPct: 0.25, partyHpPct: 0.20 } }
  ]),

  // ---- 西北：财富 ----
  ...chain('northwest', 'wealth', [
    { name: '财富 I',  cost: 800,    effects: { goldPct: 0.06 } },
    { name: '财富 II', cost: 2600,   effects: { goldPct: 0.08 } },
    { name: '财富 III',cost: 9000,   effects: { goldPct: 0.10 } },
    { name: '财富 IV', cost: 32000,  effects: { goldPct: 0.12 } },
    { name: '财富 V',  cost: 110000, effects: { goldPct: 0.15 } },
    { name: '首领税',  cost: 360000, effects: { bossGoldPct: 0.35 } },
    { name: '炼金术',  cost: 900000, effects: { alchemyPct: 0.30 } },
    { name: '点石成金',cost: 2800000,effects: { goldPct: 0.35, alchemyPct: 0.5 } },
    { name: '贪婪之冠',cost: 9000000,effects: { goldPct: 0.60, bossGoldPct: 0.5 } }
  ]),

  // ---- 正北：背包 / 便利 ----
  ...chain('north', 'bag', [
    { name: '行囊 I',    cost: 1200,   effects: { bagSlots: 10 } },
    { name: '行囊 II',   cost: 5000,   effects: { bagSlots: 10 } },
    { name: '行囊 III',  cost: 22000,  effects: { bagSlots: 15 } },
    { name: '收藏页',    cost: 60000,  effects: { stashSlots: 20 } },
    { name: '自动开箱·普',cost: 150000,effects: { autoOpen: 'common' }, note: '自动开启普通与精良宝箱' },
    { name: '自动开箱·首领',cost: 480000,effects:{ autoOpen: 'boss' },  note: '自动开启首领宝箱' },
    { name: '开箱加速',  cost: 1400000,effects: { chestCdPct: 0.25 }, note: '开箱冷却 -25%' },
    { name: '开箱大师',  cost: 4200000,effects: { chestCdPct: 0.35, chestCap: 4 } }
  ]),

  // ---- 东北：宝箱 ----
  ...chain('northeast', 'chest', [
    { name: '探索',    cost: 1500,  effects: { chestRate: 0.05 } },
    { name: '征服',    cost: 6500,  effects: { chestRate: 0.06 } },
    { name: '幸运',    cost: 24000, effects: { rarityPct: 0.12 } },
    { name: '囤积',    cost: 95000, effects: { chestCap: 3 } },
    { name: '寻宝者',  cost: 320000,effects: { chestRate: 0.10, rarityPct: 0.15 } },
    { name: '秘藏',    cost: 1100000,effects:{ rarityPct: 0.25 } },
    { name: '宝库',    cost: 3500000,effects:{ chestCap: 6, chestRate: 0.15 } },
    { name: '奇迹之匣',cost: 12000000,effects:{ rarityPct: 0.5, chestRate: 0.2 } }
  ]),

  // ---- 东南：战斗 ----
  ...chain('southeast', 'combat', [
    { name: '力量 I',   cost: 1000,   effects: { partyAtkPct: 0.05 } },
    { name: '力量 II',  cost: 4200,   effects: { partyAtkPct: 0.07 } },
    { name: '守护',     cost: 16000,  effects: { partyDefPct: 0.08 } },
    { name: '迅捷',     cost: 58000,  effects: { partyAtkSpeedPct: 0.08 } },
    { name: '暴怒',     cost: 200000, effects: { partyCritRate: 0.04 } },
    { name: '毁灭',     cost: 700000, effects: { partyCritDmg: 0.25 } },
    { name: '战神',     cost: 2400000,effects: { partyAtkPct: 0.25, partyCritRate: 0.05 } },
    { name: '终焉之力', cost: 8000000,effects: { partyAtkPct: 0.45, partyCritDmg: 0.4 } }
  ]),

  // ---- 西南：经验 / 离线 ----
  ...chain('southwest', 'growth', [
    { name: '成长 I',   cost: 900,   effects: { expPct: 0.07 } },
    { name: '成长 II',  cost: 3800,  effects: { expPct: 0.09 } },
    { name: '成长 III', cost: 14000, effects: { expPct: 0.11 } },
    { name: '训练',     cost: 52000, effects: { expPct: 0.14 } },
    { name: '安息',     cost: 170000,effects: { offlineGoldPct: 0.30 }, note: '提升离线金币' },
    { name: '冥想',     cost: 560000,effects: { offlineExpPct: 0.35 }, note: '提升离线经验' },
    { name: '专注',     cost: 1800000,effects:{ expPct: 0.30 } },
    { name: '永恒训练', cost: 6000000,effects: { expPct: 0.55, offlineExpPct: 0.5 } }
  ])
];

// 除 core 分支外，所有第一环节点都依赖 war_1
for (const r of RUNES) {
  if (r.branch !== 'core' && r.ring === 1) r.requires = ['war_1'];
}

const RUNE_MAP = Object.fromEntries(RUNES.map(r => [r.id, r]));

module.exports = { RUNES, RUNE_MAP, BRANCHES };
