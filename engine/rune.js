/**
 * 符文树：解锁判定与加成聚合
 */

const { RUNES, RUNE_MAP, BRANCHES } = require('./data/runes');

const BONUS_KEYS = [
  'partyAtkPct', 'partyHpPct', 'partyDefPct', 'partyAtkSpeedPct',
  'partyCritRate', 'partyCritDmg', 'goldPct', 'expPct', 'bossGoldPct',
  'alchemyPct', 'chestRate', 'rarityPct', 'chestCdPct', 'offlineGoldPct',
  'offlineExpPct', 'moveSpeed', 'lifesteal', 'healPower'
];

/** 聚合所有已点亮节点的效果 */
function aggregate(state) {
  const b = {};
  let partySlot = 0, skillSlot = 0, bagSlots = 0, stashSlots = 0, chestCap = 0;
  const autoOpen = new Set();
  const unlocked = state.runes || {};

  for (const id of Object.keys(unlocked)) {
    if (!unlocked[id]) continue;
    const r = RUNE_MAP[id];
    if (!r) continue;
    for (const [k, v] of Object.entries(r.effects)) {
      if (k === 'partySlot') partySlot += v;
      else if (k === 'skillSlot') skillSlot += v;
      else if (k === 'bagSlots') bagSlots += v;
      else if (k === 'stashSlots') stashSlots += v;
      else if (k === 'chestCap') chestCap += v;
      else if (k === 'autoOpen') autoOpen.add(v);
      else b[k] = (b[k] || 0) + v;
    }
  }
  b.partySlot = partySlot;
  b.skillSlot = skillSlot;
  b.bagSlots = bagSlots;
  b.stashSlots = stashSlots;
  b.chestCap = chestCap;
  b.autoOpen = [...autoOpen];
  return b;
}

/** 能否解锁某个节点 */
function canUnlock(state, runeId) {
  const r = RUNE_MAP[runeId];
  if (!r) return { ok: false, reason: '符文不存在' };
  if (state.runes?.[runeId]) return { ok: false, reason: '已点亮' };
  for (const req of r.requires || []) {
    if (!state.runes?.[req]) {
      return { ok: false, reason: `需先点亮：${RUNE_MAP[req]?.name || req}` };
    }
  }
  if (state.gold < r.cost) return { ok: false, reason: `金币不足（需 ${r.cost}）` };
  return { ok: true };
}

function unlock(state, runeId) {
  const chk = canUnlock(state, runeId);
  if (!chk.ok) return chk;
  const r = RUNE_MAP[runeId];
  state.gold -= r.cost;
  state.runes[runeId] = true;
  return { ok: true, rune: r };
}

/** 列出当前最便宜的 N 个可买节点 */
function cheapestBuyable(state, n = 5) {
  return RUNES
    .filter(r => {
      if (state.runes?.[r.id]) return false;
      return (r.requires || []).every(x => state.runes?.[x]);
    })
    .sort((a, b) => a.cost - b.cost)
    .slice(0, n);
}

/** 给前端画树用：节点 + 状态 */
function treeView(state) {
  return RUNES.map(r => {
    // 复用 canUnlock 的判定，避免在展示层复制出第二套购买规则：
    // 已拥有和前置未满足时 reason 就是失败原因；金币不足时 affordable 为 false。
    const chk = canUnlock(state, r.id);
    return {
      ...r,
      owned: !!state.runes?.[r.id],
      // 前置已满足（无论金币是否足够）
      available: !state.runes?.[r.id] && (r.requires || []).every(x => state.runes?.[x]),
      // 前置已满足且金币足够
      affordable: chk.ok,
      reason: state.runes?.[r.id] ? '已点亮' : chk.reason,
      branchZh: BRANCHES[r.branch]?.zh || r.branch
    };
  });
}

module.exports = { aggregate, canUnlock, unlock, cheapestBuyable, treeView, BONUS_KEYS, BRANCHES };
