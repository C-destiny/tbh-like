/**
 * 全局可调数值 (Live Tunables)
 * ---------------------------------------------------------------------------
 * 这里所有的数值都是 GM 可以在运行时热改的（改完立刻对在线玩家生效）。
 * 修改方式有两种：
 *   1. 直接编辑本文件后重启服务器（持久、可进 git）
 *   2. GM 控制台 -> "实时调参"（写进 DB 的 overrides 表，重启后依然生效，
 *      且优先级高于本文件）
 *
 * 想加一个新的可调参数，只要在下面加一个字段即可，GM 面板会自动出现该条目。
 * ---------------------------------------------------------------------------
 */

const CONFIG = {
  // 存档结构版本。改数据结构时 +1，并在 engine/save.js 的 MIGRATIONS 里写迁移函数
  schemaVersion: 2,

  combat: {
    tickMs: 1000,            // 服务器模拟步长（毫秒）
    maxTicksPerCatchUp: 600, // 一次补算最多多少 tick，防止卡顿雪崩
    critBaseDmg: 1.5,        // 暴击伤害倍率基数
    defK: 100,               // 减伤系数： 实际伤害 = 原始 * defK/(defK+防御)
    lifestealCap: 0.35,      // 吸血上限
    reviveSeconds: 60,       // 英雄阵亡后的复活冷却
    waveGapSeconds: 2,       // 两波之间的间隔
    waveHealPct: 0.25,       // 清完一波回复的最大生命比例
    failRetrySeconds: 8,     // 挑战失败后自动重试的等待时间
    rowDamageTaken: {        // 站位承伤权重：前排吃得多
      front: 1.0,
      mid: 0.6,
      back: 0.35
    },
    roleBonus: {             // 站位带来的输出/生存倾向
      front: { dmg: 0.85, hp: 1.25 },
      mid:   { dmg: 1.0,  hp: 1.0  },
      back:  { dmg: 1.15, hp: 0.85 }
    }
  },

  hero: {
    // 升级所需经验： base * level^expPow
    expBase: 42,
    expPow: 1.58,
    // 每级成长（线性叠加在基础值上）
    growth: { hp: 9.0, atk: 1.35, def: 0.85, heal: 1.1 },
    skillPointPerLevel: 1,
    maxLevel: 200,
    baseSlots: 2,            // 初始阵容槽（符文树可加到 4）
    deployCooldownSeconds: 60
  },

  economy: {
    goldPerKillBase: 1.0,    // 每只怪的基础金币（再乘关卡系数）
    goldLevelScale: 1.085,   // 每关金币成长
    expLevelScale: 1.075,    // 每关经验成长
    sellValueRarityMul: 1.35,// 每提升一档稀有度，卖价倍率
    stashBaseSlots: 40
  },

  idle: {
    offlineCapHours: 8,      // 离线收益封顶小时数
    offlineGoldRate: 0.55,   // 离线金币相对在线效率
    offlineExpRate: 0.60,    // 离线经验相对在线效率
    offlineChests: false     // 离线不掉宝箱（与 TBH 一致）
  },

  loot: {
    chestChancePerWave: 0.14,   // 每波清完掉普通宝箱的概率
    bossChestChance: 1.0,       // 关底 Boss 必掉 boss 箱
    actBossChestChance: 1.0,    // Act 尾关掉 actBoss 箱
    autoOpenBaseSeconds: {      // 自动开箱基础冷却（符文可减少）
      normal: 300,
      boss: 600,
      actBoss: 1800
    },
    chestCapacityBase: 6,
    // 10 档稀有度权重（会按关卡深度做偏移，见 loot.js）
    rarityWeights: {
      Common: 1000, Uncommon: 420, Rare: 150, Legendary: 52,
      Immortal: 18, Arcana: 7, Beyond: 3, Celestial: 1.2,
      Divine: 0.35, Cosmic: 0.08
    },
    rarityStatMul: {         // 稀有度对词缀数值的倍率
      Common: 1.00, Uncommon: 1.22, Rare: 1.5, Legendary: 1.85,
      Immortal: 2.3, Arcana: 2.85, Beyond: 3.5, Celestial: 4.4,
      Divine: 5.5, Cosmic: 7.0
    },
    affixCountByRarity: {    // 各稀有度附加词缀数量 [min,max]
      Common: [0, 1], Uncommon: [1, 2], Rare: [2, 3], Legendary: [3, 4],
      Immortal: [3, 5], Arcana: [4, 5], Beyond: [4, 6], Celestial: [5, 6],
      Divine: [5, 7], Cosmic: [6, 8]
    }
  },

  cube: {
    synthesisInputs: 9,      // 合成需要几件同稀有度装备
    synthesisUpgradeChance: 0.72, // 只升一档的概率，其余跳档
    synthesisJumpChance: 0.28,    // 跳档概率（再高则继续判定）
    alchemyGoldMul: 1.0,     // 炼金金币倍率
    removalCost: 400,
    craftCostBase: 2500,
    socketUnlockRarity: {    // 插槽解锁所需稀有度
      decoration: 'Rare',
      engraving: 'Immortal',
      inscription: 'Arcana'
    }
  },

  // 难度曲线：改这几个数就能整体重做游戏节奏（GM 面板可直接热改）
  balance: {
    hpPerStage: 1.152,     // 每推进一关，怪物血量倍率
    atkPerStage: 1.118,    // 每关怪物攻击倍率
    defPerStage: 1.085,    // 每关怪物防御倍率
    wavesBase: 4,          // 基础波数
    waveSizeBase: 3,       // 每波基础怪物数
    eliteFromStage: 3,     // 第几关起波次中会出现精英
    tierMul: {             // 怪物品阶倍率
      normal: 1.0, elite: 2.2, boss: 6.0, actBoss: 6.5
    }
  },

  difficulty: {
    Normal: { label: '普通', hpMul: 1.0, atkMul: 1.0, goldMul: 1.0, expMul: 1.0, rarityShift: 0 },
    Hard:   { label: '困难', hpMul: 1.9, atkMul: 1.35, goldMul: 1.45, expMul: 1.4, rarityShift: 1 },
    Expert: { label: '专家', hpMul: 3.6, atkMul: 1.85, goldMul: 2.2, expMul: 2.1, rarityShift: 2 },
    Hell:   { label: '地狱', hpMul: 6.8, atkMul: 2.6, goldMul: 3.6, expMul: 3.3, rarityShift: 3 }
  },

  events: {
    // GM 可触发的世界事件模板（持续时长 / 倍率可在 GM 面板里改）
    doubleDrop:   { label: '双倍掉率', durationSec: 1800, dropMul: 2.0 },
    doubleGold:   { label: '双倍金币', durationSec: 1800, goldMul: 2.0 },
    doubleExp:    { label: '双倍经验', durationSec: 1800, expMul: 2.0 },
    monsterRaid:  { label: '怪物攻城', durationSec: 900,  hpMul: 1.5, atkMul: 1.25, dropMul: 1.5 },
    bossRush:     { label: 'Boss 突袭', durationSec: 1200, bossRate: 3.0, dropMul: 2.5 },
    happyHour:    { label: '狂欢时刻', durationSec: 600,  goldMul: 1.8, expMul: 1.8, dropMul: 1.8 }
  },

  limits: {
    maxParty: 4,
    maxInventory: 120,
    logTail: 200
  }
};

module.exports = CONFIG;
