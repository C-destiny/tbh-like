/**
 * 符文树
 * ---------------------------------------------------------------------------
 * 7 个分支（与 TBH 一致）：core 核心 / south 成长 / northwest 财富 / north 便利 /
 * northeast 宝箱 / southeast 战斗 / southwest 经验。不存在正西分支。
 * 用 chain() 生成链式节点：同一分支内前一个点完才能点下一个，省掉手写依赖。
 *
 * BRANCHES 里的 angle / icon / description 是纯展示元数据，只供前端画树与图标用，
 * 不参与 canUnlock、unlock 或 aggregate 的任何计算。
 */

const BRANCHES = {
  core:      { zh: '核心',   color: '#f59e0b', angle: 0,   icon: 'core',
    description: '符文树的起点，点亮后解锁其余分支' },
  south:     { zh: '成长',   color: '#4caf50', angle: 90,  icon: 'formation',
    description: '扩充阵容并强化全队生存' },
  northwest: { zh: '财富',   color: '#facc15', angle: 225, icon: 'gold',
    description: '提高金币与炼金收益' },
  north:     { zh: '便利',   color: '#06b6d4', angle: 270, icon: 'bag',
    description: '扩充背包、仓库并加速开箱' },
  northeast: { zh: '宝箱',   color: '#a855f7', angle: 315, icon: 'chest',
    description: '提高宝箱掉率与稀有度' },
  southeast: { zh: '战斗',   color: '#ef4444', angle: 45,  icon: 'attack',
    description: '强化攻击、攻速与暴击' },
  southwest: { zh: '经验',   color: '#3f8cff', angle: 135, icon: 'experience',
    description: '提高经验与离线收益' }
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
      // 图标键是展示元数据：按效果语义复用 18 类图标，不参与任何效果计算
      icon: d.icon || BRANCHES[branch].icon,
      // 给前端画树用：分支内的第几个 + 一个稳定的分支内偏移角
      ring: i + 1,
      angle: d.angle !== undefined ? d.angle : BRANCHES[branch].angle
    };
    prev = id;
    _n++;
    return node;
  });
}

