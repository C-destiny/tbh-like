/**
 * 符文语义图标生成
 * ---------------------------------------------------------------------------
 * 从代码定义的像素图案生成 18 类符文图标，输出到 public/assets/runes/rune-<key>.png。
 * 图标是项目自有素材（程序化绘制，非 Kenney 或任何第三方包），登记见 assets/LICENSES.md。
 *
 * 设计约束（对应 docs/rune-system-workbuddy-plan.md 第 5 节）：
 *   - 硬边像素风，源图 24×24，运行时 CSS 显示 32px + image-rendering: pixelated
 *   - 透明背景，四周 ≥2px 安全边距，主体占画布约 70%~80%
 *   - 外轮廓统一 1px 深色描边（outline() 自动生成）
 *   - 全套图标共用一套中性浅色盘 —— 分支色与状态色由 CSS 外环/底板提供，
 *     禁止烘进 PNG（同一图标会跨分支复用，例如 attack 同时用于成长与战斗分支）
 *   - 每个图标 ≤4 个主色，不含状态色；图标内不出现文字、数字、百分号或价格
 *
 * 重新跑： node scripts/prep-rune-assets.cjs
 */

const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

const OUT = path.join(__dirname, '..', 'public', 'assets', 'runes');
const SIZE = 24; // 源图基准尺寸

// 中性浅色盘（全套图标统一，不含分支色）
const INK = { r: 26, g: 30, b: 40 };      // 1px 深色描边
const MAIN = { r: 203, g: 213, b: 225 };  // 主体浅灰蓝
const DEEP = { r: 148, g: 163, b: 184 };  // 次级暗面
const HI = { r: 241, g: 245, b: 249 };    // 高光/亮部

/**
 * 新建一张带透明背景的画布
 */
function canvas() {
  return new PNG({ width: SIZE, height: SIZE });
}

/** 画布内安全写入一个像素 */
function put(png, x, y, color) {
  if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return;
  const i = (y * SIZE + x) * 4;
  png.data[i] = color.r; png.data[i + 1] = color.g; png.data[i + 2] = color.b; png.data[i + 3] = 255;
}

/** 清除一个矩形（恢复透明），用于在已填充形状里抠洞（如背包提手） */
function clearRect(png, x0, y0, x1, y1) {
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) continue;
      const i = (y * SIZE + x) * 4;
      png.data[i + 3] = 0;
    }
  }
}

/** 画一个实心矩形（含边界，坐标为闭区间） */
function rect(png, x0, y0, x1, y1, color) {
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) put(png, x, y, color);
  }
}

/**
 * 画一条 Bresenham 直线（任意斜率，1px 宽）。
 */
function line(png, x0, y0, x1, y1, color) {
  const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  let x = x0, y = y0;
  while (true) {
    put(png, x, y, color);
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; x += sx; }
    if (e2 < dx) { err += dx; y += sy; }
  }
}

/** 画一个实心圆（逐行填充） */
function circle(png, cx, cy, r, color) {
  for (let y = -r; y <= r; y++) {
    for (let x = -r; x <= r; x++) {
      if (x * x + y * y <= r * r) put(png, cx + x, cy + y, color);
    }
  }
}

/**
 * 偶奇规则多边形填充（射线法）。pts 为 [x, y] 顶点数组。
 * 逐行求交点后成对填充，支撑星形、箭头、闪电等凹多边形。
 */
function polygon(png, pts, color) {
  const ys = pts.map(p => p[1]);
  for (let y = Math.min(...ys); y <= Math.max(...ys); y++) {
    const xs = [];
    for (let i = 0; i < pts.length; i++) {
      const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % pts.length];
      if ((y1 <= y && y2 > y) || (y2 <= y && y1 > y)) {
        xs.push(x1 + (y - y1) / (y2 - y1) * (x2 - x1));
      }
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      for (let x = Math.round(xs[k]); x <= Math.round(xs[k + 1]); x++) put(png, x, y, color);
    }
  }
}

