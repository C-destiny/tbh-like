/**
 * 战斗模拟（服务器权威）
 * ---------------------------------------------------------------------------
 * 一次挑战 = 一个 run。step() 按 dt 推进，返回发生的事件（击杀、掉箱、通关、失败）。
 * run 是可序列化的，可以存盘后断线续打。
 */

const { buildStages, scaleMonster } = require('./data/monsters');
const { computeStats } = require('./hero');
const { uid, clamp } = require('./util');
const T = require('./tunables');

let _stageCache = null;
/** 关卡表按难度缓存（配置变了就 rebuild） */
function stageTable(difficultyKey) {
  if (!_stageCache) _stageCache = {};
  const cfg = T.get();
  // 缓存 key 带上难度曲线的内容，GM 热改后自动重建
  const sig = cfg.schemaVersion + '|' + JSON.stringify(cfg.balance) + '|' + JSON.stringify(cfg.difficulty[difficultyKey]);
  if (!_stageCache[difficultyKey] || _stageCache[difficultyKey]._v !== sig) {
    const list = buildStages(difficultyKey, cfg.difficulty[difficultyKey] || cfg.difficulty.Normal);
    const map = Object.fromEntries(list.map(s => [s.id, s]));
    _stageCache[difficultyKey] = { list, map, _v: sig };
  }
  return _stageCache[difficultyKey];
}
function invalidateStageCache() { _stageCache = null; }

function getStage(difficultyKey, stageId) {
  return stageTable(difficultyKey).map[stageId];
}
function listStages(difficultyKey) {
  return stageTable(difficultyKey).list;
}

/** 开一场新的挑战 */
function createRun(state, ctx, opts = {}) {
  const cfg = T.get();
  const difficultyKey = opts.difficulty || state.currentStage.difficulty || 'Normal';
  const stageId = opts.stageId || state.currentStage.id || '1-1';
  const stage = getStage(difficultyKey, stageId);
  if (!stage) return null;

  const heroes = (state.party || [])
    .map(u => state.heroes.find(h => h.uid === u))
    .filter(h => h && h.alive !== false);
  if (!heroes.length) return null;

  const rows = heroes.map(h => ({ hero: h, stats: computeStats(h, ctx) }));
  const heroHp = {}, heroMax = {}, heroShield = {};
  for (const r of rows) {
    heroHp[r.hero.uid] = r.stats.maxHp;
    heroMax[r.hero.uid] = r.stats.maxHp;
    heroShield[r.hero.uid] = Math.round(r.stats.shield * r.stats.maxHp);
  }

  const diff = cfg.difficulty[difficultyKey] || cfg.difficulty.Normal;
  const run = {
    runId: uid('run'),
    stageId, difficulty: difficultyKey, stageIndex: stage.stageIndex,
    waveIndex: 0, waveCount: stage.waves,
    enemies: [],
    heroHp, heroMax, heroShield,
    downed: {},           // uid -> 剩余复活秒数
    phase: 'fighting',    // fighting | gap | cleared | failed
    gapTimer: 0,
    elapsed: 0,
    kills: 0, gold: 0, exp: 0,
    chestDrops: [],       // 本场掉落的宝箱（未开）
    startedAt: Date.now(),
    bossWave: stage.waves - 1,
    isActEnd: !!stage.isActEnd,
    difficultyMul: diff
  };
  spawnWave(run, stage, diff);
  return run;
}

function spawnWave(run, stage, diff) {
  const comp = stage.waveComp[run.waveIndex] || [];
  run.enemies = comp.map(pid => {
    const m = scaleMonster(pid, stage.stageIndex, diff);
    return { uid: uid('e'), protoId: pid, zh: m.zh, sprite: m.sprite, tier: m.tier,
      hp: m.hp, maxHp: m.hp, atk: m.atk, def: m.def, atkSpeed: m.atkSpeed,
      exp: m.exp, gold: m.gold, alive: true };
  });
}

/**
 * 推进 dt 秒
 * @returns {Array} events
 */
