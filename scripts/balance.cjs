/**
 * 平衡性模拟：模拟一个"会玩"的玩家挂机 N 小时
 *   node scripts/balance.cjs [hours]
 * 行为：自动开箱、自动穿更强装备、优先买最便宜符文、攒钱招募第二英雄
 */
const { createNewSave, Player } = require('../engine/game');
const { itemPower } = require('../engine/gear');
const { cheapestBuyable } = require('../engine/rune');

const HOURS = Number(process.argv[2] || 4);
const SECONDS = HOURS * 3600;

function autoPlay(p) {
  const st = p.state;
  // 1. 开掉所有宝箱
  if (st.chests.some(c => !c.opened)) p.act('openAllChests');

  // 2. 自动穿装备：每个槽位挑战力最高的
  for (const h of st.heroes) {
    for (const slot of ['weapon', 'helmet', 'armor', 'boots', 'ring', 'amulet']) {
      const cands = st.inventory.filter(i => i.slot === slot && !i.locked);
      if (!cands.length) continue;
      cands.sort((a, b) => itemPower(b) - itemPower(a));
      const best = cands[0];
      const cur = st.inventory.find(i => i.uid === h.equipment[slot]);
      if (!cur || itemPower(best) > itemPower(cur)) p.act('equip', { heroUid: h.uid, itemUid: best.uid });
    }
  }

  // 3. 背包快满就炼金掉最差的
  if (st.inventory.length > p.bagLimit() - 5) {
    const junk = st.inventory.filter(i => !i.locked)
      .sort((a, b) => itemPower(a) - itemPower(b)).slice(0, 10).map(i => i.uid);
    if (junk.length) p.act('cube', { op: 'alchemy', itemUids: junk });
  }

  // 4. 技能点：点满第一个未满级的技能
  for (const h of st.heroes) {
    while (h.skillPoints > 0) {
      const cls = require('../engine/data/classes').CLASSES[h.classId];
      const target = cls.skills.find(s => (h.skills[s.id] || 0) < s.max);
      if (!target) break;
      const r = p.act('learnSkill', { heroUid: h.uid, skillId: target.id });
      if (!r.ok) break;
    }
  }

  // 5. 买得起的最便宜符文（留一点钱招募英雄）
  const buyable = cheapestBuyable(st, 3);
  for (const r of buyable) {
    if (st.gold > r.cost * 2) p.act('buyRune', { runeId: r.id });
  }

  // 6. 攒够钱招募第二个英雄
  const maxSlots = Math.min(4, 2 + (p.ctx().bonuses.partySlot || 0));
  if (st.heroes.length < maxSlots) {
    const cost = 2000 + st.heroes.length * 5000;
    if (st.gold > cost * 1.5) {
      const cls = ['roudan', 'niuma', 'roudan'][st.heroes.length - 1] || 'roudan';
      p.act('newHero', { classId: cls });
      p.act('deploy', { heroUid: st.heroes[st.heroes.length - 1].uid });
    }
  }
}

const p = new Player(createNewSave({ name: '模拟玩家', classId: 'niuma' }));
p.act('start');

console.log(`\n模拟 ${HOURS} 小时挂机...\n`);
console.log('  时间   等级  关卡   金币      击杀    装备  符文  成就');
for (let s = 1; s <= SECONDS; s++) {
  p.tick(1);
  if (s % 60 === 0) autoPlay(p);
  if (s % 1800 === 0) {
    const st = p.state;
    const lv = Math.max(...st.heroes.map(h => h.level));
    const ach = Object.values(st.achievements).filter(a => a.done).length;
    const runes = Object.values(st.runes).filter(Boolean).length;
    console.log(
      `  ${String(s / 3600).padStart(4)}h  ${String(lv).padStart(4)}  ${st.currentStage.id.padEnd(5)} ` +
      `${String(st.gold).padStart(9)} ${String(st.stats.totalKills).padStart(8)} ` +
      `${String(st.inventory.length).padStart(5)} ${String(runes).padStart(5)} ${String(ach).padStart(5)}`
    );
  }
}
const st = p.state;
console.log(`\n结果：通关 ${Object.keys(st.clearedStages.Normal).length}/30 关，` +
  `英雄 ${st.heroes.length} 名，最高 Lv.${Math.max(...st.heroes.map(h => h.level))}，` +
  `成就 ${Object.values(st.achievements).filter(a => a.done).length}`);
console.log(`队伍 DPS ${Math.round(p.ctx().rows.reduce((a, r) => a + r.stats.dps, 0))}，` +
  `EHP ${p.ctx().rows.reduce((a, r) => a + r.stats.ehp, 0)}\n`);
