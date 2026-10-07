/**
 * 持久化层（SQLite）
 * ---------------------------------------------------------------------------
 * 表：
 *   players       玩家存档（state 以 JSON 存，读档时跑迁移）
 *   kv            键值表，存 GM overrides 等配置
 *   announcements GM 公告
 *   world_events  GM 触发的世界事件（带到期时间）
 *   audit         GM 操作审计日志
 */

const path = require('path');
const fs = require('fs');

let Database = null;

/**
 * 探测 better-sqlite3 是否真正可用。
 *
 * 关键点：可用性判定必须包含「构造」这一步，不能只包住 require()。
 * better-sqlite3 是原生模块，require() 加载的是纯 JS 包装层，
 * 只要包装层本身没语法错误就会成功返回构造函数 —— 即使 .node 二进制
 * 根本没编译出来（缺 Visual Studio Build Tools / node-gyp 失败时必现）。
 * 真正抛错发生在 new Database() 内部（bindings 找不到 .node 文件）。
 *
 * 原实现只 try 了 require()，于是 require 成功 -> Database 非空 ->
 * useSqlite 被判为 true -> 构造函数里 new Database() 抛异常 ->
 * 整个进程崩溃，JSON 兜底分支从未被走过。
 * 该缺陷在已装好原生模块的机器上不可见，换机器 clone 后才暴露。
 *
 * @returns {Function|null} 可用的 Database 构造函数；不可用时返回 null
 */
function detectSqlite() {
  let Candidate;
  try {
    Candidate = require('better-sqlite3');
  } catch (e) {
    console.error('[db] better-sqlite3 未安装，退回文件存储：', e.message);
    return null;
  }
  try {
    // 用内存库做探测，不碰磁盘：既验证 .node 能否加载，又不产生副作用。
    const probe = new Candidate(':memory:');
    probe.close();
    return Candidate;
  } catch (e) {
    // bindings 的报错自带十几行候选路径清单，直接打印会淹没启动横幅。
    // 只取首行作为原因，完整堆栈需要时用 DEBUG_SQLITE=1 打开。
    if (process.env.DEBUG_SQLITE) console.error(e);
    const reason = String(e.message || e).split('\n')[0].trim();
    console.error(`[db] better-sqlite3 原生模块不可用（${reason}），退回文件存储 data/fallback.json`);
    console.error('[db] 如需启用 SQLite，装 Visual Studio Build Tools 后执行：npm rebuild better-sqlite3');
    return null;
  }
}

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_PATH = path.join(DATA_DIR, 'game.db');

class Store {
  constructor() {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    // 探测在构造时执行，保证 useSqlite 与实际可用性一致（见 detectSqlite 注释）。
    Database = detectSqlite();
    this.useSqlite = !!Database;
    this.filePath = path.join(DATA_DIR, 'fallback.json');
    if (this.useSqlite) {
      this.db = new Database(DB_PATH);
      this.db.pragma('journal_mode = WAL');
      this.init();
    } else {
      this.mem = fs.existsSync(this.filePath)
        ? JSON.parse(fs.readFileSync(this.filePath, 'utf8'))
        : { players: {}, kv: {}, announcements: [], worldEvents: [], audit: [] };
    }
  }

