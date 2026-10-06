/**
 * 角色素材预处理
 * ---------------------------------------------------------------------------
 * 原始素材是深蓝底的 RGB PNG（没有透明通道），不能直接叠到游戏场景上。
 * 这个脚本做三件事：
 *   1. 抠背景 —— 用「从四边向内连通扩散」的方式，只删掉与画面边缘相连的背景色，
 *      角色身上的深色衣服（同样是深蓝）不会被误删
 *   2. 降采样 —— 原图 1120x2240 太大，缩到网页合适的尺寸
 *   3. 切帧   —— 走路精灵表 4 帧横排，切成单帧文件，前端好切换
 *
 * 重新跑： node scripts/prep-assets.cjs
 * 换素材： 把新图丢进 public/assets/heroes/ 并改下面的 MANIFEST
 */

const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

const DIR = path.join(__dirname, '..', 'public', 'assets', 'heroes');
const SRC = path.join(__dirname, '..', 'assets-src', 'heroes');

// 素材清单：输入文件 -> 输出规格
const MANIFEST = [
  { src: 'niuma_full.png',  out: 'niuma_full.png',  targetH: 480, kind: 'portrait' },
  { src: 'roudan_full.png', out: 'roudan_full.png', targetH: 480, kind: 'portrait' },
  { src: 'niuma_walk.png',  out: 'niuma_walk',      targetH: 200, kind: 'sheet', frames: 4 },
  { src: 'roudan_walk.png', out: 'roudan_walk',     targetH: 200, kind: 'sheet', frames: 4 }
];

// 背景是极纯的深蓝 (0,0,32)，但角色有黑色描边 rgb(0,0,0)（dist≈33）
// 和深色衣物 rgb(15,21,39)（dist≈27）—— 阈值必须卡在 20，再高就会把描边一起吃掉。
const BG_TOL = 20;         // 颜色距离小于此值 -> 判为背景
const BG_TOL_EDGE = 30;    // 仅对「紧邻背景的像素」放宽，软化抗锯齿边（必须 < 33，否则描边会变淡）

function dist(a, b, c, r, g, bl) {
  const dr = r - a, dg = g - b, db = bl - c;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

/** 从四边做 flood fill，只抠与画面边缘连通的背景 */
function cutBackground(png) {
  const { width: W, height: H, data } = png;
  const idx = (x, y) => (y * W + x) * 4;

  // 背景色 = 四角像素中位数
  const corners = [[0, 0], [W - 1, 0], [0, H - 1], [W - 1, H - 1]].map(([x, y]) => {
    const i = idx(x, y);
    return [data[i], data[i + 1], data[i + 2]];
  });
  const bg = [0, 1, 2].map(k => {
    const s = corners.map(c => c[k]).sort((a, b) => a - b);
    return (s[1] + s[2]) / 2;
  });

  const isBg = new Uint8Array(W * H);
  const stack = [];
  const nearBg = (x, y) => {
    const i = (y * W + x) * 4;
    return dist(bg[0], bg[1], bg[2], data[i], data[i + 1], data[i + 2]);
  };

  const seed = (x, y) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const p = y * W + x;
    if (isBg[p]) return;
    if (nearBg(x, y) > BG_TOL) return;
    isBg[p] = 1;
    stack.push(x - 1, y, x + 1, y, x, y - 1, x, y + 1);
  };

  for (let x = 0; x < W; x++) { seed(x, 0); seed(x, H - 1); }
  for (let y = 0; y < H; y++) { seed(0, y); seed(W - 1, y); }
  // 注意：栈里存的是 [x, y] 成对入栈，弹出来时必须先 y 后 x
  while (stack.length) {
    const y = stack.pop(), x = stack.pop();
    seed(x, y);
  }

  // 边缘软化：不透明但紧挨背景、且颜色接近背景的像素（抗锯齿边）给半透明
  const alpha = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const p = y * W + x;
      if (isBg[p]) { alpha[p] = 0; continue; }
      const d = nearBg(x, y);
      if (d < BG_TOL_EDGE) {
        let touchesBg = false;
        for (let dy = -1; dy <= 1 && !touchesBg; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx, ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
            if (isBg[ny * W + nx]) { touchesBg = true; break; }
          }
        }
        if (touchesBg) {
          const t = (d - BG_TOL) / (BG_TOL_EDGE - BG_TOL);
          alpha[p] = Math.round(Math.max(0, Math.min(1, t)) * 255);
          continue;
        }
      }
      alpha[p] = 255;
    }
  }

  // 去噪：被 8 个不透明邻居包围的孤立透明孔洞恢复回来
  const fixed = alpha.slice();
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const p = y * W + x;
      if (alpha[p] !== 0) continue;
      let allOpaque = true;
      for (let dy = -1; dy <= 1 && allOpaque; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          if (alpha[(y + dy) * W + (x + dx)] === 0) { allOpaque = false; break; }
        }
      }
      if (allOpaque) { fixed[p] = 255; }
    }
  }

  for (let p = 0; p < W * H; p++) data[p * 4 + 3] = fixed[p];
  const cut = fixed.reduce((a, v) => a + (v === 0 ? 1 : 0), 0);
  return { bg, cut };
}

