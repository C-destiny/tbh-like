/**
 * 装备 / 稀有度 / 词缀 / 素材
 * ---------------------------------------------------------------------------
 * 掉落、合成、制作、插槽全部读这里的定义。想加装备类型或词缀，只改下面的表。
 */

const RARITIES = ['Common', 'Uncommon', 'Rare', 'Legendary', 'Immortal',
  'Arcana', 'Beyond', 'Celestial', 'Divine', 'Cosmic'];

const RARITY_ZH = {
  Common: '普通', Uncommon: '优良', Rare: '稀有', Legendary: '传说',
  Immortal: '不朽', Arcana: '奥术', Beyond: '超凡', Celestial: '天界',
  Divine: '神圣', Cosmic: '宇宙'
};

// 稀有度对应的 CSS 颜色（前端直接用）
const RARITY_COLOR = {
  Common: '#9aa3b2', Uncommon: '#4caf50', Rare: '#3f8cff', Legendary: '#a855f7',
  Immortal: '#f59e0b', Arcana: '#06b6d4', Beyond: '#ef4444', Celestial: '#facc15',
  Divine: '#f472b6', Cosmic: '#a78bfa'
};

const SLOTS = [
  { id: 'weapon', zh: '武器', main: 'atk',  mainBase: 8.0 },
  { id: 'helmet', zh: '头盔', main: 'hp',   mainBase: 22.0 },
  { id: 'armor',  zh: '胸甲', main: 'def',  mainBase: 4.5 },
  { id: 'boots',  zh: '靴子', main: 'moveSpeed', mainBase: 0.04 },
  { id: 'ring',   zh: '戒指', main: 'critRate', mainBase: 0.018 },
  { id: 'amulet', zh: '护符', main: 'critDmg', mainBase: 0.12 }
];

// 附加词缀池：roll 时按 weight 抽取，数值 = base * (1 + 0.06*itemLevel) * rarityMul
const AFFIXES = [
  { id: 'atk',      zh: '攻击力',   weight: 100, base: 6.0,  pct: false },
  { id: 'hp',       zh: '生命',     weight: 100, base: 18.0, pct: false },
  { id: 'def',      zh: '防御',     weight: 90,  base: 3.2,  pct: false },
  { id: 'critRate', zh: '暴击率',   weight: 55,  base: 0.015, pct: true },
  { id: 'critDmg',  zh: '暴击伤害', weight: 55,  base: 0.10, pct: true },
  { id: 'atkSpeed', zh: '攻击速度', weight: 50,  base: 0.035, pct: true },
  { id: 'lifesteal',zh: '吸血',     weight: 30,  base: 0.012, pct: true },
  { id: 'moveSpeed',zh: '移动速度', weight: 40,  base: 0.025, pct: true },
  { id: 'healPower',zh: '治疗强度', weight: 35,  base: 0.06, pct: true },
  { id: 'goldPct',  zh: '金币获取', weight: 28,  base: 0.035, pct: true },
  { id: 'expPct',   zh: '经验获取', weight: 28,  base: 0.030, pct: true },
  { id: 'dropPct',  zh: '掉落率',   weight: 20,  base: 0.025, pct: true },
  { id: 'thorns',   zh: '荆棘',     weight: 18,  base: 0.020, pct: true }
];

const ELEMENTS = ['none', 'fire', 'ice', 'poison', 'lightning', 'holy', 'void'];
const ELEMENT_ZH = { none: '无属性', fire: '火焰', ice: '冰霜', poison: '剧毒', lightning: '雷电', holy: '神圣', void: '虚空' };

// 每个角色的元素亲和（影响素材插槽是否全额生效）
const CLASS_ELEMENT = {
  niuma: 'holy',      // 打工人·圣光
  roudan: 'lightning' // 葱之使者·雷电
};

// 装备基底：slot × 角色 组合出名字
const BASE_NAMES = {
  weapon: { niuma: '加班之锤', roudan: '冷冻大葱' },
  helmet: { niuma: '安全帽',   roudan: '遮阳帽' },
  armor:  { niuma: '反光背心', roudan: '宽松T恤' },
  boots:  { niuma: '劳保鞋',   roudan: '跑步鞋' },
  ring:   { niuma: '工龄之戒', roudan: '幸运手环' },
  amulet: { niuma: '工牌挂绳', roudan: '葱香护符' }
};

