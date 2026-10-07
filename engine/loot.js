/**
 * 掉落：宝箱生成与开启
 */

const { rollItem } = require('./gear');
const { MATERIALS, COMMEMORATIVE } = require('./data/items');
const { weightedPick } = require('./util');
const T = require('./tunables');

/**
 * 宝箱稀有度分档表。
 *
 * 设计依据：装备稀有度由 rollItem 的 rarityShift 控制 —— 权重按 2.35^shift
 * 向高档偏移（见 engine/gear.js）。因此「宝箱越稀有、箱内装备越好」
 * 直接复用同一套机制，无需在 loot 里重复实现一遍权重表。
 *
 * rarityShift 的含义：该档宝箱给箱内装备的稀有度总偏移，会与难度偏移、
 * 世界事件加成叠加后传入 rollItem。
 *
 * goldMul / itemCount / matChance / coinChance 均为倍率或概率，
 * 取值来源见各自注释；调整后受影响的平衡结论见 HANDOFF.md 第 2 节。
 */
const CHEST_TIERS = {
  // common 波次清怪常见档。rarityShift 0 = 完全不加成，与改动前一致。
  common: {
    key: 'common', zh: '普通宝箱', icon: '📦', color: '#9aa3b2',
    rarityShift: 0, itemCount: [1, 1], goldMul: 1.0,
    matChance: 0.22, coinChance: 0.02,
    rarityReluck: 0
  },
  // fine 波次清怪的升级档。shift 0.55 约等于把权重整体上抬两档左右。
  fine: {
    key: 'fine', zh: '精良宝箱', icon: '🎁', color: '#4caf50',
    rarityShift: 0.55, itemCount: [1, 2], goldMul: 1.6,
    matChance: 0.34, coinChance: 0.05,
    rarityReluck: 0.18
  },
  // boss 关底 Boss 必掉。shift 1.3 明显偏向稀有以上。
  boss: {
    key: 'boss', zh: '首领宝箱', icon: '🧰', color: '#3f8cff',
    rarityShift: 1.3, itemCount: [1, 2], goldMul: 3.2,
    matChance: 0.55, coinChance: 0.12,
    rarityReluck: 0.38
  },
  // actBoss 幕末 Boss 必掉，全项目最高档。shift 2.1 明显偏向传说以上。
  actBoss: {
    key: 'actBoss', zh: '幕末宝箱', icon: '💠', color: '#a855f7',
    rarityShift: 2.1, itemCount: [2, 3], goldMul: 8.0,
    matChance: 0.9, coinChance: 0.4,
    rarityReluck: 0.62
  }
};

/** 宝箱稀有度由低到高的顺序，用于「升档」时取相邻档 */
const CHEST_TIER_ORDER = ['common', 'fine', 'boss', 'actBoss'];

/**
 * 波次清怪的宝箱分档概率。
 * fine 占 30% —— 即波次箱有 30% 概率是精良档，其余 70% 仍是普通档。
 * 取值理由：让升级档常遇但不至于让普通档失去意义（普通档仍是最低保底）。
 */
const WAVE_CHEST_WEIGHTS = { common: 0.70, fine: 0.30 };

/** 取宝箱档位定义；未知 type 一律降级为 common，避免 undefined 参与计算 */
function tierOf(type) {
  return CHEST_TIERS[type] || CHEST_TIERS.common;
}

/**
 * 生成一个宝箱（未开启）
 * @param {object} rng
 * @param {string} type common | fine | boss | actBoss
 * @param {object} ctx { stageIndex, difficulty, ilvl, bonuses }
 */