// 各分支的起始依赖：除 core 外都要先点 war_1
const RUNES = [
  // ---- 核心：解锁符文树 ----
  { id: 'war_1', branch: 'core', name: '战争符文', cost: 100, requires: [],
    effects: {}, note: '解锁符文树', ring: 0, angle: 0, icon: 'core' },

  // ---- 正南：成长 / 阵容槽位（新手第一优先）----
  ...chain('south', 'cmd', [
    { name: '统帅 I',  cost: 5000,    effects: { partySlot: 1 }, note: '解锁第 3 个阵容槽位', icon: 'formation' },
    { name: '统帅 II', cost: 150000,  effects: { partySlot: 1 }, note: '解锁第 4 个阵容槽位', icon: 'formation' },
    { name: '觉醒',    cost: 50000,   effects: { skillSlot: 1 },  note: '解锁第 2 主动技能槽', icon: 'skill' },
    { name: '生命之树',cost: 80000,   effects: { partyHpPct: 0.10 }, icon: 'health' },
    { name: '壁垒',    cost: 180000,  effects: { partyDefPct: 0.12 }, icon: 'defense' },
    { name: '共鸣',    cost: 420000,  effects: { partyAtkPct: 0.12 }, icon: 'attack' },
    { name: '不灭',    cost: 1200000, effects: { partyHpPct: 0.20, partyDefPct: 0.10 }, icon: 'health' },
    { name: '统御',    cost: 5000000, effects: { partyAtkPct: 0.25, partyHpPct: 0.20 }, icon: 'formation' }
  ]),

  // ---- 西北：财富 ----
  ...chain('northwest', 'wealth', [
    { name: '财富 I',  cost: 800,    effects: { goldPct: 0.06 }, icon: 'gold' },
    { name: '财富 II', cost: 2600,   effects: { goldPct: 0.08 }, icon: 'gold' },
    { name: '财富 III',cost: 9000,   effects: { goldPct: 0.10 }, icon: 'gold' },
    { name: '财富 IV', cost: 32000,  effects: { goldPct: 0.12 }, icon: 'gold' },
    { name: '财富 V',  cost: 110000, effects: { goldPct: 0.15 }, icon: 'gold' },
    { name: '首领税',  cost: 360000, effects: { bossGoldPct: 0.35 }, icon: 'gold' },
    { name: '炼金术',  cost: 900000, effects: { alchemyPct: 0.30 }, icon: 'alchemy' },
    { name: '点石成金',cost: 2800000,effects: { goldPct: 0.35, alchemyPct: 0.5 }, icon: 'alchemy' },
    { name: '贪婪之冠',cost: 9000000,effects: { goldPct: 0.60, bossGoldPct: 0.5 }, icon: 'crown' }
  ]),

  // ---- 正北：背包 / 便利 ----
  ...chain('north', 'bag', [
    { name: '行囊 I',    cost: 1200,   effects: { bagSlots: 10 }, icon: 'bag' },
    { name: '行囊 II',   cost: 5000,   effects: { bagSlots: 10 }, icon: 'bag' },
    { name: '行囊 III',  cost: 22000,  effects: { bagSlots: 15 }, icon: 'bag' },
    { name: '收藏页',    cost: 60000,  effects: { stashSlots: 20 }, icon: 'stash' },
    { name: '自动开箱·普',cost: 150000,effects: { autoOpen: 'common' }, note: '自动开启普通与精良宝箱', icon: 'auto-chest' },
    { name: '自动开箱·首领',cost: 480000,effects:{ autoOpen: 'boss' },  note: '自动开启首领宝箱', icon: 'auto-chest' },
    { name: '开箱加速',  cost: 1400000,effects: { chestCdPct: 0.25 }, note: '开箱冷却 -25%', icon: 'timer' },
    { name: '开箱大师',  cost: 4200000,effects: { chestCdPct: 0.35, chestCap: 4 }, icon: 'timer' }
  ]),

  // ---- 东北：宝箱 ----
  ...chain('northeast', 'chest', [
    { name: '探索',    cost: 1500,  effects: { chestRate: 0.05 }, icon: 'chest' },
    { name: '征服',    cost: 6500,  effects: { chestRate: 0.06 }, icon: 'chest' },
    { name: '幸运',    cost: 24000, effects: { rarityPct: 0.12 }, icon: 'rarity' },
    { name: '囤积',    cost: 95000, effects: { chestCap: 3 }, icon: 'chest' },
    { name: '寻宝者',  cost: 320000,effects: { chestRate: 0.10, rarityPct: 0.15 }, icon: 'rarity' },
    { name: '秘藏',    cost: 1100000,effects:{ rarityPct: 0.25 }, icon: 'rarity' },
    { name: '宝库',    cost: 3500000,effects:{ chestCap: 6, chestRate: 0.15 }, icon: 'chest' },
    { name: '奇迹之匣',cost: 12000000,effects:{ rarityPct: 0.5, chestRate: 0.2 }, icon: 'rarity' }
  ]),

  // ---- 东南：战斗 ----
  ...chain('southeast', 'combat', [
    { name: '力量 I',   cost: 1000,   effects: { partyAtkPct: 0.05 }, icon: 'attack' },
    { name: '力量 II',  cost: 4200,   effects: { partyAtkPct: 0.07 }, icon: 'attack' },
    { name: '守护',     cost: 16000,  effects: { partyDefPct: 0.08 }, icon: 'defense' },
    { name: '迅捷',     cost: 58000,  effects: { partyAtkSpeedPct: 0.08 }, icon: 'speed' },
    { name: '暴怒',     cost: 200000, effects: { partyCritRate: 0.04 }, icon: 'critical' },
    { name: '毁灭',     cost: 700000, effects: { partyCritDmg: 0.25 }, icon: 'critical' },
    { name: '战神',     cost: 2400000,effects: { partyAtkPct: 0.25, partyCritRate: 0.05 }, icon: 'attack' },
    { name: '终焉之力', cost: 8000000,effects: { partyAtkPct: 0.45, partyCritDmg: 0.4 }, icon: 'attack' }
  ]),

  // ---- 西南：经验 / 离线 ----
  ...chain('southwest', 'growth', [
    { name: '成长 I',   cost: 900,   effects: { expPct: 0.07 }, icon: 'experience' },
    { name: '成长 II',  cost: 3800,  effects: { expPct: 0.09 }, icon: 'experience' },
    { name: '成长 III', cost: 14000, effects: { expPct: 0.11 }, icon: 'experience' },
    { name: '训练',     cost: 52000, effects: { expPct: 0.14 }, icon: 'experience' },
    { name: '安息',     cost: 170000,effects: { offlineGoldPct: 0.30 }, note: '提升离线金币', icon: 'experience' },
    { name: '冥想',     cost: 560000,effects: { offlineExpPct: 0.35 }, note: '提升离线经验', icon: 'experience' },
    { name: '专注',     cost: 1800000,effects:{ expPct: 0.30 }, icon: 'experience' },
    { name: '永恒训练', cost: 6000000,effects: { expPct: 0.55, offlineExpPct: 0.5 }, icon: 'experience' }
  ])
];

// 除 core 分支外，所有第一环节点都依赖 war_1
for (const r of RUNES) {
  if (r.branch !== 'core' && r.ring === 1) r.requires = ['war_1'];
}

const RUNE_MAP = Object.fromEntries(RUNES.map(r => [r.id, r]));

module.exports = { RUNES, RUNE_MAP, BRANCHES };
