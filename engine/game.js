/**
 * 顶层门面：把存档 + 引擎 + 战斗串起来
 * ---------------------------------------------------------------------------
 * 一个 Player 实例 = 一个玩家的完整运行时。
 *   player.tick(dt)     服务器每步调用，推进战斗与冷却
 *   player.act(name, a) 处理一条客户端指令，返回 { ok, msg, ... }
 *   player.view()       生成给前端的完整快照
 */

const { makeRng, uid, clamp, expToNext } = require('./util');
const { CLASSES, CLASS_ORDER } = require('./data/classes');
const { RARITIES, RARITY_ZH, MATERIALS, COMMEMORATIVE, SLOTS, RARITY_COLOR } = require('./data/items');
const { RUNE_MAP, RUNES, BRANCHES } = require('./data/runes');
const { PETS, ACHIEVEMENTS } = require('./data/progress');
const T = require('./tunables');
const combat = require('./combat');
const gear = require('./gear');
const heroMod = require('./hero');
const runeMod = require('./rune');
const loot = require('./loot');
const progress = require('./progress');
const { createNewSave, makeHero } = require('./save');

const MAX_LOG = 200;

class Player {
  constructor(state, opts = {}) {
    this.state = state;
    this.rng = makeRng(state.seed || 1);
    this.run = null;
    this.pendingOffline = null;
    this.onEvent = opts.onEvent || (() => {});
    this.failWait = 0;
    // 读档时先把离线收益算出来，等玩家上线领取
    const elapsed = (Date.now() - (state.lastTickAt || Date.now())) / 1000;
    if (elapsed > 60) {
      const r = progress.offlineRewards(state, this.ctx(), elapsed);
      if (r) this.pendingOffline = r;
    }
    state.lastTickAt = Date.now();
  }

  // -------------------------------------------------------------------------
  // 上下文：所有加成的汇总结果
  // -------------------------------------------------------------------------
  ctx() {
    const itemMap = {};
    for (const it of this.state.inventory) itemMap[it.uid] = it;
    for (const it of this.state.stash) itemMap[it.uid] = it;

    const runeB = runeMod.aggregate(this.state);
    const petB = progress.petBonuses(this.state);
    const modB = this.modifierBonuses();
    const bonuses = {};
    for (const src of [runeB, petB, modB]) {
      for (const [k, v] of Object.entries(src)) {
        if (k === 'autoOpen') { bonuses.autoOpen = [...(bonuses.autoOpen || []), ...v]; }
        else if (typeof v === 'number') bonuses[k] = (bonuses[k] || 0) + v;
      }
    }
    bonuses.autoOpen = [...new Set(bonuses.autoOpen || [])];

    const ctx = { itemMap, bonuses, config: T.get(), rows: [] };
    ctx.rows = heroMod.partyStats(this.state, ctx).rows;
    return ctx;
  }

  /** GM / 世界事件带来的加成 */
  modifierBonuses() {
    const now = Date.now();
    const b = {};
    this.state.modifiers = (this.state.modifiers || []).filter(m => !m.until || m.until > now);
    for (const m of this.state.modifiers) {
      for (const [k, v] of Object.entries(m.effects || {})) b[k] = (b[k] || 0) + v;
    }
    return b;
  }

  get eventMul() {
    const now = Date.now();
    const mul = { dropMul: 1, goldMul: 1, expMul: 1, hpMul: 1, atkMul: 1, bossRate: 1 };
    for (const m of this.state.modifiers || []) {
      if (m.until && m.until < now) continue;
      for (const k of Object.keys(mul)) if (m[k]) mul[k] *= m[k];
    }
    for (const k of Object.keys(mul)) mul[k] *= (this.worldMul?.[k] ?? 1);
    return mul;
  }

