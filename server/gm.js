/**
 * GM 指令集
 * ---------------------------------------------------------------------------
 * 所有指令都是 (world, args) => result。world 由 index.js 注入，提供：
 *   world.players   Map<id, Player>
 *   world.store     Store
 *   world.broadcast(fn)  广播给所有人
 *   world.sendTo(id, obj)
 *   world.kick(id, reason)
 * GM 令牌在 config/server.json 或环境变量 GM_TOKEN 里。
 */

const { rollItem, itemName } = require('../engine/gear');
const { RARITIES, SLOTS, MATERIALS, COMMEMORATIVE } = require('../engine/data/items');
const { CLASS_ORDER, CLASSES } = require('../engine/data/classes');
const T = require('../engine/tunables');
const { uid } = require('../engine/util');
const { createNewSave } = require('../engine/save');
const { makeRng } = require('../engine/util');

const rng = makeRng(Date.now() & 0xffff);

const CMDS = {};

// ---------------- 数值热改 ----------------
CMDS.tunables = (world, a = {}) => {
  if (a.op === 'set') {
    T.setAt(a.path, a.value);
    world.store.setKV('overrides', T.getOverrides());
    world.store.log('tunable', { path: a.path, value: a.value });
    world.onTunablesChanged?.();
    return { ok: true, msg: `已设置 ${a.path} = ${a.value}`, overrides: T.getOverrides() };
  }
  if (a.op === 'reset') {
    T.resetAt(a.path);
    world.store.setKV('overrides', T.getOverrides());
    world.store.log('tunable-reset', { path: a.path });
    world.onTunablesChanged?.();
    return { ok: true, msg: `已恢复 ${a.path} 为默认值`, overrides: T.getOverrides() };
  }
  if (a.op === 'resetAll') {
    T.setOverrides({});
    world.store.setKV('overrides', {});
    world.store.log('tunable-reset', { path: '*' });
    world.onTunablesChanged?.();
    return { ok: true, msg: '全部数值已恢复默认', overrides: {} };
  }
  return { ok: true, list: T.listTunables(), overrides: T.getOverrides() };
};

// ---------------- 公告 ----------------
CMDS.announce = (world, a = {}) => {
  if (!a.text) return { ok: false, msg: '公告内容为空' };
  world.store.addAnnouncement(a.text, a.by || 'GM');
  world.broadcast({ type: 'announce', text: a.text, at: Date.now() });
  world.store.log('announce', { text: a.text });
  return { ok: true, msg: '已广播公告' };
};

// ---------------- 世界事件 ----------------
CMDS.event = (world, a = {}) => {
  const cfg = T.get();
  if (a.op === 'start') {
    const kind = a.kind || 'doubleDrop';
    const tpl = cfg.events[kind];
    if (!tpl) return { ok: false, msg: `未知事件：${kind}` };
    const dur = a.durationSec ?? tpl.durationSec;
    const effects = {};
    for (const [k, v] of Object.entries(tpl)) {
      if (['label', 'durationSec'].includes(k)) continue;
      effects[k] = a.overrides?.[k] ?? v;
    }
    // 同类事件不叠加，启动时先顶掉旧的
    for (const old of world.store.listWorldEvents()) {
      if (old.kind === kind) world.stopEvent(old.id);
    }
    const ev = {
      id: uid('ev'), kind, label: tpl.label,
      until: Date.now() + dur * 1000, effects, by: a.by || 'GM'
    };
    world.store.addWorldEvent(ev);
    world.refreshWorldEvents();
    world.broadcast({ type: 'worldEvent', event: ev, action: 'start' });
    world.store.log('event-start', { kind, dur, effects });
    return { ok: true, msg: `已启动事件「${tpl.label}」，持续 ${dur} 秒`, event: ev };
  }
  if (a.op === 'stop') {
    const list = world.store.listWorldEvents();
    const target = a.id ? list.filter(e => e.id === a.id) : list;
    for (const e of target) world.stopEvent(e.id);
    world.refreshWorldEvents();
    world.broadcast({ type: 'worldEvent', action: 'stop', ids: target.map(e => e.id) });
    world.store.log('event-stop', { ids: target.map(e => e.id) });
    return { ok: true, msg: `已停止 ${target.length} 个事件` };
  }
  return { ok: true, list: world.store.listWorldEvents(), templates: cfg.events };
};

