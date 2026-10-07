/* ==========================================================================
   横向卷轴战场
   --------------------------------------------------------------------------
   服务器每秒推一次快照（波次 / 血量），这里负责把那一秒"演"出来：
     · 小队在路上向右推进，推进时播放走路帧
     · 新一波怪物从右端走入场，各自占到自己的位置
     · 双方停下互砍：突进 / 受击 / 飘字 / 刀光   （沿用上一版的手感）
     · 怪物死亡 -> 地上掉战利品，小队过去"捡"走
   血量与击杀始终以服务器为准，这里只做视觉插值。
   ========================================================================== */
(function (global) {

  const WALK_FRAME_MS = 130;   // 走路帧切换间隔
  const MARCH_MS = 900;        // 推进动画时长
  const ENTER_MS = 1100;       // 怪物入场时长
  const LOOT_LIFE_MS = 1100;   // 掉落物在地上停留多久后被「捡走」

  // 宝箱按类型的展示样式：class 决定箱子长相与光效
  const CHEST_STYLE = {
    normal: { cls: 'chest-normal', label: '宝箱' },
    boss: { cls: 'chest-boss', label: '首领宝箱' },
    actBoss: { cls: 'chest-act', label: '幕末宝箱' }
  };

  const Stage = {
    units: new Map(),          // uid -> unit
    heroGroup: null,
    lead: 0,                   // 小队推进进度 0~1
    waveKey: null,
    mode: 'idle',              // idle | march | fight
    lastFrame: 0,
    started: false,
    walkTimer: 0,
    walkFrame: 0,
    healerTimer: 0,
    seenDropId: 0,             // 已播过的掉落 id（快照每秒重推，靠它去重）
    runId: null,               // 当前 run 的 id，换 run 就重置去重游标
    deathSpots: {},            // foeUid -> 尸体在战场里的坐标，掉落要落在同一个点
    pendingLoot: [],           // 场上还没被捡走的掉落物元素
    // 下面两个由 sync() 填充。frame() 可能先于第一次 sync 跑完启动（rAF 已排队），
    // 所以必须给空数组初值，否则 tickHeal / attack 里 filter 会抛
    heroes: [],
    foes: [],

    dom() {
      return {
        view: document.getElementById('stage-view'),
        foes: document.getElementById('layer-foes'),
        heroes: document.getElementById('layer-heroes'),
        drops: document.getElementById('layer-drops'),
        fx: document.getElementById('layer-fx'),
        hint: document.getElementById('stage-hint')
      };
    },

    /** 服务器快照到达 */
    sync(v, c) {
      const d = this.dom();
      if (!d.view) return;

      const running = v.running;
      const waveId = c && running ? `${c.stageId}#${c.wave}` : null;
      if (waveId && waveId !== this.waveKey) {
        const advancing = this.waveKey && this.waveKey.split('#')[0] === waveId.split('#')[0];
        this.waveKey = waveId;
        this.beginWave(advancing);
      }
      if (!running) this.waveKey = null;

      // 小队推进进度：跟着波次走
      const targetLead = c ? Math.min(0.52, 0.14 + c.wave * 0.075) : 0;

      this.syncHeroes(v, c, targetLead);
      this.syncFoes(c);
      this.syncDrops(c);
      this.renderHeroCards(v, c);

      if (d.hint) d.hint.style.display = (running || (c && c.enemies.length)) ? 'none' : '';
      if (!this.started) { this.started = true; this.lastFrame = performance.now(); requestAnimationFrame(this.frame.bind(this)); }
    },

    beginWave(advancing) {
      this.mode = 'march';
      this.marchUntil = performance.now() + (advancing ? MARCH_MS : 300);
    },

    // ---------------------------------------------------------------- 英雄
    syncHeroes(v, c, targetLead) {
      const d = this.dom();
      const hpMap = Object.fromEntries((c?.heroes || []).map(h => [h.uid, h]));
      const party = v.heroes.filter(h => h.inParty);

      if (!this.heroGroup) {
        this.heroGroup = document.createElement('div');
        this.heroGroup.className = 'hero-group';
        d.heroes.appendChild(this.heroGroup);
      }

      // 队伍内部成员按 uid 复用
      const seen = new Set();
      for (const h of party) {
        seen.add(h.uid);
        let u = this.units.get(h.uid);
        if (!u || u.kind !== 'hero') {
          u = this.createHero(h);
          this.heroGroup.appendChild(u.el);
          this.units.set(h.uid, u);
        }
        this.updateHero(u, h, hpMap[h.uid]);
      }
      for (const [key, u] of this.units) {
        if (u.kind !== 'hero' || seen.has(key)) continue;
        this.units.delete(key);
        u.el.remove();
      }
      this.heroes = party.map(h => this.units.get(h.uid)).filter(Boolean);
      this.targetLead = targetLead;
    },

    createHero(h) {
      const el = document.createElement('div');
      el.className = 'sfx-unit hero-unit';
      // 素材名走 heroSprite()，不要直接读 h.sprite（见该函数注释）
      const sp = heroSprite(h);
      el.innerHTML =
        `<div class="walk">${[0, 1, 2, 3].map(i =>
          `<img src="assets/heroes/${sp}_walk_${i}.png" alt="">`).join('')}</div>` +
        `<div class="tag"></div>` +
        `<div class="bar hp"><i></i><span class="label"></span></div>`;
      return {
        kind: 'hero', key: h.uid, el,
        walk: el.querySelector('.walk'),
        imgs: [...el.querySelectorAll('.walk img')],
        tag: el.querySelector('.tag'),
        fill: el.querySelector('.bar > i'),
        label: el.querySelector('.bar .label'),
        atkTimer: Math.random() * 500,
        alive: true
      };
    },

    updateHero(u, h, ch) {
      const max = ch ? ch.maxHp : h.stats.hp;
      const hp = ch ? ch.hp : h.stats.hp;
      const downed = ch ? (ch.down > 0 || ch.hp <= 0) : false;
      const st = h.stats;
      const spd = clampSpd(st.atkSpeed);

      if (u.tag.textContent !== `${h.zh}`) u.tag.textContent = h.zh;
      u.el.title = `${h.zh} Lv.${h.level}`;
      const p = max > 0 ? Math.max(0, Math.min(100, hp / max * 100)) : 0;
      u.fill.style.width = p + '%';
      u.label.textContent = shortNum(hp);
      u.el.classList.toggle('downed', !!downed);
      u.alive = !downed && hp > 0;
      u.atkSpeed = spd;
      u.perHit = spd > 0 ? st.dps / spd : 0;
      u.crit = st.crit / 100;
      u.critDmg = st.critDmg;
      u.glyph = '✦';
      u.hps = st.hps || 0;
    },

    // ---------------------------------------------------------------- 敌人
    syncFoes(c) {
      const d = this.dom();
      const list = (c && c.enemies ? c.enemies : []).filter(e => e.alive && e.hp > 0);
      const seen = new Set();

      // 位置：右侧扇形排开，最多 5 个位置
      const slots = [0.60, 0.72, 0.84, 0.66, 0.78];
      list.forEach((e, i) => {
        seen.add(e.uid);
        let u = this.units.get(e.uid);
        if (!u || u.kind !== 'foe') {
          u = this.createFoe(e, slots[i % slots.length]);
          d.foes.appendChild(u.el);
          this.units.set(e.uid, u);
        }
        this.updateFoe(u, e, slots[i % slots.length]);
      });

      for (const [key, u] of this.units) {
        if (u.kind !== 'foe' || seen.has(key)) continue;
        this.units.delete(key);
        this.killFoe(u);
      }
      this.foes = list.map(e => this.units.get(e.uid)).filter(Boolean);
    },

    createFoe(e, slot) {
      const el = document.createElement('div');
      el.className = 'sfx-unit foe-unit entering' + (e.tier === 'boss' || e.tier === 'actBoss' ? ' boss' : '');
      el.style.left = (1.06 * 100) + '%';
      el.innerHTML =
        `<div class="av bob">${spriteOf(e.sprite)}</div>` +
        `<div class="tag"></div>` +
        `<div class="bar enemy"><i></i><span class="label"></span></div>`;
      // 下一帧再移到目标位置，触发 transition 滑入
      requestAnimationFrame(() => {
        el.style.left = (slot * 100) + '%';
        setTimeout(() => el.classList.remove('entering'), ENTER_MS);
      });
      return {
        kind: 'foe', key: e.uid, el,
        av: el.querySelector('.av'),
        tag: el.querySelector('.tag'),
        fill: el.querySelector('.bar > i'),
        label: el.querySelector('.bar .label'),
        atkTimer: Math.random() * 500,
        alive: true, entered: false
      };
    },

    updateFoe(u, e, slot) {
      const p = e.maxHp > 0 ? Math.max(0, Math.min(100, e.hp / e.maxHp * 100)) : 0;
      if (u.tag.textContent !== e.zh) u.tag.textContent = e.zh;
      u.fill.style.width = p + '%';
      u.label.textContent = shortNum(e.hp);
      u.atkSpeed = clampSpd(e.atkSpeed);
      u.perHit = (e.atk || 1) * 0.72;
      u.crit = 0; u.critDmg = 1.5;
      u.glyph = '⚔';
      u.boss = e.tier === 'boss' || e.tier === 'actBoss';
    },

    killFoe(u) {
      u.alive = false;
      const p = this.unitCenter(u);
      // 记下尸体位置：随后来到的掉落流水要落在同一个点上，
      // 顺序是先 syncFoes（怪物消失）再 syncDrops（掉落出现），所以这里必须先存
      this.deathSpots[u.key] = p;

      u.el.classList.add('dying');
      setTimeout(() => u.el.remove(), 480);
    },

    /** 取单位在战场坐标系里的中心点（相对 stage-view 左上角） */
    unitCenter(u) {
      const d = this.dom();
      const rect = u.el.getBoundingClientRect();
      const vrect = d.view.getBoundingClientRect();
      return {
        x: rect.left + rect.width / 2 - vrect.left,
        y: rect.top + rect.height * 0.62 - vrect.top
      };
    },

    // ---------------------------------------------------------------- 掉落
    /**
     * 播放服务器记录的真实掉落。
     * 快照每秒重推同一条记录，所以用 seenDropId 只播新 id；
     * 断线重连后 runId 变了要重置，否则新的一条会被当成旧的丢掉。
     */
    syncDrops(c) {
      if (!c || !c.drops) return;
      if (this.runId !== c.runId) {
        this.runId = c.runId;
        this.seenDropId = 0;
        this.deathSpots = {};
      }
      for (const rec of c.drops) {
        if (!rec || rec.id <= this.seenDropId) continue;
        this.seenDropId = rec.id;
        if (rec.t === 'gold') this.dropGold(rec);
        else if (rec.t === 'chest') this.dropChest(rec);
      }
    },

    /** 击杀掉落：金币 + 经验，飘在尸体位置上 */
    dropGold(rec) {
      const p = this.deathSpots[rec.foeUid] || this.defaultDropPoint();
      const g = Math.max(1, Math.round(rec.gold || 0));
      const x = Math.max(28, Math.min(p.x, this.dropBounds().w - 28));
      this.spawnLoot(x, p.y, `
        <span class="coin-ico">🪙</span>
        <span class="loot-amt">+${g}</span>`, 'gold');
    },

    /** 宝箱掉落：直接画出箱子本体，并按箱内稀有度点亮对应颜色的装备小图标 */
    dropChest(rec) {
      const st = CHEST_STYLE[rec.chestType] || CHEST_STYLE.normal;
      const p = this.defaultDropPoint();
      const x = Math.max(40, Math.min(p.x, this.dropBounds().w - 40));
      const previews = (rec.items || []).slice(0, 3).map(it =>
        `<span class="chest-prev" style="color:${RARITY_COLOR[it.rarity] || '#9aa3b2'}">${
          GearUI.gearIcon(it.slot, RARITY_COLOR[it.rarity] || '#9aa3b2', 13)}</span>`).join('');
      this.spawnLoot(x, p.y, `
        <span class="chest-ico ${st.cls}">📦</span>
        <span class="chest-lb">${st.label}${rec.itemCount ? ' · ' + rec.itemCount + ' 件' : ''}</span>
        ${previews ? `<span class="chest-prevs">${previews}</span>` : ''}`, 'chest');
    },

    /** 没有对应尸体时（宝箱在波次间隙掉）落在场地中偏右 */
    defaultDropPoint() {
      const b = this.dropBounds();
      return { x: b.w * 0.62, y: b.h * 0.72 };
    },

    dropBounds() {
      const el = this.dom().view;
      const r = (el && el.getBoundingClientRect) ? el.getBoundingClientRect() : { width: 800, height: 250 };
      return { w: r.width || 800, h: r.height || 250 };
    },

    /**
     * 生成一个掉落物：弹出来 -> 在地上停 LOOT_LIFE_MS -> 飞向小队被捡走。
     * 「捡走」只影响这段 DOM 动画，物品本身由服务器直接入背包，不经过这里。
     */
    spawnLoot(x, y, html, kind) {
      const d = this.dom();
      const el = document.createElement('div');
      el.className = 'loot ' + kind;
      el.style.left = x + 'px';
      el.style.top = y + 'px';
      el.dataset.born = String(performance.now());
      el.innerHTML = html;
      d.drops.appendChild(el);
      this.pendingLoot.push(el);
      // 兜底清理：主循环停了（页面隐藏）时也要保证不残留
      setTimeout(() => this.collectLoot(el), LOOT_LIFE_MS + 400);
    },

    collectLoot(el) {
      if (!el || el.dataset.collected) return;
      el.dataset.collected = '1';
      this.pendingLoot = this.pendingLoot.filter(x => x !== el);
      el.classList.add('collected');
      setTimeout(() => el.remove(), 620);
    },

    // ---------------------------------------------------------------- 主循环
    frame(now) {
      const dt = Math.min(120, now - this.lastFrame);
      this.lastFrame = now;

      // 小队推进
      if (this.heroGroup) {
        const lead = this.targetLead == null ? this.lead
          : this.lead + (this.targetLead - this.lead) * Math.min(1, dt / 420);
        this.lead = lead;
        this.heroGroup.style.left = (lead * 100) + '%';
      }
      const marching = now < (this.marchUntil || 0);
      if (this.mode === 'march' && !marching) this.mode = 'fight';
      const walking = marching || this.mode === 'idle';

      // 走路帧
      if (walking || this.mode === 'march') {
        this.walkTimer += dt;
        if (this.walkTimer >= WALK_FRAME_MS) {
          this.walkTimer -= WALK_FRAME_MS;
          this.walkFrame = (this.walkFrame + 1) % 4;
        }
      }
      for (const u of this.units.values()) {
        if (u.kind !== 'hero' || !u.imgs) continue;
        const downed = u.el.classList.contains('downed');
        u.imgs.forEach((im, i) => {
          im.style.opacity = downed ? (i === 1 ? 0.35 : 0) : (i === this.walkFrame ? 1 : 0);
        });
      }

      // 攻击节奏（走路时不砍）
      if (!marching) {
        for (const u of this.units.values()) {
          if (!u.alive) continue;
          const interval = 1000 / Math.max(0.2, u.atkSpeed || 1);
          u.atkTimer += dt;
          while (u.atkTimer >= interval) {
            u.atkTimer -= interval;
            this.attack(u);
          }
        }
        this.tickHeal(dt);
      }

      this.tickLoot(now);
      requestAnimationFrame(this.frame.bind(this));
    },

    /**
     * 掉落物落地一段时间后被小队捡走。
     * 用「落地时刻 + LOOT_LIFE_MS」判定，不依赖 CSS animationend：
     * 标签页切到后台时动画会暂停，事件不触发会导致掉落物永久堆在场上。
     */
    tickLoot(now) {
      if (!this.pendingLoot.length) return;
      for (const el of this.pendingLoot.slice()) {
        if (!el.isConnected) { this.collectLoot(el); continue; }
        const born = Number(el.dataset.born || 0);
        if (born && now - born >= LOOT_LIFE_MS) this.collectLoot(el);
      }
    },

    tickHeal(dt) {
      const healers = this.heroes.filter(h => h.alive && h.hps > 0);
      if (!healers.length) return;
      this.healerTimer += dt;
      if (this.healerTimer < 1400) return;
      this.healerTimer = 0;
      const wounded = this.heroes.filter(h => h.alive)
        .sort((a, b) => parseFloat(a.fill.style.width) - parseFloat(b.fill.style.width))[0];
      if (!wounded) return;
      replay(healers[0].el, 'act-heal');
      this.pop(wounded, '+' + shortNum(healers[0].hps * 1.4), 'heal');
    },

    attack(u) {
      const foes = this.foes.filter(f => f.alive);
      const heroes = this.heroes.filter(h => h.alive && h.row === 'front');
      const pool = u.kind === 'hero'
        ? foes
        : (heroes.length ? heroes : this.heroes.filter(h => h.alive));
      if (!pool.length) return;
      const target = pool[Math.floor(Math.random() * pool.length)];

      replay(u.el, 'act-atk');
      setTimeout(() => {
        if (!target.el.isConnected || !target.alive) return;
        replay(target.el, 'act-hit');
        const crit = u.crit > 0 && Math.random() < u.crit;
        const val = Math.max(1, Math.round((u.perHit || 1) * (crit ? (u.critDmg || 1.5) : 1)));
        this.pop(target, (crit ? '暴击 ' : '') + shortNum(val),
          u.kind === 'hero' ? (crit ? 'crit' : 'hit') : 'hurt');
        this.slash(u.el, target.el, crit ? '💥' : u.glyph);
      }, 150);
    },

    pop(unit, text, cls) {
      const d = document.createElement('div');
      d.className = 'dmg ' + cls;
      d.textContent = text;
      unit.el.appendChild(d);
      requestAnimationFrame(() => d.classList.add('go'));
      setTimeout(() => d.remove(), 900);
    },

    slash(fromEl, toEl, glyph) {
      const d = this.dom();
      const vrect = d.view.getBoundingClientRect();
      const a = fromEl.getBoundingClientRect(), b = toEl.getBoundingClientRect();
      const el = document.createElement('div');
      el.className = 'slash';
      el.textContent = glyph || '⚔';
      el.style.left = ((a.left + a.width / 2 + b.left + b.width / 2) / 2 - vrect.left) + 'px';
      el.style.top = ((a.top + a.height / 2 + b.top + b.height / 2) / 2 - vrect.top) + 'px';
      d.fx.appendChild(el);
      requestAnimationFrame(() => el.classList.add('go'));
      setTimeout(() => el.remove(), 340);
    },

    // ---------------------------------------------------------------- 属性卡
    renderHeroCards(v, c) {
      const box = document.getElementById('b-heroes');
      if (!box) return;
      const hpMap = Object.fromEntries((c?.heroes || []).map(h => [h.uid, h]));
      const list = v.heroes.filter(h => h.inParty);
      box.innerHTML = list.map(h => {
        const ch = hpMap[h.uid];
        const down = ch && (ch.down > 0 || ch.hp <= 0);
        const st = h.stats;
        const gear = {};
        for (const slot of Object.keys(h.equipment)) {
          const uid = h.equipment[slot];
          if (uid) gear[slot] = v.inventory.find(i => i.uid === uid);
        }
        return `<div class="hero-card ${down ? 'down' : ''}">
          <div class="hero-head">
            <div><b>${esc(h.zh)}</b> <span class="muted">Lv.${h.level}</span>
              ${down ? `<span class="tiny" style="color:var(--bad)">倒下${ch.down ? ' ' + ch.down + 's' : ''}</span>` : ''}</div>
            <div class="tiny muted">${rowZh(h.row)}</div>
          </div>
          <div class="hero-stats">
            <div><span>DPS</span> ${shortNum(st.dps)}</div>
            <div><span>攻</span> ${shortNum(st.atk)}</div>
            <div><span>防</span> ${shortNum(st.def)}</div>
            <div><span>暴击</span> ${st.crit}%</div>
          </div>
        </div>`;
      }).join('') || '<div class="muted small">还没有部署英雄 —— 去「阵容」页签部署</div>';
    }
  };

  // ---- 小工具 ----
  // 稀有度配色：必须与 engine/data/items.js 的 RARITY_COLOR 完全一致。
  // 抽成前端常量是为了让 stage.js 不必等 gamedata 到达就能画出掉落预览。
  //
  // 原实现只有 6 档，且键名 Epic / Mythic 在引擎里根本不存在
  // （引擎实际用的是 Immortal / Arcana / Beyond / Celestial / Divine / Cosmic），
  // 导致战场上 6 档以上的掉落预览全部退回默认灰色 ——
  // 越稀有的装备反而看不出稀有。键名与数量都要以引擎为准，不要凭印象写。
  const RARITY_COLOR = {
    Common: '#9aa3b2', Uncommon: '#4caf50', Rare: '#3f8cff', Legendary: '#a855f7',
    Immortal: '#f59e0b', Arcana: '#06b6d4', Beyond: '#ef4444', Celestial: '#facc15',
    Divine: '#f472b6', Cosmic: '#a78bfa'
  };

  const SPRITES = {
    slime: '🟢', wolf: '🐺', bandit: '🥷', bat: '🦇', boar: '🐗', skeleton: '💀',
    ogre: '👹', treant: '🌳', fly: '🪰', lavaworm: '🐛', golem: '🗿', shaman: '🔮',
    hound: '🐕', fire_spirit: '🔥', warlord: '👺', ashdragon: '🐉',
    ghost: '👻', wraith: '🌫️', darkknight: '⚔️', voidmage: '🧙', abyssbeast: '🦖',
    bluegolem: '🧊', titan: '🗿', formless: '🌀'
  };
  function spriteOf(s) { return SPRITES[s] || '👾'; }

  /**
   * 解析英雄的走路帧图片名（不含目录与扩展名）。
   *
   * 背景：引擎下发的阵容对象（view.heroes[]）带的是 classId，
   * 并没有 sprite 字段 —— sprite 只存在于 engine/data/classes.js 的
   * CLASSES 表里，且当前恰好与 classId 同名。原实现直接读 h.sprite，
   * 于是拼出 "assets/heroes/undefined_walk_0.png"，
   * 4 张图全部 404，浏览器上只剩 HTML 血条（血条不依赖图片，故仍可见）。
   *
   * 优先读 classId：它是引擎真实下发的字段，且与素材文件名一一对应
   * （niuma / roudan）。heroSprite 供未来出现「同职业不同形象」时使用。
   *
   * @param {Object} h 引擎下发的英雄对象
   * @returns {string} 素材名，用于拼 assets/heroes/<name>_walk_<i>.png
   */
  function heroSprite(h) {
    return h.heroSprite || h.sprite || h.classId || 'niuma';
  }

  function rowZh(r) { return { front: '前排', mid: '中排', back: '后排' }[r] || r; }
  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  function clampSpd(v) { return Math.max(0.25, Math.min(3.2, v || 1)); }
  function shortNum(v) {
    v = Math.round(v || 0);
    const a = Math.abs(v);
    if (a >= 1e9) return (v / 1e9).toFixed(1) + 'B';
    if (a >= 1e6) return (v / 1e6).toFixed(1) + 'M';
    if (a >= 1e4) return (v / 1e3).toFixed(1) + 'K';
    return String(v);
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
  function replay(el, cls) {
    if (!el) return;
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
    setTimeout(() => el.classList.remove(cls), 420);
  }

  global.Stage = Stage;
  global.StageUtils = { spriteOf, heroSprite, rowZh, shortNum, esc, replay, RARITY_COLOR };
})(window);