/**
 * 丢掉零星残片（比如切片时带进来的相邻帧角色的手）。
 * 注意：不能只留最大块 —— 走路帧里两腿分开、手臂离体都可能是独立连通块，
 * 所以判据是「小于最大块 6% 的块」才算残片。
 * 另外：sprite sheet 必须切片后再做，整图做会把其它三帧当残片删掉。
 */
function keepLargestBlob(png) {
  const { width: W, height: H, data } = png;
  const label = new Int32Array(W * H).fill(-1);
  const sizes = [];
  let cur = 0;

  for (let start = 0; start < W * H; start++) {
    if (label[start] !== -1 || data[start * 4 + 3] === 0) continue;
    const stack = [start];
    label[start] = cur;
    let size = 0;
    while (stack.length) {
      const p = stack.pop();
      size++;
      const x = p % W, y = (p / W) | 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const q = ny * W + nx;
          if (label[q] !== -1 || data[q * 4 + 3] === 0) continue;
          label[q] = cur;
          stack.push(q);
        }
      }
    }
    sizes.push(size);
    cur++;
  }
  if (sizes.length <= 1) return { removed: 0, blobs: sizes.length };

  const maxSize = Math.max(...sizes);
  const cut = maxSize * 0.06;
  let removed = 0;
  for (let p = 0; p < W * H; p++) {
    const l = label[p];
    if (l >= 0 && sizes[l] < cut) { data[p * 4 + 3] = 0; removed++; }
  }
  return { removed, blobs: sizes.length };
}

/** 裁掉四周全透明的空白边（带一点内边距） */
function trim(png, pad = 2) {
  const { width: W, height: H, data } = png;
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (data[(y * W + x) * 4 + 3] > 8) {
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) return png;
  x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad);
  x1 = Math.min(W - 1, x1 + pad); y1 = Math.min(H - 1, y1 + pad);
  const w = x1 - x0 + 1, h = y1 - y0 + 1;
  const out = new PNG({ width: w, height: h });
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const si = ((y + y0) * W + (x + x0)) * 4, di = (y * w + x) * 4;
      out.data[di] = data[si]; out.data[di + 1] = data[si + 1];
      out.data[di + 2] = data[si + 2]; out.data[di + 3] = data[si + 3];
    }
  }
  return out;
}

/** 面积平均降采样（比最近邻平滑，比我懒得写的 Lanczos 够用） */
function resize(png, targetH) {
  const { width: W, height: H, data } = png;
  const scale = targetH / H;
  const w = Math.max(1, Math.round(W * scale));
  const h = Math.max(1, Math.round(targetH));
  const out = new PNG({ width: w, height: h });
  const sx = W / w, sy = H / h;

  for (let y = 0; y < h; y++) {
    const y0 = Math.floor(y * sy), y1 = Math.min(H, Math.ceil((y + 1) * sy));
    for (let x = 0; x < w; x++) {
      const x0 = Math.floor(x * sx), x1 = Math.min(W, Math.ceil((x + 1) * sx));
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let yy = y0; yy < y1; yy++) {
        for (let xx = x0; xx < x1; xx++) {
          const i = (yy * W + xx) * 4;
          const av = data[i + 3] / 255;
          // 按 alpha 加权，避免透明像素把边缘染黑
          r += data[i] * av; g += data[i + 1] * av; b += data[i + 2] * av;
          a += av; n++;
        }
      }
      const di = (y * w + x) * 4;
      if (a > 0.001) {
        out.data[di] = Math.round(r / a);
        out.data[di + 1] = Math.round(g / a);
        out.data[di + 2] = Math.round(b / a);
        out.data[di + 3] = Math.round((a / n) * 255);
      } else {
        out.data[di] = out.data[di + 1] = out.data[di + 2] = 0;
        out.data[di + 3] = 0;
      }
    }
  }
  return out;
}

