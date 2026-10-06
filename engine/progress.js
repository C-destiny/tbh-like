/**
 * 宠物解锁 / 成就判定 / 离线收益
 */

const { PETS, ACHIEVEMENTS } = require('./data/progress');
const { RARITIES, RARITY_ZH } = require('./data/items');
const { partyStats } = require('./hero');
const T = require('./tunables');

/** 检查宠物解锁条件（在指定关卡的累计击杀数） */
function checkPets(state) {
  const newly = [];
  for (const p of PETS) {
    if (state.pets?.[p.id]?.unlocked) continue;
    const kills = state.stageKills?.[p.atStage] || 0;
    if (kills >= p.kills) {
      state.pets[p.id] = { unlocked: true, at: Date.now() };
      newly.push(p);
    }
  }
  return newly;
}

/** 宠物被动汇总（不部署也生效） */
function petBonuses(state) {
  const b = {};
  for (const p of PETS) {
    if (!state.pets?.[p.id]?.unlocked) continue;
    for (const [k, v] of Object.entries(p.effects)) b[k] = (b[k] || 0) + v;
  }
  return b;
}

/** 判定单个成就条件 */
function condMet(cond, state, ctx) {
  switch (cond.type) {
    case 'kill': return (state.stats.totalKills || 0) >= cond.count;
    case 'level': return (state.heroes || []).some(h => h.level >= cond.heroLevel);
    case 'stageClear': {
      const m = state.clearedStages?.[cond.difficulty || 'any'] || {};
      return Object.keys(m).length >= cond.count;
    }
    case 'stage': {
      const id = cond.id;
      return Object.values(state.clearedStages || {}).some(m => m && m[id]);
    }
    case 'gold': return (state.stats.totalGold || 0) >= cond.total;
    case 'gearRarity': {
      const from = RARITIES.indexOf(cond.rarity);
      let n = 0;
      for (let i = from; i < RARITIES.length; i++) n += state.stats.gearObtained?.[RARITIES[i]] || 0;
      return n >= cond.count;
    }
    case 'runeCount': return Object.values(state.runes || {}).filter(Boolean).length >= cond.count;
    case 'petCount': return Object.values(state.pets || {}).filter(p => p?.unlocked).length >= cond.count;
    case 'cubeUse': return (state.stats.cubeOps?.[cond.op] || 0) >= cond.count;
    case 'partySize': return (state.party || []).length >= cond.count;
    case 'offlineClaims': return (state.stats.offlineClaims || 0) >= cond.count;
    case 'gearEquipped': {
      return (state.heroes || []).some(h => Object.values(h.equipment || {}).filter(Boolean).length >= cond.count);
    }
    case 'socketsOnOne': {
      return (state.inventory || []).some(it =>
        ['decoration', 'engraving', 'inscription'].filter(t => it.sockets?.[t]).length >= cond.count);
    }
    default: return false;
  }
}

/** 检查所有成就，返回新完成的（并自动发放奖励） */
function checkAchievements(state, ctx) {
  const newly = [];
  for (const a of ACHIEVEMENTS) {
    if (state.achievements?.[a.id]?.done) continue;
    if (condMet(a.cond, state, ctx)) {
      state.achievements[a.id] = { done: true, at: Date.now() };
      if (a.reward?.gold) { state.gold += a.reward.gold; state.stats.totalGold += a.reward.gold; }
      newly.push(a);
    }
  }
  return newly;
}

/**
 * 离线收益结算
 * 与 TBH 一致：离线给金币和经验，但不开宝箱，且有封顶时长。
 */
function offlineRewards(state, ctx, elapsedSec) {
  const cfg = T.get();
  const capH = cfg.idle.offlineCapHours;
  const capped = Math.min(elapsedSec, capH * 3600);
  if (capped < 60) return null;

  const ps = partyStats(state, ctx);
  const stage = state.currentStage?.id || '1-1';
  const si = (parseInt(String(stage).split('-')[0], 10) - 1) * 10 + (parseInt(String(stage).split('-')[1], 10) - 1);
  const diff = cfg.difficulty[state.currentStage?.difficulty || 'Normal'] || cfg.difficulty.Normal;

  const goldPerSec = (3 * Math.pow(cfg.economy.goldLevelScale, si) * diff.goldMul) * 1.2;
  const expPerSec = (6 * Math.pow(cfg.economy.expLevelScale, si) * diff.expMul) * 1.1;

  const b = ctx.bonuses || {};
  const gold = Math.round(goldPerSec * capped * cfg.idle.offlineGoldRate * (1 + (b.goldPct || 0) + (b.offlineGoldPct || 0)));
  const exp = Math.round(expPerSec * capped * cfg.idle.offlineExpRate * (1 + (b.expPct || 0) + (b.offlineExpPct || 0)));
  const kills = Math.round(capped * 0.35);

  return {
    seconds: capped, capped: elapsedSec > capH * 3600, capHours: capH,
    gold, exp, kills,
    goldPerHour: Math.round(goldPerSec * 3600 * cfg.idle.offlineGoldRate),
    expPerHour: Math.round(expPerSec * 3600 * cfg.idle.offlineExpRate)
  };
}

/** 领取离线收益并写入存档 */
function claimOffline(state, ctx, elapsedSec) {
  const r = offlineRewards(state, ctx, elapsedSec);
  if (!r) return null;
  state.gold += r.gold;
  state.stats.totalGold += r.gold;
  state.stats.totalKills += r.kills;
  state.stats.offlineClaims = (state.stats.offlineClaims || 0) + 1;

  // 经验平分给在场英雄
  const heroes = (state.party || []).map(u => state.heroes.find(h => h.uid === u)).filter(Boolean);
  if (heroes.length) {
    const each = Math.floor(r.exp / heroes.length);
    for (const h of heroes) h.xp += each;
  }
  return r;
}

module.exports = { checkPets, petBonuses, checkAchievements, offlineRewards, claimOffline, condMet };
