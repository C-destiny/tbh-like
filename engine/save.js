/**
 * 存档结构定义与版本迁移
 * ---------------------------------------------------------------------------
 * 【升级路径】改动存档字段时：
 *   1. config.schemaVersion += 1
 *   2. 在 MIGRATIONS 里加一个函数 (state) => state
 *   迁移会在读档时自动依次执行，老存档不会被丢弃。
 */

const { uid } = require('./util');
const { CLASSES, CLASS_ORDER } = require('./data/classes');
const T = require('./tunables');

const DEFAULT_CLASSES = ['niuma', 'roudan'];

/**
 * 旧职业 -> 新角色的映射。v1 时代有 6 个职业，现在只有 2 个角色。
 * 这里同时兜住两种情况：老存档迁移、以及旧版前端页面（缓存）发来已不存在的 classId。
 */
const LEGACY_CLASS_MAP = {
  Knight: 'niuma', Priest: 'niuma', Slayer: 'niuma',
  Ranger: 'roudan', Sorcerer: 'roudan', Hunter: 'roudan'
};

/** 任何来源的 classId 都先过这里，保证一定是存在的角色 */
function normalizeClassId(id) {
  if (CLASSES[id]) return id;
  return LEGACY_CLASS_MAP[id] || 'niuma';
}

function makeHero(classId, level = 1) {
  const cid = normalizeClassId(classId);
  return {
    uid: uid('h'),
    classId: cid,
    level,
    xp: 0,
    skillPoints: 0,
    skills: {},                       // skillId -> level
    equipment: { weapon: null, helmet: null, armor: null, boots: null, ring: null, amulet: null },
    row: CLASSES[cid]?.preferRow || 'mid',
    alive: true,
    createdAt: Date.now()
  };
}

function createNewSave(opts = {}) {
  const cfg = T.get();
  const startClass = opts.classId || 'niuma';
  const hero = makeHero(startClass, 1);
  const now = Date.now();

  return {
    schemaVersion: cfg.schemaVersion,
    id: opts.id || uid('p'),
    name: opts.name || '无名冒险者',
    token: opts.token || uid('tk'),
    createdAt: now,
    lastSeenAt: now,
    lastTickAt: now,
    seed: opts.seed || Math.floor(Math.random() * 2 ** 31),

    gold: 0,
    heroes: [hero],
    party: [hero.uid],
    unlockedClasses: [...DEFAULT_CLASSES],

    inventory: [],
    stash: [],
    materials: {},
    coins: {},

    runes: {},
    pets: {},
    deployedPet: null,

    killCounts: {},        // monsterId -> n
    stageKills: {},        // '1-8' -> n

    clearedStages: { Normal: {}, Hard: {}, Expert: {}, Hell: {} },
    currentStage: { difficulty: 'Normal', id: '1-1' },
    autoRetry: true,
    running: false,

    chests: [],            // 未开启的宝箱
    chestCd: { normal: 0, boss: 0, actBoss: 0 },

    cube: { level: 1, xp: 0 },

    achievements: {},
    stats: {
      totalKills: 0, totalGold: 0, offlineClaims: 0,
      cubeOps: {}, gearObtained: {}, maxPartySize: 1, playSeconds: 0
    },

    modifiers: [],         // GM 施加的临时增益 [{ id, label, until, effects }]
    log: [],
    seenAnnouncements: []
  };
}

