/**
 * 怪物表 + 关卡生成器
 * ---------------------------------------------------------------------------
 * 怪物只定义"原型"（act 1~3 各一组），实际强度由 stageIndex 按公式缩放，
 * 所以调 balance 里的两个系数就能整体重做难度曲线，不用改 30 张关卡表。
 */

// 品阶倍率与难度曲线都从可调配置读取，GM 面板可以热改
const T = require('../tunables');
const bal = () => T.get().balance;
const TIER_MUL = { normal: 1.0, elite: 2.2, boss: 6.0, actBoss: 6.5 };
const tierMul = (t) => bal().tierMul?.[t] ?? TIER_MUL[t] ?? 1;

const MONSTERS = {
  // ---- Act 1：翠绿边境 ----
  a1_slime:  { id: 'a1_slime',  zh: '史莱姆',   act: 1, tier: 'normal', hp: 26,  atk: 5,  def: 1, atkSpeed: 0.7, sprite: 'slime' },
  a1_wolf:   { id: 'a1_wolf',   zh: '森林狼',   act: 1, tier: 'normal', hp: 34,  atk: 7,  def: 2, atkSpeed: 1.1, sprite: 'wolf' },
  a1_bandit: { id: 'a1_bandit', zh: '盗贼',     act: 1, tier: 'normal', hp: 42,  atk: 6,  def: 4, atkSpeed: 0.9, sprite: 'bandit' },
  a1_bat:    { id: 'a1_bat',    zh: '洞穴蝙蝠', act: 1, tier: 'normal', hp: 24,  atk: 6,  def: 1, atkSpeed: 1.5, sprite: 'bat' },
  a1_boar:   { id: 'a1_boar',   zh: '野猪',     act: 1, tier: 'normal', hp: 58,  atk: 9,  def: 6, atkSpeed: 0.6, sprite: 'boar' },
  a1_skel:   { id: 'a1_skel',   zh: '骷髅兵',   act: 1, tier: 'normal', hp: 46,  atk: 8,  def: 5, atkSpeed: 0.8, sprite: 'skeleton' },
  a1_ogre:   { id: 'a1_ogre',   zh: '兽人卫士', act: 1, tier: 'elite',  hp: 135, atk: 13, def: 9, atkSpeed: 0.6, sprite: 'ogre' },
  a1_boss:   { id: 'a1_boss',   zh: '腐化树王', act: 1, tier: 'actBoss',hp: 380, atk: 20, def: 14, atkSpeed: 0.7, sprite: 'treant' },

  // ---- Act 2：熔火矿坑 ----
  a2_fly:    { id: 'a2_fly',    zh: '巨型苍蝇', act: 2, tier: 'normal', hp: 150, atk: 14, def: 6,  atkSpeed: 1.3, sprite: 'fly' },
  a2_lava:   { id: 'a2_lava',   zh: '熔岩虫',   act: 2, tier: 'normal', hp: 190, atk: 18, def: 10, atkSpeed: 0.7, sprite: 'lavaworm' },
  a2_golem:  { id: 'a2_golem',  zh: '岩石魔像', act: 2, tier: 'normal', hp: 260, atk: 20, def: 18, atkSpeed: 0.5, sprite: 'golem' },
  a2_shaman: { id: 'a2_shaman', zh: '火焰萨满', act: 2, tier: 'normal', hp: 170, atk: 24, def: 8,  atkSpeed: 0.9, sprite: 'shaman' },
  a2_hound:  { id: 'a2_hound',  zh: '地狱犬',   act: 2, tier: 'normal', hp: 200, atk: 22, def: 9,  atkSpeed: 1.4, sprite: 'hound' },
  a2_spirit: { id: 'a2_spirit', zh: '火之灵',   act: 2, tier: 'normal', hp: 145, atk: 26, def: 5,  atkSpeed: 1.2, sprite: 'fire_spirit' },
  a2_warlord:{ id: 'a2_warlord',zh: '熔火督军', act: 2, tier: 'elite',  hp: 700, atk: 40, def: 26, atkSpeed: 0.8, sprite: 'warlord' },
  a2_boss:   { id: 'a2_boss',   zh: '灰烬巨龙', act: 2, tier: 'actBoss',hp: 2100, atk: 62, def: 40, atkSpeed: 0.9, sprite: 'ashdragon' },

  // ---- Act 3：虚空回廊 ----
  a3_ghost:  { id: 'a3_ghost',  zh: '幽灵',     act: 3, tier: 'normal', hp: 520, atk: 48, def: 14, atkSpeed: 1.2, sprite: 'ghost' },
  a3_wraith: { id: 'a3_wraith', zh: '虚无怨灵', act: 3, tier: 'normal', hp: 610, atk: 54, def: 18, atkSpeed: 1.0, sprite: 'wraith' },
  a3_knight: { id: 'a3_knight', zh: '堕落骑士', act: 3, tier: 'normal', hp: 780, atk: 58, def: 32, atkSpeed: 0.7, sprite: 'darkknight' },
  a3_mage:   { id: 'a3_mage',   zh: '虚空术士', act: 3, tier: 'normal', hp: 560, atk: 70, def: 16, atkSpeed: 1.1, sprite: 'voidmage' },
  a3_beast:  { id: 'a3_beast',  zh: '深渊兽',   act: 3, tier: 'normal', hp: 900, atk: 62, def: 28, atkSpeed: 0.9, sprite: 'abyssbeast' },
  a3_golem:  { id: 'a3_golem',  zh: '蓝色魔像', act: 3, tier: 'normal', hp: 1050,atk: 55, def: 46, atkSpeed: 0.5, sprite: 'bluegolem' },
  a3_titan:  { id: 'a3_titan',  zh: '虚空泰坦', act: 3, tier: 'elite',  hp: 2600,atk: 96, def: 60, atkSpeed: 0.7, sprite: 'titan' },
  a3_boss:   { id: 'a3_boss',   zh: '无相之主', act: 3, tier: 'actBoss',hp: 7800,atk: 145,def: 88, atkSpeed: 1.0, sprite: 'formless' }
};

