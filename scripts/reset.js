/**
 * 清空所有玩家存档（保留 GM 令牌与数值覆盖）
 *   node scripts/reset.js           清空玩家
 *   node scripts/reset.js --all     连 GM 令牌、数值覆盖、日志一起清空
 */
const fs = require('fs');
const path = require('path');
const { DATA_DIR } = require('../server/db');

const all = process.argv.includes('--all');
const dbPath = path.join(DATA_DIR, 'game.db');

if (fs.existsSync(dbPath)) {
  const Database = require('better-sqlite3');
  const db = new Database(dbPath);
  db.exec('DELETE FROM players');
  // kv 存的是 GM 的数值覆盖，重置时一并清掉，避免旧调参残留影响新档
  db.exec('DELETE FROM kv; DELETE FROM world_events');
  if (all) db.exec('DELETE FROM announcements; DELETE FROM audit');
  db.close();
  console.log('[reset] 已清空玩家存档与数值覆盖' + (all ? '、公告与审计日志' : ''));
} else {
  console.log('[reset] 没有找到数据库，无需清理');
}

if (all && fs.existsSync(path.join(DATA_DIR, 'server.json'))) {
  fs.unlinkSync(path.join(DATA_DIR, 'server.json'));
  console.log('[reset] 已删除 GM 令牌（下次启动自动生成）');
}
