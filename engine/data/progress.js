/**
 * 宠物与成就
 * ---------------------------------------------------------------------------
 * 宠物：解锁条件 = 在指定关卡累计击杀数达标；被动效果永久生效（不部署也生效）。
 * 成就：条件用 { type, ... } 描述，engine/achievement.js 统一判定，加新成就只改这张表。
 */

const PETS = [
  { id: 'bat',      zh: '蝙蝠',     atStage: '1-8',  kills: 120,  effects: { chestRate: 0.10, expPct: 0.15 }, note: '普通宝箱掉率 +10%，经验 +15%' },
  { id: 'giantfly', zh: '巨型苍蝇', atStage: '2-4',  kills: 150,  effects: { goldPct: 0.12, atkSpeed: 0.05 },  note: '金币 +12%，攻速 +5%' },
  { id: 'firespirit',zh:'火之灵',   atStage: '2-8',  kills: 180,  effects: { partyAtkPct: 0.10, dotMul: 0.15 }, note: '全队攻击 +10%，持续伤害 +15%' },
  { id: 'ghost',    zh: '幽灵',     atStage: '3-4',  kills: 200,  effects: { lifesteal: 0.04, critRate: 0.03 }, note: '吸血 +4%，暴击率 +3%' },
  { id: 'bluegolem',zh: '蓝色魔像', atStage: '3-6',  kills: 220,  effects: { partyDefPct: 0.15, hp: 60 },       note: '全队防御 +15%，生命 +60' },
  { id: 'phoenix',  zh: '不死鸟',   atStage: '2-10', kills: 60,   effects: { reviveSpeed: 0.35, partyHpPct: 0.12 }, note: '复活时间 -35%，全队生命 +12%' },
  { id: 'voidpup',  zh: '虚空幼兽', atStage: '3-10', kills: 80,   effects: { rarityPct: 0.20, partyCritDmg: 0.20 }, note: '稀有度权重 +20%，暴击伤害 +20%' },
  { id: 'luckycat', zh: '招财猫',   atStage: '1-10', kills: 60,   effects: { goldPct: 0.25, chestRate: 0.08 },  note: '金币 +25%，宝箱掉率 +8%' }
];

