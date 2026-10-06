/** 通用工具：随机、数值、深拷贝、加权抽取 */

/** 可复现随机数（mulberry32）。存档里只存 seed，重开结果一致。 */
function makeRng(seed) {
  let a = (seed >>> 0) || 1;
  const fn = function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  fn.int = (n) => Math.floor(fn() * n);
  fn.range = (lo, hi) => lo + fn() * (hi - lo);
  fn.pick = (arr) => arr[Math.floor(fn() * arr.length)];
  fn.chance = (p) => fn() < p;
  fn.seed = seed;
  return fn;
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const round2 = (v) => Math.round(v * 100) / 100;

function deepMerge(base, over) {
  if (over === undefined || over === null) return base;
  if (typeof base !== 'object' || base === null || Array.isArray(base)) return over;
  const out = { ...base };
  for (const k of Object.keys(over)) {
    out[k] = (k in base) ? deepMerge(base[k], over[k]) : over[k];
  }
  return out;
}

function weightedPick(rng, entries, weightOf) {
  let total = 0;
  for (const e of entries) total += Math.max(0, weightOf(e));
  if (total <= 0) return null;
  let r = rng() * total;
  for (const e of entries) {
    r -= Math.max(0, weightOf(e));
    if (r <= 0) return e;
  }
  return entries[entries.length - 1];
}

/** 升到下一级所需经验 */
function expToNext(level, cfg) {
  return Math.floor(cfg.expBase * Math.pow(level, cfg.expPow));
}

let _uidCounter = 0;
function uid(prefix = 'u') {
  _uidCounter = (_uidCounter + 1) % 1e6;
  return `${prefix}_${Date.now().toString(36)}${_uidCounter.toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
}

/** 把秒数格式化成 "2h 13m" */
function fmtDur(sec) {
  sec = Math.max(0, Math.floor(sec));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m ${s}s`;
  return `${s}s`;
}

/** 大数字缩写：12.3K / 4.5M */
function fmtNum(n) {
  n = Math.floor(n || 0);
  const abs = Math.abs(n);
  if (abs >= 1e12) return (n / 1e12).toFixed(2) + 'T';
  if (abs >= 1e9) return (n / 1e9).toFixed(2) + 'B';
  if (abs >= 1e6) return (n / 1e6).toFixed(2) + 'M';
  if (abs >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return String(n);
}

module.exports = { makeRng, clamp, round2, deepMerge, weightedPick, expToNext, uid, fmtDur, fmtNum };
