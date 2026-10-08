/* ==========================================================================
   符文树渲染模块
   职责：坐标计算、SVG 依赖连线、节点四态渲染、详情面板、桌面树 + 小屏列表。
   本文件不定义任何价格、效果数值或依赖关系 —— 全部读服务器下发的
   gd.runes / gd.runeBranches；购买永远走 App.act('buyRune')（服务器权威）。
   ========================================================================== */
(function () {
  // 画布几何常量（逻辑像素）。900×680 可容纳最多的 9 环财富分支：
  // 纵向 340±(56+8×28+22)=±302 在界内；斜向分支横向 0.707×280+22+16≈236 < 450。
  const CANVAS_W = 900;
  const CANVAS_H = 680;
  const CX = CANVAS_W / 2;
  const CY = CANVAS_H / 2;
  const RING1 = 56;   // 第一环到中心的距离（避开 44px 核心节点）
  const SPACING = 28; // 相邻两环沿分支方向的间距；配合 ±16 之字偏移，相邻节点中心距 ≈42
  const ZIGZAG = 16;  // 偶数环沿分支法线方向的偏移，避免同支节点在同一直线上相互重叠

  // ---- 会话内状态（跨服务器状态推送保持，重建后也能恢复）----
  let selectedId = null; // 详情面板当前展示的节点
  let focusId = null;    // 结构重建后需要恢复键盘焦点的节点
  let collapsed = {};    // 小屏列表各分支的折叠表
  let cache = null;      // 增量更新的元素缓存

  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const n = (v) => Math.round(v || 0).toLocaleString('en-US');

  // ---- 效果键的显示文案（纯标签映射，不含数值规则；数值全部来自服务器数据）----
  const EFFECT_ZH = {
    partyAtkPct: '队伍攻击', partyHpPct: '队伍生命', partyDefPct: '队伍防御',
    partyAtkSpeedPct: '攻击速度', partyCritRate: '暴击率', partyCritDmg: '暴击伤害',
    goldPct: '金币获取', expPct: '经验获取', bossGoldPct: '首领金币',
    alchemyPct: '炼金收益', chestRate: '宝箱掉率', rarityPct: '稀有度',
    chestCdPct: '开箱冷却', offlineGoldPct: '离线金币', offlineExpPct: '离线经验'
  };
  const EFFECT_FLAT_ZH = {
    partySlot: '阵容槽位', skillSlot: '技能槽位', bagSlots: '背包格',
    stashSlots: '仓库格', chestCap: '宝箱上限'
  };
  const AUTO_OPEN_ZH = { common: '自动开启普通/精良宝箱', boss: '自动开启首领宝箱' };

  /** 把节点 effects 翻译成人类可读的行（百分比键 ×100，扁平键原值） */
  function effectLines(effects) {
    const out = [];
    for (const [k, v] of Object.entries(effects || {})) {
      if (k === 'autoOpen') { out.push(AUTO_OPEN_ZH[v] || String(v)); continue; }
      if (EFFECT_FLAT_ZH[k]) { out.push(`${EFFECT_FLAT_ZH[k]} +${v}`); continue; }
      if (EFFECT_ZH[k]) { out.push(`${EFFECT_ZH[k]} +${Math.round(v * 100)}%`); continue; }
      out.push(`${k} +${v}`); // 未知键兜底显示原键，禁止静默丢弃加成信息
    }
    return out;
  }

  /**
   * 四态判定（文档 4.3）。这是服务器 canUnlock 规则的只读展示投影：
   * 不写状态、不扣金币；真正的购买判定与扣费只发生在服务器。
   */
  function statusOf(r, view) {
    if (view.runes[r.id]) return 'owned';
    const reqOk = (r.requires || []).every(x => view.runes[x]);
    if (!reqOk) return 'locked';
    return view.gold >= r.cost ? 'affordable' : 'reachable';
  }

  /** 节点画布圆心坐标：核心居中，其余按分支 angle 放射 + 等距 + 之字偏移 */
  function nodePos(r) {
    if (r.branch === 'core') return { x: CX, y: CY };
    const rad = RING1 + (r.ring - 1) * SPACING;
    const a = (r.angle ?? 0) * Math.PI / 180;
    // 之字偏移沿分支法线方向：法线 = (-sin, cos)
    const perp = (r.ring % 2 === 0 ? 1 : -1) * ZIGZAG;
    return {
      x: CX + Math.cos(a) * rad - Math.sin(a) * perp,
      y: CY + Math.sin(a) * rad + Math.cos(a) * perp
    };
  }

/** 节点角标：已点亮勾标记；未解锁 CSS 画的小锁（禁止用 Emoji 当图标） */
function badgeHtml(st) {
  if (st === 'owned') return '<span class="rune-badge ok">✓</span>';
  if (st === 'locked') return '<span class="rune-badge lock"></span>';
  return '';
}

/** 小屏列表一行的内部结构（build 与增量 update 共用，避免两份标记不一致） */
  function rowInner(r, view) {
    const st = statusOf(r, view);
    const canBuy = st === 'affordable';
    return `<img src="assets/runes/rune-${r.icon}.png" alt="" width="24" height="24">
      <div class="rune-row-main"><b>${esc(r.name)}</b>
        <span class="tiny ${st === 'reachable' ? 'rune-cost-bad' : 'muted'}">${n(r.cost)} 金</span></div>
      ${st === 'owned' ? '<span class="tiny gold">✓</span>'
        : `<button class="sm rune-buy" data-act="buy" data-id="${r.id}"${canBuy ? '' : ' disabled'}>点亮</button>`}`;
  }

  /** 顶部摘要条：点亮数 / 金币 / 分支图例 */
  function headHtml(ctx) {
    const { gd, view } = ctx;
    const ownedN = Object.values(view.runes).filter(Boolean).length;
    const legend = Object.entries(gd.runeBranches || {}).map(([b, br]) =>
      `<span class="lg" title="${esc(br.description || '')}"><i style="background:${br.color}"></i>${esc(br.zh || b)}</span>`).join('');
    return `<span>已点亮 <b>${ownedN}/${gd.runes.length}</b></span>
      <span class="gold">💰 <b>${n(view.gold)}</b></span>
      <span class="rune-legend">${legend}</span>`;
  }

  /** 推荐区：前置已满足的最便宜节点（保留旧能力，但不替代主树） */
  function suggestHtml(ctx) {
    const { gd, view } = ctx;
    const cheapest = gd.runes
      .filter(r => !view.runes[r.id] && (r.requires || []).every(x => view.runes[x]))
      .sort((a, b) => a.cost - b.cost).slice(0, 5);
    if (!cheapest.length) return '';
    return '<div class="rune-suggest-wrap"><div class="rune-suggest"><span class="small muted">推荐：</span>' +
      cheapest.map(r => `<button class="sm ${view.gold >= r.cost ? 'good' : ''}" data-act="buy" data-id="${r.id}"${view.gold >= r.cost ? '' : ' disabled'}>${esc(r.name)} · ${n(r.cost)}</button>`).join('') +
      '</div></div>';
  }

  /** 详情面板：图标 / 名称 / 分支 / 效果 / 价格 / 前置 / 状态 / 失败原因 / 点亮按钮 */
  function detailHtml(ctx) {
    const { gd, view } = ctx;
    const r = gd.runes.find(x => x.id === selectedId);
    if (!r) return '<div class="rd-empty small muted">点击任意节点查看详情</div>';
    const br = gd.runeBranches[r.branch] || {};
    const st = statusOf(r, view);
    const nameOf = (id) => (gd.runes.find(y => y.id === id) || {}).name || id;
    const missing = (r.requires || []).filter(x => !view.runes[x]).map(nameOf);
    const req = (r.requires || []).map(nameOf);
    // 失败原因必须具体到"差多少 / 缺哪个"，不能只写"不可购买"
    let stateZh;
    if (st === 'owned') stateZh = '已点亮';
    else if (st === 'locked') stateZh = `需先点亮：${esc(missing.join('、'))}`;
    else if (st === 'reachable') stateZh = `金币不足，还差 ${n(r.cost - view.gold)}`;
    else stateZh = '条件满足，可以点亮';
    const fx = effectLines(r.effects).map(t => `<div>· ${esc(t)}</div>`).join('')
      || '<div class="muted">无加成（解锁型节点）</div>';
    return `
      <div class="rd-head">
        <img src="assets/runes/rune-${r.icon}.png" alt="" width="32" height="32">
        <div><b>${esc(r.name)}</b>
          <div class="tiny muted">${esc(br.zh || r.branch)} · ${esc(br.description || '')}</div></div>
      </div>
      <div class="rd-sec"><span class="tiny muted">效果</span>${fx}</div>
      <div class="rd-sec"><span class="tiny muted">价格</span>
        <b class="${st === 'reachable' ? 'rune-cost-bad' : 'gold'}">${n(r.cost)} 金币</b></div>
      ${req.length ? `<div class="rd-sec"><span class="tiny muted">前置</span>${esc(req.join('、'))}</div>` : ''}
      <div class="rd-sec"><span class="tiny muted">状态</span>${stateZh}</div>
      ${st === 'owned' ? '' : `<button class="primary rune-buy" data-act="buy" data-id="${r.id}"${st === 'affordable' ? '' : ' disabled'}>点亮</button>`}`;
  }

  /** 小屏列表：按分支分组的可折叠纵向列表，节点严格按 ring 排列 */
  function listHtml(ctx) {
    const { gd, view } = ctx;
    const byBranch = {};
    for (const r of gd.runes) (byBranch[r.branch] = byBranch[r.branch] || []).push(r);
    let h = '<div class="rune-list">';
    for (const [b, list] of Object.entries(byBranch)) {
      const br = gd.runeBranches[b] || {};
      const ownedN = list.filter(r => view.runes[r.id]).length;
      const sorted = [...list].sort((a, b2) => a.ring - b2.ring);
      h += `<div class="rune-branch${collapsed[b] ? ' is-collapsed' : ''}" data-branch="${b}">
        <button class="rune-branch-head" data-branch="${b}" title="${esc(br.description || '')}">
          <i style="background:${br.color}"></i><span>${esc(br.zh || b)}</span>
          <span class="tiny muted">${ownedN}/${list.length}</span></button>
        <div class="rune-branch-body">`;
      for (const r of sorted) {
        const sel = selectedId === r.id ? ' is-selected' : '';
        h += `<div class="rune-row st-${statusOf(r, view)}${sel}" data-id="${r.id}">${rowInner(r, view)}</div>`;
      }
      h += '</div></div>';
    }
    return h + '</div>';
  }

  /** 首次构建：画布（连线 + 节点）、详情面板、小屏列表、推荐区，并缓存元素引用 */
  function build(root, ctx) {
    const { gd, view } = ctx;
    const branches = gd.runeBranches || {};
    if (!selectedId) selectedId = 'war_1'; // 默认选中核心，详情面板不空白

    // 连线先画（SVG 在节点下层），数量 = 全部依赖边数
    let edges = '';
    const posCache = {};
    for (const r of gd.runes) posCache[r.id] = nodePos(r);
    for (const r of gd.runes) {
      for (const req of r.requires || []) {
        const a = posCache[req], b = posCache[r.id];
        edges += `<line class="rune-edge" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"` +
          ` stroke="${(branches[r.branch] || {}).color || '#888'}" />`;
      }
    }

    let nodes = '';
    for (const r of gd.runes) {
      const p = posCache[r.id];
      const st = statusOf(r, view);
      const sel = selectedId === r.id ? ' is-selected' : '';
      nodes += `<button class="rune-node st-${st}${sel}" style="left:${p.x - 22}px;top:${p.y - 22}px;--bc:${(branches[r.branch] || {}).color || '#888'}"` +
        ` data-id="${r.id}" title="${esc(r.name)} · ${n(r.cost)}金">` +
        `<img class="rune-ico" src="assets/runes/rune-${r.icon}.png" alt="" width="24" height="24">${badgeHtml(st)}</button>`;
    }

    root.innerHTML = `
      <div class="rune-head">${headHtml(ctx)}</div>
      <div class="rune-tree"><div class="rune-canvas" style="width:${CANVAS_W}px;height:${CANVAS_H}px">
        <svg class="rune-svg" width="${CANVAS_W}" height="${CANVAS_H}" viewBox="0 0 ${CANVAS_W} ${CANVAS_H}">${edges}</svg>
        ${nodes}
      </div></div>
      <div class="rune-detail"></div>
      ${listHtml(ctx)}
      ${suggestHtml(ctx)}`;

    // 初始滚动：把核心节点滚到视口中央；只在首次构建时做，避免打断用户浏览位置
    const tree = root.querySelector('.rune-tree');
    if (tree && tree.scrollLeft !== undefined) {
      tree.scrollLeft = (CANVAS_W - tree.clientWidth) / 2;
      tree.scrollTop = (CANVAS_H - tree.clientHeight) / 2;
    }

    cache = {
      root,
      nodes: new Map([...root.querySelectorAll('.rune-node')].map(el => [el.dataset.id, el])),
      rows: new Map([...root.querySelectorAll('.rune-row')].map(el => [el.dataset.id, el])),
      detail: root.querySelector('.rune-detail'),
      head: root.querySelector('.rune-head'),
      suggest: root.querySelector('.rune-suggest-wrap'),
      tree
    };

    wireEvents(root, ctx);
    refreshDetail(ctx);
    restoreFocus();
  }

  /** 增量更新：服务器每秒推状态，只改类名 / 角标 / 按钮，不重建结构。
      这样滚动位置、键盘焦点和选中态都不会被打断（文档验收清单要求键盘可用）。 */
  function update(root, ctx) {
    const { gd, view } = ctx;
    if (cache.head) cache.head.innerHTML = headHtml(ctx);
    for (const r of gd.runes) {
      const st = statusOf(r, view);
      const node = cache.nodes.get(r.id);
      if (node) {
        node.className = `rune-node st-${st}${selectedId === r.id ? ' is-selected' : ''}`;
        node.innerHTML = `<img class="rune-ico" src="assets/runes/rune-${r.icon}.png" alt="" width="24" height="24">${badgeHtml(st)}`;
      }
      const row = cache.rows.get(r.id);
      if (row) {
        row.className = `rune-row st-${st}${selectedId === r.id ? ' is-selected' : ''}`;
        row.innerHTML = rowInner(r, view);
      }
    }
    refreshDetail(ctx);
    // 推荐区随金币变化：整块替换（包一层 wrap 以便定位）
    if (cache.suggest) {
      const fresh = document.createElement('div');
      fresh.innerHTML = suggestHtml(ctx);
      const next = fresh.firstChild;
      if (next) cache.suggest.replaceWith(next);
      else cache.suggest.remove();
      cache.suggest = root.querySelector('.rune-suggest-wrap');
    }
  }

  function refreshDetail(ctx) {
    if (cache && cache.detail) cache.detail.innerHTML = detailHtml(ctx);
  }

  /** 选中变化：只切换类名 + 重画详情，不动整棵树 */
  function refreshSelection(ctx) {
    if (!cache) return;
    for (const [id, el] of cache.nodes) el.classList.toggle('is-selected', id === selectedId);
    for (const [id, el] of cache.rows) el.classList.toggle('is-selected', id === selectedId);
    refreshDetail(ctx);
  }

  /** 结构重建后恢复键盘焦点（focusId 在每次选中时记录） */
  function restoreFocus() {
    if (!focusId || !cache) return;
    const el = cache.nodes.get(focusId) || cache.rows.get(focusId);
    if (el && el.focus) {
      try { el.focus({ preventScroll: true }); } catch (_) { el.focus(); }
    }
  }

  /** 事件委托绑在容器上：innerHTML 更新不丢失处理器。
      节点点击 = 只选中；购买必须点明确按钮（data-act="buy"），防误触。 */
  function wireEvents(root, ctx) {
    root.onclick = (e) => {
      const buy = e.target.closest('[data-act="buy"]');
      if (buy) {
        if (buy.disabled) return;
        ctx.act('buyRune', { runeId: buy.dataset.id });
        return;
      }
      const head = e.target.closest('.rune-branch-head');
      if (head) {
        const b = head.dataset.branch;
        collapsed[b] = !collapsed[b];
        head.parentElement.classList.toggle('is-collapsed', collapsed[b]);
        return;
      }
      const node = e.target.closest('.rune-node, .rune-row');
      if (node && node.dataset.id) {
        selectedId = node.dataset.id;
        focusId = node.dataset.id;
        refreshSelection(ctx);
      }
    };
  }

  /**
   * 渲染入口
   * @param {Element} root 符文页容器（renderTab 保证其跨状态推送持久存在）
   * @param {{gd: object, view: object, act: Function}} ctx 服务器数据与购买回调
   */
  function render(root, ctx) {
    if (!root || !ctx || !ctx.gd || !ctx.view) return;
    if (cache && cache.root === root) update(root, ctx);
    else build(root, ctx);
  }

  window.RuneUI = { render };
})();
