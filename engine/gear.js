/**
 * 装备生成 / 评分 / 魔方（Hero-dric Cube）
 * ---------------------------------------------------------------------------
 * 合成 synthesis、炼金 alchemy、制作 craft、插槽 socket、移除 removal、供奉 offering
 */

const { RARITIES, RARITY_ZH, SLOTS, AFFIXES, MATERIALS, COMMEMORATIVE, BASE_NAMES, CLASS_ELEMENT } = require('./data/items');
const { CLASS_ORDER } = require('./data/classes');
const { weightedPick, uid, clamp } = require('./util');
const T = require('./tunables');

const SLOT_MAP = Object.fromEntries(SLOTS.map(s => [s.id, s]));
const MAT_MAP = Object.fromEntries(MATERIALS.map(m => [m.id, m]));
const rarityIndex = (r) => RARITIES.indexOf(r);

/**
 * 提档重掷时 rarityShift 的增量。
 * 单位：无量纲，与 rarityShift 同量纲。
 * 取值来源：1.0 相当于把权重整体上抬约两档半（基数 2.35），
 * 实测能让幕末箱的「传说以上占比」从 4.66% 提升到 12% 上下，
 * 而普通箱（rerollChance=0）完全不受影响。
 * 调整后受影响的平衡结论见 HANDOFF.md 第 2 节。
 */
const REROLL_SHIFT_GAIN = 1.0;

/** 词缀数值：base * (1 + 0.06*ilvl) * 稀有度倍率 * 随机 0.85~1.15 */
function affixValue(rng, affix, ilvl, rarity) {
  const cfg = T.get();
  const mul = cfg.loot.rarityStatMul[rarity] || 1;
  const v = affix.base * (1 + 0.06 * ilvl) * mul * rng.range(0.85, 1.15);
  return affix.pct ? Math.round(v * 10000) / 10000 : Math.round(v * 10) / 10;
}

/**
 * 生成一件装备
 * @param {object} rng
 * @param {object} opts { slot, classId, rarity, ilvl, rarityShift, forceRarity, rerollChance, rerollShift }
 */
function rollItem(rng, opts = {}) {
  const cfg = T.get();
  const slot = opts.slot || rng.pick(SLOTS).id;
  const classId = opts.classId || rng.pick(CLASS_ORDER);
  const slotDef = SLOT_MAP[slot];

  let rarity = opts.forceRarity;
  if (!rarity) {
    const shift = opts.rarityShift || 0;
    // 稀有度权重按 shift 向高档偏移：低档权重衰减，高档权重提升
    const entries = RARITIES.map((r, i) => ({
      r, w: (cfg.loot.rarityWeights[r] || 1) * Math.pow(2.35, shift * (i / (RARITIES.length - 1)) - shift * 0.18)
    }));
    // 提档重掷：命中时把 shift 整体抬高 REROLL_SHIFT_GAIN 后重新 roll 一次，取较高稀有度。
    // 为什么需要它：上面的公式里 Common 档的权重基数是 1000，独占大头，
    // 而 i=0 时指数只有 -0.18*shift，衰减幅度很小。
    // 实测 shift=2.1 时 Common 仍占 52.6%，各档之间体感差异不明显，
    // 「高稀有箱开出好东西」这件事玩家感知不到。
    // 这里不改公式本身（它是魔方/合成/普通掉落的公共路径，改动会波及全项目），
    // 而是在宝箱层额外做一次提档，避免影响其他产出途径。
    const rollOnce = (s) => {
      const e = RARITIES.map((r, i) => ({
        r, w: (cfg.loot.rarityWeights[r] || 1) * Math.pow(2.35, s * (i / (RARITIES.length - 1)) - s * 0.18)
      }));
      const p = weightedPick(rng, e, x => x.w);
      return p ? p.r : 'Common';
    };
    rarity = rollOnce(shift);
    if (opts.rerollChance && rng.chance(opts.rerollChance)) {
      const better = rollOnce(shift + REROLL_SHIFT_GAIN);
      // 取稀有度更高的一方：重掷只会变好，不会把好装备换成差装备
      if (RARITIES.indexOf(better) > RARITIES.indexOf(rarity)) rarity = better;
    }
  }

  const ilvl = Math.max(1, Math.round(opts.ilvl ?? (1 + Math.floor(rng() * 60))));
  const mainMul = cfg.loot.rarityStatMul[rarity] || 1;
  const main = {
    stat: slotDef.main,
    value: (slotDef.mainBase * (1 + 0.07 * ilvl) * mainMul * rng.range(0.9, 1.1))
  };
  main.value = main.stat === 'moveSpeed' || main.stat === 'critRate' || main.stat === 'critDmg'
    ? Math.round(main.value * 10000) / 10000
    : Math.round(main.value * 10) / 10;

  const [lo, hi] = cfg.loot.affixCountByRarity[rarity] || [0, 1];
  const nAffix = lo + rng.int(hi - lo + 1);
  const pool = AFFIXES.filter(a => a.id !== slotDef.main);
  const affixes = [];
  const used = new Set();
  for (let i = 0; i < nAffix; i++) {
    const a = weightedPick(rng, pool.filter(x => !used.has(x.id)), x => x.weight);
    if (!a) break;
    used.add(a.id);
    affixes.push({ stat: a.id, value: affixValue(rng, a, ilvl, rarity) });
  }

  const ri = rarityIndex(rarity);
  const unlock = cfg.cube.socketUnlockRarity;
  const canSocket = (tier) => ri >= rarityIndex(unlock[tier]);

  return {
    uid: uid('it'),
    slot, classId, rarity, ilvl,
    element: CLASS_ELEMENT[classId] || 'none',
    main, affixes,
    sockets: {
      decoration: canSocket('decoration') ? null : undefined,
      engraving: canSocket('engraving') ? null : undefined,
      inscription: canSocket('inscription') ? null : undefined
    },
    locked: false,
    obtainedAt: Date.now()
  };
}