  // -------------------------------------------------------------------------
  // 每步推进
  // -------------------------------------------------------------------------
  tick(dt) {
    const cfg = T.get();
    const st = this.state;
    st.lastTickAt = Date.now();
    st.stats.playSeconds += dt;
    const ctx = this.ctx();
    const em = this.eventMul;

    // 宝箱自动开启冷却
    for (const type of ['normal', 'boss', 'actBoss']) {
      if (st.chestCd[type] > 0) st.chestCd[type] = Math.max(0, st.chestCd[type] - dt);
    }
    if ((ctx.bonuses.autoOpen || []).length) {
      this.autoOpenChests(ctx);
    }

    if (!st.running) return;

    if (this.failWait > 0) {
      this.failWait -= dt;
      if (this.failWait <= 0) this.failWait = 0;
      else return;
    }

    if (!this.run) {
      this.run = combat.createRun(st, ctx, {});
      if (!this.run) { st.running = false; return; }
      this.onEvent(this, { t: 'runStart', stageId: this.run.stageId });
    }

    const events = combat.step(this.run, dt, ctx, this.rng);
    for (const ev of events) this.handleCombatEvent(ev, ctx, em);

    if (this.run.phase === 'cleared') this.finishRun(true);
    else if (this.run.phase === 'failed') this.finishRun(false);
  }

  handleCombatEvent(ev, ctx, em) {
    const st = this.state;
    if (ev.t === 'kill') {
      st.stats.totalKills++;
      st.killCounts[ev.protoId] = (st.killCounts[ev.protoId] || 0) + 1;
      const stageKey = this.run.stageId;
      st.stageKills[stageKey] = (st.stageKills[stageKey] || 0) + 1;
      const gold = Math.round(ev.gold * em.goldMul);
      const exp = Math.round(ev.exp * em.expMul);
      st.gold += gold; st.stats.totalGold += gold;
      this.grantExp(exp);
    } else if (ev.t === 'waveClear') {
      if (loot.rollWaveChest(this.rng, { bonuses: ctx.bonuses, eventDropMul: em.dropMul })) {
        this.dropChest('normal');
      }
    } else if (ev.t === 'cleared') {
      this.dropChest(this.run.isActEnd ? 'actBoss' : 'boss');
    }
  }

  dropChest(type) {
    const st = this.state;
    const ctx = this.ctx();
    const stage = combat.getStage(st.currentStage.difficulty, st.currentStage.id);
    const chest = loot.rollChest(this.rng, type, {
      stageIndex: stage?.stageIndex || 0,
      difficulty: st.currentStage.difficulty,
      bonuses: ctx.bonuses
    });
    st.chests.push(chest);
    this.pushLog('chest', `获得 ${chest.zh}`);
    this.onEvent(this, { t: 'chest', chest: { uid: chest.uid, type, zh: chest.zh } });
    return chest;
  }

  autoOpenChests(ctx) {
    const st = this.state;
    const auto = new Set(ctx.bonuses.autoOpen || []);
    if (!auto.size) return;
    const cfg = T.get();
    const now = Date.now();
    for (const type of ['normal', 'boss', 'actBoss']) {
      if (!auto.has(type)) continue;
      const base = cfg.loot.autoOpenBaseSeconds[type] || 300;
      const cd = base * (1 - (ctx.bonuses.chestCdPct || 0));
      if (st.chestCd[type] > 0) continue;
      const chest = st.chests.find(c => !c.opened && c.type === type);
      if (chest) {
        this.openChest(chest.uid);
        st.chestCd[type] = cd;
      } else {
        st.chestCd[type] = Math.min(cd, 30); // 没箱子就短间隔再查
      }
    }
  }

  grantExp(amount) {
    const heroes = (this.state.party || [])
      .map(u => this.state.heroes.find(h => h.uid === u)).filter(Boolean);
    if (!heroes.length) return;
    const each = Math.floor(amount / heroes.length);
    let leveled = false;
    for (const h of heroes) {
      const n = heroMod.gainXp(h, each, T.get());
      if (n > 0) {
        leveled = true;
        this.pushLog('level', `${CLASSES[h.classId]?.zh || h.classId} 升到 ${h.level} 级`);
        this.onEvent(this, { t: 'levelUp', uid: h.uid, level: h.level });
      }
    }
    if (leveled) this.checkProgress();
  }

