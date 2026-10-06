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

let Database;
try {
  Database = require('better-sqlite3');
} catch (e) {
  console.error('[db] better-sqlite3 不可用，退回文件存储：', e.message);
  Database = null;
}

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_PATH = path.join(DATA_DIR, 'game.db');

class Store {
  constructor() {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
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

module.exports = { Store, DB_PATH, DATA_DIR };