const ACT_POOLS = {
  1: ['a1_slime', 'a1_wolf', 'a1_bandit', 'a1_bat', 'a1_boar', 'a1_skel'],
  2: ['a2_fly', 'a2_lava', 'a2_golem', 'a2_shaman', 'a2_hound', 'a2_spirit'],
  3: ['a3_ghost', 'a3_wraith', 'a3_knight', 'a3_mage', 'a3_beast', 'a3_golem']
};
const ACT_ELITE = { 1: 'a1_ogre', 2: 'a2_warlord', 3: 'a3_titan' };
const ACT_BOSS  = { 1: 'a1_boss', 2: 'a2_boss', 3: 'a3_boss' };
const ACT_NAMES = { 1: '翠绿边境', 2: '熔火矿坑', 3: '虚空回廊' };

/** 计算某关某怪物的实际数值 */
function scaleMonster(protoId, stageIndex, difficulty) {
  const B = bal();
  const p = MONSTERS[protoId];
  const s = Math.pow(B.hpPerStage, stageIndex);
  const a = Math.pow(B.atkPerStage, stageIndex);
  const d = Math.pow(B.defPerStage, stageIndex);
  const t = tierMul(p.tier);
  return {
    id: p.id, zh: p.zh, sprite: p.sprite, tier: p.tier,
    hp: Math.round(p.hp * s * t * difficulty.hpMul),
    atk: Math.round(p.atk * a * t * difficulty.atkMul),
    def: Math.round(p.def * d * (1 + (t - 1) * 0.35) * difficulty.atkMul),
    atkSpeed: p.atkSpeed,
    exp: Math.round(6 * Math.pow(1.075, stageIndex) * t * (difficulty.expMul || 1)),
    gold: Math.round(3 * Math.pow(1.085, stageIndex) * t * (difficulty.goldMul || 1))
  };
}

/** 生成全部关卡（3 Act × 10 关） */
function buildStages(difficultyKey, difficulty) {
  const B = bal();
  const out = [];
  for (let act = 1; act <= 3; act++) {
    for (let st = 1; st <= 10; st++) {
      const stageIndex = (act - 1) * 10 + (st - 1);
      const pool = ACT_POOLS[act];
      const waves = B.wavesBase + Math.floor(stageIndex / 6);
      const waveSize = B.waveSizeBase + Math.floor(stageIndex / 10);
      const isActEnd = st === 10;

      const waveComp = [];
      for (let w = 0; w < waves; w++) {
        const comp = [];
        for (let i = 0; i < waveSize; i++) {
          comp.push(pool[(stageIndex + w * 2 + i) % pool.length]);
        }
        if (stageIndex >= B.eliteFromStage && w > 0 && w % 3 === 0) comp.push(ACT_ELITE[act]);
        waveComp.push(comp);
      }
      // 最后一波是 Boss：每幕前 3 关不出精英，避免新手开局就撞墙
      const useElite = !isActEnd && st > 3;
      const bossWave = isActEnd ? [ACT_BOSS[act]]
        : (useElite ? [ACT_ELITE[act]] : [pool[st % pool.length], pool[(st + 2) % pool.length]]);
      waveComp.push(bossWave);

      out.push({
        id: `${act}-${st}`,
        act, stage: st, stageIndex,
        name: `${act}-${st}`,
        zhName: `第${act}幕 第${st}关`,
        actName: ACT_NAMES[act],
        difficulty: difficultyKey,
        bossId: bossWave[0],
        isActEnd,
        waves: waveComp.length,
        waveComp
      });
    }
  }
  return out;
}

module.exports = {
  MONSTERS, ACT_POOLS, ACT_ELITE, ACT_BOSS, ACT_NAMES,
  TIER_MUL, tierMul, scaleMonster, buildStages
};
