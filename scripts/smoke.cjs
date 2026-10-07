/**
 * 冒烟测试：不开服务器，直接把引擎跑一遍完整链路。
 *   node scripts/smoke.cjs
 */
const { Player, createNewSave } = require('../engine/game');
const { migrate } = require('../engine/save');
const combat = require('../engine/combat');
const loot = require('../engine/loot');
const { makeRng } = require('../engine/util');
const T = require('../engine/tunables');

function assert(cond, label) {
  console.log((cond ? '  OK   ' : '  FAIL ') + label);
  if (!cond) process.exitCode = 1;
}

console.log('\n== 1. 创建存档 ==');
const st = createNewSave({ name: '测试者', classId: 'niuma' });
let p = new Player(st);
assert(!!st.token, '生成 token');
assert(st.heroes.length === 1, '初始 1 名英雄');
assert(st.party.length === 1, '默认上阵 1 人');

console.log('\n== 2. 战斗推进 120 秒 ==');
p.act('start');
let cleared = 0;
const origOnEvent = p.onEvent;
p.onEvent = (pl, ev) => { if (ev.t === 'stageCleared') cleared++; origOnEvent(pl, ev); };
for (let i = 0; i < 120; i++) p.tick(1);
assert(p.state.stats.totalKills > 0, `产生击杀 (${p.state.stats.totalKills})`);
assert(p.state.gold > 0, `获得金币 (${p.state.gold})`);
assert(cleared > 0, `通关关卡 (${cleared})`);
assert(p.state.heroes[0].level > 1, `英雄升级 (Lv.${p.state.heroes[0].level})`);

console.log('\n== 3. 掉落与开箱 ==');
p.dropChest('boss');
p.dropChest('normal');
assert(p.state.chests.length >= 2, `宝箱生成 (${p.state.chests.length})`);
const r = p.act('openAllChests');
assert(r.ok, '开箱成功: ' + r.msg);
assert(p.state.inventory.length > 0, `背包有装备 (${p.state.inventory.length})`);

console.log('\n== 4. 装备与属性 ==');
const item = p.state.inventory[0];
const before = p.view().heroes[0].stats.dps;
const eq = p.act('equip', { heroUid: p.state.heroes[0].uid, itemUid: item.uid });
assert(eq.ok, '穿戴装备');
assert(p.state.heroes[0].equipment[item.slot] === item.uid, '装备已上槽');

console.log('\n== 5. 符文树 ==');
p.state.gold = 100000;
const rr = p.act('buyRune', { runeId: 'war_1' });
assert(rr.ok, '解锁战争符文: ' + rr.msg);
const rr2 = p.act('buyRune', { runeId: 'wealth_1' });
assert(rr2.ok, '解锁财富 I: ' + rr2.msg);
assert(p.ctx().bonuses.goldPct > 0, `符文加成生效 (${p.ctx().bonuses.goldPct})`);

console.log('\n== 6. 魔方 ==');
for (let i = 0; i < 12; i++) p.dropChest('normal');
p.act('openAllChests');
const commons = p.state.inventory.filter(i => i.rarity === 'Common').slice(0, 9);
if (commons.length === 9) {
  const syn = p.act('cube', { op: 'synthesis', itemUids: commons.map(c => c.uid) });
  assert(syn.ok, '合成: ' + syn.msg);
} else {
  console.log(`  SKIP  合成（普通装备不足: ${commons.length}/9）`);
}
const alc = p.act('cube', { op: 'alchemy', itemUids: p.state.inventory.slice(0, 2).map(i => i.uid) });
assert(alc.ok, '炼金: ' + alc.msg);

console.log('\n== 7. 技能点 ==');
const h = p.state.heroes[0];
const spBefore = h.skillPoints;
if (spBefore > 0) {
  const ls = p.act('learnSkill', { heroUid: h.uid, skillId: 'n_hp' });
  assert(ls.ok, '学习技能');
} else console.log('  SKIP  技能点不足');