// ---------------- 发放 ----------------
CMDS.grant = (world, a = {}) => {
  const p = world.players.get(a.playerId);
  if (!p) return { ok: false, msg: '玩家不存在' };
  const st = p.state;
  const got = [];

  if (a.gold) { st.gold += a.gold; st.stats.totalGold += a.gold; got.push(`${a.gold} 金币`); }
  if (a.exp) { p.grantExp(a.exp); got.push(`${a.exp} 经验`); }
  if (a.levels) {
    for (const h of (a.heroUid ? st.heroes.filter(h => h.uid === a.heroUid) : st.heroes)) {
      h.level += a.levels;
      h.skillPoints += a.levels * T.get().hero.skillPointPerLevel;
    }
    got.push(`${a.levels} 级`);
  }
  if (a.skillPoints) {
    for (const h of (a.heroUid ? st.heroes.filter(h => h.uid === a.heroUid) : st.heroes)) {
      h.skillPoints += a.skillPoints;
    }
    got.push(`${a.skillPoints} 技能点`);
  }
  if (a.item) {
    const n = a.item.count || 1;
    for (let i = 0; i < n; i++) {
      const it = rollItem(rng, {
        slot: a.item.slot, classId: a.item.classId,
        rarity: a.item.rarity, ilvl: a.item.ilvl, rarityShift: a.item.rarityShift
      });
      st.inventory.push(it);
      got.push(itemName(it));
    }
  }
  if (a.material) {
    for (const m of (Array.isArray(a.material) ? a.material : [a.material])) {
      st.materials[m.id] = (st.materials[m.id] || 0) + (m.count || 1);
      got.push(`${MATERIALS.find(x => x.id === m.id)?.zh || m.id} ×${m.count || 1}`);
    }
  }
  if (a.coin) {
    st.coins[a.coin.id] = (st.coins[a.coin.id] || 0) + (a.coin.count || 1);
    got.push(`${COMMEMORATIVE.find(c => c.id === a.coin.id)?.zh || a.coin.id} ×${a.coin.count || 1}`);
  }
  if (a.pet) {
    st.pets[a.pet] = { unlocked: true, at: Date.now(), byGM: true };
    got.push(`宠物 ${a.pet}`);
  }
  if (a.rune) {
    st.runes[a.rune] = true;
    got.push(`符文 ${a.rune}`);
  }
  if (a.chest) {
    for (let i = 0; i < (a.chest.count || 1); i++) p.dropChest(a.chest.type || 'boss');
    got.push(`${a.chest.count || 1} 个宝箱`);
  }
  if (a.unlockClass) {
    if (!st.unlockedClasses.includes(a.unlockClass)) st.unlockedClasses.push(a.unlockClass);
    got.push(`职业 ${CLASSES[a.unlockClass]?.zh || a.unlockClass}`);
  }

  if (!got.length) return { ok: false, msg: '没有指定发放内容' };
  p.pushLog('gm', `GM 发放：${got.join('、')}`);
  world.store.log('grant', { playerId: a.playerId, got });
  p.checkProgress();
  world.sendTo(a.playerId, { type: 'toast', text: `GM 发放：${got.join('、')}`, kind: 'good' });
  return { ok: true, msg: `已发放：${got.join('、')}` };
};