// 成就条件类型：
//  level        { type:'level', heroLevel:n }
//  stageClear   { type:'stageClear', count:n } / { difficulty:'Hell' }
//  kill         { type:'kill', count:n }
//  gold         { type:'gold', total:n }
//  gearRarity   { type:'gearRarity', rarity:'Immortal', count:n }
//  runeCount    { type:'runeCount', count:n }
//  petCount     { type:'petCount', count:n }
//  cubeUse      { type:'cubeUse', op:'synthesis', count:n }
const ACHIEVEMENTS = [
  { id: 'a_first_blood', zh: '初次交锋',   desc: '击杀 100 只怪物',           cond: { type: 'kill', count: 100 },       reward: { gold: 500 } },
  { id: 'a_kill_1k',     zh: '百战老兵',   desc: '击杀 1,000 只怪物',         cond: { type: 'kill', count: 1000 },      reward: { gold: 2500 } },
  { id: 'a_kill_10k',    zh: '怪物屠夫',   desc: '击杀 10,000 只怪物',        cond: { type: 'kill', count: 10000 },     reward: { gold: 15000 } },
  { id: 'a_lv10',        zh: '小有名气',   desc: '任意英雄达到 10 级',        cond: { type: 'level', heroLevel: 10 },   reward: { gold: 1000 } },
  { id: 'a_lv30',        zh: '久经沙场',   desc: '任意英雄达到 30 级',        cond: { type: 'level', heroLevel: 30 },   reward: { gold: 8000 } },
  { id: 'a_lv60',        zh: '传奇诞生',   desc: '任意英雄达到 60 级',        cond: { type: 'level', heroLevel: 60 },   reward: { gold: 60000 } },
  { id: 'a_clear10',     zh: '边境行者',   desc: '通关 10 个关卡',            cond: { type: 'stageClear', count: 10 },  reward: { gold: 3000 } },
  { id: 'a_clear30',     zh: '三幕征服者', desc: '通关 30 个关卡',            cond: { type: 'stageClear', count: 30 },  reward: { gold: 20000 } },
  { id: 'a_hell10',      zh: '地狱行者',   desc: '通关 10 个地狱难度关卡',    cond: { type: 'stageClear', count: 10, difficulty: 'Hell' }, reward: { gold: 120000 } },
  { id: 'a_gold_10k',    zh: '小有积蓄',   desc: '累计获得 10,000 金币',      cond: { type: 'gold', total: 10000 },     reward: { gold: 2000 } },
  { id: 'a_gold_1m',     zh: '富甲一方',   desc: '累计获得 1,000,000 金币',   cond: { type: 'gold', total: 1000000 },   reward: { gold: 50000 } },
  { id: 'a_legendary',   zh: '传说入手',   desc: '获得 5 件传说及以上装备',   cond: { type: 'gearRarity', rarity: 'Legendary', count: 5 }, reward: { gold: 10000 } },
  { id: 'a_immortal',    zh: '不朽之力',   desc: '获得 3 件不朽装备',         cond: { type: 'gearRarity', rarity: 'Immortal', count: 3 },  reward: { gold: 40000 } },
  { id: 'a_cosmic',      zh: '触及宇宙',   desc: '获得 1 件宇宙级装备',       cond: { type: 'gearRarity', rarity: 'Cosmic', count: 1 },    reward: { gold: 500000 } },
  { id: 'a_rune20',      zh: '符文学者',   desc: '点亮 20 个符文',            cond: { type: 'runeCount', count: 20 },   reward: { gold: 20000 } },
  { id: 'a_rune50',      zh: '符文大师',   desc: '点亮 50 个符文',            cond: { type: 'runeCount', count: 50 },   reward: { gold: 150000 } },
  { id: 'a_pet3',        zh: '动物之友',   desc: '解锁 3 只宠物',             cond: { type: 'petCount', count: 3 },     reward: { gold: 15000 } },
  { id: 'a_pet8',        zh: '兽群领袖',   desc: '解锁全部 8 只宠物',         cond: { type: 'petCount', count: 8 },     reward: { gold: 300000 } },
  { id: 'a_synth10',     zh: '合成工匠',   desc: '进行 10 次魔方合成',        cond: { type: 'cubeUse', op: 'synthesis', count: 10 }, reward: { gold: 8000 } },
  { id: 'a_craft10',     zh: '能工巧匠',   desc: '进行 10 次魔方制作',        cond: { type: 'cubeUse', op: 'craft', count: 10 },     reward: { gold: 12000 } },
  { id: 'a_sock5',       zh: '镶嵌大师',   desc: '镶嵌 5 个插槽素材',         cond: { type: 'cubeUse', op: 'socket', count: 5 },      reward: { gold: 25000 } },
  { id: 'a_act1',        zh: '边境终结',   desc: '通关第 1 幕第 10 关',       cond: { type: 'stage', id: '1-10' },      reward: { gold: 20000 } },
  { id: 'a_act2',        zh: '矿坑征服',   desc: '通关第 2 幕第 10 关',       cond: { type: 'stage', id: '2-10' },      reward: { gold: 80000 } },
  { id: 'a_act3',        zh: '虚空终结',   desc: '通关第 3 幕第 10 关',       cond: { type: 'stage', id: '3-10' },      reward: { gold: 400000 } },
  { id: 'a_first_rune',  zh: '初识符文',   desc: '点亮第 1 个符文',           cond: { type: 'runeCount', count: 1 },    reward: { gold: 300 } },
  { id: 'a_first_pet',   zh: '第一位伙伴', desc: '解锁第 1 只宠物',           cond: { type: 'petCount', count: 1 },     reward: { gold: 2000 } },
  { id: 'a_party4',      zh: '满编出击',   desc: '同时部署 4 名英雄',         cond: { type: 'partySize', count: 4 },    reward: { gold: 30000 } },
  { id: 'a_offline',     zh: '时间就是金钱', desc: '累计领取 10 次离线收益',  cond: { type: 'offlineClaims', count: 10 },reward: { gold: 10000 } },
  { id: 'a_gear_full',   zh: '全身武装',   desc: '让一名英雄穿满 6 件装备',   cond: { type: 'gearEquipped', count: 6 },  reward: { gold: 20000 } },
  { id: 'a_socket3',     zh: '三槽齐开',   desc: '在一件装备上开满 3 个插槽', cond: { type: 'socketsOnOne', count: 3 },  reward: { gold: 60000 } }
];

module.exports = { PETS, ACHIEVEMENTS };
