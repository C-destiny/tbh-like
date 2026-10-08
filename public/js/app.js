/* ==========================================================================
   TBH-like 玩家端
   服务器是权威，这里只负责渲染 + 发指令
   ========================================================================== */
(function () {
  const S = {
    view: null,
    gd: null,          // 静态游戏数据
    tab: 'party',
    token: localStorage.getItem('tbh_token') || '',
    pid: localStorage.getItem('tbh_pid') || '',
    connected: false,
    cubeSel: [],       // 魔方已选中的装备
    craftOpts: { slot: '', ilvl: 30 }
  };

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const n = (v) => Math.round(v || 0).toLocaleString('en-US');
  const shortN = (v) => StageUtils.shortNum(v);
  const pct = (v) => (v * 100).toFixed(1) + '%';
  const rowZh = (r) => ({ front: '前排', mid: '中排', back: '后排' }[r] || r);

  // ---------------------------------------------------------------------------
  // 启动
  // ---------------------------------------------------------------------------
  async function boot() {
    S.gd = await fetch('api/gamedata').then(r => r.json());

    // 角色选择：两张立绘卡片
    let selClass = S.gd.classOrder[0];
    renderCharCards();
    $('lg-token').value = S.token;
    $('lg-name').value = localStorage.getItem('tbh_name') || '';

    function renderCharCards() {
      $('char-list').innerHTML = S.gd.classOrder.map(c => {
        const cl = S.gd.classes[c];
        const b = cl.base;
        return `<div class="char-card ${c === selClass ? 'sel' : ''}" data-cls="${c}">
          ${GearUI.heroFigure({ sprite: cl.sprite, width: 150 })}
          <div class="cc-name">${esc(cl.zh)}</div>
          <div class="cc-tag">${esc(cl.tagline || '')}</div>
          <div class="cc-stat">
            <span>生命 ${b.hp}</span><span>攻击 ${b.atk}</span><span>防御 ${b.def}</span>
            <span>攻速 ${b.atkSpeed}</span>
          </div>
          <div class="cc-blurb">${esc(cl.blurb || '')}</div>
        </div>`;
      }).join('');
      $('char-list').onclick = (e) => {
        const card = e.target.closest('.char-card');
        if (!card) return;
        selClass = card.dataset.cls;
        renderCharCards();
      };
    }

    const go = () => {
      const name = $('lg-name').value.trim() || '冒险者';
      const token = $('lg-token').value.trim();
      localStorage.setItem('tbh_name', name);
      startWS({ name, classId: selClass, token });
      $('login').style.display = 'none';
      $('app').style.display = '';
    };
    $('lg-go').onclick = go;
    $('lg-name').onkeydown = e => { if (e.key === 'Enter') go(); };

    // 难度下拉
    $('t-diff').innerHTML = Object.entries(S.gd.difficulties)
      .map(([k, v]) => `<option value="${k}">${esc(v.label)}</option>`).join('');
    $('t-diff').onchange = () => Net.act('setStage', { difficulty: $('t-diff').value });
    $('t-start').onclick = () => {
      Net.act(S.view?.running ? 'stop' : 'start');
    };
    $('b-retry').onchange = () => Net.act('setAuto', { retry: $('b-retry').checked });
    $('b-advance').onchange = () => Net.act('setAuto', { advance: $('b-advance').checked });
    $('b-openall').onclick = () => Net.act('openAllChests');
    $('t-gm').onclick = () => location.href = 'gm.html';

    document.getElementById('tabs').onclick = (e) => {
      const t = e.target.closest('.tab');
      if (!t) return;
      S.tab = t.dataset.tab;
      document.querySelectorAll('.tab').forEach(x => x.classList.toggle('active', x === t));
      renderTab();
    };
  }

  function startWS(opts) {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    Net.connect(`${proto}://${location.host}/ws`);

    Net.on('hello', () => {
      Net.send({ type: 'hello', role: 'player', name: opts.name, classId: opts.classId, token: opts.token || undefined });
    });
    Net.on('welcome', (m) => {
      if (m.role !== 'player') return;
      S.token = m.token; S.pid = m.pid;
      localStorage.setItem('tbh_token', m.token);
      localStorage.setItem('tbh_pid', m.pid);
      S.connected = true;
      (m.announcements || []).forEach(a => toast(a.text, 'warn'));
      (m.worldEvents || []).forEach(e => toast(`世界事件：${e.label}`, 'good'));
    });
    Net.on('state', (m) => { S.view = m.view; renderAll(); });
    Net.on('event', (m) => onGameEvent(m.ev));
    Net.on('announce', (m) => toast(m.text, 'warn'));
    Net.on('worldEvent', (m) => {
      if (m.action === 'start') toast(`世界事件开始：${m.event.label}（${Math.round((m.event.until - Date.now()) / 1000)}秒）`, 'good');
      else toast('世界事件已结束', 'info');
    });
    Net.on('toast', (m) => toast(m.text, m.kind));
    Net.on('kicked', (m) => { alert('被踢出：' + m.reason); location.reload(); });
    Net.onStatus = (st) => {
      $('t-status').textContent = st === 'connected' ? '已连接' : (st === 'error' ? '连接错误' : '重连中...');
    };
  }

  function onGameEvent(ev) {
    if (ev.t === 'levelUp') toast('升级！', 'good');
    else if (ev.t === 'stageCleared') toast(`通关 ${ev.stageId}`, 'good');
    else if (ev.t === 'stageFailed') toast(`挑战失败 ${ev.stageId}`, 'bad');
    else if (ev.t === 'achievement') toast(`🏆 ${ev.ach.zh}`, 'good');
    else if (ev.t === 'pet') toast(`🐾 解锁宠物 ${ev.pet.zh}`, 'good');
    else if (ev.t === 'chestOpened') {
      const g = ev.gained;
      toast(`开箱：${g.items.length} 件装备，${n(g.gold)} 金币`, 'good');
    }
  }

  // ---------------------------------------------------------------------------
  // 渲染
  // ---------------------------------------------------------------------------
  function renderAll() {
    if (!S.view) return;
    renderTop();
    renderBattle();
    renderTab();
  }

  function renderTop() {
    const v = S.view;
    $('t-gold').textContent = n(v.gold);
    $('t-dps').textContent = shortN(v.partySummary.dps);
    $('t-ehp').textContent = shortN(v.partySummary.ehp);
    $('t-chest').textContent = v.chests.length;
    $('t-chest-wrap').style.opacity = v.chests.length ? 1 : 0.45;
    $('b-stage').textContent = `${v.currentStage.difficulty} ${v.currentStage.id}`;
    $('t-diff').value = v.currentStage.difficulty;
    $('t-name').textContent = esc(v.name);
    $('t-start').textContent = v.running ? '停止' : '开始挂机';
    $('t-start').className = v.running ? 'danger' : 'primary';
    $('b-retry').checked = v.autoRetry;
    $('b-advance').checked = v.autoAdvance;
    document.title = `${v.currentStage.id} · ${shortN(v.gold)} 金 · TBH-like`;
  }

  function renderBattle() {
    const v = S.view;
    const c = v.combat;

    // 横幅：离线收益
    const banners = [];
    if (v.pendingOffline) {
      const o = v.pendingOffline;
      banners.push(`<div class="banner">离线 ${(o.seconds / 3600).toFixed(1)} 小时：${n(o.gold)} 金币 / ${n(o.exp)} 经验
        ${o.capped ? `（已达 ${o.capHours} 小时上限）` : ''}
        <button class="sm good" onclick="App.claimOffline()">领取</button></div>`);
    }
    for (const m of v.modifiers) {
      banners.push(`<div class="banner">✨ ${esc(m.label)} — 剩余 ${Math.max(0, Math.round((m.until - Date.now()) / 1000))} 秒</div>`);
    }
    $('banners').innerHTML = banners.join('');

    $('b-stage').textContent = `${v.currentStage.difficulty} ${v.currentStage.id}`;
    let waveTxt = '未开始';
    if (c) waveTxt = `波次 ${c.wave}/${c.waveCount} · ${c.phase === 'gap' ? '整备中' : c.phase === 'failed' ? '失败' : '战斗中'} · ${c.elapsed}s`;
    if (v.failWait > 0) waveTxt += ` · ${v.failWait}s 后重试`;
    $('b-wave').textContent = waveTxt;

    // 战场交给战场模块做增量更新（全量重建会把动画打断）
    Stage.sync(v, c);

    const ps = v.partySummary;
    $('b-summary').innerHTML = `队伍 ${ps.size}/${v.maxPartySlots} 人 · 总 DPS ${n(ps.dps)} · 总 EHP ${n(ps.ehp)} · 回复 ${n(ps.hps)}/s`;

    // 日志
    $('b-log').innerHTML = (v.log || []).map(l =>
      `<div class="t-${l.type}"><span class="tiny muted">${new Date(l.at).toLocaleTimeString('zh-CN', { hour12: false })}</span> ${esc(l.text)}</div>`
    ).join('');
  }


  // ---------------------------------------------------------------------------
  // Tab 内容
  // ---------------------------------------------------------------------------
  function renderTab() {
    const el = $('tab-content');
    // 符文页特殊：结构由 RuneUI 持久持有并增量更新。
    // 若每秒随状态推送整页重建，滚动位置与键盘焦点都会被打断。
    if (S.tab === 'runes') {
      let root = $('rune-root');
      if (!root) { el.innerHTML = tabRunes(); root = $('rune-root'); }
      RuneUI.render(root, { gd: S.gd, view: S.view, act: (name, args) => App.act(name, args) });
      return;
    }
    const f = ({ party: tabParty, bag: tabBag, cube: tabCube, runes: tabRunes, stages: tabStages, pets: tabPets, ach: tabAch })[S.tab];
    el.innerHTML = f ? f() : '';
  }

  // ---- 阵容 ----
  function tabParty() {
    const v = S.view;
    let h = `<div class="card"><h3>队伍（${v.party.length}/${v.maxPartySlots}）</h3>`;
    h += `<div class="small muted">总 DPS ${n(v.partySummary.dps)} · EHP ${n(v.partySummary.ehp)} · 回复 ${n(v.partySummary.hps)}/s</div></div>`;

    for (const hero of v.heroes) {
      // 兜底：万一存档里出现了未知角色，也别让页面白屏
      const cls = S.gd.classes[hero.classId] || { zh: hero.zh, sprite: 'niuma', skills: [] };
      const st = hero.stats;
      // 把已穿戴的装备查出来，传给立绘做叠层
      const gear = {};
      for (const slot of Object.keys(hero.equipment)) {
        const uid = hero.equipment[slot];
        if (uid) gear[slot] = v.inventory.find(i => i.uid === uid) || v.stash.find(i => i.uid === uid);
      }
      h += `<div class="card">
        <div class="spread">
          <div><b>${esc(hero.zh)}</b> <span class="muted">Lv.${hero.level}</span>
            ${hero.inParty ? '<span class="tiny" style="color:var(--ok)">● 出战中</span>' : '<span class="tiny muted">○ 待命</span>'}</div>
          <div class="row">
            <select onchange="App.setRow('${hero.uid}', this.value)">
              ${['front', 'mid', 'back'].map(r => `<option value="${r}" ${hero.row === r ? 'selected' : ''}>${rowZh(r)}</option>`).join('')}
            </select>
            ${hero.inParty
          ? `<button class="sm" onclick="App.act('undeploy',{heroUid:'${hero.uid}'})">撤下</button>`
          : `<button class="sm good" onclick="App.act('deploy',{heroUid:'${hero.uid}'})">部署</button>`}
          </div>
        </div>
        <div class="party-figure" style="margin-top:8px">
          <div class="fig-col">
            ${GearUI.heroFigure({ sprite: cls.sprite, gear, width: 130, showEmpty: true })}
            <div class="tiny muted" style="text-align:center;margin-top:4px">已穿戴 ${Object.keys(gear).length}/6</div>
          </div>
          <div class="info-col">
            <div class="bar xp" style="margin:0 0 8px"><i style="width:${Math.min(100, hero.xp / hero.xpNext * 100)}%"></i>
              <span class="label">${n(hero.xp)} / ${n(hero.xpNext)}</span></div>
            <div class="hero-stats">
              <div><span>DPS</span> ${n(st.dps)}</div><div><span>EHP</span> ${n(st.ehp)}</div>
              <div><span>攻</span> ${n(st.atk)}</div><div><span>防</span> ${n(st.def)}</div>
              <div><span>暴击</span> ${st.crit}%</div><div><span>爆伤</span> ${st.critDmg}</div>
            </div>
            <div class="row" style="margin-top:8px">
              ${S.gd.slots.map(slot => {
          const it = gear[slot.id];
          return `<button class="sm" style="border-color:${it ? it.color : 'var(--line)'}"
                  title="${it ? esc(it.zh) : slot.zh + '：空'}"
                  onclick="${it ? `App.act('unequip',{heroUid:'${hero.uid}',slot:'${slot.id}'})` : `App.hintSlot('${slot.id}')`}">
                  ${GearUI.gearIcon(slot.id, it ? it.color : '#5a6379', 14)} ${it ? esc(it.zh.slice(0, 6)) : slot.zh}</button>`;
        }).join('')}
            </div>
          </div>
        </div>
        <div class="small" style="margin-top:8px">
          <b>技能点 ${hero.skillPoints}</b>
          <button class="sm" onclick="App.act('resetSkills',{heroUid:'${hero.uid}'})">重置</button>
        </div>
        <div class="row" style="margin-top:4px">
          ${cls.skills.map(sk => {
        const lv = hero.skills[sk.id] || 0;
        return `<span class="tiny" style="background:var(--bg2);border:1px solid var(--line);border-radius:5px;padding:2px 6px"
              title="${esc(sk.desc)}">${esc(sk.name)} ${lv}/${sk.max}
              ${hero.skillPoints > 0 && lv < sk.max
            ? `<button class="sm" style="padding:0 4px" onclick="App.act('learnSkill',{heroUid:'${hero.uid}',skillId:'${sk.id}'})">+</button>`
            : ''}</span>`;
      }).join('')}
        </div>
      </div>`;
    }

    // 招募
    h += `<div class="card"><h3>招募新成员</h3><div class="row">`;
    for (const c of S.gd.classOrder) {
      const cls = S.gd.classes[c];
      const cost = 2000 + v.heroes.length * 5000;
      const afford = v.gold >= cost;
      h += `<button class="sm ${afford ? 'good' : ''}" onclick="App.act('newHero',{classId:'${c}'})">
        ${GearUI.gearIcon('amulet', 'var(--gold)', 12)} ${esc(cls.zh)} · ${n(cost)} 金</button>`;
    }
    h += `</div><div class="tiny muted" style="margin-top:6px">初始阵容 2 槽，符文树「统帅」可解锁第 3、4 槽。</div></div>`;
    return h;
  }

  // ---- 背包 ----
  /**
   * 单个宝箱卡片。稀有度越高配色越暖、图标越华丽。
   * 箱内装备只显示槽位图标与稀有度配色（服务端只下发这两个字段），
   * 目的是让玩家在开箱前知道"值不值得点"，不剧透具体属性。
   * @param {object} c 服务端下发的宝箱展示字段
   * @returns {string} HTML
   */
  function chestCard(c) {
    const color = c.color || '#9aa3b2';
    // 配色表从 StageUtils 取（与引擎的 RARITY_COLOR 同源），
    // 不要在 GearUI 上取 —— 那里没有这个字段，用了会渲染成 undefined 颜色。
    const RC = StageUtils.RARITY_COLOR;
    const previews = (c.items || []).map(i => {
      const rc = RC[i.rarity] || '#9aa3b2';
      return `<span class="chest-prev" style="color:${rc}" title="${esc(GearUI.SLOT_ZH[i.slot] || i.slot)} · ${esc(i.rarity)}">${
        GearUI.gearIcon(i.slot, rc, 15)
      }</span>`;
    }).join('');
    return `<div class="chest-card" style="border-color:${color};box-shadow:0 0 12px ${color}33">
      <img class="chest-ico" src="assets/world/chest-${chestAssetName(c.type)}.png" alt="${esc(c.zh)}">
      <div class="chest-info">
        <div class="chest-zh" style="color:${color}">${esc(c.zh)}</div>
        <div class="tiny muted">${c.itemCount} 件装备 · ${n(c.gold)} 金${
          c.matCount ? ` · 素材×${c.matCount}` : ''}${c.coinCount ? ` · 纪念币×${c.coinCount}` : ''
        }</div>
        ${previews ? `<div class="chest-prevs">${previews}</div>` : ''}
      </div>
      <button class="sm good" onclick="App.act('openChest',{uid:'${c.uid}'})">打开</button>
    </div>`;
  }

  // 存档迁移前的 normal 与当前 common 共用同一张普通宝箱图。
  function chestAssetName(type) {
    return ({ normal: 'common', common: 'common', fine: 'fine', boss: 'boss', actBoss: 'act-boss' })[type]
      || 'common';
  }

  function tabBag() {
    const v = S.view;
    const chests = v.chests || [];
    let h = `<div class="card"><h3>宝箱 ${chests.length}</h3>`;
    if (chests.length) {
      h += `<div class="chest-list">${chests.map(chestCard).join('')}</div>`;
      h += `<div class="row" style="margin-top:8px">
        <button class="sm good" onclick="App.act('openAllChests')">全部打开（${chests.length}）</button>
        <span class="tiny muted">稀有度越高，箱内装备越好</span></div>`;
    } else {
      h += `<div class="tiny muted">暂无宝箱。清完一波怪有概率掉落，关底必掉首领箱。</div>`;
    }
    h += `</div>`;

    h += `<div class="card"><h3>背包 ${v.inventory.length}/${v.bagLimit}</h3>
      <div class="row"><button class="sm" onclick="App.sellJunk()">炼金最差 10 件</button></div>
      <div class="tiny muted" style="margin-top:6px">素材：${Object.entries(v.materials).map(([k, c]) => `${esc(matZh(k))}×${c}`).join('、') || '无'}</div>
      <div class="tiny muted">纪念币：${Object.entries(v.coins).map(([k, c]) => `${esc(coinZh(k))}×${c}`).join('、') || '无'}</div>
      </div>`;

    const items = v.inventory.slice().sort((a, b) => b.power - a.power);
    h += `<div class="item-list">` + items.map(it => itemRow(it, v)).join('') + `</div>`;

    if (v.stash.length) {
      h += `<div class="card"><h3>收藏 ${v.stash.length}</h3><div class="item-list">`
        + v.stash.map(it => itemRow(it, v, true)).join('') + `</div></div>`;
    }
    return h;
  }

  function itemRow(it, v, inStash) {
    const heroWith = v.heroes.find(h => Object.values(h.equipment).includes(it.uid));
    const affixTxt = it.affixes.map(a => `${affixZh(a.stat)} +${fmtVal(a)}`).join('，');
    const sockTxt = ['decoration', 'engraving', 'inscription']
      .filter(t => it.sockets[t]).map(t => `${SOCKET_ZH[t]}:${esc(matZh(it.sockets[t]))}`).join('，');
    return `<div class="item ${it.locked ? 'locked' : ''}" style="border-left-color:${it.color}">
      ${GearUI.gearChip(it)}
      <div style="flex:1;min-width:0">
        <div class="iname" style="color:${it.color}">${esc(it.zh)} <span class="tiny muted">iLv.${it.ilvl} · 战力 ${n(it.power)}</span></div>
        <div class="iaffix">${affixTxt}${sockTxt ? ' · ' + sockTxt : ''}</div>
        <div class="tiny muted">${heroWith ? `装备在 ${esc(heroWith.zh)}` : '未装备'} · 卖 ${n(it.sell)} 金</div>
      </div>
      <div class="iacts">
        ${inStash
        ? `<button class="sm" onclick="App.act('unstash',{itemUid:'${it.uid}'})">取回</button>`
        : `<button class="sm" onclick="App.act('stash',{itemUid:'${it.uid}'})">收藏</button>`}
        <button class="sm" onclick="App.act('lock',{itemUid:'${it.uid}'})">${it.locked ? '解锁' : '锁定'}</button>
        <button class="sm" onclick="App.equipTo('${it.uid}')">装备</button>
        ${it.locked ? '' : `<button class="sm danger" onclick="App.act('sellItem',{itemUid:'${it.uid}'})">卖</button>`}
      </div>
    </div>`;
  }

  const SOCKET_ZH = { decoration: '装饰', engraving: '雕刻', inscription: '铭文' };
  function fmtVal(a) {
    return ['critRate', 'critDmg', 'atkSpeed', 'lifesteal', 'moveSpeed', 'healPower', 'goldPct', 'expPct', 'dropPct', 'thorns'].includes(a.stat)
      ? (a.value * 100).toFixed(1) + '%' : Math.round(a.value);
  }
  function affixZh(id) {
    const m = { atk: '攻击', hp: '生命', def: '防御', critRate: '暴击率', critDmg: '暴击伤害', atkSpeed: '攻速', lifesteal: '吸血', moveSpeed: '移速', healPower: '治疗', goldPct: '金币', expPct: '经验', dropPct: '掉落', thorns: '荆棘', dotMul: '持续伤害', aoeMul: '范围伤害' };
    return m[id] || id;
  }
  function matZh(id) { return (S.gd.materials.find(m => m.id === id) || {}).zh || id; }
  function coinZh(id) { return (S.gd.coins.find(c => c.id === id) || {}).zh || id; }

  // ---- 魔方 ----
  function tabCube() {
    const v = S.view;
    const sel = S.cubeSel;
    let h = `<div class="card"><h3>魔方合成</h3>
      <div class="small muted">放入 9 件<b>同稀有度</b>装备，合成一件更高稀有度。已选 ${sel.length}/9</div>
      <div class="row" style="margin-top:6px">
        <button class="sm primary" onclick="App.cubeSynthesis()">合成</button>
        <button class="sm" onclick="App.cubeClear()">清空选择</button>
        <button class="sm" onclick="App.cubeSelectCommons()">自动选 9 件普通</button>
      </div></div>`;

    h += `<div class="card"><h3>炼金</h3><div class="row">
      <button class="sm" onclick="App.cubeAlchemy()">炼金已选（${sel.length}）</button>
      <button class="sm danger" onclick="App.sellJunk()">炼金战力最低 10 件</button></div></div>`;

    h += `<div class="card"><h3>制作</h3>
      <div class="row">
        <select id="cube-slot">${S.gd.slots.map(s => `<option value="${s.id}">${esc(s.zh)}</option>`).join('')}</select>
        <label class="tiny">等级</label><input type="number" id="cube-ilvl" value="30" style="width:70px">
        <button class="sm primary" onclick="App.cubeCraft()">制作</button>
      </div>
      <div class="tiny muted" style="margin-top:4px">消耗金币与素材，产出指定槽位的随机装备（稀有度有加成）。</div></div>`;

    // 镶嵌
    const sockables = v.inventory.filter(i => ['decoration', 'engraving', 'inscription'].some(t => i.sockets[t] === null));
    h += `<div class="card"><h3>插槽镶嵌</h3>`;
    if (!sockables.length) h += `<div class="small muted">没有可镶嵌的装备（蓝色稀有度以上才有装饰槽）</div>`;
    else {
      h += sockables.slice(0, 12).map(it => {
        const tiers = ['decoration', 'engraving', 'inscription'].filter(t => it.sockets[t] === null);
        return `<div class="row tiny" style="padding:3px 0;border-bottom:1px dashed #2a2f40">
          <span style="color:${it.color};flex:1">${esc(it.zh)}</span>
          ${tiers.map(t => `<select id="sock-${it.uid}-${t}">
            <option value="">${SOCKET_ZH[t]}槽…</option>
            ${S.gd.materials.filter(m => m.tier === ({ decoration: 1, engraving: 2, inscription: 3 })[t])
          .map(m => `<option value="${m.id}">${esc(m.zh)}（${esc(m.zh_effect)}）</option>`).join('')}
          </select>
          <button class="sm" onclick="App.socket('${it.uid}','${t}')">镶</button>`).join('')}
        </div>`;
      }).join('');
    }
    h += `</div>`;

    // 已镶嵌的可以移除
    const filled = v.inventory.filter(i => ['decoration', 'engraving', 'inscription'].some(t => i.sockets[t]));
    if (filled.length) {
      h += `<div class="card"><h3>移除插槽素材</h3><div class="row">` +
        filled.slice(0, 10).flatMap(it => ['decoration', 'engraving', 'inscription'].filter(t => it.sockets[t])
          .map(t => `<button class="sm danger" onclick="App.removeSocket('${it.uid}','${t}')">${esc(it.zh)}·${SOCKET_ZH[t]}</button>`)).join('')
        + `</div><div class="tiny muted" style="margin-top:4px">移除费用 400 金币，素材不返还。</div></div>`;
    }

    // 供奉
    const myCoins = Object.entries(v.coins).filter(([, c]) => c > 0);
    h += `<div class="card"><h3>供奉（纪念币）</h3>`;
    h += myCoins.length ? `<div class="row">` + myCoins.map(([id, c]) =>
      `<button class="sm" onclick="App.offering('${id}')">${esc(coinZh(id))} ×${c}</button>`).join('') + `</div>`
      : `<div class="small muted">暂无纪念币（Boss 宝箱有概率掉落）</div>`;
    h += `</div>`;

    // 选择列表
    h += `<div class="card"><h3>选择装备（点击选择/取消）</h3><div class="grid-items">` +
      v.inventory.slice().sort((a, b) => b.power - a.power).slice(0, 40).map(it =>
        `<div class="cube-pick ${sel.includes(it.uid) ? 'sel' : ''}" style="border-color:${it.color}"
           onclick="App.toggleSel('${it.uid}')">
          ${GearUI.gearIcon(it.slot, it.color, 20)}
          <div style="min-width:0;flex:1">
            <div style="color:${it.color};font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(it.zh)}</div>
            <div class="muted tiny">iLv.${it.ilvl} · ${n(it.power)}</div>
          </div>
        </div>`).join('') + `</div></div>`;
    return h;
  }

  // ---- 符文树 ----
  // 只准备容器；摘要、树、详情、列表、推荐区全部由 RuneUI 渲染（见 rune-ui.js）
  function tabRunes() {
    return '<div id="rune-root"></div>';
  }

  // ---- 关卡 ----
  function tabStages() {
    const v = S.view;
    const unlocked = new Set(v.unlockedStages);
    const cleared = v.clearedStages[v.currentStage.difficulty] || {};
    let h = `<div class="card"><h3>选择关卡（${S.gd.difficulties[v.currentStage.difficulty].label}）</h3>
      <div class="small muted">已通关 ${Object.keys(cleared).length}/30 · 当前 ${v.currentStage.id}</div></div>`;
    const stages = S.gd.stages;
    for (let a = 1; a <= 3; a++) {
      h += `<div class="card"><h3>第 ${a} 幕</h3><div class="stage-grid">`;
      for (const s of stages.filter(x => x.act === a)) {
        const isCur = s.id === v.currentStage.id;
        const isClear = !!cleared[s.id];
        const isLock = !unlocked.has(s.id);
        h += `<div class="stage-cell ${isCur ? 'current' : ''} ${isClear ? 'cleared' : ''} ${isLock ? 'locked' : ''} ${s.isActEnd ? 'boss' : ''}"
          onclick="App.setStage('${s.id}')" title="${esc(s.bossZh)}">
          <div><b>${s.id}</b></div>
          <div class="tiny muted">${isClear ? `${(cleared[s.id].bestMs / 1000).toFixed(1)}s` : isLock ? '🔒' : '未通关'}</div>
        </div>`;
      }
      h += `</div></div>`;
    }
    return h;
  }

  // ---- 宠物 ----
  function tabPets() {
    const v = S.view;
    let h = `<div class="card"><h3>宠物（被动永久生效）</h3>
      <div class="small muted">无论是否部署，解锁的宠物效果都会永久生效。</div></div>`;
    for (const p of S.gd.pets) {
      const st = v.pets[p.id];
      const kills = v.stageKills[p.atStage] || 0;
      const prog = Math.min(100, kills / p.kills * 100);
      h += `<div class="card">
        <div class="spread"><div><b>${esc(p.zh)}</b> ${st?.unlocked ? '<span class="tiny" style="color:var(--ok)">已解锁</span>' : `<span class="tiny muted">${kills}/${p.kills}</span>`}</div>
        <div>${st?.unlocked
          ? `<button class="sm ${v.deployedPet === p.id ? 'primary' : ''}" onclick="App.act('deployPet',{petId:'${v.deployedPet === p.id ? '' : p.id}'})">${v.deployedPet === p.id ? '取消展示' : '展示'}</button>`
          : `<span class="tiny muted">在第 ${p.atStage} 关击杀</span>`}</div></div>
        <div class="bar xp" style="margin:5px 0"><i style="width:${prog}%"></i><span class="label">${esc(p.note)}</span></div>
      </div>`;
    }
    return h;
  }

  // ---- 成就 ----
  function tabAch() {
    const v = S.view;
    const done = Object.values(v.achievements).filter(a => a.done).length;
    let h = `<div class="card"><h3>成就 ${done}/${S.gd.achievements.length}</h3></div><div class="card">`;
    h += `<table><tr><th>成就</th><th>说明</th><th class="num">奖励</th><th>状态</th></tr>`;
    for (const a of S.gd.achievements) {
      const d = v.achievements[a.id]?.done;
      h += `<tr style="opacity:${d ? 1 : .55}">
        <td>${d ? '🏆 ' : ''}${esc(a.zh)}</td>
        <td class="muted small">${esc(a.desc)}</td>
        <td class="num gold">${n(a.reward?.gold || 0)}</td>
        <td>${d ? '<span style="color:var(--ok)">已达成</span>' : '<span class="muted">未达成</span>'}</td></tr>`;
    }
    return h + `</table></div>`;
  }

  // ---------------------------------------------------------------------------
  // 动作
  // ---------------------------------------------------------------------------
  const App = {
    act(name, args) { Net.act(name, args); },
    setRow(uid, row) { Net.act('setRow', { heroUid: uid, row }); },
    setStage(id) { Net.act('setStage', { id }); },
    claimOffline() { Net.act('claimOffline'); },

    equipTo(itemUid) {
      const v = S.view;
      const it = v.inventory.find(i => i.uid === itemUid);
      if (!it) return;
      // 优先装在队伍里的同角色身上
      const cands = v.heroes.filter(h => h.inParty);
      const auto = cands.find(h => h.classId === it.classId) || (cands.length === 1 ? cands[0] : null);
      if (auto) { Net.act('equip', { heroUid: auto.uid, itemUid }); return; }
      // 多个人选 -> 让他挑
      const pool = cands.length ? cands : v.heroes;
      openModal(`把「${it.zh}」装给谁？`, pool.map(h =>
        `<button class="sm" onclick="App.act('equip',{heroUid:'${h.uid}',itemUid:'${itemUid}'});App.closeModal()">
          ${esc(h.zh)} Lv.${h.level}</button>`).join(''));
    },
    hintSlot(slot) {
      toast(`「${GearUI.SLOT_ZH[slot]}」还没装东西 —— 去「背包」页挑一件点「装备」`, 'info');
    },
    closeModal() {
      const m = document.querySelector('.modal-mask.dyn');
      if (m) m.remove();
    },
    sellJunk() {
      const v = S.view;
      const junk = v.inventory.filter(i => !i.locked)
        .sort((a, b) => a.power - b.power).slice(0, 10).map(i => i.uid);
      if (junk.length) Net.act('cube', { op: 'alchemy', itemUids: junk });
    },
    toggleSel(uid) {
      const i = S.cubeSel.indexOf(uid);
      if (i >= 0) S.cubeSel.splice(i, 1);
      else if (S.cubeSel.length < 9) S.cubeSel.push(uid);
      renderTab();
    },
    cubeClear() { S.cubeSel = []; renderTab(); },
    cubeSelectCommons() {
      S.cubeSel = S.view.inventory.filter(i => i.rarity === 'Common' && !i.locked).slice(0, 9).map(i => i.uid);
      renderTab();
    },
    cubeSynthesis() { Net.act('cube', { op: 'synthesis', itemUids: S.cubeSel }); S.cubeSel = []; },
    cubeAlchemy() { Net.act('cube', { op: 'alchemy', itemUids: S.cubeSel }); S.cubeSel = []; },
    cubeCraft() {
      Net.act('cube', { op: 'craft', args: { slot: $('cube-slot').value, ilvl: Number($('cube-ilvl').value) } });
    },
    socket(uid, tier) {
      const sel = document.getElementById(`sock-${uid}-${tier}`);
      if (!sel || !sel.value) return;
      Net.act('cube', { op: 'socket', args: { itemUid: uid, tier, matId: sel.value } });
    },
    removeSocket(uid, tier) { Net.act('cube', { op: 'removal', args: { itemUid: uid, tier } }); },
    offering(coinId) { Net.act('cube', { op: 'offering', args: { coinId } }); }
  };
  window.App = App;

  // ---------------------------------------------------------------------------
  // Toast
  // ---------------------------------------------------------------------------
  /** 通用小弹窗 */
  function openModal(title, bodyHtml) {
    const el = document.createElement('div');
    el.className = 'modal-mask dyn';
    el.innerHTML = `<div class="modal" style="width:440px">
      <h2>${esc(title)}</h2>
      <div class="row">${bodyHtml}</div>
      <div class="row" style="justify-content:flex-end;margin-top:14px">
        <button class="sm" onclick="this.closest('.modal-mask').remove()">取消</button>
      </div></div>`;
    el.onclick = (e) => { if (e.target === el) el.remove(); };
    document.getElementById('modal-root').appendChild(el);
  }

  function toast(text, kind) {
    const box = $('toasts');
    const d = document.createElement('div');
    d.className = 'toast ' + (kind || 'info');
    d.textContent = text;
    box.appendChild(d);
    setTimeout(() => { d.style.opacity = 0; d.style.transition = 'opacity .3s'; }, 3200);
    setTimeout(() => d.remove(), 3600);
    while (box.children.length > 5) box.firstChild.remove();
  }
  window.toast = toast;

  boot();
})();