// ---------------- 回收 ----------------
CMDS.take = (world, a = {}) => {
  const p = world.players.get(a.playerId);
  if (!p) return { ok: false, msg: '玩家不存在' };
  const st = p.state;
  const taken = [];
  if (a.gold) {
    const v = Math.min(st.gold, a.gold);
    st.gold -= v; taken.push(`${v} 金币`);
  }
  if (a.itemUid) {
    const i = st.inventory.findIndex(x => x.uid === a.itemUid);
    if (i >= 0) {
      const [it] = st.inventory.splice(i, 1);
      taken.push(itemName(it));
    }
    const j = st.stash.findIndex(x => x.uid === a.itemUid);
    if (j >= 0) st.stash.splice(j, 1);
  }
  if (a.clearInventory) { st.inventory = []; taken.push('清空背包'); }
  if (a.resetLevel) {
    for (const h of st.heroes) { h.level = 1; h.xp = 0; h.skills = {}; h.skillPoints = 0; }
    taken.push('等级重置');
  }
  p.pushLog('gm', `GM 回收：${taken.join('、')}`);
  world.store.log('take', { playerId: a.playerId, taken });
  return { ok: true, msg: `已回收：${taken.join('、')}` };
};

// ---------------- 踢人 / 重置 ----------------
CMDS.kick = (world, a = {}) => {
  if (!world.players.has(a.playerId)) return { ok: false, msg: '玩家不存在' };
  world.kick(a.playerId, a.reason || '被 GM 请离');
  world.store.log('kick', { playerId: a.playerId, reason: a.reason });
  return { ok: true, msg: '已踢出' };
};

CMDS.reset = (world, a = {}) => {
  const old = world.players.get(a.playerId);
  if (!old) return { ok: false, msg: '玩家不存在' };
  const fresh = createNewSave({ id: old.state.id, name: old.state.name, token: old.state.token, classId: a.classId });
  old.state = fresh;
  old.run = null;
  old.pendingOffline = null;
  world.store.log('reset', { playerId: a.playerId });
  world.sendTo(a.playerId, { type: 'toast', text: '存档已被 GM 重置', kind: 'warn' });
  return { ok: true, msg: '存档已重置' };
};

CMDS.rename = (world, a = {}) => {
  const p = world.players.get(a.playerId);
  if (!p) return { ok: false, msg: '玩家不存在' };
  p.state.name = a.name || p.state.name;
  return { ok: true, msg: `已改名为 ${p.state.name}` };
};

// ---------------- 查询 ----------------
CMDS.players = (world) => ({
  ok: true,
  players: [...world.players.values()].map(p => ({
    id: p.state.id, name: p.state.name,
    online: !!world.sockets.has(p.state.id),
    level: Math.max(...p.state.heroes.map(h => h.level), 0),
    gold: p.state.gold,
    stage: `${p.state.currentStage.difficulty} ${p.state.currentStage.id}`,
    running: p.state.running,
    kills: p.state.stats.totalKills,
    lastSeenAt: p.state.lastSeenAt,
    party: p.state.party.length
  }))
});

CMDS.inspect = (world, a = {}) => {
  const p = world.players.get(a.playerId);
  if (!p) return { ok: false, msg: '玩家不存在' };
  return { ok: true, view: p.view() };
};

CMDS.audit = (world, a = {}) => ({ ok: true, list: world.store.listAudit(a.limit || 60) });
CMDS.announcements = (world) => ({ ok: true, list: world.store.listAnnouncements(30) });

/** 给 GM 面板用的元数据（生成表单） */
CMDS.meta = (world) => ({
  ok: true,
  rarities: RARITIES,
  slots: SLOTS.map(s => ({ id: s.id, zh: s.zh })),
  classes: CLASS_ORDER.map(c => ({ id: c, zh: CLASSES[c].zh })),
  materials: MATERIALS.map(m => ({ id: m.id, zh: m.zh, tier: m.tier })),
  coins: COMMEMORATIVE.map(c => ({ id: c.id, zh: c.zh })),
  pets: require('../engine/data/progress').PETS.map(p => ({ id: p.id, zh: p.zh })),
  runes: require('../engine/data/runes').RUNES.map(r => ({ id: r.id, name: r.name, cost: r.cost, branch: r.branch })),
  events: T.get().events
});

function run(world, cmd, args = {}, by = 'GM') {
  const fn = CMDS[cmd];
  if (!fn) return { ok: false, msg: `未知 GM 指令：${cmd}` };
  try {
    return fn(world, { ...args, by });
  } catch (e) {
    return { ok: false, msg: `GM 指令出错：${e.message}` };
  }
}

module.exports = { run, CMDS };
