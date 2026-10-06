/**
 * 冒烟测试：不开服务器，直接把引擎跑一遍完整链路。
 *   node scripts/smoke.cjs
 */
const { Player, createNewSave } = require('../engine/game');
const { migrate } = require('../engine/save');
const combat = require('../engine/combat');
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

console.log('\n完成。\n');
