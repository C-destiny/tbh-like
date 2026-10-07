/**
 * 存档结构定义与版本迁移
 * ---------------------------------------------------------------------------
 * 【升级路径】改动存档字段时：
 *   1. config.schemaVersion += 1
 *   2. 在 MIGRATIONS 里加一个函数 (state) => state
 *   迁移会在读档时自动依次执行，老存档不会被丢弃。
 */

const { uid } = require('./util');
const { CHEST_TIERS, CHEST_TIER_ORDER } = require('./loot');
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
    chestCd: { common: 0, fine: 0, boss: 0, actBoss: 0 },

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
  },

  /**
   * v2 -> v3：宝箱从 3 档（normal/boss/actBoss）扩到 4 档，
   * 键名 normal 改为 common，并新增 fine（精良）档。参见 engine/loot.js 的 CHEST_TIERS。
   *
   * 要迁两处，缺一不可：
   *   1. 背包里未开启的宝箱：type/zh/icon/color 全部要换成新档位定义。
   *      只改 type 不改 zh 的话，旧箱会显示成「普通宝箱」但走 fine 档的参数，
   *      名字与内容对不上。物品内容（items/gold）沿用，不重掷 ——
   *      重掷等于凭空改玩家已获得的收益。
   *   2. chestCd 的键名：normal -> common，并补上 fine 的初值。
   *      漏了的话自动开箱读 st.chestCd.fine 得到 undefined，
   *      与 0 比较为 false，会在同一次 tick 里连开多个箱。
   */
  2: (s) => {
    for (const c of (s.chests || [])) {
      if (!c || c.opened) continue;
      // 旧档 normal -> 新档 common；未知档位一律归到 common，保证不出现孤儿宝箱
      const key = c.type === 'normal' ? 'common' : (CHEST_TIERS[c.type] ? c.type : 'common');
      const tier = CHEST_TIERS[key];
      c.type = key;
      c.zh = tier.zh;
      c.icon = tier.icon;
      c.color = tier.color;
    }

    // chestCd 重建为全档位齐全的零值，避免残留旧键与缺失新键
    s.chestCd = {};
    for (const t of CHEST_TIER_ORDER) s.chestCd[t] = 0;
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
  // chestCd 逐档位补齐：整体 || {} 兜不住「对象存在但缺某个新档位键」的情况。
  // 缺键时 st.chestCd.fine 为 undefined，与 0 比较为 false，会导致同一次 tick 连开多箱。
  state.chestCd = state.chestCd || {};
  for (const t of CHEST_TIER_ORDER) {
    if (typeof state.chestCd[t] !== 'number') state.chestCd[t] = 0;
  }
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