function rollChest(rng, type, ctx = {}) {
  const cfg = T.get();
  const diff = cfg.difficulty[ctx.difficulty || 'Normal'] || cfg.difficulty.Normal;
  const stageIndex = ctx.stageIndex || 0;
  const b = ctx.bonuses || {};
  const tier = tierOf(type);

  const [lo, hi] = tier.itemCount;
  const count = lo + rng.int(hi - lo + 1);
  const ilvl = ctx.ilvl ?? (1 + Math.floor(stageIndex * 1.6) + rng.int(8));

  const items = [];
  for (let i = 0; i < count; i++) {
    items.push(rollItem(rng, {
      ilvl,
      // 箱档偏移 + 难度偏移 + 世界事件偏移，三者叠加
      rarityShift: tier.rarityShift + (diff.rarityShift || 0) + (b.rarityPct ? b.rarityPct * 2 : 0),
      // 高稀有箱的额外提档重掷概率，见 RARITY_RELUCK 注释
      rerollChance: tier.rarityReluck || 0
    }));
  }

  const gold = Math.round((30 + stageIndex * 14) * tier.goldMul * (diff.goldMul || 1) * rng.range(0.85, 1.15));

  const materials = [];
  if (rng.chance(tier.matChance)) {
    const m = weightedPick(rng, MATERIALS, x => x.weight);
    if (m) materials.push({ id: m.id, count: 1 + (rng.chance(0.15) ? 1 : 0) });
  }

  const coins = [];
  if (rng.chance(tier.coinChance)) {
    const c = weightedPick(rng, COMMEMORATIVE, x => x.weight);
    if (c) coins.push({ id: c.id, count: 1 });
  }

  return { uid: 'ch_' + Math.floor(rng() * 1e9).toString(36) + Date.now().toString(36),
    type: tier.key, zh: tier.zh, icon: tier.icon, color: tier.color,
    items, gold, materials, coins, opened: false, at: Date.now() };
}

/** 每波清完是否掉宝箱 */
function rollWaveChest(rng, ctx = {}) {
  const cfg = T.get();
  const b = ctx.bonuses || {};
  const p = cfg.loot.chestChancePerWave * (1 + (b.chestRate || 0)) * (ctx.eventDropMul || 1);
  return rng.chance(Math.min(0.95, p));
}

/**
 * 决定波次清怪掉哪一档宝箱（common / fine）。
 * 与 rollWaveChest 分开：本函数只在「已确定要掉」之后调用，
 * 这样「掉不掉」与「掉什么档」两个概率互相独立，调节一个不影响另一个。
 *
 * @param {object} rng
 * @returns {string} common | fine
 */
function rollWaveChestTier(rng) {
  const r = rng();
  let acc = 0;
  for (const key of CHEST_TIER_ORDER) {
    const w = WAVE_CHEST_WEIGHTS[key];
    if (w == null) continue;
    acc += w;
    if (r < acc) return key;
  }
  return 'common';
}

/**
 * 打开宝箱，把内容物写入存档。返回摘要
 * @param {object} state 玩家存档
 * @param {object} chest 存档中的宝箱对象
 * @returns {{ok:boolean, msg?:string, gained?:object}} 开箱结果摘要
 */
function openChest(state, chest, rng) {
  if (chest.opened) return { ok: false, msg: '宝箱已开启' };
  chest.opened = true;
  const gained = { items: [], gold: chest.gold, materials: [], coins: [] };

  for (const it of chest.items) {
    state.inventory.push(it);
    state.stats.gearObtained[it.rarity] = (state.stats.gearObtained[it.rarity] || 0) + 1;
    gained.items.push(it);
  }
  state.gold += chest.gold;
  state.stats.totalGold += chest.gold;
  for (const m of chest.materials) {
    state.materials[m.id] = (state.materials[m.id] || 0) + m.count;
    gained.materials.push(m);
  }
  for (const c of chest.coins) {
    state.coins[c.id] = (state.coins[c.id] || 0) + c.count;
    gained.coins.push(c);
  }
  return { ok: true, gained };
}

module.exports = {
  rollChest, rollWaveChest, rollWaveChestTier, openChest,
  CHEST_TIERS, CHEST_TIER_ORDER, tierOf
};