// ---------------------------------------------------------------------------
// 迁移：键是"从哪个版本升上去"
// ---------------------------------------------------------------------------
const MIGRATIONS = {
  /**
   * v1 -> v2：职业体系从「6 职业」改成「2 个角色（肾虚牛马 / 肉蛋葱击使者）」。
   * 旧职业按定位映射过来；技能 id 全换了，所以清空技能并把点数退回，
   * 玩家不会白白损失加点。
   */
  1: (s) => {
    for (const h of (s.heroes || [])) {
      h.classId = normalizeClassId(h.classId);
      const refund = Object.values(h.skills || {}).reduce((a, v) => a + (Number(v) || 0), 0);
      h.skills = {};
      h.skillPoints = (h.skillPoints || 0) + refund;
      h.row = CLASSES[h.classId]?.preferRow || 'front';
    }
    s.unlockedClasses = Object.keys(CLASSES);

    // 装备上的职业标签也要跟着换，否则名字和元素亲和会对不上
    for (const list of [s.inventory, s.stash]) {
      for (const it of (list || [])) if (it) it.classId = normalizeClassId(it.classId);
    }
    return s;
  }
};

/** 补齐缺失字段（新老存档都跑一遍，防止加字段后旧档炸掉） */
function fillDefaults(state) {
  const cfg = T.get();
  state.schemaVersion = state.schemaVersion || 1;
  state.stats = state.stats || {};
  state.stats.cubeOps = state.stats.cubeOps || {};
  state.stats.gearObtained = state.stats.gearObtained || {};
  state.stats.totalKills = state.stats.totalKills || 0;
  state.stats.totalGold = state.stats.totalGold || 0;
  state.stats.offlineClaims = state.stats.offlineClaims || 0;
  state.stats.playSeconds = state.stats.playSeconds || 0;
  state.materials = state.materials || {};
  state.coins = state.coins || {};
  state.runes = state.runes || {};
  state.pets = state.pets || {};
  state.killCounts = state.killCounts || {};
  state.stageKills = state.stageKills || {};
  state.inventory = state.inventory || [];
  state.stash = state.stash || [];
  state.log = state.log || [];
  state.modifiers = state.modifiers || [];
  state.seenAnnouncements = state.seenAnnouncements || [];
  state.clearedStages = state.clearedStages || { Normal: {}, Hard: {}, Expert: {}, Hell: {} };
  for (const d of ['Normal', 'Hard', 'Expert', 'Hell']) state.clearedStages[d] = state.clearedStages[d] || {};
  state.currentStage = state.currentStage || { difficulty: 'Normal', id: '1-1' };
  state.chestCd = state.chestCd || { normal: 0, boss: 0, actBoss: 0 };
  state.chests = state.chests || [];
  state.cube = state.cube || { level: 1, xp: 0 };
  state.achievements = state.achievements || {};
  state.party = state.party || [];
  state.heroes = (state.heroes || []).map(h => {
    h.classId = normalizeClassId(h.classId);   // 兜住旧职业/脏数据
    h.equipment = h.equipment || { weapon: null, helmet: null, armor: null, boots: null, ring: null, amulet: null };
    h.skills = h.skills || {};
    // 技能 id 可能来自已删除的职业，清掉对应的加点并退回点数
    const valid = new Set((CLASSES[h.classId]?.skills || []).map(s => s.id));
    for (const [sid, lv] of Object.entries(h.skills)) {
      if (!valid.has(sid)) { h.skillPoints = (h.skillPoints || 0) + (Number(lv) || 0); delete h.skills[sid]; }
    }
    h.row = h.row || CLASSES[h.classId]?.preferRow || 'mid';
    h.alive = h.alive !== false;
    return h;
  });
  state.unlockedClasses = state.unlockedClasses || [...DEFAULT_CLASSES];
  for (const list of [state.inventory, state.stash]) {
    for (const it of (list || [])) if (it && it.classId) it.classId = normalizeClassId(it.classId);
  }
  return state;
}

function migrate(state) {
  fillDefaults(state);
  const target = T.get().schemaVersion;
  let v = state.schemaVersion || 1;
  while (v < target) {
    const fn = MIGRATIONS[v];
    if (fn) state = fn(state);
    v++;
  }
  state.schemaVersion = target;
  return state;
}

module.exports = { createNewSave, migrate, fillDefaults, makeHero, MIGRATIONS, DEFAULT_CLASSES, normalizeClassId, LEGACY_CLASS_MAP };