  finishRun(success) {
    const st = this.state;
    const run = this.run;
    const key = st.currentStage.difficulty;
    if (success) {
      const rec = st.clearedStages[key][run.stageId] || { clears: 0, bestMs: null };
      rec.clears++;
      const ms = Math.round(run.elapsed * 1000);
      if (rec.bestMs == null || ms < rec.bestMs) rec.bestMs = ms;
      st.clearedStages[key][run.stageId] = rec;
      this.pushLog('clear', `通关 ${run.stageId}（${Math.round(run.elapsed)}秒）`);
      this.onEvent(this, { t: 'stageCleared', stageId: run.stageId, ms });
      // 自动推进到下一关
      const next = this.nextStageId(run.stageId);
      if (next && st.autoAdvance !== false) {
        st.currentStage.id = next;
      }
    } else {
      this.pushLog('fail', `挑战 ${run.stageId} 失败`);
      this.onEvent(this, { t: 'stageFailed', stageId: run.stageId });
      if (st.autoRetry) this.failWait = T.get().combat.failRetrySeconds;
      else st.running = false;
    }
    this.run = null;
    this.checkProgress();
  }

  nextStageId(id) {
    const [a, s] = String(id).split('-').map(Number);
    if (s < 10) return `${a}-${s + 1}`;
    if (a < 3) return `${a + 1}-1`;
    return null;
  }

  checkProgress() {
    const ctx = this.ctx();
    const pets = progress.checkPets(this.state);
    for (const p of pets) {
      this.pushLog('pet', `解锁宠物：${p.zh}`);
      this.onEvent(this, { t: 'pet', pet: p });
    }
    const achs = progress.checkAchievements(this.state, ctx);
    for (const a of achs) {
      this.pushLog('achieve', `达成成就：${a.zh}`);
      this.onEvent(this, { t: 'achievement', ach: a });
    }
  }

  pushLog(type, text) {
    this.state.log.push({ type, text, at: Date.now() });
    if (this.state.log.length > MAX_LOG) this.state.log.splice(0, this.state.log.length - MAX_LOG);
  }

  // -------------------------------------------------------------------------
  // 指令
  // -------------------------------------------------------------------------
  act(name, args = {}) {
    const fn = this[`act_${name}`];
    if (typeof fn !== 'function') return { ok: false, msg: `未知指令：${name}` };
    try {
      const r = fn.call(this, args) || { ok: true };
      if (r.ok) this.checkProgress();
      return r;
    } catch (e) {
      return { ok: false, msg: `执行出错：${e.message}` };
    }
  }

  act_start() {
    const st = this.state;
    if (!(st.party || []).length) return { ok: false, msg: '先部署至少一名英雄' };
    st.running = true;
    this.failWait = 0;
    return { ok: true, msg: '开始挑战' };
  }
  act_stop() {
    this.state.running = false;
    this.run = null;
    return { ok: true, msg: '已停止' };
  }
  act_setStage(a) {
    const st = this.state;
    const diff = a.difficulty || st.currentStage.difficulty;
    const id = a.id || st.currentStage.id;
    if (!T.get().difficulty[diff]) return { ok: false, msg: '难度不存在' };
    const allowed = this.allowedStages(diff);
    if (!allowed.includes(id)) {
      return { ok: false, msg: '该关卡尚未解锁（需先通关前面的关卡）' };
    }
    st.currentStage.difficulty = diff;
    st.currentStage.id = id;
    this.run = null;
    this.failWait = 0;
    return { ok: true, msg: `切换到 ${st.currentStage.difficulty} ${st.currentStage.id}` };
  }

  /** 已解锁的关卡：从 1-1 起，连续已通关的关卡 + 紧接的下一关 */
  allowedStages(diff) {
    const cleared = this.state.clearedStages[diff] || {};
    const out = [];
    for (let a = 1; a <= 3; a++) {
      for (let s = 1; s <= 10; s++) {
        const id = `${a}-${s}`;
        out.push(id);
        if (!cleared[id]) return out;
      }
    }
    return out;
  }
  act_setAuto(a) {
    if ('retry' in a) this.state.autoRetry = !!a.retry;
    if ('advance' in a) this.state.autoAdvance = !!a.advance;
    return { ok: true };
  }

