/* 实时排行榜纯展示模块：排序与 HTML 生成不持有服务器状态。 */
(function () {
  const SORTS = {
    progress: ['progressScore', '进度'], level: ['level', '等级'], dps: ['dps', 'DPS'],
    kills: ['kills', '击杀'], gold: ['gold', '金币']
  };
  const esc = (value) => String(value ?? '').replace(/[&<>"]/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'
  }[char]));
  const num = (value) => Math.round(value || 0).toLocaleString('en-US');

  /** 输入公开榜单及视图选项，返回完整榜单 HTML；无副作用。 */
  function render(rows, options) {
    const sortKey = SORTS[options.sortKey] ? options.sortKey : 'progress';
    const field = SORTS[sortKey][0];
    const sorted = [...rows].sort((a, b) => b[field] - a[field] || b.progressScore - a.progressScore);
    const controls = Object.entries(SORTS).map(([key, item]) =>
      `<button class="sm ${key === sortKey ? 'primary' : ''}" onclick="App.setRankSort('${key}')">${item[1]}</button>`
    ).join('');
    const body = sorted.map((row, index) => `<tr class="${row.id === options.selfId ? 'is-self' : ''}">
      <td><span class="rank-no rank-${index + 1}">${index + 1}</span></td>
      <td><span class="online-dot ${row.online ? 'is-online' : ''}"></span>${esc(row.name)}
        ${row.id === options.selfId ? '<span class="tiny self-tag">你</span>' : ''}</td>
      <td>${esc(row.progress)}<div class="tiny muted">${row.cleared} 关</div></td>
      <td class="num">${row.level}</td><td class="num">${num(row.dps)}</td>
      <td class="num">${num(row.ehp)}</td><td class="num">${num(row.kills)}</td>
      <td class="num">${num(row.gold)}</td><td class="num">${row.runes}</td>
    </tr>`).join('');
    const time = options.updatedAt
      ? new Date(options.updatedAt).toLocaleTimeString('zh-CN', { hour12: false }) : '--';
    return `<div class="card leaderboard-head"><div><h3>全服排行榜</h3>
      <div class="small muted">共 ${rows.length} 名玩家 · 每秒实时更新 · ${time}</div></div>
      <div class="rank-sorts">${controls}</div></div>
      <div class="card leaderboard-wrap"><table class="leaderboard-table"><thead><tr>
      <th>#</th><th>玩家</th><th>最高进度</th><th class="num">等级</th><th class="num">DPS</th>
      <th class="num">EHP</th><th class="num">击杀</th><th class="num">金币</th><th class="num">符文</th>
      </tr></thead><tbody>${body || '<tr><td colspan="9" class="muted">等待服务器数据…</td></tr>'}</tbody>
      </table></div>`;
  }

  window.LeaderboardUI = { render };
})();
