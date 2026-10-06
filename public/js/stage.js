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
      el.innerHTML =
        `<div class="walk">${[0, 1, 2, 3].map(i =>
          `<img src="assets/heroes/${h.sprite}_walk_${i}.png" alt="">`).join('')}</div>` +
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
      const d = this.dom();
      const rect = u.el.getBoundingClientRect();
      const vrect = d.view.getBoundingClientRect();
      const cx = rect.left + rect.width / 2 - vrect.left;
      const cy = rect.top + rect.height * 0.6 - vrect.top;

      u.el.classList.add('dying');
      setTimeout(() => u.el.remove(), 480);
      this.dropLoot(cx, cy, u.boss);
    },

    // ---------------------------------------------------------------- 掉落
    dropLoot(x, y, boss) {
      const d = this.dom();
      const n = boss ? 3 : (Math.random() < 0.45 ? 1 : 0);
      for (let i = 0; i < Math.max(1, n); i++) {
        const isCoin = Math.random() < (boss ? 0.35 : 0.7);
        const el = document.createElement('div');
        el.className = 'loot' + (isCoin ? ' coin' : ' gear');
        el.style.left = x + 'px';
        el.style.top = y + 'px';
        el.style.animationDelay = (i * 90) + 'ms';
        el.innerHTML = isCoin
          ? `<span>🪙</span>`
          : GearUI.gearIcon(pick(['weapon', 'helmet', 'armor', 'boots', 'ring', 'amulet']),
            pick(['#9aa3b2', '#4caf50', '#3f8cff', '#a855f7', '#f59e0b']), 20);
        d.drops.appendChild(el);
        el.addEventListener('animationend', () => {
          el.classList.add('collected');
          setTimeout(() => el.remove(), 620);
        });
      }
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

      requestAnimationFrame(this.frame.bind(this));
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
  const SPRITES = {
    slime: '🟢', wolf: '🐺', bandit: '🥷', bat: '🦇', boar: '🐗', skeleton: '💀',
    ogre: '👹', treant: '🌳', fly: '🪰', lavaworm: '🐛', golem: '🗿', shaman: '🔮',
    hound: '🐕', fire_spirit: '🔥', warlord: '👺', ashdragon: '🐉',
    ghost: '👻', wraith: '🌫️', darkknight: '⚔️', voidmage: '🧙', abyssbeast: '🦖',
    bluegolem: '🧊', titan: '🗿', formless: '🌀'
  };
  function spriteOf(s) { return SPRITES[s] || '👾'; }
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
  global.StageUtils = { spriteOf, rowZh, shortNum, esc, replay };
})(window);