// ---- 素材（制作 / 插槽用）----
// tier 1~3 对应 decoration / engraving / inscription
const MATERIALS = [
  { id: 'm_emerald',   zh: '翡翠',     element: 'poison',    tier: 1, zh_effect: '剧毒强化', affix: 'atk',      value: 6,  weight: 40 },
  { id: 'm_ruby',      zh: '红宝石',   element: 'fire',      tier: 1, zh_effect: '火焰强化', affix: 'atk',      value: 7,  weight: 36 },
  { id: 'm_sapphire',  zh: '蓝宝石',   element: 'ice',       tier: 1, zh_effect: '冰霜强化', affix: 'critDmg',  value: 0.10, weight: 34 },
  { id: 'm_topaz',     zh: '黄玉',     element: 'lightning', tier: 1, zh_effect: '雷电强化', affix: 'atkSpeed', value: 0.035, weight: 32 },
  { id: 'm_pearl',     zh: '珍珠',     element: 'holy',      tier: 1, zh_effect: '神圣强化', affix: 'healPower',value: 0.07, weight: 28 },
  { id: 'm_obsidian',  zh: '黑曜石',   element: 'void',      tier: 1, zh_effect: '虚空强化', affix: 'lifesteal',value: 0.014, weight: 24 },
  { id: 'm_granite',   zh: '花岗石',   element: 'none',      tier: 1, zh_effect: '坚固',     affix: 'def',      value: 4,  weight: 44 },
  { id: 'm_dragonbone',zh: '龙骨',     element: 'fire',      tier: 2, zh_effect: '龙炎刻印', affix: 'atk',      value: 16, weight: 12 },
  { id: 'm_frostcore', zh: '霜核',     element: 'ice',       tier: 2, zh_effect: '寒霜刻印', affix: 'critRate', value: 0.03, weight: 12 },
  { id: 'm_venomsac',  zh: '毒囊',     element: 'poison',    tier: 2, zh_effect: '剧毒刻印', affix: 'dotMul',   value: 0.14, weight: 12 },
  { id: 'm_stormrune', zh: '雷纹石',   element: 'lightning', tier: 2, zh_effect: '雷霆刻印', affix: 'atkSpeed', value: 0.06, weight: 12 },
  { id: 'm_angelfeather',zh:'天使之羽',element: 'holy',      tier: 2, zh_effect: '圣光刻印', affix: 'hp',       value: 45, weight: 12 },
  { id: 'm_voidshard', zh: '虚空碎片', element: 'void',      tier: 2, zh_effect: '虚空刻印', affix: 'critDmg',  value: 0.20, weight: 10 },
  { id: 'm_starsteel', zh: '星钢',     element: 'none',      tier: 2, zh_effect: '星辰刻印', affix: 'def',      value: 12, weight: 14 },
  { id: 'm_eternalflame',zh:'永恒之焰',element: 'fire',      tier: 3, zh_effect: '永恒铭文', affix: 'atk',      value: 34, weight: 3 },
  { id: 'm_abyssalheart',zh:'深渊之心',element: 'void',      tier: 3, zh_effect: '深渊铭文', affix: 'critDmg',  value: 0.42, weight: 3 },
  { id: 'm_celestialtear',zh:'天界之泪',element:'holy',      tier: 3, zh_effect: '天界铭文', affix: 'hp',       value: 110, weight: 3 },
  { id: 'm_worldseed', zh: '世界之种', element: 'poison',    tier: 3, zh_effect: '世界铭文', affix: 'dotMul',   value: 0.30, weight: 3 },
  { id: 'm_thundercrown',zh:'雷冠',    element: 'lightning', tier: 3, zh_effect: '雷霆铭文', affix: 'atkSpeed', value: 0.11, weight: 3 },
  { id: 'm_primordialice',zh:'太初之冰',element:'ice',       tier: 3, zh_effect: '太初铭文', affix: 'critRate', value: 0.055, weight: 3 },
  { id: 'm_godsblood',  zh: '神之血',  element: 'none',      tier: 3, zh_effect: '神血铭文', affix: 'lifesteal',value: 0.035, weight: 2 }
];

// 纪念币（供奉用）
const COMMEMORATIVE = [
  { id: 'coin_c',  zh: '普通纪念币', rarity: 'Rare',      weight: 62 },
  { id: 'coin_i',  zh: '不朽纪念币', rarity: 'Immortal',  weight: 26 },
  { id: 'coin_a',  zh: '奥术纪念币', rarity: 'Arcana',    weight: 9 },
  { id: 'coin_d',  zh: '神圣纪念币', rarity: 'Divine',    weight: 2.6 },
  { id: 'coin_co', zh: '宇宙纪念币', rarity: 'Cosmic',    weight: 0.4 }
];

module.exports = {
  RARITIES, RARITY_ZH, RARITY_COLOR, SLOTS, AFFIXES,
  ELEMENTS, ELEMENT_ZH, CLASS_ELEMENT, BASE_NAMES,
  MATERIALS, COMMEMORATIVE
};
