/**
 * 第一幕世界素材预处理
 * ---------------------------------------------------------------------------
 * 从 Kenney Tiny Dungeon 单图中选取怪物、宝箱和环境图块，统一按整数倍最近邻放大。
 * 源图保持不变，浏览器只读取 public/assets/world/ 产物。
 */

const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

const SOURCE_DIR = path.join(__dirname, '..', 'assets-src', 'kenney', 'tiny-dungeon', 'Tiles');
const OUTPUT_DIR = path.join(__dirname, '..', 'public', 'assets', 'world');
const TILE_SCALE = 4;
const BOSS_SCALE = 6;

// 一幕怪物优先保证轮廓差异；名称语义由游戏数据负责，素材层只提供稳定的 sprite 键。
const MANIFEST = [
  { source: 'tile_0108.png', output: 'monster-slime.png' },
  { source: 'tile_0123.png', output: 'monster-wolf.png' },
  { source: 'tile_0096.png', output: 'monster-bandit.png' },
  { source: 'tile_0122.png', output: 'monster-bat.png' },
  { source: 'tile_0120.png', output: 'monster-boar.png' },
  { source: 'tile_0121.png', output: 'monster-skeleton.png' },
  { source: 'tile_0110.png', output: 'monster-ogre.png' },
  { source: 'tile_0112.png', output: 'monster-treant.png', scale: BOSS_SCALE },
  { source: 'tile_0089.png', output: 'chest-common.png' },
  { source: 'tile_0090.png', output: 'chest-fine.png' },
  { source: 'tile_0091.png', output: 'chest-boss.png' },
  { source: 'tile_0092.png', output: 'chest-act-boss.png' },
  { source: 'tile_0066.png', output: 'drop-coin.png' },
  { source: 'tile_0048.png', output: 'ground-sand.png' },
  { source: 'tile_0049.png', output: 'ground-speckle.png' },
  { source: 'tile_0014.png', output: 'wall-brick.png' }
];

/**
 * 以最近邻方式整数倍放大 PNG，保证像素边缘不被插值污染。
 * @param {PNG} source 源图；不会被修改
 * @param {number} scale 正整数缩放倍数
 * @returns {PNG} 放大后的新图
 */
function scaleNearest(source, scale) {
  const output = new PNG({ width: source.width * scale, height: source.height * scale });
  for (let y = 0; y < output.height; y++) {
    for (let x = 0; x < output.width; x++) {
      // 整数除法让每个源像素精确复制 scale×scale 次，不引入半透明插值边。
      const sourceX = Math.floor(x / scale);
      const sourceY = Math.floor(y / scale);
      const sourceIndex = (sourceY * source.width + sourceX) * 4;
      const outputIndex = (y * output.width + x) * 4;
      source.data.copy(output.data, outputIndex, sourceIndex, sourceIndex + 4);
    }
  }
  return output;
}

fs.mkdirSync(OUTPUT_DIR, { recursive: true });
console.log('\n第一幕世界素材预处理\n');
for (const item of MANIFEST) {
  const scale = item.scale || TILE_SCALE;
  const sourcePath = path.join(SOURCE_DIR, item.source);
  if (!fs.existsSync(sourcePath)) throw new Error(`缺少源素材：${sourcePath}`);
  const source = PNG.sync.read(fs.readFileSync(sourcePath));
  const output = scaleNearest(source, scale);
  const buffer = PNG.sync.write(output);
  fs.writeFileSync(path.join(OUTPUT_DIR, item.output), buffer);
  console.log(`  ${item.source} -> ${item.output}  ${output.width}x${output.height}`);
}
console.log('\n完成。\n');