/** 以中心 (cx,cy)、外径 R、内径 r 生成 n 角星形顶点 */
function starPoints(cx, cy, spikes, R, r, rotDeg = -90) {
  const pts = [];
  for (let i = 0; i < spikes * 2; i++) {
    const a = (rotDeg + i * 180 / spikes) * Math.PI / 180;
    const rad = i % 2 === 0 ? R : r;
    pts.push([Math.round(cx + Math.cos(a) * rad), Math.round(cy + Math.sin(a) * rad)]);
  }
  return pts;
}

/**
 * 给已绘制的图形加 1px 深色描边：不透明像素的 4 邻域有透明者置为描边色。
 * 必须在所有主体绘制完成后再调用。
 */
function outline(png) {
  const copy = Buffer.from(png.data);
  const opaque = (x, y) => {
    if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return false;
    return copy[(y * SIZE + x) * 4 + 3] > 0;
  };
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const i = (y * SIZE + x) * 4;
      if (copy[i + 3] === 0) continue;
      if (!opaque(x - 1, y) || !opaque(x + 1, y) || !opaque(x, y - 1) || !opaque(x, y + 1)) {
        png.data[i] = INK.r; png.data[i + 1] = INK.g; png.data[i + 2] = INK.b;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// 18 类图标绘制函数（与 engine/data/runes.js 的键一一对应）
// ---------------------------------------------------------------------------

/** 核心：菱形宝石 */
function drawCore() {
  const p = canvas();
  polygon(p, [[12, 3], [21, 12], [12, 21], [3, 12]], MAIN);
  polygon(p, [[12, 8], [16, 12], [12, 16], [8, 12]], DEEP);
  rect(p, 11, 11, 12, 12, HI);
  outline(p);
  return p;
}

/** 阵容：三个人形 */
function drawFormation() {
  const p = canvas();
  for (const cx of [6, 12, 18]) {
    circle(p, cx, 8, 2, MAIN);
    rect(p, cx - 2, 11, cx + 2, 17, MAIN);
  }
  outline(p);
  return p;
}

/** 技能：五角星 */
function drawSkill() {
  const p = canvas();
  polygon(p, starPoints(12, 12, 5, 9, 4), MAIN);
  outline(p);
  return p;
}

/** 生命：十字 */
function drawHealth() {
  const p = canvas();
  rect(p, 9, 5, 14, 18, MAIN);
  rect(p, 5, 9, 18, 14, MAIN);
  rect(p, 10, 7, 13, 9, HI);
  outline(p);
  return p;
}

/** 防御：盾牌 */
function drawDefense() {
  const p = canvas();
  polygon(p, [[12, 3], [19, 6], [19, 12], [12, 20], [5, 12], [5, 6]], MAIN);
  rect(p, 11, 6, 12, 16, DEEP);
  outline(p);
  return p;
}

/** 攻击：竖直剑 */
function drawAttack() {
  const p = canvas();
  rect(p, 10, 3, 13, 13, HI);       // 剑身（最亮 = 金属）
  rect(p, 10, 3, 13, 4, MAIN);      // 剑尖暗一格
  rect(p, 7, 14, 16, 15, DEEP);     // 护手
  rect(p, 11, 16, 12, 18, MAIN);    // 剑柄
  rect(p, 10, 19, 13, 20, DEEP);    // 柄尾
  outline(p);
  return p;
}

/** 金币：双圈圆币 */
function drawGold() {
  const p = canvas();
  circle(p, 12, 12, 8, MAIN);
  circle(p, 12, 12, 5, DEEP);
  rect(p, 11, 9, 12, 15, HI);
  outline(p);
  return p;
}

/** 炼金：圆底烧瓶 */
function drawAlchemy() {
  const p = canvas();
  rect(p, 10, 3, 13, 7, MAIN);
  circle(p, 12, 14, 6, MAIN);
  rect(p, 8, 13, 16, 14, DEEP);
  outline(p);
  return p;
}

/** 分支终点：皇冠 */
function drawCrown() {
  const p = canvas();
  rect(p, 5, 14, 18, 17, MAIN);
  rect(p, 5, 8, 8, 14, MAIN);
  rect(p, 10, 5, 13, 14, MAIN);
  rect(p, 15, 8, 18, 14, MAIN);
  rect(p, 11, 15, 12, 16, HI);
  outline(p);
  return p;
}

/** 背包：带提手的袋子 */
function drawBag() {
  const p = canvas();
  rect(p, 9, 5, 14, 8, MAIN);       // 提手
  clearRect(p, 10, 6, 13, 7);       // 提手中空
  rect(p, 6, 8, 17, 19, MAIN);      // 袋身
  rect(p, 6, 11, 17, 12, DEEP);     // 袋口束带
  outline(p);
  return p;
}

/** 仓库：带锁孔的箱子 */
function drawStash() {
  const p = canvas();
  rect(p, 5, 9, 18, 19, MAIN);
  rect(p, 5, 12, 18, 13, DEEP);
  rect(p, 11, 14, 12, 17, HI);
  outline(p);
  return p;
}

/** 自动开箱：宝箱 + 闪电 */
function drawAutoChest() {
  const p = canvas();
  rect(p, 4, 11, 15, 19, MAIN);     // 箱体（偏左）
  rect(p, 4, 13, 15, 14, DEEP);     // 箱盖缝
  // 闪电（六点轮廓，标准闪电剪影）
  polygon(p, [[18, 3], [12, 11], [15, 11], [10, 19], [16, 10], [13, 10]], HI);
  outline(p);
  return p;
}

/** 冷却缩减：秒表 */
function drawTimer() {
  const p = canvas();
  rect(p, 10, 3, 13, 5, MAIN);      // 顶部按钮
  circle(p, 12, 13, 7, MAIN);
  circle(p, 12, 13, 5, DEEP);
  rect(p, 11, 9, 12, 13, HI);       // 指针
  outline(p);
  return p;
}

/** 宝箱 */
function drawChest() {
  const p = canvas();
  rect(p, 5, 10, 18, 19, MAIN);
  rect(p, 5, 12, 18, 13, DEEP);
  rect(p, 11, 13, 12, 16, HI);
  outline(p);
  return p;
}

/** 稀有度：宝石钻石 */
function drawRarity() {
  const p = canvas();
  polygon(p, [[12, 4], [19, 10], [12, 20], [5, 10]], MAIN);
  polygon(p, [[12, 8], [16, 10], [12, 17], [8, 10]], DEEP);
  outline(p);
  return p;
}

/** 攻速：实心箭头 */
function drawSpeed() {
  const p = canvas();
  rect(p, 4, 10, 13, 14, MAIN);
  polygon(p, [[13, 4], [21, 12], [13, 20]], MAIN);
  outline(p);
  return p;
}

/** 暴击：八芒爆裂 */
function drawCritical() {
  const p = canvas();
  polygon(p, starPoints(12, 12, 8, 10, 5), MAIN);
  circle(p, 12, 12, 3, DEEP);
  outline(p);
  return p;
}

/** 经验：书 */
function drawExperience() {
  const p = canvas();
  rect(p, 6, 5, 17, 19, MAIN);
  rect(p, 6, 5, 8, 19, DEEP);       // 书脊
  rect(p, 15, 7, 16, 17, HI);       // 书页边
  outline(p);
  return p;
}

// 图标键 -> 绘制函数
const ICONS = {
  core: drawCore,
  formation: drawFormation,
  skill: drawSkill,
  health: drawHealth,
  defense: drawDefense,
  attack: drawAttack,
  gold: drawGold,
  alchemy: drawAlchemy,
  crown: drawCrown,
  bag: drawBag,
  stash: drawStash,
  'auto-chest': drawAutoChest,
  timer: drawTimer,
  chest: drawChest,
  rarity: drawRarity,
  speed: drawSpeed,
  critical: drawCritical,
  experience: drawExperience
};

// ---------------------------------------------------------------------------

function write(file, png) {
  const buf = PNG.sync.write(png);
  fs.writeFileSync(path.join(OUT, file), buf);
  return { file, kb: Math.round(buf.length / 1024) };
}

console.log('\n符文图标生成\n');
let count = 0;
for (const [key, draw] of Object.entries(ICONS)) {
  const png = draw();
  const r = write(`rune-${key}.png`, png);
  console.log(`  -> ${r.file}  ${png.width}x${png.height}  ${r.kb} KB`);
  count++;
}
console.log(`\n完成。共生成 ${count} 张图标。\n`);
