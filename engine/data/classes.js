/**
 * 角色表
 * ---------------------------------------------------------------------------
 * 目前只开放两个角色（素材由用户提供）。每个角色既是"外观"也是"职业"，
 * 拥有各自的属性成长与技能树。
 *
 * 【加角色】往 CLASSES 里加一项 + CLASS_ORDER 加 id，并准备 4 张素材：
 *    assets-src/heroes/<sprite>_full.png   全身立绘（深色纯底）
 *    assets-src/heroes/<sprite>_walk.png   走路精灵表（4 帧横排）
 *   然后跑 node scripts/prep-assets.cjs 生成到 public/assets/heroes/
 *
 * 技能效果用统一的 effect 结构描述，engine/hero.js 负责算成属性。
 */

const EFFECT_KEYS = [
  'flatHp', 'pctHp', 'flatAtk', 'pctAtk', 'flatDef', 'pctDef',
  'critRate', 'critDmg', 'atkSpeed', 'moveSpeed', 'lifesteal',
  'healPower', 'flatHeal', 'aoeMul', 'dotMul', 'shield', 'thorns',
  'partyAtkPct', 'partyHpPct', 'partyDefPct', 'goldPct', 'expPct', 'dropPct'
];

const CLASSES = {
  niuma: {
    id: 'niuma', zh: '肾虚牛马', en: 'Niuma',
    sprite: 'niuma',                       // public/assets/heroes/niuma_*.png
    tagline: '前排肉盾 · 越打越硬',
    blurb: '被生活捶打多年依然屹立不倒的打工人。血厚防高，能自己恢复，适合顶在最前面。',
    role: 'tank', preferRow: 'front', unlock: 'default',
    base: { hp: 230, atk: 15, def: 15, heal: 6, atkSpeed: 0.95, crit: 0.05, critDmg: 1.5, moveSpeed: 1.0 },
    growth: { hp: 21.0, atk: 1.15, def: 2.0, heal: 0.75 },
    skills: [
      { id: 'n_hp',    name: '牛马体魄', type: 'passive', max: 10, desc: '每级 +6% 最大生命',        effect: { pctHp: 0.06 } },
      { id: 'n_def',   name: '耐磨护甲', type: 'passive', max: 10, desc: '每级 +7% 防御',            effect: { pctDef: 0.07 } },
      { id: 'n_regen', name: '摸鱼回血', type: 'passive', max: 8,  desc: '每级 +30% 每秒回复',       effect: { healPower: 0.30 } },
      { id: 'n_shield',name: 'KPI 护盾', type: 'active',  max: 5,  desc: '每级开场获得 5% 生命护盾', effect: { shield: 0.05 } },
      { id: 'n_taunt', name: '扛下所有', type: 'active',  max: 5,  desc: '每级 +3% 全队生命',        effect: { partyHpPct: 0.03 } },
      { id: 'n_thorns',name: '反骨',     type: 'passive', max: 8,  desc: '每级反弹 4% 受到伤害',     effect: { thorns: 0.04 } },
      { id: 'n_gold',  name: '打工攒钱', type: 'passive', max: 5,  desc: '每级 +4% 金币获取',        effect: { goldPct: 0.04 } }
    ]
  },

  roudan: {
    id: 'roudan', zh: '肉蛋葱击使者', en: 'Roudan',
    sprite: 'roudan',                      // public/assets/heroes/roudan_*.png
    tagline: '远程输出 · 攻速拉满',
    blurb: '把葱当成武器的神秘少年。输出高、攻速快、清波效率一流，但身板脆，需要队友挡在前面。',
    role: 'dps', preferRow: 'back', unlock: 'default',
    base: { hp: 135, atk: 19, def: 7, heal: 0, atkSpeed: 1.45, crit: 0.08, critDmg: 1.6, moveSpeed: 1.15 },
    growth: { hp: 11.5, atk: 1.75, def: 1.0, heal: 0 },
    skills: [
      { id: 'r_flat',  name: '葱击精准', type: 'passive', max: 10, desc: '每级 +5 点攻击',        effect: { flatAtk: 5 } },
      { id: 'r_rain',  name: '葱雨',     type: 'active',  max: 5,  desc: '每级 +14% 范围伤害',    effect: { aoeMul: 0.14 } },
      { id: 'r_crit',  name: '要害打击', type: 'passive', max: 8,  desc: '每级 +2.5% 暴击率',     effect: { critRate: 0.025 } },
      { id: 'r_critd', name: '致命一葱', type: 'passive', max: 8,  desc: '每级 +15% 暴击伤害',    effect: { critDmg: 0.15 } },
      { id: 'r_speed', name: '疾风连击', type: 'passive', max: 6,  desc: '每级 +5% 攻速',         effect: { atkSpeed: 0.05 } },
      { id: 'r_poison',name: '辛辣腐蚀', type: 'active',  max: 5,  desc: '每级 +18% 持续伤害',    effect: { dotMul: 0.18 } },
      { id: 'r_drop',  name: '捡漏之眼', type: 'passive', max: 5,  desc: '每级 +3% 掉落率',       effect: { dropPct: 0.03 } }
    ]
  }
};

const CLASS_ORDER = ['niuma', 'roudan'];

module.exports = { CLASSES, CLASS_ORDER, EFFECT_KEYS };