  act_deploy(a) {
    const st = this.state;
    const h = st.heroes.find(x => x.uid === a.heroUid);
    if (!h) return { ok: false, msg: '英雄不存在' };
    const maxSlots = (T.get().hero.baseSlots) + (this.ctx().bonuses.partySlot || 0);
    if (!st.party.includes(h.uid)) {
      if (st.party.length >= Math.min(maxSlots, T.get().limits.maxParty)) {
        return { ok: false, msg: '阵容槽位不足（可在符文树解锁）' };
      }
      st.party.push(h.uid);
    }
    st.stats.maxPartySize = Math.max(st.stats.maxPartySize || 1, st.party.length);
    return { ok: true };
  }
  act_undeploy(a) {
    const st = this.state;
    st.party = st.party.filter(u => u !== a.heroUid);
    return { ok: true };
  }
  act_setRow(a) {
    const h = this.state.heroes.find(x => x.uid === a.heroUid);
    if (!h) return { ok: false, msg: '英雄不存在' };
    if (!['front', 'mid', 'back'].includes(a.row)) return { ok: false, msg: '站位无效' };
    h.row = a.row;
    return { ok: true };
  }
  act_learnSkill(a) {
    const h = this.state.heroes.find(x => x.uid === a.heroUid);
    if (!h) return { ok: false, msg: '英雄不存在' };
    const def = (CLASSES[h.classId]?.skills || []).find(s => s.id === a.skillId);
    if (!def) return { ok: false, msg: '技能不存在' };
    if (h.skillPoints <= 0) return { ok: false, msg: '技能点不足' };
    const cur = h.skills[a.skillId] || 0;
    if (cur >= def.max) return { ok: false, msg: '技能已满级' };
    h.skills[a.skillId] = cur + 1;
    h.skillPoints--;
    return { ok: true };
  }
  act_resetSkills(a) {
    const h = this.state.heroes.find(x => x.uid === a.heroUid);
    if (!h) return { ok: false, msg: '英雄不存在' };
    const cost = 500 + h.level * 120;
    if (this.state.gold < cost) return { ok: false, msg: `金币不足（需 ${cost}）` };
    this.state.gold -= cost;
    let refund = 0;
    for (const [k, v] of Object.entries(h.skills)) { refund += v; }
    h.skills = {};
    h.skillPoints += refund;
    return { ok: true, msg: '已重置技能点' };
  }
  act_unlockClass(a) {
    const st = this.state;
    const cls = CLASSES[a.classId];
    if (!cls) return { ok: false, msg: '职业不存在' };
    if (st.unlockedClasses.includes(a.classId)) return { ok: false, msg: '已解锁' };
    const cost = cls.unlockCost || 500;
    if (st.gold < cost) return { ok: false, msg: `金币不足（需 ${cost}）` };
    st.gold -= cost;
    st.unlockedClasses.push(a.classId);
    return { ok: true, msg: `已解锁 ${cls.zh}` };
  }
  act_newHero(a) {
    const st = this.state;
    const cls = CLASSES[a.classId];
    if (!cls) return { ok: false, msg: '职业不存在' };
    if (!st.unlockedClasses.includes(a.classId)) return { ok: false, msg: '该职业尚未解锁' };
    const cost = 2000 + st.heroes.length * 5000;
    if (st.gold < cost) return { ok: false, msg: `金币不足（需 ${cost}）` };
    st.gold -= cost;
    const h = makeHero(a.classId, 1);
    st.heroes.push(h);
    this.pushLog('hero', `招募了 ${cls.zh}`);
    return { ok: true, hero: h };
  }
  act_equip(a) {
    const st = this.state;
    const h = st.heroes.find(x => x.uid === a.heroUid);
    const item = st.inventory.find(i => i.uid === a.itemUid) || st.stash.find(i => i.uid === a.itemUid);
    if (!h || !item) return { ok: false, msg: '英雄或装备不存在' };
    const prev = h.equipment[item.slot];
    h.equipment[item.slot] = item.uid;
    if (prev && prev !== item.uid) {
      // 换下来的装备回背包
      const old = st.inventory.find(i => i.uid === prev) || st.stash.find(i => i.uid === prev);
      if (old) { /* 已在 inventory 中则不动 */ }
    }
    return { ok: true };
  }
  act_unequip(a) {
    const h = this.state.heroes.find(x => x.uid === a.heroUid);
    if (!h) return { ok: false, msg: '英雄不存在' };
    h.equipment[a.slot] = null;
    return { ok: true };
  }
  act_stash(a) {
    const st = this.state;
    const i = st.inventory.findIndex(x => x.uid === a.itemUid);
    if (i < 0) return { ok: false, msg: '装备不在背包' };
    const [it] = st.inventory.splice(i, 1);
    st.stash.push(it);
    return { ok: true };
  }
  act_unstash(a) {
    const st = this.state;
    const i = st.stash.findIndex(x => x.uid === a.itemUid);
    if (i < 0) return { ok: false, msg: '装备不在收藏' };
    if (st.inventory.length >= this.bagLimit()) return { ok: false, msg: '背包已满' };
    const [it] = st.stash.splice(i, 1);
    st.inventory.push(it);
    return { ok: true };
  }
  act_lock(a) {
    const it = this.state.inventory.find(x => x.uid === a.itemUid) || this.state.stash.find(x => x.uid === a.itemUid);
    if (!it) return { ok: false, msg: '装备不存在' };
    it.locked = !it.locked;
    return { ok: true, locked: it.locked };
  }
  act_sellItem(a) {
    return gear.CUBE.alchemy(this.state, this.rng, [a.itemUid]);
  }
  act_buyRune(a) {
    const r = runeMod.unlock(this.state, a.runeId);
    if (r.ok) this.pushLog('rune', `点亮符文：${r.rune.name}`);
    return r.ok ? { ok: true, msg: `已点亮 ${r.rune.name}` } : { ok: false, msg: r.reason };
  }
  act_cube(a) {
    const args = a.args || {};
    const st = this.state, rng = this.rng;
    switch (a.op) {
      case 'synthesis': return gear.CUBE.synthesis(st, rng, a.itemUids || []);
      case 'alchemy':   return gear.CUBE.alchemy(st, rng, a.itemUids || []);
      case 'craft':     return gear.CUBE.craft(st, rng, args);
      case 'socket':    return gear.CUBE.socket(st, rng, args.itemUid, args.tier, args.matId);
      case 'removal':   return gear.CUBE.removal(st, rng, args.itemUid, args.tier);
      case 'offering':  return gear.CUBE.offering(st, rng, args.coinId);
      default: return { ok: false, msg: `未知魔方操作：${a.op}` };
    }
  }
  act_openChest(a) {
    const c = this.state.chests.find(x => x.uid === a.uid);
    if (!c) return { ok: false, msg: '宝箱不存在' };
    return this.openChest(a.uid);
  }
  act_openAllChests() {
    const targets = this.state.chests.filter(c => !c.opened).map(c => c.uid);
    let n = 0, gold = 0, items = 0;
    for (const u of targets) {
      const r = this.openChest(u);
      if (r?.ok) { n++; gold += r.gained.gold; items += r.gained.items.length; }
    }
    this.state.chests = this.state.chests.filter(c => !c.opened);
    return { ok: true, msg: `开启 ${n} 个宝箱：${items} 件装备，${gold} 金币` };
  }
  openChest(chestUid) {
    const st = this.state;
    const idx = st.chests.findIndex(c => c.uid === chestUid);
    if (idx < 0) return { ok: false, msg: '宝箱不存在' };
    const r = loot.openChest(st, st.chests[idx], this.rng);
    if (!r.ok) return r;
    st.chests.splice(idx, 1);
    this.pushLog('chest', `开启宝箱：${r.gained.items.length} 件装备，${r.gained.gold} 金币`);
    this.onEvent(this, { t: 'chestOpened', gained: r.gained });
    return { ok: true, gained: r.gained };
  }
  act_deployPet(a) {
    if (a.petId && !this.state.pets?.[a.petId]?.unlocked) return { ok: false, msg: '宠物未解锁' };
    this.state.deployedPet = a.petId || null;
    return { ok: true };
  }
  act_claimOffline() {
    if (!this.pendingOffline) return { ok: false, msg: '暂无离线收益' };
    const r = this.pendingOffline;
    this.state.gold += r.gold;
    this.state.stats.totalGold += r.gold;
    this.state.stats.totalKills += r.kills;
    this.state.stats.offlineClaims = (this.state.stats.offlineClaims || 0) + 1;
    const heroes = (this.state.party || []).map(u => this.state.heroes.find(h => h.uid === u)).filter(Boolean);
    if (heroes.length) {
      const each = Math.floor(r.exp / heroes.length);
      for (const h of heroes) heroMod.gainXp(h, each, T.get());
    }
    this.pendingOffline = null;
    this.pushLog('offline', `领取离线收益：${r.gold} 金币`);
    return { ok: true, msg: `获得 ${r.gold} 金币`, reward: r };
  }

