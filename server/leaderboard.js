/** 排行榜只汇总可公开的玩法统计，不返回令牌、装备或完整存档。 */
const DIFFICULTIES = ['Normal', 'Hard', 'Expert', 'Hell'];
const STAGES_PER_DIFFICULTY = 30;

function stageNumber(stageId) {
  const parts = String(stageId || '').split('-').map(Number);
  if (parts.length !== 2 || parts.some(Number.isNaN)) return 0;
  return (parts[0] - 1) * 10 + parts[1];
}

function progressOf(state) {
  let score = 0;
  let label = '未通关';
  let cleared = 0;
  for (let i = 0; i < DIFFICULTIES.length; i++) {
    const difficulty = DIFFICULTIES[i];
    for (const [stageId, result] of Object.entries(state.clearedStages?.[difficulty] || {})) {
      if (!result) continue;
      cleared++;
      const nextScore = i * STAGES_PER_DIFFICULTY + stageNumber(stageId);
      if (nextScore > score) {
        score = nextScore;
        label = `${difficulty} ${stageId}`;
      }
    }
  }
  return { score, label, cleared };
}

/** 输入 Player 集合与在线判断函数，返回按最高进度排序的公开快照；无副作用。 */
function buildLeaderboard(players, isOnline) {
  const rows = [];
  for (const player of players) {
    const state = player.state;
    const view = player.view();
    const progress = progressOf(state);
    rows.push({
      id: state.id, name: state.name, online: !!isOnline(state.id),
      level: Math.max(...state.heroes.map(hero => hero.level), 0),
      progress: progress.label, progressScore: progress.score, cleared: progress.cleared,
      dps: view.partySummary.dps, ehp: view.partySummary.ehp,
      gold: state.gold, kills: state.stats.totalKills,
      runes: Object.keys(state.runes || {}).length
    });
  }
  return rows.sort((a, b) => b.progressScore - a.progressScore || b.level - a.level || b.dps - a.dps);
}

module.exports = { buildLeaderboard };