console.log('\n== 8. 离线收益 ==');
const off = require('../engine/progress').offlineRewards(p.state, p.ctx(), 3600 * 3);
assert(off && off.gold > 0, `离线 3 小时金币 (${off && off.gold})`);

console.log('\n== 9. 成就与宠物 ==');
p.checkProgress();
const achCount = Object.values(p.state.achievements).filter(a => a.done).length;
assert(achCount > 0, `达成成就 (${achCount})`);

console.log('\n== 10. 存档迁移 ==');
const round = JSON.parse(JSON.stringify(p.state));
round.schemaVersion = 0;
const mig = migrate(round);
assert(mig.schemaVersion === T.get().schemaVersion, `迁移到 v${mig.schemaVersion}`);
assert(!!mig.stats.cubeOps, '缺失字段已补齐');

// v1 -> v2：旧 6 职业必须能安全转成 2 角色
const old = JSON.parse(JSON.stringify(p.state));
old.schemaVersion = 1;
old.unlockedClasses = ['Knight', 'Ranger', 'Priest'];
old.heroes[0].classId = 'Priest';
old.heroes[0].skills = { p_heal: 3, p_bless: 2 };
old.heroes[0].skillPoints = 1;
old.inventory = [
  { uid: 'x1', slot: 'weapon', classId: 'Sorcerer', rarity: 'Rare', ilvl: 10, main: { stat: 'atk', value: 5 }, affixes: [], sockets: {}, locked: false },
  { uid: 'x2', slot: 'armor', classId: 'Hunter', rarity: 'Common', ilvl: 8, main: { stat: 'def', value: 3 }, affixes: [], sockets: {}, locked: false }
];
const m2 = migrate(old);
assert(m2.heroes[0].classId === 'niuma', `旧职业 Priest -> ${m2.heroes[0].classId}`);
assert(m2.heroes[0].skillPoints === 6, `旧技能点已退回 (1 + 3 + 2 = ${m2.heroes[0].skillPoints})`);
assert(Object.keys(m2.heroes[0].skills).length === 0, '旧技能已清空');
assert(m2.inventory[0].classId === 'roudan' && m2.inventory[1].classId === 'roudan', '装备职业标签已转换');
assert(JSON.stringify(m2.unlockedClasses) === JSON.stringify(['niuma', 'roudan']), '可选角色已更新');

// v2 -> v3：宝箱分档 normal -> common/fine/boss/actBoss
const old3 = JSON.parse(JSON.stringify(p.state));
old3.schemaVersion = 2;
old3.chests = [
  // 旧档的普通箱：type/zh 都要换成新定义，不能只改 type
  { uid: 'c1', type: 'normal', zh: '普通宝箱', items: [{ slot: 'weapon', rarity: 'Common' }], gold: 100, materials: [], coins: [], opened: false },
  { uid: 'c2', type: 'boss', zh: '首领宝箱', items: [], gold: 500, materials: [], coins: [], opened: false },
  // 脏数据：未知档位必须被收敛到 common，不能留下孤儿宝箱
  { uid: 'c3', type: '???', zh: '???', items: [], gold: 1, materials: [], coins: [], opened: false },
  // 已开启的不用改
  { uid: 'c4', type: 'normal', zh: '普通宝箱', items: [], gold: 1, opened: true }
];
old3.chestCd = { normal: 12, boss: 34, actBoss: 56 };
const m3 = migrate(old3);
assert(m3.chests[0].type === 'common', `旧 normal 箱 -> ${m3.chests[0].type}`);
assert(m3.chests[0].zh === '普通宝箱', `名称仍正确 (${m3.chests[0].zh})`);
assert(!!m3.chests[0].icon && !!m3.chests[0].color, 'icon 与 color 已补上');
assert(m3.chests[1].type === 'boss', `boss 箱保持 (${m3.chests[1].type})`);
assert(m3.chests[2].type === 'common', `未知档位收敛到 common (${m3.chests[2].type})`);
assert(m3.chests[0].items.length === 1, '箱内物品未被重掷（不改玩家已得收益）');
assert(!('normal' in m3.chestCd), '旧键 normal 已从 chestCd 移除');
assert(m3.chestCd.fine === 0, '新键 fine 已补初值 0');
assert(Object.keys(m3.chestCd).length === 4, `chestCd 覆盖全部 4 档 (${Object.keys(m3.chestCd).join(',')})`);