  bagLimit() {
    return Math.min(T.get().limits.maxInventory,
      (T.get().limits.maxInventory / 2) + (this.ctx().bonuses.bagSlots || 0) + 20);
  }

  // -------------------------------------------------------------------------
  // 前端快照
  // -------------------------------------------------------------------------
  view() {
    const st = this.state;
    const ctx = this.ctx();
    const ps = heroMod.partyStats(st, ctx);
    const cfg = T.get();

    const heroes = st.heroes.map(h => {
      const row = ps.rows.find(r => r.hero.uid === h.uid);
      return {
        uid: h.uid, classId: h.classId, zh: CLASSES[h.classId]?.zh || h.classId,
        level: h.level, xp: h.xp, xpNext: expToNext(h.level, cfg.hero),
        skillPoints: h.skillPoints, skills: h.skills, row: h.row,
        inParty: st.party.includes(h.uid),
        equipment: { ...h.equipment },
        stats: row ? {
          dps: Math.round(row.stats.dps), ehp: row.stats.ehp, hp: row.stats.maxHp,
          atk: Math.round(row.stats.atk), def: Math.round(row.stats.def),
          crit: Math.round(row.stats.crit * 1000) / 10, critDmg: Math.round(row.stats.critDmg * 100) / 100,
          atkSpeed: Math.round(row.stats.atkSpeed * 100) / 100,
          lifesteal: Math.round(row.stats.lifesteal * 1000) / 10,
          hps: Math.round(row.stats.hps)
        } : null
      };
    });

    return {
      // 基础
      id: st.id, name: st.name, gold: st.gold,
      schemaVersion: st.schemaVersion,
      running: st.running,
      currentStage: { ...st.currentStage },
      autoRetry: st.autoRetry, autoAdvance: st.autoAdvance !== false,

      // 队伍
      heroes,
      party: st.party.slice(),
      partySummary: { dps: Math.round(ps.dps), ehp: ps.ehp, hps: Math.round(ps.hps), size: ps.size },
      maxPartySlots: Math.min(cfg.limits.maxParty, cfg.hero.baseSlots + (ctx.bonuses.partySlot || 0)),
      unlockedClasses: st.unlockedClasses.slice(),

      // 物品
      inventory: st.inventory.map(decorateItem),
      stash: st.stash.map(decorateItem),
      bagLimit: this.bagLimit(),
      materials: st.materials,
      coins: st.coins,
      chests: st.chests.map(c => ({ uid: c.uid, type: c.type, zh: c.zh })),
      chestCd: { ...st.chestCd },

      // 进度
      clearedStages: st.clearedStages,
      unlockedStages: this.allowedStages(st.currentStage.difficulty),
      runes: st.runes,
      pets: st.pets,
      deployedPet: st.deployedPet,
      achievements: st.achievements,
      stats: st.stats,
      cube: st.cube,
      stageKills: st.stageKills,

      // 战斗
      combat: combat.snapshot(this.run),
      failWait: Math.round(this.failWait),

      // 其它
      modifiers: st.modifiers.map(m => ({ id: m.id, label: m.label, until: m.until })),
      pendingOffline: this.pendingOffline,
      log: st.log.slice(-40).reverse(),
      bonuses: ctx.bonuses
    };
  }
}

function decorateItem(it) {
  return {
    ...it,
    zh: gear.itemName(it),
    rarityZh: RARITY_ZH[it.rarity],
    color: RARITY_COLOR[it.rarity],
    power: gear.itemPower(it),
    sell: gear.sellValue(it)
  };
}

module.exports = { Player, createNewSave, decorateItem };