function step(run, dt, ctx, rng) {
  const cfg = T.get();
  const events = [];
  if (run.phase === 'cleared' || run.phase === 'failed') return events;

  if (run.phase === 'gap') {
    run.gapTimer -= dt;
    run.elapsed += dt;
    if (run.gapTimer <= 0) {
      run.waveIndex++;
      if (run.waveIndex >= run.waveCount) {
        run.phase = 'cleared';
        events.push({ t: 'cleared', stageId: run.stageId, elapsed: run.elapsed });
      } else {
        run.phase = 'fighting';
        const stage = getStage(run.difficulty, run.stageId);
        spawnWave(run, stage, run.difficultyMul);
        events.push({ t: 'wave', index: run.waveIndex + 1, total: run.waveCount });
      }
    }
    return events;
  }

  run.elapsed += dt;

  // 复活倒计时
  for (const u of Object.keys(run.downed)) {
    run.downed[u] -= dt;
    if (run.downed[u] <= 0) {
      delete run.downed[u];
      run.heroHp[u] = Math.round(run.heroMax[u] * 0.5);
      events.push({ t: 'revive', uid: u });
    }
  }

  const aliveHeroes = ctx.rows.filter(r => !run.downed[r.hero.uid] && run.heroHp[r.hero.uid] > 0);
  const aliveEnemies = run.enemies.filter(e => e.alive);

  if (!aliveEnemies.length) {
    run.phase = 'gap';
    run.gapTimer = cfg.combat.waveGapSeconds;
    // 清完一波回一口血，否则长时间挂机会被消耗致死
    const healPct = cfg.combat.waveHealPct ?? 0.25;
    for (const u of Object.keys(run.heroMax)) {
      if (run.downed[u]) continue;
      run.heroHp[u] = Math.min(run.heroMax[u], run.heroHp[u] + run.heroMax[u] * healPct);
    }
    events.push({ t: 'waveClear', index: run.waveIndex + 1 });
    return events;
  }
  if (!aliveHeroes.length) {
    run.phase = 'failed';
    events.push({ t: 'failed', stageId: run.stageId });
    return events;
  }

  // --- 英雄输出 ---
  let targetCursor = 0;
  for (const r of aliveHeroes) {
    const raw = r.stats.dps * dt;
    // AoE 英雄把伤害摊到全体，否则集中打最前一只
    if (r.stats.aoeMul > 0.25 && aliveEnemies.length > 1) {
      const each = raw / aliveEnemies.length;
      for (const e of aliveEnemies) dealDamage(run, e, each, events);
    } else {
      const e = aliveEnemies[targetCursor % aliveEnemies.length];
      targetCursor++;
      dealDamage(run, e, raw, events);
    }
    // 吸血
    if (r.stats.lifesteal > 0) {
      const cap = run.heroMax[r.hero.uid];
      run.heroHp[r.hero.uid] = Math.min(cap, run.heroHp[r.hero.uid] + raw * r.stats.lifesteal);
    }
  }

  // --- 怪物输出 ---
  const defK = cfg.combat.defK;
  const front = aliveHeroes.filter(r => r.stats.row === 'front');
  const mid = aliveHeroes.filter(r => r.stats.row === 'mid');
  const back = aliveHeroes.filter(r => r.stats.row === 'back');
  for (const e of run.enemies.filter(x => x.alive)) {
    const raw = e.atk * e.atkSpeed * dt;
    const pool = front.length ? front : (mid.length ? mid : back);
    if (!pool.length) break;
    const per = raw / pool.length;
    for (const r of pool) {
      const uid = r.hero.uid;
      const mitigated = per * (defK / (defK + Math.max(0, r.stats.def)));
      // 护盾先扛
      if (run.heroShield[uid] > 0) {
        const absorbed = Math.min(run.heroShield[uid], mitigated);
        run.heroShield[uid] -= absorbed;
        const rest = mitigated - absorbed;
        run.heroHp[uid] -= rest;
      } else {
        run.heroHp[uid] -= mitigated;
      }
      // 荆棘
      if (r.stats.thorns > 0) dealDamage(run, e, mitigated * r.stats.thorns, events);
      if (run.heroHp[uid] <= 0 && !run.downed[uid]) {
        run.heroHp[uid] = 0;
        const reviveSec = cfg.combat.reviveSeconds * (1 - (ctx.bonuses.reviveSpeed || 0));
        run.downed[uid] = reviveSec;
        events.push({ t: 'down', uid, name: r.hero.classId, seconds: reviveSec });
      }
    }
  }

  // --- 治疗 ---
  const healers = ctx.rows.filter(r => r.stats.hps > 0 && !run.downed[r.hero.uid]);
  for (const h of healers) {
    const wounded = aliveHeroes
      .filter(r => run.heroHp[r.hero.uid] < run.heroMax[r.hero.uid])
      .sort((a, b) => (run.heroHp[a.hero.uid] / run.heroMax[a.hero.uid]) - (run.heroHp[b.hero.uid] / run.heroMax[b.hero.uid]));
    if (!wounded.length) continue;
    const amt = h.stats.hps * dt;
    const t = wounded[0];
    run.heroHp[t.hero.uid] = Math.min(run.heroMax[t.hero.uid], run.heroHp[t.hero.uid] + amt);
  }

  return events;
}

function dealDamage(run, enemy, amount, events) {
  if (!enemy.alive || amount <= 0) return;
  const defK = T.get().combat.defK;
  const dmg = amount * (defK / (defK + enemy.def));
  enemy.hp -= dmg;
  if (enemy.hp <= 0) {
    enemy.hp = 0;
    enemy.alive = false;
    run.kills++;
    run.gold += enemy.gold;
    run.exp += enemy.exp;
    events.push({ t: 'kill', protoId: enemy.protoId, zh: enemy.zh, gold: enemy.gold, exp: enemy.exp });
  }
}

function hashCode(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h;
}

/** 战斗进度快照，给前端渲染血条用 */
function snapshot(run) {
  if (!run) return null;
  return {
    runId: run.runId,
    stageId: run.stageId,
    difficulty: run.difficulty,
    phase: run.phase,
    wave: run.waveIndex + 1,
    waveCount: run.waveCount,
    elapsed: Math.round(run.elapsed),
    kills: run.kills,
    gold: Math.round(run.gold),
    exp: Math.round(run.exp),
    enemies: run.enemies.map(e => ({
      uid: e.uid, zh: e.zh, sprite: e.sprite, tier: e.tier,
      hp: Math.max(0, Math.round(e.hp)), maxHp: e.maxHp, alive: e.alive,
      atk: e.atk, atkSpeed: e.atkSpeed,     // 客户端用它排攻击动作节奏与飘字大小
      rowHint: Math.abs(hashCode(e.uid)) % 3   // 稳定的站位偏移，用于攻击目标选择
    })),
    heroes: Object.keys(run.heroHp).map(u => ({
      uid: u,
      hp: Math.max(0, Math.round(run.heroHp[u])),
      maxHp: Math.round(run.heroMax[u]),
      shield: Math.round(run.heroShield[u] || 0),
      down: run.downed[u] ? Math.ceil(run.downed[u]) : 0
    }))
  };
}

module.exports = { createRun, step, snapshot, getStage, listStages, stageTable, invalidateStageCache };
