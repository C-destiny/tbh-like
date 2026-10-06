/**
 * 掉落：宝箱生成与开启
 */

const { rollItem } = require('./gear');
const { MATERIALS, COMMEMORATIVE } = require('./data/items');
const { weightedPick } = require('./util');
const T = require('./tunables');

const CHEST_ZH = { normal: '普通宝箱', boss: '首领宝箱', actBoss: '幕末宝箱' };

const CHEST_ITEM_COUNT = { normal: [1, 1], boss: [1, 2], actBoss: [2, 3] };
const CHEST_GOLD_MUL = { normal: 1.0, boss: 3.2, actBoss: 8.0 };
const CHEST_MAT_CHANCE = { normal: 0.22, boss: 0.55, actBoss: 0.9 };
const CHEST_COIN_CHANCE = { normal: 0.02, boss: 0.12, actBoss: 0.4 };

/**
 * 生成一个宝箱（未开启）
 * @param {object} rng
 * @param {string} type normal | boss | actBoss
 * @param {object} ctx { stageIndex, difficulty, ilvl, bonuses }
 */
function rollChest(rng, type, ctx = {}) {
  const cfg = T.get();
  const diff = cfg.difficulty[ctx.difficulty || 'Normal'] || cfg.difficulty.Normal;
  const stageIndex = ctx.stageIndex || 0;
  const b = ctx.bonuses || {};

  const [lo, hi] = CHEST_ITEM_COUNT[type] || [1, 1];
  const count = lo + rng.int(hi - lo + 1);
  const ilvl = ctx.ilvl ?? (1 + Math.floor(stageIndex * 1.6) + rng.int(8));

  const items = [];
  for (let i = 0; i < count; i++) {
    items.push(rollItem(rng, {
      ilvl,
      rarityShift: (diff.rarityShift || 0) + (b.rarityPct ? b.rarityPct * 2 : 0)
    }));
  }

  const gold = Math.round((30 + stageIndex * 14) * CHEST_GOLD_MUL[type] * (diff.goldMul || 1) * rng.range(0.85, 1.15));

  const materials = [];
  if (rng.chance(CHEST_MAT_CHANCE[type] || 0)) {
    const m = weightedPick(rng, MATERIALS, x => x.weight);
    if (m) materials.push({ id: m.id, count: 1 + (rng.chance(0.15) ? 1 : 0) });
  }

  const coins = [];
  if (rng.chance(CHEST_COIN_CHANCE[type] || 0)) {
    const c = weightedPick(rng, COMMEMORATIVE, x => x.weight);
    if (c) coins.push({ id: c.id, count: 1 });
  }

  return { uid: 'ch_' + Math.floor(rng() * 1e9).toString(36) + Date.now().toString(36),
    type, zh: CHEST_ZH[type], items, gold, materials, coins, opened: false, at: Date.now() };
}

/** 每波清完是否掉宝箱 */
function rollWaveChest(rng, ctx = {}) {
  const cfg = T.get();
  const b = ctx.bonuses || {};
  const p = cfg.loot.chestChancePerWave * (1 + (b.chestRate || 0)) * (ctx.eventDropMul || 1);
  return rng.chance(Math.min(0.95, p));
}

/** 开箱，把内容物写入存档。返回摘要 */
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

module.exports = { rollChest, rollWaveChest, openChest, CHEST_ZH };
