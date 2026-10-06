/* ==========================================================================
   装备图标 & 角色立绘（穿戴展示）
   --------------------------------------------------------------------------
   图标用 9x9 的像素点阵画出来，再转成 SVG —— 和角色立绘的像素风统一，
   而且颜色能跟着稀有度走，不需要额外素材。
   ========================================================================== */
(function (global) {

  // 每个字符 '#' = 一个像素块
  const PIXEL_ART = {
    weapon: [
      '...##....',
      '...##....',
      '...##....',
      '...##....',
      '.######..',
      '...##....',
      '...##....',
      '..####...',
      '.........'
    ],
    helmet: [
      '..####...',
      '.######..',
      '########.',
      '##....##.',
      '##....##.',
      '########.',
      '.######..',
      '.........',
      '.........'
    ],
    armor: [
      '.##..##..',
      '########.',
      '########.',
      '##.##.##.',
      '##.##.##.',
      '########.',
      '.######..',
      '.######..',
      '.........'
    ],
    boots: [
      '.##......',
      '.##......',
      '.##......',
      '.##......',
      '.#####...',
      '.#####...',
      '.........',
      '.........',
      '.........'
    ],
    ring: [
      '...###...',
      '..##.##..',
      '.##...##.',
      '.##...##.',
      '..##.##..',
      '...###...',
      '.........',
      '.........',
      '.........'
    ],
    amulet: [
      '.##...##.',
      '#..#.#..#',
      '.#.....#.',
      '..#...#..',
      '...###...',
      '....#....',
      '...###...',
      '.........',
      '.........'
    ]
  };

  const SLOT_ZH = { weapon: '武器', helmet: '头盔', armor: '胸甲', boots: '靴子', ring: '戒指', amulet: '护符' };

  /** 生成一枚装备图标的 SVG 字符串 */
  function gearIcon(slot, color, size) {
    const art = PIXEL_ART[slot];
    if (!art) return '';
    const n = art.length;
    let rects = '';
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        if (art[y][x] === '#') rects += `<rect x="${x}" y="${y}" width="1" height="1"/>`;
      }
    }
    return `<svg class="gear-svg" viewBox="0 0 ${n} ${n}" width="${size || 26}" height="${size || 26}" ` +
      `shape-rendering="crispEdges" fill="${color || '#9aa3b2'}">${rects}</svg>`;
  }

  /** 带稀有度底框的图标（背包里用） */
  function gearChip(item, size) {
    const s = size || 34;
    return `<span class="gear-chip" style="border-color:${item.color};background:${hexA(item.color, 0.13)}">` +
      gearIcon(item.slot, item.color, s * 0.62) + `</span>`;
  }

  function hexA(hex, a) {
    const h = (hex || '#888888').replace('#', '');
    const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
    return `rgba(${r},${g},${b},${a})`;
  }

  // -------------------------------------------------------------------------
  //  角色立绘 + 穿戴展示
  //  gear 形如 { weapon: item|null, helmet: item|null, ... }
  //  原理：立绘上叠一层绝对定位的装备图标，位置按身体部位写死百分比
  // -------------------------------------------------------------------------
  const GEAR_SPOTS = {
    helmet: { top: '4%',  left: '50%', size: 30, label: '头' },
    armor:  { top: '33%', left: '50%', size: 34, label: '身' },
    weapon: { top: '40%', left: '88%', size: 30, label: '手' },
    boots:  { top: '88%', left: '50%', size: 26, label: '脚' },
    ring:   { top: '56%', left: '12%', size: 20, label: '' },
    amulet: { top: '20%', left: '12%', size: 22, label: '' }
  };

  /**
   * @param {object} opts { sprite, gear, width, showEmpty }
   */
  function heroFigure(opts) {
    const w = opts.width || 150;
    const gear = opts.gear || {};
    let layers = '';
    for (const slot of Object.keys(GEAR_SPOTS)) {
      const it = gear[slot];
      if (!it && !opts.showEmpty) continue;
      const spot = GEAR_SPOTS[slot];
      if (!it) {
        layers += `<span class="fig-slot empty" style="top:${spot.top};left:${spot.left}">` +
          gearIcon(slot, '#3a4055', spot.size * 0.6) + `</span>`;
        continue;
      }
      layers += `<span class="fig-slot" style="top:${spot.top};left:${spot.left}" title="${escAttr(it.zh)}">` +
        gearIcon(slot, it.color, spot.size) + `</span>`;
    }
    return `<div class="figure" style="width:${w}px">
        <img class="fig-img" src="assets/heroes/${opts.sprite}_full.png" alt="">
        ${layers}
      </div>`;
  }

  /** 战场里的小人（走路/待机） */
  function heroSprite(sprite, frames, height) {
    const h = height || 92;
    const imgs = [];
    for (let i = 0; i < frames; i++) {
      imgs.push(`<img src="assets/heroes/${sprite}_walk_${i}.png" style="height:${h}px">`);
    }
    return `<div class="sprite-anim" data-frames="${frames}">${imgs.join('')}</div>`;
  }

  function escAttr(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  global.GearUI = { gearIcon, gearChip, heroFigure, heroSprite, PIXEL_ART, SLOT_ZH, GEAR_SPOTS, hexA };
})(window);