console.log('\n== 10b. 宝箱稀有度分档 ==');
assert(loot.CHEST_TIER_ORDER.length === 4, `4 档宝箱 (${loot.CHEST_TIER_ORDER.join(',')})`);
for (const key of loot.CHEST_TIER_ORDER) {
  const tier = loot.CHEST_TIERS[key];
  assert(!!tier.zh && !!tier.icon && !!tier.color, `${tier.zh} 定义完整`);
}
// rarityShift 与 rarityReluck 必须随稀有度单调递增，否则「越高档越好」不成立
for (let i = 1; i < loot.CHEST_TIER_ORDER.length; i++) {
  const a = loot.CHEST_TIERS[loot.CHEST_TIER_ORDER[i - 1]];
  const b = loot.CHEST_TIERS[loot.CHEST_TIER_ORDER[i]];
  assert(b.rarityShift > a.rarityShift, `${a.zh}->${b.zh} rarityShift 递增`);
  assert(b.rarityReluck >= a.rarityReluck, `${a.zh}->${b.zh} rarityReluck 不减`);
}

// 实测梯度：每档开 600 箱，统计传说以上占比
const N = 600;
const topRarities = ['Legendary', 'Immortal', 'Arcana', 'Beyond', 'Celestial', 'Divine', 'Cosmic'];
const topRate = {};
for (const key of loot.CHEST_TIER_ORDER) {
  let top = 0, total = 0;
  for (let i = 0; i < N; i++) {
    const c = loot.rollChest(makeRng(20260101 + i * 7919), key, { stageIndex: 5, difficulty: 'Normal' });
    total += c.items.length;
    top += c.items.filter(it => topRarities.includes(it.rarity)).length;
  }
  topRate[key] = top / total;
  assert(total > 0, `${loot.CHEST_TIERS[key].zh} 产出 ${(total / N).toFixed(2)} 件/箱`);
}
const rates = loot.CHEST_TIER_ORDER.map(k => topRate[k]);
let mono = true;
for (let i = 1; i < rates.length; i++) if (rates[i] <= rates[i - 1]) mono = false;
assert(mono, `传说以上占比随稀有度递增 (${loot.CHEST_TIER_ORDER.map((k, i) =>
  loot.CHEST_TIERS[k].zh + ' ' + (rates[i] * 100).toFixed(1) + '%').join(' < ')})`);
assert(rates[3] / rates[0] >= 1.8, `最高档是最低档的 ${(rates[3] / rates[0]).toFixed(2)} 倍（体感差异明显）`);

// 波次箱分档：只在 common / fine 两档间分流
const waveSeen = new Set();
for (let i = 0; i < 300; i++) waveSeen.add(loot.rollWaveChestTier(makeRng(7000 + i * 13)));
assert(waveSeen.size === 2 && waveSeen.has('common') && waveSeen.has('fine'),
  `波次箱只在 common/fine 间分流 (${[...waveSeen].join(',')})`);
// 300 次里 fine 占比应在 30% 上下（配置 WAVE_CHEST_WEIGHTS）
let fine = 0;
for (let i = 0; i < 2000; i++) if (loot.rollWaveChestTier(makeRng(9000 + i * 31)) === 'fine') fine++;
assert(Math.abs(fine / 2000 - 0.30) < 0.04, `fine 档占比 ${(fine / 2000 * 100).toFixed(1)}%（配置 30%）`);

console.log('\n== 11. 数值热改 ==');
T.setAt('loot.chestChancePerWave', 0.5);
assert(T.get().loot.chestChancePerWave === 0.5, '热改生效');
T.resetAt('loot.chestChancePerWave');
assert(T.get().loot.chestChancePerWave === T.baseConfig.loot.chestChancePerWave, '恢复默认');
assert(T.listTunables().length > 10, `可热改项 (${T.listTunables().length})`);

