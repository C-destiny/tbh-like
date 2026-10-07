/**
 * 前端逻辑冒烟测试（不需要浏览器）
 *   node scripts/ui-smoke.cjs
 * 用 Proxy 造一个宽松的 DOM 桩，把 gear-ui.js / stage.js 真跑一遍，
 * 目的不是验证"好不好看"，而是抓运行时报错和字段名写错。
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let fails = 0;
const ok = (c, l) => { console.log((c ? '  OK   ' : '  FAIL ') + l); if (!c) fails++; };

// ---------------- DOM 桩 ----------------
function mkEl(tag) {
  const el = {
    tagName: (tag || 'div').toUpperCase(),
    className: '', innerHTML: '', textContent: '', title: '', value: '',
    children: [], childNodes: [], isConnected: true, offsetWidth: 10,
    style: new Proxy({}, { get: () => '', set: () => true }),
    classList: { _s: new Set(), add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); },
      toggle(c, on) { on === undefined ? (this._s.has(c) ? this._s.delete(c) : this._s.add(c)) : (on ? this._s.add(c) : this._s.delete(c)); },
      contains(c) { return this._s.has(c); } },
    dataset: {},
    appendChild(c) { this.children.push(c); c.parent = this; return c; },
    removeChild(c) { this.children = this.children.filter(x => x !== c); },
    remove() { if (this.parent) this.parent.removeChild(this); },
    addEventListener() {}, removeEventListener() {},
    querySelector(sel) { return this._q(sel)[0] || mkEl(); },
    querySelectorAll(sel) { return this._q(sel); },
    getBoundingClientRect() { return { left: 10, top: 20, width: 60, height: 90, right: 70, bottom: 110 }; },
    closest() { return this; },
    setAttribute() {}, getAttribute() { return null; }
  };
  // 极简选择器：只在已 append 的子节点里按 class 找
  el._q = (sel) => {
    const cls = sel.replace(/[.>]/g, '').trim().split(/\s+/).pop();
    const found = [];
    const walk = (n) => {
      for (const c of n.children || []) {
        if (typeof c.className === 'string' && c.className.split(/\s+/).includes(cls)) found.push(c);
        walk(c);
      }
    };
    walk(el);
    return found;
  };
  return el;
}

const registry = new Map();
const document = {
  createElement: (t) => mkEl(t),
  getElementById: (id) => {
    if (!registry.has(id)) registry.set(id, mkEl());
    return registry.get(id);
  },
  querySelector: () => mkEl(),
  querySelectorAll: () => [],
  body: mkEl('body'),
  title: ''
};

// 定时器队列：浏览器里 setTimeout 是异步的，桩必须也异步，
// 否则掉落物刚生成就会被同一个同步栈里的清理回调收掉，测不到中间态
let timerQueue = [];
function flushTimers(maxRounds = 20) {
  let rounds = 0;
  while (timerQueue.length && rounds++ < maxRounds) {
    const batch = timerQueue;
    timerQueue = [];
    for (const fn of batch) {
      try { fn(); } catch (e) { console.log('  定时器抛错: ' + e.message); fails++; }
    }
  }
}

let rafQueue = [];
const sandbox = {
  console, document,
  window: {},
  requestAnimationFrame: (fn) => { rafQueue.push(fn); return rafQueue.length; },
  performance: { now: () => Date.now() },
  setTimeout: (fn) => { timerQueue.push(fn); return timerQueue.length; },
  clearTimeout: () => {},
  Math, Date, JSON, Object, Array, String, Number, Boolean, Set, Map, parseInt, parseFloat, isNaN,
  localStorage: { getItem: () => null, setItem: () => {} }
};
sandbox.global = sandbox;
sandbox.window = sandbox;
vm.createContext(sandbox);

function load(file) {
  const code = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  vm.runInContext(code, sandbox, { filename: file });
}

console.log('\n== 1. 加载前端脚本 ==');
try {
  load('public/js/gear-ui.js');
  load('public/js/stage.js');
  ok(true, 'gear-ui.js + stage.js 加载无异常');
} catch (e) {
  ok(false, '加载失败: ' + e.message);
  process.exit(1);
}
ok(!!sandbox.GearUI, 'GearUI 已挂到 window');
ok(!!sandbox.Stage, 'Stage 已挂到 window');

console.log('\n== 2. 装备图标生成 ==');
const SLOTS = ['weapon', 'helmet', 'armor', 'boots', 'ring', 'amulet'];
for (const s of SLOTS) {
  const svg = sandbox.GearUI.gearIcon(s, '#ff0000', 24);
  const rects = (svg.match(/<rect/g) || []).length;
  ok(svg.startsWith('<svg') && rects > 4, `${s} 图标生成（${rects} 个像素块）`);
}
ok(sandbox.GearUI.gearIcon('unknown', '#fff', 10) === '', '未知槽位返回空串');

console.log('\n== 3. 立绘穿戴 ==');
const fig = sandbox.GearUI.heroFigure({
  sprite: 'niuma', width: 130, showEmpty: true,
  gear: { weapon: { zh: '加班之锤', color: '#a855f7', slot: 'weapon' } }
});
ok(fig.includes('niuma_full.png'), '立绘图片路径正确');
ok(fig.includes('加班之锤'), '已穿戴装备带上名字');
ok((fig.match(/fig-slot/g) || []).length === 6, `6 个装备位都渲染（${(fig.match(/fig-slot/g) || []).length}）`);

console.log('\n== 4. 战场同步（模拟服务器快照）==');
const view = {
  running: true,
  heroes: [
    { uid: 'h1', zh: '肾虚牛马', classId: 'niuma', sprite: 'niuma', level: 5, row: 'front', inParty: true,
      equipment: { weapon: null, helmet: null, armor: null, boots: null, ring: null, amulet: null },
      stats: { hp: 300, dps: 40, atk: 20, def: 18, crit: 5, critDmg: 1.5, atkSpeed: 0.95, hps: 8, ehp: 400 } },
    { uid: 'h2', zh: '肉蛋葱击使者', classId: 'roudan', sprite: 'roudan', level: 5, row: 'back', inParty: true,
      equipment: { weapon: null, helmet: null, armor: null, boots: null, ring: null, amulet: null },
      stats: { hp: 180, dps: 90, atk: 30, def: 9, crit: 8, critDmg: 1.6, atkSpeed: 1.45, hps: 0, ehp: 200 } }
  ],
  inventory: []
};
const combat = {
  runId: 'run_1', stageId: '1-1', difficulty: 'Normal', wave: 1, waveCount: 5, phase: 'fighting', elapsed: 10,
  kills: 3, gold: 30, exp: 40, dropSeq: 0, drops: [],
  enemies: [
    { uid: 'e1', zh: '史莱姆', sprite: 'slime', tier: 'normal', hp: 20, maxHp: 26, alive: true, atk: 5, atkSpeed: 0.7 },
    { uid: 'e2', zh: '森林狼', sprite: 'wolf', tier: 'normal', hp: 30, maxHp: 34, alive: true, atk: 9, atkSpeed: 1.1 }
  ],
  heroes: [
    { uid: 'h1', hp: 280, maxHp: 300, shield: 0, down: 0 },
    { uid: 'h2', hp: 180, maxHp: 180, shield: 0, down: 0 }
  ]
};

try {
  sandbox.Stage.sync(view, combat);
  ok(true, 'sync() 首次执行无异常');
  ok(sandbox.Stage.units.size === 4, `场上单位数正确（${sandbox.Stage.units.size} = 2 英雄 + 2 怪物）`);
  ok(sandbox.Stage.heroes.length === 2, '英雄列表正确');
  ok(sandbox.Stage.foes.length === 2, '敌人列表正确');
  ok(sandbox.Stage.runId === 'run_1', '记录了 runId');
} catch (e) {
  ok(false, 'sync 抛错: ' + e.message + '\n' + e.stack.split('\n')[1]);
}

console.log('\n== 5. 推进与波次切换 ==');
try {
  const c2 = JSON.parse(JSON.stringify(combat));
  c2.wave = 2;
  c2.enemies = [{ uid: 'e3', zh: '野猪', sprite: 'boar', tier: 'elite', hp: 200, maxHp: 210, alive: true, atk: 14, atkSpeed: 0.6 }];
  sandbox.Stage.sync(view, c2);
  ok(sandbox.Stage.foes.length === 1, '换波后旧怪物已清理');
  ok(sandbox.Stage.units.size === 3, `单位数更新为 ${sandbox.Stage.units.size}`);
} catch (e) {
  ok(false, '换波抛错: ' + e.message);
}

console.log('\n== 6. 怪物死亡掉落（真实流水）==');
try {
  const drops = registry.get('layer-drops');
  const before = drops.children.length;
  // 模拟：e3 死了，服务器在同一次快照里下发这条击杀掉落
  const c3 = JSON.parse(JSON.stringify(combat));
  c3.enemies = [{ uid: 'e3', zh: '野猪', sprite: 'boar', tier: 'normal', hp: 0, maxHp: 210, alive: false, atk: 14, atkSpeed: 0.6 }];
  c3.dropSeq = 1;
  c3.drops = [{ id: 1, t: 'gold', gold: 42, exp: 17, foeUid: 'e3', sprite: 'boar' }];
  sandbox.Stage.sync(view, c3);
  ok(sandbox.Stage.foes.length === 0, '死亡怪物已从场上移除');
  const added = drops.children.length - before;
  ok(added === 1, `按真实流水生成了 1 个掉落物（实际 ${added}）`);
  const loot = drops.children[drops.children.length - 1];
  ok(loot.className.includes('gold'), '掉落物标记为金币类型');
  ok(loot.innerHTML.includes('+42'), '显示服务器给的实际金币数');
  ok(!!sandbox.Stage.deathSpots.e3, '记住了 e3 的尸体坐标');
  ok(sandbox.Stage.seenDropId === 1, '去重游标推进到 1');
} catch (e) {
  ok(false, '掉落抛错: ' + e.message + '\n' + e.stack.split('\n')[1]);
}

console.log('\n== 7. 掉落去重与宝箱掉落 ==');
try {
  const drops = registry.get('layer-drops');
  // 同一份快照重推一次（服务器每秒推同一个 run），不能重复播
  const c4 = JSON.parse(JSON.stringify(combat));
  c4.wave = 1;
  c4.enemies = [];
  c4.dropSeq = 1;
  c4.drops = [{ id: 1, t: 'gold', gold: 42, exp: 17, foeUid: 'e3', sprite: 'boar' }];
  const before = drops.children.length;
  sandbox.Stage.sync(view, c4);
  ok(drops.children.length === before, '重复快照没有重复生成掉落物');

  // 新 run 的 id 会归零，必须能重新播
  const c5 = JSON.parse(JSON.stringify(c4));
  c5.runId = 'run_2';
  c5.dropSeq = 1;
  c5.drops = [{ id: 1, t: 'chest', chestType: 'boss', chestZh: '首领宝箱', gold: 900, itemCount: 2,
    items: [{ slot: 'weapon', rarity: 'Epic' }, { slot: 'ring', rarity: 'Legendary' }] }];
  const b2 = drops.children.length;
  sandbox.Stage.sync(view, c5);
  ok(drops.children.length === b2 + 1, '换 run 后同 id 的掉落能重新播放');
  const chest = drops.children[drops.children.length - 1];
  ok(chest.className.includes('chest'), '宝箱掉落标记为 chest 类型');
  ok(chest.innerHTML.includes('首领宝箱'), '显示宝箱名称');
  ok(chest.innerHTML.includes('2 件'), '显示箱内装备数量');
  // 注意：容器 class 是 chest-prevs，会被 chest-prev 的正则匹配到，
  // 所以必须带引号锚定 class="chest-prev" 才能数准
  ok((chest.innerHTML.match(/class="chest-prev"/g) || []).length === 2, '画出了 2 个装备预览图标');
  ok(chest.innerHTML.includes('chest-prevs'), '装备预览有独立容器');
} catch (e) {
  ok(false, '宝箱掉落抛错: ' + e.message + '\n' + e.stack.split('\n')[1]);
}

console.log('\n== 8. 掉落被捡走 ==');
try {
  const drops = registry.get('layer-drops');
  const n0 = sandbox.Stage.pendingLoot.length;
  ok(n0 > 0, `场上有 ${n0} 个待捡掉落物`);
  // 时间基准必须用 Date.now()：沙箱里 performance.now() 返回的是 Date.now()，
  // 而 Node 全局 performance.now() 是「进程启动至今」的毫秒数，量纲不同不能混用
  const t0 = Date.now() + 5000;
  sandbox.Stage.frame(t0);
  ok(sandbox.Stage.pendingLoot.length === 0, '超时后掉落物全部被捡走');
  // 用 dataset.collected 判定回收，用 classList 的内部集合判定样式类：
  // 桩的 classList.add 不回写 className 字符串（真实 DOM 会），所以查 _s 才是对桩的正确检查
  const left = drops.children.filter(c => c.dataset.collected !== '1').length;
  ok(left === 0, '没有残留未回收的掉落物');
  const tagged = drops.children.filter(c => c.classList.contains('collected')).length;
  ok(tagged === drops.children.length, `每个被捡的掉落物都加上了 collected 类（${tagged}/${drops.children.length}）`);
  // 再跑一帧不能因为空数组崩
  sandbox.Stage.frame(t0 + 60);
  ok(true, '掉落清空后继续跑帧不崩');
  // 延迟清理回调也要能安全执行
  flushTimers();
  ok(true, '延迟清理定时器全部执行完毕无异常');
  ok(drops.children.length === 0, '掉落物 DOM 已全部移除');
} catch (e) {
  ok(false, '捡取抛错: ' + e.message + '\n' + e.stack.split('\n')[1]);
}

console.log('\n== 9. 动画帧循环 ==');
try {
  for (let i = 0; i < 40; i++) sandbox.Stage.frame(Date.now() + 6000 + i * 60);
  ok(true, '连续 40 帧无异常');
} catch (e) {
  ok(false, '帧循环抛错: ' + e.message + '\n' + e.stack.split('\n')[1]);
}

console.log('\n== 10. 停止挂机 / 空状态 ==');
try {
  sandbox.Stage.sync({ ...view, running: false }, null);
  ok(true, '空战斗数据不崩');
  sandbox.Stage.sync({ heroes: [], running: false, inventory: [] }, null);
  ok(true, '空队伍不崩');
  sandbox.Stage.sync(view, { ...combat, drops: null });
  ok(true, '快照缺 drops 字段不崩');
} catch (e) {
  ok(false, '空状态抛错: ' + e.message);
}

console.log('\n== 11. 人物素材路径（真实引擎字段） ==');
try {
  // 背景：本组夹具刻意 **不带 sprite 字段**，与 engine 下发的 view.heroes[] 一致。
  // 此前夹具自己伪造了 sprite，导致素材路径拼错的问题测不出来：
  // 浏览器上表现为人物形象不显示、只剩 HTML 血条（血条不依赖图片）。
  const realView = {
    running: true,
    heroes: [
      // 真实引擎只给这些字段，没有 sprite
      { uid: 'r1', zh: '肾虚牛马', classId: 'niuma', level: 5, row: 'front', inParty: true,
        equipment: { weapon: null, helmet: null, armor: null, boots: null, ring: null, amulet: null },
        stats: { hp: 300, dps: 40, atk: 20, def: 18, crit: 5, critDmg: 1.5, atkSpeed: 0.95, hps: 8, ehp: 400 } },
      { uid: 'r2', zh: '肉蛋葱击使者', classId: 'roudan', level: 5, row: 'back', inParty: true,
        equipment: { weapon: null, helmet: null, armor: null, boots: null, ring: null, amulet: null },
        stats: { hp: 180, dps: 90, atk: 30, def: 9, crit: 8, critDmg: 1.6, atkSpeed: 1.45, hps: 0, ehp: 200 } }
    ],
    inventory: []
  };
  // heroSprite 的取值优先级：heroSprite > sprite > classId > 'niuma'
  ok(sandbox.StageUtils.heroSprite({ classId: 'niuma' }) === 'niuma', '只有 classId 时取 classId');
  ok(sandbox.StageUtils.heroSprite({ classId: 'roudan' }) === 'roudan', '只有 classId 时取 classId（第 2 个角色）');
  ok(sandbox.StageUtils.heroSprite({ sprite: 'x', classId: 'y' }) === 'x', '同时有 sprite 时优先 sprite');
  ok(sandbox.StageUtils.heroSprite({ heroSprite: 'z', classId: 'y' }) === 'z', 'heroSprite 字段优先级最高');
  ok(sandbox.StageUtils.heroSprite({}) === 'niuma', '字段全缺时有兜底，不拼出 undefined');
  ok(!/undefined/.test(sandbox.StageUtils.heroSprite({})), '兜底值里不含 undefined');

  // 用真实字段同步一次，直接检查 createHero 生成的 HTML。
  // 不遍历 DOM 子节点：DOM 桩的 innerHTML 存的是字符串，不会真的生成 IMG 元素，
  // 按 children 去找必然是 0 张，那是测试写法的问题而非渲染的问题。
  sandbox.Stage.sync(realView, combat);
  const heroUnits = sandbox.Stage.units
    ? [...sandbox.Stage.units.values()].filter(u => u.kind === 'hero')
    : [];
  ok(heroUnits.length === 2, `战场建出 ${heroUnits.length} 个英雄单位`);

  const allHtml = heroUnits.map(u => u.el.innerHTML || '').join('\n');
  const allSrc = [...allHtml.matchAll(/src="([^"]+)"/g)].map(m => m[1]);
  ok(allSrc.length === 8, `两个英雄共 8 张走路图（实际 ${allSrc.length}）`);
  ok(!/undefined/.test(allHtml), 'HTML 里不含 undefined 路径');
  ok(allSrc.filter(s => /niuma_walk_\d\.png$/.test(s)).length === 4, '肾虚牛马 4 帧路径正确');
  ok(allSrc.filter(s => /roudan_walk_\d\.png$/.test(s)).length === 4, '肉蛋葱击使者 4 帧路径正确');

  // 逐帧核对文件真实存在，避免路径写对了但文件没入库
  const fsx = require('fs');
  const pth = require('path');
  const assetDir = pth.join(__dirname, '..', 'public', 'assets', 'heroes');
  const missing = allSrc.filter(s => !fsx.existsSync(pth.join(assetDir, s.split('/').pop())));
  ok(missing.length === 0, `引用的 ${allSrc.length} 个素材文件全部存在（缺 ${missing.length} 个）`);

  // 复原夹具状态，避免影响后续用例
  sandbox.Stage.sync(view, combat);
} catch (e) {
  ok(false, '素材路径用例抛错: ' + e.message + '\n' + e.stack.split('\n')[1]);
}

console.log(`\n${fails ? '❌ 失败 ' + fails + ' 项' : '✅ 前端逻辑全部通过'}\n`);
process.exit(fails ? 1 : 0);
