/* ==========================================================================
   GM 控制台
   ========================================================================== */
(function () {
  const S = { meta: null, tunables: [], overrides: {}, selected: null, players: [], events: [] };
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const n = (v) => Math.round(v || 0).toLocaleString('en-US');

  function boot() {
    const saved = localStorage.getItem('tbh_gm_token') || '';
    $('gm-token').value = saved;
    $('gm-go').onclick = login;
    $('gm-token').onkeydown = e => { if (e.key === 'Enter') login(); };
    if (saved) login();
  }

  function login() {
    const token = $('gm-token').value.trim();
    if (!token) return;
    localStorage.setItem('tbh_gm_token', token);
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    Net.connect(`${proto}://${location.host}/ws`);
    Net.on('hello', () => Net.send({ type: 'hello', role: 'gm', token }));

    Net.on('welcome', (m) => {
      if (m.role !== 'gm') return;
      S.meta = m.meta;
      $('login').style.display = 'none';
      $('wrap').style.display = '';
      fillSelects();
      // 拉一次数据
      ['players', 'tunables', 'audit', 'announcements', 'meta'].forEach(c => Net.gm(c));
    });

    Net.on('error', (m) => { $('g-status').textContent = m.msg || '错误'; alert(m.msg || '错误'); });
    Net.on('gmState', (m) => { S.players = m.players; S.events = m.events; S.overrides = m.overrides || {}; renderPlayers(); renderEvents(); });
    Net.on('gmResult', onResult);
    Net.on('playerEvent', (m) => {
      const box = $('g-alerts');
      const d = document.createElement('div');
      d.className = 'toast info';
      d.textContent = `[${m.playerName}] ${describeEvent(m.ev)}`;
      box.appendChild(d);
      setTimeout(() => d.remove(), 4000);
    });
    Net.onStatus = (st) => { $('g-status').textContent = st === 'connected' ? '已连接' : '连接中/重连中'; };
  }

  function describeEvent(ev) {
    switch (ev.t) {
      case 'levelUp': return `升级到 Lv.${ev.level}`;
      case 'stageCleared': return `通关 ${ev.stageId}`;
      case 'stageFailed': return `挑战失败 ${ev.stageId}`;
      case 'achievement': return `达成成就「${ev.ach.zh}」`;
      case 'pet': return `解锁宠物「${ev.pet.zh}」`;
      case 'chest': return `获得 ${ev.chest.zh}`;
      case 'runStart': return `开始挑战 ${ev.stageId}`;
      default: return ev.t;
    }
  }

  function onResult(m) {
    if (!m.ok && m.msg) { toast(m.msg, 'bad'); return; }
    if (m.cmd === 'players') { S.players = m.players; renderPlayers(); }
    else if (m.cmd === 'tunables') { S.tunables = m.list || []; S.overrides = m.overrides || {}; renderTunables(); }
    else if (m.cmd === 'audit') { renderAudit(m.list || []); }
    else if (m.cmd === 'announcements') { renderAnns(m.list || []); }
    else if (m.cmd === 'event') { S.events = m.list || []; renderEvents(); if (m.msg) toast(m.msg, 'good'); }
    else if (m.cmd === 'meta') { S.meta = m; fillSelects(); }
    else if (m.cmd === 'inspect') { showInspect(m.view); }
    else if (m.msg) toast(m.msg, 'good');
  }

  function fillSelects() {
    const m = S.meta; if (!m) return;
    $('gv-rarity').innerHTML = m.rarities.map(r => `<option value="${r}">${esc(r)}</option>`).join('');
    $('gv-slot').innerHTML = `<option value="">随机槽位</option>` + m.slots.map(s => `<option value="${s.id}">${esc(s.zh)}</option>`).join('');
    $('gv-class').innerHTML = `<option value="">随机职业</option>` + m.classes.map(c => `<option value="${c.id}">${esc(c.zh)}</option>`).join('');
    $('gv-mat').innerHTML = m.materials.map(x => `<option value="${x.id}">${esc(x.zh)} (T${x.tier})</option>`).join('');
    $('gv-pet').innerHTML = m.pets.map(p => `<option value="${p.id}">${esc(p.zh)}</option>`).join('');
    $('gv-rune').innerHTML = m.runes.map(r => `<option value="${r.id}">${esc(r.name)} · ${n(r.cost)}</option>`).join('');
    $('gv-event').innerHTML = Object.entries(m.events).map(([k, v]) => `<option value="${k}">${esc(v.label)}（默认 ${v.durationSec}s）</option>`).join('');
  }

  // ---- 玩家列表 ----
  function renderPlayers() {
    $('g-count').textContent = `玩家 ${S.players.length} · 在线 ${S.players.filter(p => p.online).length}`;
    $('g-players').innerHTML = `<table>
      <tr><th>名字</th><th class="num">等级</th><th class="num">金币</th><th>关卡</th><th>状态</th><th></th></tr>` +
      S.players.map(p => `<tr style="cursor:pointer;background:${S.selected === p.id ? '#2f2a16' : ''}" onclick="G.select('${p.id}')">
        <td>${p.online ? '🟢' : '⚪'} ${esc(p.name)}</td>
        <td class="num">${p.level}</td><td class="num gold">${n(p.gold)}</td>
        <td>${esc(p.stage)}</td>
        <td>${p.running ? '<span style="color:var(--ok)">挂机中</span>' : '<span class="muted">暂停</span>'}</td>
        <td><button class="sm" onclick="event.stopPropagation();G.inspect('${p.id}')">查看</button></td>
      </tr>`).join('') + `</table>`;
    if (S.selected) {
      const p = S.players.find(x => x.id === S.selected);
      $('g-sel').innerHTML = p ? `已选择：<b>${esc(p.name)}</b>（${p.id}）` : '所选玩家已不存在';
    }
  }

  function renderEvents() {
    const now = Date.now();
    $('g-events').innerHTML = S.events.length
      ? S.events.map(e => `<div class="row tiny" style="padding:3px 0">
          <span style="flex:1">✨ ${esc(e.label)}</span>
          <span class="muted">剩 ${Math.max(0, Math.round((e.until - now) / 1000))}s</span>
          <button class="sm danger" onclick="G.gm('event',{op:'stop',id:'${e.id}'})">停</button>
        </div>`).join('')
      : `<div class="tiny muted">当前没有进行中的事件</div>`;
  }

  function renderTunables() {
    const q = ($('gv-search').value || '').toLowerCase();
    const list = S.tunables.filter(t => !q || t.label.toLowerCase().includes(q) || t.path.toLowerCase().includes(q));
    $('g-tunable-count').textContent = `${list.length} 项`;
    $('g-tunables').innerHTML = list.map(t => {
      const cur = (t.path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), S.overrides));
      const isDef = cur === undefined;
      return `<div class="tunable-row ${isDef ? '' : 'changed'}">
        <label title="${esc(t.path)}">${esc(t.group)} · ${esc(t.label)}</label>
        <input type="number" step="any" value="${t.value}" data-path="${esc(t.path)}"
          onchange="G.setTunable('${esc(t.path)}', this.value)">
        <button class="sm" onclick="G.resetTunable('${esc(t.path)}')">↺</button>
      </div>`;
    }).join('');
  }

  function renderAudit(list) {
    $('g-audit').innerHTML = list.map(a =>
      `<div><span class="muted">${new Date(a.at).toLocaleString('zh-CN', { hour12: false })}</span>
       <b>${esc(a.kind)}</b> <span class="muted">${esc(typeof a.detail === 'string' ? a.detail : JSON.stringify(a.detail))}</span></div>`).join('');
  }
  function renderAnns(list) {
    $('g-anns').innerHTML = list.map(a =>
      `<div>${new Date(a.at).toLocaleString('zh-CN', { hour12: false })} — ${esc(a.text)}</div>`).join('');
  }

  function showInspect(v) {
    const box = document.createElement('div');
    box.className = 'modal-mask';
    box.innerHTML = `<div class="modal">
      <h2>${esc(v.name)} <button class="sm close" onclick="this.closest('.modal-mask').remove()">关闭</button></h2>
      <div class="small">金币 ${n(v.gold)} · 队伍 DPS ${n(v.partySummary.dps)} / EHP ${n(v.partySummary.ehp)} · 关卡 ${v.currentStage.difficulty} ${v.currentStage.id}</div>
      <div class="small muted">英雄：</div>
      <table><tr><th>职业</th><th class="num">等级</th><th class="num">DPS</th><th class="num">EHP</th></tr>
      ${v.heroes.map(h => `<tr><td>${esc(h.zh)}</td><td class="num">${h.level}</td><td class="num">${n(h.stats?.dps || 0)}</td><td class="num">${n(h.stats?.ehp || 0)}</td></tr>`).join('')}
      </table>
      <div class="small muted" style="margin-top:8px">背包 ${v.inventory.length} 件 · 符文 ${Object.values(v.runes).filter(Boolean).length} ·
        成就 ${Object.values(v.achievements).filter(a => a.done).length} · 击杀 ${n(v.stats.totalKills)}</div>
      <div class="small muted">最近日志：</div>
      <div class="log">${(v.log || []).slice(0, 12).map(l => `<div class="t-${l.type}">${esc(l.text)}</div>`).join('')}</div>
    </div>`;
    box.onclick = (e) => { if (e.target === box) box.remove(); };
    document.body.appendChild(box);
  }

  function toast(text, kind) {
    const d = document.createElement('div');
    d.className = 'toast ' + (kind || 'info');
    d.textContent = text;
    $('g-alerts').appendChild(d);
    setTimeout(() => d.remove(), 3500);
  }

  // ---- 对外动作 ----
  window.G = {
    gm: (cmd, args) => Net.gm(cmd, args),
    select(id) { S.selected = id; renderPlayers(); },
    need() {
      if (!S.selected) { toast('先在左侧选择一个玩家', 'bad'); return null; }
      return S.selected;
    },
    grant(extra) {
      const id = G.need(); if (!id) return;
      Net.gm('grant', { playerId: id, ...extra });
    },
    grantItem() {
      const id = G.need(); if (!id) return;
      Net.gm('grant', {
        playerId: id, item: {
          rarity: $('gv-rarity').value,
          slot: $('gv-slot').value || undefined,
          classId: $('gv-class').value || undefined,
          ilvl: Number($('gv-ilvl').value) || 30,
          count: Number($('gv-icount').value) || 1
        }
      });
    },
    take(extra) {
      const id = G.need(); if (!id) return;
      if (extra.clearInventory && !confirm('确定清空该玩家背包？')) return;
      if (extra.resetLevel && !confirm('确定把该玩家所有英雄等级归 1？')) return;
      Net.gm('take', { playerId: id, ...extra });
    },
    kick() {
      const id = G.need(); if (!id) return;
      Net.gm('kick', { playerId: id, reason: $('gv-kickreason').value || '被 GM 请离' });
    },
    reset() {
      const id = G.need(); if (!id) return;
      if (!confirm('确定重置该玩家的整个存档？此操作不可撤销！')) return;
      Net.gm('reset', { playerId: id });
    },
    rename() {
      const id = G.need(); if (!id) return;
      Net.gm('rename', { playerId: id, name: $('gv-rename').value });
    },
    inspect(id) { Net.gm('inspect', { playerId: id }); },
    startEvent() {
      Net.gm('event', {
        op: 'start', kind: $('gv-event').value,
        durationSec: Number($('gv-evdur').value) || undefined
      });
    },
    stopEvent() { Net.gm('event', { op: 'stop' }); },
    announce() {
      const t = $('gv-ann').value.trim();
      if (!t) return;
      Net.gm('announce', { text: t });
      $('gv-ann').value = '';
      setTimeout(() => Net.gm('announcements'), 300);
    },
    setTunable(path, value) {
      const v = value === '' ? undefined : Number(value);
      Net.gm('tunables', { op: 'set', path, value: v });
      setTimeout(() => Net.gm('tunables'), 250);
    },
    resetTunable(path) {
      Net.gm('tunables', { op: 'reset', path });
      setTimeout(() => Net.gm('tunables'), 250);
    },
    resetAllTunables() {
      if (!confirm('确定把所有数值恢复为默认值？')) return;
      Net.gm('tunables', { op: 'resetAll' });
      setTimeout(() => Net.gm('tunables'), 250);
    },
    renderTunables
  };

  boot();
})();