const SOCKET_ZH = { decoration: '装饰', engraving: '雕刻', inscription: '铭文' };

/** 插槽是否解锁（undefined = 该稀有度不开放这个槽） */
function socketState(item, tier) {
  if (!(tier in item.sockets)) return 'locked';
  return item.sockets[tier] ? 'filled' : 'empty';
}

/** 素材镶到装备上时，元素匹配才算全额 */
function socketEffect(item, matId) {
  const m = MAT_MAP[matId];
  if (!m) return null;
  const matched = m.element === 'none' || item.element === m.element;
  return { stat: m.affix, value: m.value * (matched ? 1 : 0.4), matched, matId };
}

/** 装备的全部有效词条（主属性 + 词缀 + 已镶嵌素材） */
function itemStats(item) {
  const out = [];
  if (!item) return out;
  out.push({ stat: item.main.stat, value: item.main.value, src: 'main' });
  for (const a of item.affixes) out.push({ stat: a.stat, value: a.value, src: 'affix' });
  for (const tier of ['decoration', 'engraving', 'inscription']) {
    if (item.sockets[tier]) {
      const e = socketEffect(item, item.sockets[tier]);
      if (e) out.push({ stat: e.stat, value: e.value, src: tier });
    }
  }
  return out;
}

/** 粗略战力评分，用于排序与"是否值得换"提示 */
function itemPower(item) {
  const W = { atk: 10, hp: 1.1, def: 4, critRate: 900, critDmg: 120, atkSpeed: 700,
    lifesteal: 900, moveSpeed: 200, healPower: 150, goldPct: 90, expPct: 90,
    dropPct: 90, thorns: 300, dotMul: 400, aoeMul: 400 };
  let p = 0;
  for (const s of itemStats(item)) p += (W[s.stat] || 1) * s.value;
  return Math.round(p);
}

function itemName(item) {
  const base = (BASE_NAMES[item.slot]?.[item.classId]) || item.slot;
  return `${RARITY_ZH[item.rarity]}·${base}`;
}

/** 卖给 NPC 的金币 */
function sellValue(item) {
  const cfg = T.get();
  const base = 40 + item.ilvl * 12 + item.affixes.length * 25;
  return Math.round(base * Math.pow(cfg.economy.sellValueRarityMul, rarityIndex(item.rarity)) * cfg.cube.alchemyGoldMul);
}

