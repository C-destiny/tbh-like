/**
 * 服务器入口：静态服务 + WebSocket + 权威 tick 循环
 * ---------------------------------------------------------------------------
 * 用法： node server/index.js            （默认 8787）
 *        PORT=9000 node server/index.js
 * GM 令牌首次启动会生成在 data/server.json
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
const { URL } = require('url');

const { Store, DATA_DIR } = require('./db');
const gm = require('./gm');
const T = require('../engine/tunables');
const { Player, createNewSave } = require('../engine/game');
const { migrate } = require('../engine/save');
const { CLASSES, CLASS_ORDER } = require('../engine/data/classes');
const { RARITIES, RARITY_ZH, RARITY_COLOR, SLOTS, MATERIALS, COMMEMORATIVE, AFFIXES, ELEMENT_ZH } = require('../engine/data/items');
const { RUNES, BRANCHES } = require('../engine/data/runes');
const { PETS, ACHIEVEMENTS } = require('../engine/data/progress');
const combat = require('../engine/combat');

const ROOT = path.join(__dirname, '..');
const PUBLIC = path.join(ROOT, 'public');
const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || '0.0.0.0';

// ---------------------------------------------------------------------------
// GM 令牌
// ---------------------------------------------------------------------------
const SERVER_CFG_PATH = path.join(DATA_DIR, 'server.json');
let serverCfg = {};
try { serverCfg = JSON.parse(fs.readFileSync(SERVER_CFG_PATH, 'utf8')); } catch (e) { /* 首次运行 */ }
if (!serverCfg.gmToken) {
  serverCfg.gmToken = process.env.GM_TOKEN || require('../engine/util').uid('gm');
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(SERVER_CFG_PATH, JSON.stringify(serverCfg, null, 2));
}
const GM_TOKEN = process.env.GM_TOKEN || serverCfg.gmToken;

// ---------------------------------------------------------------------------
// 世界
// ---------------------------------------------------------------------------
const store = new Store();
const players = new Map();     // id -> Player
const sockets = new Map();     // id -> Set<ws>
const gmSockets = new Set();

function socketsOf(id) { return sockets.get(id) || new Set(); }

function sendTo(id, obj) {
  const data = JSON.stringify(obj);
  for (const ws of socketsOf(id)) {
    if (ws.readyState === 1) ws.send(data);
  }
}
function sendWs(ws, obj) {
  if (ws.readyState === 1) ws.send(JSON.stringify(obj));
}
function broadcast(obj) {
  const data = JSON.stringify(obj);
  for (const set of sockets.values()) for (const ws of set) if (ws.readyState === 1) ws.send(data);
  for (const ws of gmSockets) if (ws.readyState === 1) ws.send(data);
}
function broadcastGM(obj) {
  const data = JSON.stringify(obj);
  for (const ws of gmSockets) if (ws.readyState === 1) ws.send(data);
}

const world = {
  players, store, sockets,
  sendTo, broadcast,
  kick(id, reason) {
    for (const ws of socketsOf(id)) {
      sendWs(ws, { type: 'kicked', reason });
      ws.close();
    }
  },
  stopEvent(id) {
    store.db && store.useSqlite
      ? store.db.prepare('DELETE FROM world_events WHERE id = ?').run(id)
      : (store.mem.worldEvents = store.mem.worldEvents.filter(e => e.id !== id), store.flush());
  },
  refreshWorldEvents() {
    const list = store.listWorldEvents();
    world.activeEvents = list;
    for (const p of players.values()) {
      // 把世界事件写进玩家 modifiers，玩家侧统一生效
      const gmIds = new Set((p.state.modifiers || []).filter(m => m._world).map(m => m.id));
      p.state.modifiers = (p.state.modifiers || []).filter(m => !m._world);
      for (const e of list) {
        p.state.modifiers.push({
          id: e.id, label: e.label, until: e.until, effects: e.effects, _world: true
        });
      }
    }
  },
  onTunablesChanged() {
    combat.invalidateStageCache();
    broadcastGM({ type: 'tunablesChanged', overrides: T.getOverrides(), list: T.listTunables() });
    broadcast({ type: 'toast', text: 'GM 调整了游戏数值', kind: 'info' });
  },
  activeEvents: []
};

// 载入存档
for (const rec of store.loadAllPlayers()) {
  try {
    const state = migrate(rec.state);
    players.set(state.id, new Player(state, { onEvent: onPlayerEvent }));
  } catch (e) {
    console.error('[load] 存档损坏，跳过：', rec.id, e.message);
  }
}
console.log(`[load] 已载入 ${players.size} 个存档（SQLite: ${store.useSqlite}）`);