  init() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS players (
        id TEXT PRIMARY KEY,
        name TEXT,
        token TEXT,
        state TEXT,
        updatedAt INTEGER
      );
      CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT);
      CREATE TABLE IF NOT EXISTS announcements (
        id INTEGER PRIMARY KEY AUTOINCREMENT, text TEXT, at INTEGER, by TEXT
      );
      CREATE TABLE IF NOT EXISTS world_events (
        id TEXT PRIMARY KEY, kind TEXT, label TEXT, until INTEGER, effects TEXT, by TEXT
      );
      CREATE TABLE IF NOT EXISTS audit (
        id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER, by TEXT, kind TEXT, detail TEXT
      );
    `);
  }

  // ---- 玩家 ----
  loadAllPlayers() {
    if (!this.useSqlite) return Object.values(this.mem.players).map(p => JSON.parse(p));
    return this.db.prepare('SELECT id, name, token, state FROM players').all()
      .map(r => ({ id: r.id, name: r.name, token: r.token, state: JSON.parse(r.state) }));
  }

  savePlayer(player) {
    const state = JSON.stringify(player.state);
    if (!this.useSqlite) {
      this.mem.players[player.state.id] = JSON.stringify({ id: player.state.id, name: player.state.name, token: player.state.token, state: player.state });
      this.flush();
      return;
    }
    this.db.prepare(`
      INSERT INTO players (id, name, token, state, updatedAt) VALUES (?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET name=excluded.name, state=excluded.state, updatedAt=excluded.updatedAt
    `).run(player.state.id, player.state.name, player.state.token, state, Date.now());
  }

  deletePlayer(id) {
    if (!this.useSqlite) { delete this.mem.players[id]; this.flush(); return; }
    this.db.prepare('DELETE FROM players WHERE id = ?').run(id);
  }

  // ---- KV ----
  getKV(k, dflt = null) {
    if (!this.useSqlite) return this.mem.kv[k] ? JSON.parse(this.mem.kv[k]) : dflt;
    const r = this.db.prepare('SELECT v FROM kv WHERE k = ?').get(k);
    return r ? JSON.parse(r.v) : dflt;
  }
  setKV(k, v) {
    const s = JSON.stringify(v);
    if (!this.useSqlite) { this.mem.kv[k] = s; this.flush(); return; }
    this.db.prepare('INSERT INTO kv (k,v) VALUES (?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v').run(k, s);
  }

  // ---- 公告 ----
  addAnnouncement(text, by) {
    if (!this.useSqlite) {
      this.mem.announcements.push({ id: Date.now(), text, at: Date.now(), by });
      this.flush(); return;
    }
    this.db.prepare('INSERT INTO announcements (text, at, by) VALUES (?,?,?)').run(text, Date.now(), by);
  }
  listAnnouncements(limit = 20) {
    if (!this.useSqlite) return this.mem.announcements.slice(-limit).reverse();
    return this.db.prepare('SELECT * FROM announcements ORDER BY id DESC LIMIT ?').all(limit);
  }

  // ---- 世界事件 ----
  addWorldEvent(ev) {
    if (!this.useSqlite) {
      this.mem.worldEvents.push(ev); this.flush(); return;
    }
    this.db.prepare('INSERT OR REPLACE INTO world_events (id,kind,label,until,effects,by) VALUES (?,?,?,?,?,?)')
      .run(ev.id, ev.kind, ev.label, ev.until, JSON.stringify(ev.effects || {}), ev.by || 'GM');
  }
  listWorldEvents() {
    const now = Date.now();
    if (!this.useSqlite) return this.mem.worldEvents.filter(e => e.until > now);
    return this.db.prepare('SELECT * FROM world_events WHERE until > ?').all(now)
      .map(r => ({ id: r.id, kind: r.kind, label: r.label, until: r.until, effects: JSON.parse(r.effects), by: r.by }));
  }
  clearWorldEvents() {
    if (!this.useSqlite) { this.mem.worldEvents = []; this.flush(); return; }
    this.db.prepare('DELETE FROM world_events').run();
  }

  // ---- 审计 ----
  log(kind, detail, by = 'GM') {
    if (!this.useSqlite) {
      this.mem.audit.push({ at: Date.now(), by, kind, detail });
      if (this.mem.audit.length > 2000) this.mem.audit.splice(0, this.mem.audit.length - 2000);
      this.flush(); return;
    }
    this.db.prepare('INSERT INTO audit (at, by, kind, detail) VALUES (?,?,?,?)')
      .run(Date.now(), by, kind, typeof detail === 'string' ? detail : JSON.stringify(detail));
  }
  listAudit(limit = 50) {
    if (!this.useSqlite) return this.mem.audit.slice(-limit).reverse();
    return this.db.prepare('SELECT * FROM audit ORDER BY id DESC LIMIT ?').all(limit);
  }

  flush() {
    if (this.useSqlite) return;
    fs.writeFileSync(this.filePath, JSON.stringify(this.mem));
  }
}

module.exports = { Store, DB_PATH, DATA_DIR, detectSqlite, FALLBACK_PATH: path.join(DATA_DIR, 'fallback.json') };