// ---------------------------------------------------------------------------
// 魔方操作。每个函数都返回 { ok, msg, changes }
// ---------------------------------------------------------------------------

const CUBE = {};

/** 合成：N 件同稀有度 -> 1 件更高稀有度（有概率跳档） */
CUBE.synthesis = function (state, rng, itemUids) {
  const cfg = T.get();
  const need = cfg.cube.synthesisInputs;
  if (itemUids.length !== need) return { ok: false, msg: `需要放入 ${need} 件装备` };
  const items = itemUids.map(u => state.inventory.find(i => i.uid === u)).filter(Boolean);
  if (items.length !== need) return { ok: false, msg: '部分装备不存在' };
  const rar = items[0].rarity;
  if (!items.every(i => i.rarity === rar)) return { ok: false, msg: '必须使用相同稀有度的装备' };
  if (items.some(i => i.locked)) return { ok: false, msg: '有装备被锁定' };
  const ri = rarityIndex(rar);
  if (ri >= RARITIES.length - 1) return { ok: false, msg: '已是最高稀有度' };

  let gain = 1;
  if (rng.chance(cfg.cube.synthesisJumpChance)) gain = 2;
  if (ri + gain >= RARITIES.length - 1 && rng.chance(0.25)) gain += 1;
  const target = RARITIES[Math.min(RARITIES.length - 1, ri + gain)];

  for (const i of items) removeFromInventory(state, i.uid);
  const ilvl = Math.max(...items.map(i => i.ilvl));
  const out = rollItem(rng, { rarity: target, ilvl, classId: rng.pick(items).classId, slot: rng.pick(SLOTS).id });
  state.inventory.push(out);
  state.stats.cubeOps.synthesis = (state.stats.cubeOps.synthesis || 0) + 1;
  return { ok: true, msg: `合成成功：${itemName(out)}`, item: out };
};

/** 炼金：装备 -> 金币 */
CUBE.alchemy = function (state, rng, itemUids) {
  if (!itemUids.length) return { ok: false, msg: '没有选择装备' };
  let gold = 0, n = 0;
  for (const u of itemUids) {
    const it = state.inventory.find(i => i.uid === u);
    if (!it || it.locked) continue;
    gold += sellValue(it);
    removeFromInventory(state, u);
    n++;
  }
  if (!n) return { ok: false, msg: '没有可炼金的装备' };
  state.gold += gold;
  state.stats.totalGold += gold;
  state.stats.cubeOps.alchemy = (state.stats.cubeOps.alchemy || 0) + 1;
  return { ok: true, msg: `炼金 ${n} 件，获得 ${gold} 金币`, gold };
};

/** 制作：消耗素材，产出指定槽位/等级的随机装备 */
CUBE.craft = function (state, rng, opts = {}) {
  const cfg = T.get();
  const cost = Math.round(cfg.cube.craftCostBase * (1 + (opts.ilvl || 20) * 0.08));
  if (state.gold < cost) return { ok: false, msg: `金币不足（需要 ${cost}）` };
  // 素材需求：按目标等级取 2~4 种
  const need = [];
  const kinds = 2 + rng.int(3);
  for (let i = 0; i < kinds; i++) {
    const m = weightedPick(rng, MATERIALS, x => x.weight);
    if (m && !need.find(x => x.id === m.id)) need.push({ id: m.id, count: 1 + rng.int(3) });
  }
  for (const n of need) {
    if ((state.materials[n.id] || 0) < n.count) {
      return { ok: false, msg: `素材不足：${MAT_MAP[n.id].zh} ×${n.count}` };
    }
  }
  for (const n of need) state.materials[n.id] -= n.count;
  state.gold -= cost;

  const item = rollItem(rng, {
    slot: opts.slot || rng.pick(SLOTS).id,
    classId: opts.classId || rng.pick(CLASS_ORDER),
    ilvl: opts.ilvl || 20 + rng.int(30),
    rarityShift: 1.2
  });
  state.inventory.push(item);
  state.stats.cubeOps.craft = (state.stats.cubeOps.craft || 0) + 1;
  return { ok: true, msg: `制作成功：${itemName(item)}`, item };
};