// 载入 GM overrides
const savedOverrides = store.getKV('overrides', {});
if (savedOverrides && Object.keys(savedOverrides).length) {
  T.setOverrides(savedOverrides);
  console.log('[load] 已应用 GM 数值覆盖：', Object.keys(savedOverrides).join(', '));
}
world.refreshWorldEvents();

function onPlayerEvent(player, ev) {
  sendTo(player.state.id, { type: 'event', ev });
  broadcastGM({ type: 'playerEvent', playerId: player.state.id, playerName: player.state.name, ev });
}

// ---------------------------------------------------------------------------
// tick 循环
// ---------------------------------------------------------------------------
let lastTick = Date.now();
function loop() {
  const now = Date.now();
  let dt = (now - lastTick) / 1000;
  lastTick = now;

  const cfg = T.get();
  const stepSec = cfg.combat.tickMs / 1000;
  if (dt > stepSec * cfg.combat.maxTicksPerCatchUp) dt = stepSec * cfg.combat.maxTicksPerCatchUp;

  // 世界事件到期清理
  if (world.activeEvents.length) {
    const alive = world.activeEvents.filter(e => e.until > now);
    if (alive.length !== world.activeEvents.length) {
      world.refreshWorldEvents();
      broadcast({ type: 'toast', text: '世界事件已结束', kind: 'info' });
    }
  }

  // 固定步长推进，保证不同 dt 下结果一致
  let acc = dt;
  while (acc >= stepSec) {
    for (const p of players.values()) p.tick(stepSec);
    acc -= stepSec;
  }
  if (acc > 0) for (const p of players.values()) p.tick(acc);

  pushStates();
}
setInterval(loop, T.get().combat.tickMs);

function pushStates() {
  for (const [id, p] of players) {
    if (!socketsOf(id).size) continue;   // 没人在线就不推
    p.state.lastSeenAt = Date.now();
    sendTo(id, { type: 'state', view: p.view() });
  }
  // GM 面板的在线概览
  if (gmSockets.size) {
    broadcastGM({
      type: 'gmState',
      players: [...players.values()].map(p => ({
        id: p.state.id, name: p.state.name,
        online: !!socketsOf(p.state.id).size,
        gold: p.state.gold,
        level: Math.max(...p.state.heroes.map(h => h.level), 0),
        stage: `${p.state.currentStage.difficulty} ${p.state.currentStage.id}`,
        running: p.state.running,
        kills: p.state.stats.totalKills,
        combat: p.run ? { wave: p.run.waveIndex + 1, total: p.run.waveCount, phase: p.run.phase } : null
      })),
      events: store.listWorldEvents(),
      overrides: T.getOverrides()
    });
  }
}

// 自动存盘
setInterval(() => {
  for (const p of players.values()) store.savePlayer(p);
}, 20000);

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.map': 'application/json'
};

function serveStatic(req, res) {
  const url = new URL(req.url, 'http://x');
  let p = decodeURIComponent(url.pathname);
  if (p === '/' || p === '') p = '/index.html';
  const file = path.join(PUBLIC, path.normalize(p).replace(/^([/\\])+/, ''));
  if (!file.startsWith(PUBLIC)) { res.writeHead(403); return res.end('forbidden'); }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('404'); }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-cache'
    });
    res.end(buf);
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');

  if (url.pathname === '/api/gamedata') {
    const difficulty = url.searchParams.get('difficulty') || 'Normal';
    const stages = combat.listStages(difficulty).map(s => ({
      id: s.id, act: s.act, stage: s.stage, zhName: s.zhName, actName: s.actName,
      waves: s.waves, isActEnd: s.isActEnd, bossId: s.bossId,
      bossZh: require('../engine/data/monsters').MONSTERS[s.bossId]?.zh || s.bossId
    }));
    return json(res, {
      classes: CLASSES, classOrder: CLASS_ORDER,
      rarities: RARITIES, rarityZh: RARITY_ZH, rarityColor: RARITY_COLOR,
      slots: SLOTS, materials: MATERIALS, coins: COMMEMORATIVE, affixes: AFFIXES,
      elementZh: ELEMENT_ZH,
      runes: RUNES, runeBranches: BRANCHES,
      pets: PETS, achievements: ACHIEVEMENTS,
      stages,
      difficulties: T.get().difficulty,
      gmTokenHint: GM_TOKEN.slice(0, 4) + '****'
    });
  }

  if (url.pathname === '/api/health') {
    return json(res, { ok: true, players: players.size, uptime: process.uptime() });
  }

  serveStatic(req, res);
});