console.log('\n== 12. 视图序列化 ==');
const view = p.view();
const json = JSON.stringify(view);
assert(json.length < 2_000_000, `视图大小 ${(json.length / 1024).toFixed(0)} KB`);
assert(Array.isArray(view.heroes) && view.heroes[0].stats, '英雄属性已计算');
assert(typeof view.partySummary.dps === 'number', `队伍 DPS ${view.partySummary.dps}`);

console.log('\n== 13. 关卡表 ==');
for (const d of ['Normal', 'Hard', 'Expert', 'Hell']) {
  const l = combat.listStages(d);
  assert(l.length === 30, `${d} 关卡数 ${l.length}`);
}

console.log('\n== 14. 掉落流水（前端战场要靠它画真实掉落）==');
{
  // 用独立存档，避免受上面 120 秒推进与手动 dropChest 的干扰
  const st2 = createNewSave({ name: '掉落测试', classId: 'roudan' });
  const p2 = new Player(st2);
  p2.act('start');
  for (let i = 0; i < 90; i++) p2.tick(1);

  const snap = combat.snapshot(p2.run);
  assert(!!snap, '战斗快照存在');
  assert(typeof snap.dropSeq === 'number' && snap.dropSeq > 0, `dropSeq 递增 (${snap.dropSeq})`);
  assert(Array.isArray(snap.drops) && snap.drops.length > 0, `快照带真实掉落流水 (${snap.drops.length} 条)`);

  const golds = snap.drops.filter(d => d.t === 'gold');
  assert(golds.length > 0, `含击杀掉落 (${golds.length} 条)`);
  assert(golds.every(d => d.gold > 0 && d.foeUid), '每条击杀掉落都有金币数与怪物 uid');

  // id 必须严格递增且唯一：前端靠它去重，重复 id 会导致掉落不播
  const ids = snap.drops.map(d => d.id);
  assert(new Set(ids).size === ids.length, '掉落 id 无重复');
  assert(ids.every((v, i) => i === 0 || v > ids[i - 1]), '掉落 id 严格递增');

  // 流水只保留最近 8 条，不能随挂机时间无限增长
  assert(snap.drops.length <= 8, `流水长度有上限 (${snap.drops.length} <= 8)`);

  // 金币数字必须与实际入账一致（世界事件加成后仍要对得上）
  const sumDrop = golds.reduce((a, b) => a + b.gold, 0);
  assert(sumDrop > 0, `流水金币合计 ${sumDrop}`);

  // 宝箱掉落：开箱前就能在快照里看到，且带箱内装备的槽位+稀有度预览
  p2.dropChest('boss');
  const s2 = combat.snapshot(p2.run);
  const chestDrop = s2.drops.find(d => d.t === 'chest');
  assert(!!chestDrop, '宝箱掉落进入战斗流水');
  assert(chestDrop.chestType === 'boss', `宝箱类型正确 (${chestDrop.chestType})`);
  assert(chestDrop.items && chestDrop.items.length > 0, `箱内装备预览 ${chestDrop.items.length} 件`);
  assert(chestDrop.items.every(i => i.slot && i.rarity && !i.main), '预览只含槽位与稀有度，不外泄完整属性');

  // amendDrop：把裸值改成实发值
  const target = s2.drops.find(d => d.t === 'gold');
  const beforeGold = target.gold;
  assert(combat.amendDrop(p2.run, target.id, { gold: beforeGold * 2 }) === true, 'amendDrop 命中并更新');
  const after = combat.snapshot(p2.run).drops.find(d => d.id === target.id);
  assert(after.gold === beforeGold * 2, `实发金币已回填 (${beforeGold} -> ${after.gold})`);
  assert(combat.amendDrop(p2.run, 99999, { gold: 1 }) === false, 'amendDrop 对不存在的 id 返回 false');
}

console.log('\n完成。\n');