/** 镶嵌素材到插槽 */
CUBE.socket = function (state, rng, itemUid, tier, matId) {
  const cfg = T.get();
  const it = state.inventory.find(i => i.uid === itemUid);
  if (!it) return { ok: false, msg: '装备不存在' };
  if (socketState(it, tier) !== 'empty') return { ok: false, msg: '该插槽不可用或已占用' };
  const m = MAT_MAP[matId];
  if (!m) return { ok: false, msg: '素材不存在' };
  if ((state.materials[matId] || 0) < 1) return { ok: false, msg: `素材不足：${m.zh}` };
  if (m.tier !== ({ decoration: 1, engraving: 2, inscription: 3 })[tier]) {
    return { ok: false, msg: `素材品阶不匹配（${SOCKET_ZH[tier]}需要 ${tier === 'decoration' ? '1' : tier === 'engraving' ? '2' : '3'} 阶素材）` };
  }
  state.materials[matId] -= 1;
  it.sockets[tier] = matId;
  state.stats.cubeOps.socket = (state.stats.cubeOps.socket || 0) + 1;
  return { ok: true, msg: `镶嵌成功：${m.zh} -> ${SOCKET_ZH[tier]}槽`, item: it };
};

/** 移除插槽素材（素材不返还） */
CUBE.removal = function (state, rng, itemUid, tier) {
  const cfg = T.get();
  const it = state.inventory.find(i => i.uid === itemUid);
  if (!it) return { ok: false, msg: '装备不存在' };
  if (socketState(it, tier) !== 'filled') return { ok: false, msg: '该插槽没有素材' };
  if (state.gold < cfg.cube.removalCost) return { ok: false, msg: `金币不足（需要 ${cfg.cube.removalCost}）` };
  state.gold -= cfg.cube.removalCost;
  it.sockets[tier] = null;
  return { ok: true, msg: `已移除${SOCKET_ZH[tier]}槽素材`, item: it };
};

/** 供奉：消耗纪念币换随机物品 */
CUBE.offering = function (state, rng, coinId) {
  const coin = COMMEMORATIVE.find(c => c.id === coinId);
  if (!coin) return { ok: false, msg: '纪念币不存在' };
  if ((state.coins[coinId] || 0) < 1) return { ok: false, msg: '纪念币不足' };
  state.coins[coinId] -= 1;

  const roll = rng();
  let result;
  if (roll < 0.45) {
    const m = weightedPick(rng, MATERIALS.filter(x => x.tier >= 2), x => x.weight);
    state.materials[m.id] = (state.materials[m.id] || 0) + 1;
    result = { kind: 'material', name: m.zh, id: m.id };
  } else if (roll < 0.85) {
    const it = rollItem(rng, { rarity: coin.rarity, ilvl: 30 + rng.int(40), rarityShift: 0.5 });
    state.inventory.push(it);
    result = { kind: 'item', name: itemName(it), id: it.uid };
  } else {
    const gold = Math.round(5000 * Math.pow(4, rarityIndex(coin.rarity) / 3));
    state.gold += gold; state.stats.totalGold += gold;
    result = { kind: 'gold', name: `${gold} 金币`, id: null };
  }
  return { ok: true, msg: `供奉 ${coin.zh}：获得 ${result.name}`, result };
};

function removeFromInventory(state, itemUid) {
  const idx = state.inventory.findIndex(i => i.uid === itemUid);
  if (idx >= 0) state.inventory.splice(idx, 1);
  // 同时从所有英雄身上卸下
  for (const h of state.heroes) {
    for (const s of Object.keys(h.equipment)) {
      if (h.equipment[s] === itemUid) h.equipment[s] = null;
    }
  }
}

module.exports = {
  rollItem, itemStats, itemPower, itemName, sellValue, socketState, socketEffect,
  removeFromInventory, CUBE, SOCKET_ZH, rarityIndex, RARITY_ZH, MAT_MAP, SLOT_MAP
};
