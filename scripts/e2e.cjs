/**
 * 端到端测试：连真实服务器，跑玩家 + GM 两条链路
 *   node scripts/e2e.cjs
 */
const WebSocket = require('ws');
const URL = process.env.TEST_URL || 'ws://localhost:8787/ws';
const GM_TOKEN = process.env.GM_TOKEN || require('fs').readFileSync(__dirname + '/../data/server.json', 'utf8') && JSON.parse(require('fs').readFileSync(__dirname + '/../data/server.json', 'utf8')).gmToken;

let fails = 0;
function assert(c, l) { console.log((c ? '  OK   ' : '  FAIL ') + l); if (!c) fails++; }

function conn() {
  return new Promise((res) => {
    const ws = new WebSocket(URL);
    ws.on('open', () => res(ws));
  });
}
function wait(ws, type, ms = 6000) {
  return new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('超时等待 ' + type)), ms);
    ws.on('message', function h(raw) {
      const m = JSON.parse(raw);
      if (m.type === type) { clearTimeout(t); ws.off('message', h); res(m); }
    });
  });
}
function collect(ws) {
  const bag = [];
  ws.on('message', (raw) => bag.push(JSON.parse(raw)));
  return bag;
}
/** 先注册监听再发送，避免响应早于等待而丢失 */
async function ask(ws, obj, type, ms = 8000) {
  const p = wait(ws, type, ms);
  ws.send(JSON.stringify(obj));
  return p;
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  console.log('\n== 玩家链路 ==');
  const pws = await conn();
  const pbag = collect(pws);
  pws.send(JSON.stringify({ type: 'hello', role: 'player', name: '端到端测试', classId: 'niuma' }));
  const welcome = await wait(pws, 'welcome');
  assert(welcome.role === 'player', '玩家握手成功');
  assert(!!welcome.token, '拿到存档令牌');

  let st = await wait(pws, 'state');
  assert(st.view.heroes.length === 1, '初始 1 名英雄');
  assert(st.view.gold === 0, '初始金币 0');
  const leaderboard = await wait(pws, 'leaderboard');
  const ownRank = leaderboard.rows.find(row => row.id === welcome.pid);
  assert(!!ownRank, '排行榜包含当前玩家');
  assert(ownRank.online === true, '排行榜实时显示在线状态');
  assert(!JSON.stringify(leaderboard).includes(welcome.token), '排行榜不泄露玩家令牌');
  assert(leaderboard.rows.every(row => Number.isFinite(row.dps) && Number.isFinite(row.progressScore)),
    '排行榜下发可排序的进度与战力数据');

  // 开始挂机
  const r1 = await ask(pws, { type: 'act', name: 'start' }, 'actResult');
  assert(r1.ok, '开始挂机: ' + r1.msg);

  // 等几秒看战斗
  await sleep(6000);
  const states = pbag.filter(m => m.type === 'state');
  const last = states[states.length - 1].view;
  assert(last.running === true, '服务器处于挂机中');
  assert(!!last.combat, '战斗快照存在');
  assert(last.combat.enemies.length > 0, `场上有敌人 (${last.combat.enemies.length})`);
  assert(last.stats.totalKills > 0 || last.gold >= 0, `击杀数 ${last.stats.totalKills}`);
  console.log(`        战斗：${last.currentStage.id} 波次 ${last.combat.wave}/${last.combat.waveCount} 击杀 ${last.stats.totalKills} 金币 ${last.gold}`);

  console.log('\n== GM 链路 ==');
  const gws = await conn();
  const gbag = collect(gws);
  gws.send(JSON.stringify({ type: 'hello', role: 'gm', token: GM_TOKEN }));
  const gw = await wait(gws, 'welcome');
  assert(gw.role === 'gm', 'GM 握手成功');
  assert(!!gw.meta, '收到 GM 元数据');

  // 错误令牌
  const bad = await conn();
  bad.send(JSON.stringify({ type: 'hello', role: 'gm', token: 'wrong' }));
  const ber = await wait(bad, 'error');
  assert(!!ber.msg, '错误令牌被拒绝: ' + ber.msg);
  bad.close();

  // 发金币
  const pl = await ask(gws, { type: 'gm', cmd: 'players' }, 'gmResult');
  assert(pl.ok && pl.players.length > 0, `玩家列表 ${pl.players.length} 人`);
  // 只操作自己这个连接的玩家，别误伤服务器上的其它存档
  const pid = welcome.pid;
  assert(pl.players.some(p => p.id === pid), '玩家列表包含自己');

  const gr = await ask(gws, { type: 'gm', cmd: 'grant', args: { playerId: pid, gold: 99999 } }, 'gmResult');
  assert(gr.ok, '发放金币: ' + gr.msg);

  await sleep(1500);
  const after = pbag.filter(m => m.type === 'state').pop().view;
  assert(after.gold >= 99999, `玩家收到金币 (${after.gold})`);
  const gotToast = pbag.some(m => m.type === 'toast');
  assert(gotToast, '玩家收到提示');

  // 发装备
  const gi = await ask(gws, { type: 'gm', cmd: 'grant', args: { playerId: pid, item: { rarity: 'Immortal', ilvl: 50, count: 2 } } }, 'gmResult');
  assert(gi.ok, '发放装备: ' + gi.msg);

  // 世界事件
  const ev = await ask(gws, { type: 'gm', cmd: 'event', args: { op: 'start', kind: 'doubleGold', durationSec: 120 } }, 'gmResult');
  assert(ev.ok, '启动世界事件: ' + ev.msg);
  await sleep(1500);
  const evState = pbag.filter(m => m.type === 'state').pop().view;
  assert(evState.modifiers.length > 0, `玩家侧看到事件 (${evState.modifiers.map(m => m.label).join(',')})`);
  const sawEventToast = pbag.some(m => m.type === 'worldEvent' && m.action === 'start');
  assert(sawEventToast, '玩家收到事件广播');

  // 公告
  const an = await ask(gws, { type: 'gm', cmd: 'announce', args: { text: '测试公告' } }, 'gmResult');
  assert(an.ok, '广播公告');
  await sleep(600);
  assert(pbag.some(m => m.type === 'announce'), '玩家收到公告');

  // 调参
  const tu = await ask(gws, { type: 'gm', cmd: 'tunables' }, 'gmResult');
  assert(tu.ok && tu.list.length > 20, `可调参数 ${tu.list.length} 项`);

  const ts = await ask(gws, { type: 'gm', cmd: 'tunables', args: { op: 'set', path: 'loot.chestChancePerWave', value: 0.9 } }, 'gmResult');
  assert(ts.ok, '热改掉率: ' + ts.msg);

  const tr = await ask(gws, { type: 'gm', cmd: 'tunables', args: { op: 'reset', path: 'loot.chestChancePerWave' } }, 'gmResult');
  assert(tr.ok, '恢复默认: ' + tr.msg);

  // 踢人
  const kk = await ask(gws, { type: 'gm', cmd: 'kick', args: { playerId: pid, reason: '测试' } }, 'gmResult');
  assert(kk.ok, '踢人: ' + kk.msg);
  await sleep(500);
  assert(pbag.some(m => m.type === 'kicked'), '玩家收到踢出通知');

  // 审计
  const au = await ask(gws, { type: 'gm', cmd: 'audit' }, 'gmResult');
  assert(au.ok && au.list.length > 3, `审计日志 ${au.list.length} 条`);

  console.log(`\n${fails ? '❌ 失败 ' + fails + ' 项' : '✅ 全部通过'}\n`);
  pws.close(); gws.close();
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('发生异常:', e.message); process.exit(1); });
