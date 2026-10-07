/**
 * 清空所有玩家存档（保留 GM 令牌与数值覆盖）
 *   node scripts/reset.js           清空玩家
 *   node scripts/reset.js --all     连 GM 令牌、数值覆盖、日志一起清空
 */
const fs = require('fs');
const path = require('path');
const { DATA_DIR, detectSqlite, FALLBACK_PATH } = require('../server/db');

const all = process.argv.includes('--all');
const dbPath = path.join(DATA_DIR, 'game.db');

// 复用 db.js 的探测逻辑：better-sqlite3 的可用性判定必须包含构造步骤，
// 只 require 会在原生模块缺失时拿到不可用的构造函数。
// 判不出来时走 JSON 分支 —— 否则降级模式下 reset 会直接抛异常，
// 而降级模式恰恰是玩家唯一能用的模式。
const Database = detectSqlite();

if (Database && fs.existsSync(dbPath)) {
  const db = new Database(dbPath);
  db.exec('DELETE FROM players');
  // kv 存的是 GM 的数值覆盖，重置时一并清掉，避免旧调参残留影响新档
  db.exec('DELETE FROM kv; DELETE FROM world_events');
  if (all) db.exec('DELETE FROM announcements; DELETE FROM audit');
  db.close();
  console.log('[reset] 已清空玩家存档与数值覆盖' + (all ? '、公告与审计日志' : ''));
} else if (fs.existsSync(FALLBACK_PATH)) {
  // 降级模式：数据全在 fallback.json 里，直接重写该文件。
  // 只清玩家与数值覆盖，GM 令牌在 server.json，不在此文件，天然不受影响。
  const data = JSON.parse(fs.readFileSync(FALLBACK_PATH, 'utf8'));
  data.players = {};
  data.kv = {};
  data.worldEvents = [];
  if (all) { data.announcements = []; data.audit = []; }
  fs.writeFileSync(FALLBACK_PATH, JSON.stringify(data));
  console.log('[reset] 已清空文件存储中的玩家存档与数值覆盖' + (all ? '、公告与审计日志' : ''));
} else {
  console.log('[reset] 没有找到存档，无需清理');
}

if (all && fs.existsSync(path.join(DATA_DIR, 'server.json'))) {
  fs.unlinkSync(path.join(DATA_DIR, 'server.json'));
  console.log('[reset] 已删除 GM 令牌（下次启动自动生成）');
}
