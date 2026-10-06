/**
 * 英雄：属性计算、升级、技能点、装备加成聚合
 * ---------------------------------------------------------------------------
 * 属性流水线： 职业基础 -> 等级成长 -> 装备词条 -> 技能 -> 符文/宠物(全局) -> 站位
 * 想加新属性就往 STAT_KEYS 里加，并在下面流水线里补一行。
 */

const { CLASSES } = require('./data/classes');
const { itemStats } = require('./gear');
const { expToNext, clamp } = require('./util');
const T = require('./tunables');

const STAT_KEYS = ['hp', 'atk', 'def', 'atkSpeed', 'crit', 'critDmg', 'lifesteal',
  'healPower', 'moveSpeed', 'shield', 'thorns', 'dotMul', 'aoeMul'];

/** 一个空的属性包 */
function emptyStats() {
  return {
    hp: 0, atk: 0, def: 0, atkSpeed: 0, crit: 0, critDmg: 0, lifesteal: 0,
    healPower: 0, moveSpeed: 0, shield: 0, thorns: 0, dotMul: 0, aoeMul: 0,
    goldPct: 0, expPct: 0, dropPct: 0
  };
}

/** 把技能/符文的 effect 累加进 stats（pct 类按乘算基数累加，flat 类直接加） */
function addEffect(stats, eff, level = 1) {
  for (const [k, v] of Object.entries(eff)) {
    if (!(k in stats)) continue;
    stats[k] += v * level;
  }
  return stats;
}

/**
 * 计算单个英雄的完整属性
 * @param {object} hero 存档里的英雄对象
 * @param {object} ctx { itemMap, bonuses, row, config }
 */
function computeStats(hero, ctx) {
  const cfg = T.get();
  const cls = CLASSES[hero.classId];
  if (!cls) return emptyStats();
  const lv = hero.level || 1;
  const g = { ...cfg.hero.growth, ...cls.growth };

  const s = emptyStats();
  s.hp = cls.base.hp + g.hp * (lv - 1);
  s.atk = cls.base.atk + g.atk * (lv - 1);
  s.def = cls.base.def + g.def * (lv - 1);
  s.healPower = cls.base.heal + (g.heal || 0) * (lv - 1);
  s.atkSpeed = cls.base.atkSpeed;
  s.crit = cls.base.crit;
  s.critDmg = cls.base.critDmg;
  s.moveSpeed = cls.base.moveSpeed;

  // --- 装备 ---
  const flat = emptyStats();
  for (const slot of Object.keys(hero.equipment || {})) {
    const uid = hero.equipment[slot];
    if (!uid) continue;
    const item = ctx.itemMap?.[uid];
    if (!item) continue;
    for (const st of itemStats(item)) {
      if (st.stat in flat) flat[st.stat] += st.value;
      else if (st.stat === 'flatAtk') flat.atk += st.value;
      else if (st.stat === 'flatHp') flat.hp += st.value;
      else if (st.stat === 'flatDef') flat.def += st.value;
      else if (st.stat === 'flatHeal') flat.healPower += st.value;
    }
  }
  for (const k of STAT_KEYS) s[k] += flat[k] || 0;

  // --- 技能 ---
  const sk = emptyStats();
  for (const def of cls.skills) {
    const lvl = hero.skills?.[def.id] || 0;
    if (lvl <= 0) continue;
    addEffect(sk, def.effect, lvl);
  }
  // 技能里的百分比转成乘算系数（后面统一乘）
  const pct = {
    hp: sk.pctHp || 0, atk: sk.pctAtk || 0, def: sk.pctDef || 0
  };
  for (const k of STAT_KEYS) s[k] += sk[k] || 0;
  // party* 类属于全局，收集起来交给上层
  const partyFromSkills = {
    partyAtkPct: sk.partyAtkPct || 0, partyHpPct: sk.partyHpPct || 0, partyDefPct: sk.partyDefPct || 0
  };

  // --- 符文 / 宠物 / GM buff（全局百分比）---
  const b = ctx.bonuses || {};
  s.atk *= 1 + (b.partyAtkPct || 0) + (partyFromSkills.partyAtkPct || 0);
  s.hp *= 1 + (b.partyHpPct || 0) + (partyFromSkills.partyHpPct || 0) + pct.hp;
  s.def *= 1 + (b.partyDefPct || 0) + (partyFromSkills.partyDefPct || 0) + pct.def;
  s.atk *= 1 + pct.atk;
  s.atkSpeed *= 1 + (b.partyAtkSpeedPct || 0);
  s.crit = clamp(s.crit + (b.partyCritRate || 0), 0, 1);
  s.critDmg += b.partyCritDmg || 0;
  s.moveSpeed *= 1 + (b.moveSpeed || 0);
  s.lifesteal = clamp(s.lifesteal + (b.lifesteal || 0), 0, cfg.combat.lifestealCap);
  s.healPower *= 1 + (b.healPower || 0);

  // --- 站位 ---
  const row = hero.row || cls.preferRow || 'mid';
  const rb = cfg.combat.roleBonus[row] || cfg.combat.roleBonus.mid;
  s.atk *= rb.dmg;
  s.hp *= rb.hp;

  // --- 派生 ---
  s.maxHp = Math.max(1, Math.round(s.hp));
  s.atk = Math.max(0, s.atk);
  s.dps = s.atk * s.atkSpeed * (1 + s.crit * (s.critDmg - 1)) * (1 + s.aoeMul) * (1 + s.dotMul * 0.5);
  s.ehp = Math.round(s.maxHp * (1 + s.def / cfg.combat.defK) + s.shield * s.maxHp);
  s.hps = s.healPower * (1 + s.atkSpeed * 0.2); // 每秒治疗量估算
  s.row = row;
  s.takenMul = cfg.combat.rowDamageTaken[row] ?? 0.6;

  s.goldPct = (b.goldPct || 0);
  s.expPct = (b.expPct || 0);
  s.dropPct = (b.dropPct || 0);
  return s;
}

/** 队伍总览：DPS、EHP、各英雄明细 */
function partyStats(state, ctx) {
  const heroes = (state.party || []).map(uid => state.heroes.find(h => h.uid === uid)).filter(Boolean);
  const rows = heroes.map(h => ({ hero: h, stats: computeStats(h, ctx) }));
  const dps = rows.reduce((a, r) => a + r.stats.dps, 0);
  const ehp = rows.reduce((a, r) => a + r.stats.ehp, 0);
  const hps = rows.reduce((a, r) => a + r.stats.hps, 0);
  return { rows, dps, ehp, hps, size: rows.length };
}

/** 加经验，返回升级次数 */
function gainXp(hero, amount, cfg) {
  const c = cfg || T.get();
  hero.xp += amount;
  let levels = 0;
  while (hero.level < c.hero.maxLevel && hero.xp >= expToNext(hero.level, c.hero)) {
    hero.xp -= expToNext(hero.level, c.hero);
    hero.level++;
    hero.skillPoints += c.hero.skillPointPerLevel;
    levels++;
  }
  if (hero.level >= c.hero.maxLevel) hero.xp = 0;
  return levels;
}

function heroDisplayName(hero) {
  const cls = CLASSES[hero.classId];
  return `${cls ? cls.zh : hero.classId} Lv.${hero.level}`;
}

module.exports = { computeStats, partyStats, gainXp, emptyStats, addEffect, heroDisplayName, STAT_KEYS };
