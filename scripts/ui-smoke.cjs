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

let rafQueue = [];
const sandbox = {
  console, document,
  window: {},
  requestAnimationFrame: (fn) => { rafQueue.push(fn); return rafQueue.length; },
  performance: { now: () => Date.now() },
  setTimeout: (fn) => { try { fn(); } catch (e) { throw e; } return 0; },
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
  stageId: '1-1', difficulty: 'Normal', wave: 1, waveCount: 5, phase: 'fighting', elapsed: 10,
  kills: 3, gold: 30, exp: 40,
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

console.log('\n== 6. 怪物死亡掉落 ==');
try {
  const c3 = JSON.parse(JSON.stringify(combat));
  c3.enemies = [{ uid: 'e3', zh: '野猪', sprite: 'boar', tier: 'actBoss', hp: 0, maxHp: 210, alive: false, atk: 14, atkSpeed: 0.6 }];
  sandbox.Stage.sync(view, c3);
  ok(sandbox.Stage.foes.length === 0, '死亡怪物已从场上移除');
  const drops = registry.get('layer-drops');
  ok(drops.children.length > 0, `生成了掉落物（${drops.children.length} 个）`);
} catch (e) {
  ok(false, '掉落抛错: ' + e.message);
}

console.log('\n== 7. 动画帧循环 ==');
try {
  for (let i = 0; i < 40; i++) sandbox.Stage.frame(performance.now() + i * 60);
  ok(true, '连续 40 帧无异常');
} catch (e) {
  ok(false, '帧循环抛错: ' + e.message + '\n' + e.stack.split('\n')[1]);
}

console.log('\n== 8. 停止挂机 / 空状态 ==');
try {
  sandbox.Stage.sync({ ...view, running: false }, null);
  ok(true, '空战斗数据不崩');
  sandbox.Stage.sync({ heroes: [], running: false, inventory: [] }, null);
  ok(true, '空队伍不崩');
} catch (e) {
  ok(false, '空状态抛错: ' + e.message);
}

console.log(`\n${fails ? '❌ 失败 ' + fails + ' 项' : '✅ 前端逻辑全部通过'}\n`);
process.exit(fails ? 1 : 0);