function json(res, obj) {
  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-cache' });
  res.end(JSON.stringify(obj));
}

// ---------------------------------------------------------------------------
// WebSocket
// ---------------------------------------------------------------------------
const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws) => {
  ws.meta = { role: null, playerId: null };
  ws.send(JSON.stringify({ type: 'hello', server: 'tbh-like', version: 1 }));

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch (e) { return; }
    handleMsg(ws, msg);
  });

  ws.on('close', () => {
    if (ws.meta.role === 'gm') gmSockets.delete(ws);
    else if (ws.meta.playerId) {
      const set = sockets.get(ws.meta.playerId);
      if (set) { set.delete(ws); if (!set.size) sockets.delete(ws.meta.playerId); }
    }
  });
});

function handleMsg(ws, msg) {
  const { type } = msg;

  if (type === 'hello') {
    if (msg.role === 'gm') {
      if (msg.token !== GM_TOKEN) {
        return sendWs(ws, { type: 'error', msg: 'GM 令牌不正确' });
      }
      ws.meta.role = 'gm';
      gmSockets.add(ws);
      store.log('gm-login', { ip: ws._socket?.remoteAddress });
      return sendWs(ws, { type: 'welcome', role: 'gm', meta: gm.run(world, 'meta') });
    }

    // 玩家
    let player = msg.token ? players.get(msg.pid || '') : null;
    if (msg.token) {
      // 用 token 找存档
      for (const p of players.values()) {
        if (p.state.token === msg.token) { player = p; break; }
      }
    }
    if (!player) {
      const st = createNewSave({ name: msg.name || '冒险者', classId: msg.classId || 'niuma' });
      player = new Player(st, { onEvent: onPlayerEvent });
      players.set(st.id, player);
      store.savePlayer(player);
      store.log('new-player', { id: st.id, name: st.name });
    }
    if (msg.name && msg.name !== player.state.name) player.state.name = msg.name;

    ws.meta.role = 'player';
    ws.meta.playerId = player.state.id;
    if (!sockets.has(player.state.id)) sockets.set(player.state.id, new Set());
    sockets.get(player.state.id).add(ws);

    // 上线结算离线收益
    const elapsed = (Date.now() - (player.state.lastTickAt || Date.now())) / 1000;
    if (elapsed > 60) {
      const r = require('../engine/progress').offlineRewards(player.state, player.ctx(), elapsed);
      if (r) player.pendingOffline = r;
    }
    player.state.lastTickAt = Date.now();

    sendWs(ws, {
      type: 'welcome', role: 'player',
      token: player.state.token, pid: player.state.id,
      announcements: store.listAnnouncements(5),
      worldEvents: store.listWorldEvents()
    });
    sendWs(ws, { type: 'state', view: player.view() });
    broadcastGM({ type: 'playerOnline', id: player.state.id, name: player.state.name });
    return;
  }

  if (type === 'act') {
    const p = players.get(ws.meta.playerId);
    if (!p) return sendWs(ws, { type: 'error', msg: '未连接' });
    const r = p.act(msg.name, msg.args || {});
    sendWs(ws, { type: 'actResult', name: msg.name, ...r });
    sendWs(ws, { type: 'state', view: p.view() });
    if (!r.ok && r.msg) sendWs(ws, { type: 'toast', text: r.msg, kind: 'bad' });
    return;
  }

  if (type === 'gm') {
    if (ws.meta.role !== 'gm') return sendWs(ws, { type: 'error', msg: '需要 GM 权限' });
    const r = gm.run(world, msg.cmd, msg.args || {}, 'GM');
    sendWs(ws, { type: 'gmResult', cmd: msg.cmd, ...r });
    return;
  }
}

server.listen(PORT, HOST, () => {
  const nets = require('os').networkInterfaces();
  const addrs = [];
  for (const list of Object.values(nets)) {
    for (const n of list) if (n.family === 'IPv4' && !n.internal) addrs.push(n.address);
  }
  console.log('');
  console.log('  TBH-like 服务器已启动');
  console.log(`  本机:   http://localhost:${PORT}`);
  addrs.forEach(a => console.log(`  局域网: http://${a}:${PORT}   (手机同 WiFi 可访问)`));
  console.log(`  GM 面板: http://localhost:${PORT}/gm.html`);
  console.log(`  GM 令牌: ${GM_TOKEN}`);
  console.log('');
});

process.on('SIGINT', () => {
  console.log('\n[exit] 保存中...');
  for (const p of players.values()) store.savePlayer(p);
  process.exit(0);
});