/** 把横向 sprite sheet 切成 frames 张（只负责切，裁边和对齐交给后面） */
function sliceSheet(png, frames) {
  const { width: W, height: H } = png;
  const fw = Math.floor(W / frames);
  const out = [];
  for (let f = 0; f < frames; f++) {
    const one = new PNG({ width: fw, height: H });
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < fw; x++) {
        const si = (y * W + (f * fw + x)) * 4, di = (y * fw + x) * 4;
        one.data[di] = png.data[si]; one.data[di + 1] = png.data[si + 1];
        one.data[di + 2] = png.data[si + 2]; one.data[di + 3] = png.data[si + 3];
      }
    }
    out.push(one);
  }
  return out;
}

/**
 * 把若干帧对齐到同一张画布上：水平居中 + 底部对齐（脚踩地）。
 * 必须在 resize 之前做，否则各帧宽窄不一，播放起来角色会左右抖、上下跳。
 */
function normalizeFrames(frames) {
  const maxH = Math.max(...frames.map(p => p.height));
  const maxW = Math.max(...frames.map(p => p.width));
  return frames.map(p => {
    const canvas = new PNG({ width: maxW, height: maxH });
    const ox = Math.floor((maxW - p.width) / 2);
    const oy = maxH - p.height;
    for (let y = 0; y < p.height; y++) {
      for (let x = 0; x < p.width; x++) {
        const si = (y * p.width + x) * 4, di = ((y + oy) * maxW + (x + ox)) * 4;
        canvas.data[di] = p.data[si]; canvas.data[di + 1] = p.data[si + 1];
        canvas.data[di + 2] = p.data[si + 2]; canvas.data[di + 3] = p.data[si + 3];
      }
    }
    return canvas;
  });
}

function write(file, png) {
  const buf = PNG.sync.write(png);
  fs.writeFileSync(path.join(DIR, file), buf);
  return { file, w: png.width, h: png.height, kb: Math.round(buf.length / 1024) };
}

// ---------------------------------------------------------------------------
console.log('\n角色素材预处理\n');
for (const m of MANIFEST) {
  const src = path.join(SRC, m.src);
  if (!fs.existsSync(src)) { console.log(`  跳过 ${m.src}（assets-src/heroes 下不存在）`); continue; }

  let png = PNG.sync.read(fs.readFileSync(src));
  const { bg, cut } = cutBackground(png);
  const pct = ((cut / (png.width * png.height)) * 100).toFixed(1);

  if (m.kind === 'portrait') {
    const blob = keepLargestBlob(png);
    console.log(`  ${m.src}  ${png.width}x${png.height}  背景 RGB(${bg.map(v => Math.round(v)).join(',')})  透明化 ${pct}%  残片清除 ${blob.removed}px`);
    png = trim(png);
    png = resize(png, m.targetH);
    const r = write(m.out, png);
    console.log(`     -> ${r.file}  ${r.w}x${r.h}  ${r.kb} KB`);
  } else {
    // sprite sheet：先切片，再逐帧去残片+裁边，然后统一画布，最后才缩放
    // （顺序不能乱：先 resize 再对齐会让各帧尺寸不一致，播放时角色会抖）
    const raw = sliceSheet(png, m.frames).map(f => {
      keepLargestBlob(f);
      return trim(f);
    });
    const frames = normalizeFrames(raw);
    console.log(`  ${m.src}  ${png.width}x${png.height}  背景 RGB(${bg.map(v => Math.round(v)).join(',')})  透明化 ${pct}%  ${m.frames} 帧`);
    frames.forEach((f, i) => {
      const scaled = resize(f, m.targetH);
      const r = write(`${m.out}_${i}.png`, scaled);
      console.log(`     -> ${r.file}  ${r.w}x${r.h}  ${r.kb} KB`);
    });
  }
}
console.log('\n完成。\n');
