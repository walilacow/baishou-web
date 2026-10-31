// 華麗特效（對照試玩版 App 的 FancyFX，同一套 16 張素材）。只是顯示，結算以引擎為準。
// 每個 ≤0.6 秒（結算橫幅除外）、不攔點擊；設定「特效」關掉或系統開了「減少動態效果」就一律不播。
// 特效畫在 body 上的固定圖層，不跟著牌桌重畫被清掉。素材讀不到（fx/index.json 缺）就不播。

const KEY = 'fancyFX';
export const FACTION_COLOR = { tiger: '#B8541F', dragon: '#7A5A1E', crane: '#3F7396', wolf: '#4F5862', scorpion: '#66367F', bat: '#8E2531', jiao: '#1F7A78', jianghu: '#5E5246' };

let available = new Set();
let base = '.';
export async function loadFX(b = '.') {
  base = b;
  try { available = new Set(await (await fetch(`${b}/art/fx/index.json`)).json()); } catch { available = new Set(); }
  for (const n of available) { const i = new Image(); i.src = url(n); }   // 先載，第一次播才不會空一下
}
const url = (n) => `${base}/art/fx/${n}.webp`;

export function fxEnabled() {
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return false;
  try { return localStorage.getItem(KEY) !== 'off'; } catch { return true; }
}
export function setFX(on) { try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch { /* 無痕視窗等：只是這次不記 */ } }
export function fxSetting() { try { return localStorage.getItem(KEY) !== 'off'; } catch { return true; } }

function layer() {
  let l = document.getElementById('fx-layer');
  if (!l) { l = document.createElement('div'); l.id = 'fx-layer'; l.setAttribute('aria-hidden', 'true'); document.body.append(l); }
  return l;
}

/** 在某個元素中心（或整個畫面）放一張特效圖，跑一段 CSS 動畫後自己移除。tint 有值就把灰階素材乘上門派色。 */
function play(name, { at = null, w = 110, h = w, anim = 'fx-burst', ms = 400, tint = null, dx = 0, dy = 0 } = {}) {
  if (!available.has(name)) return null;
  const r = at ? at.getBoundingClientRect() : { left: 0, top: 0, width: innerWidth, height: innerHeight };
  if (at && (r.width === 0 || r.height === 0)) return null;
  const el = document.createElement('div');
  el.className = `fx ${anim}`;
  el.dataset.fx = name;
  Object.assign(el.style, {
    left: `${r.left + r.width / 2 - w / 2 + dx}px`, top: `${r.top + r.height / 2 - h / 2 + dy}px`, width: `${w}px`, height: `${h}px`,
    animationName: anim, animationDuration: `${ms}ms`,   // 動畫名就是 style.css 裡的 @keyframes（只加 class 不會套上動畫）
    backgroundImage: tint ? `url(${url(name)}), linear-gradient(${tint}, ${tint})` : `url(${url(name)})`,
  });
  if (tint) { el.style.backgroundBlendMode = 'multiply'; el.style.maskImage = el.style.webkitMaskImage = `url(${url(name)})`; }
  layer().append(el);
  setTimeout(() => el.remove(), ms + 50);
  return el;
}

const SPARK = { crane: ['spark_metal', false], wolf: ['spark_metal', false], jianghu: ['spark_metal', false], tiger: ['spark_fist', false], dragon: ['spark_fist', false], scorpion: ['spark_poison', true], bat: ['spark_poison', true], jiao: ['spark_poison', true] };

/**
 * 依這次引擎回傳的事件播特效。find(id) 找場上卡片的元素；panel(side) 找主建築物那一欄；mana(side) 找內力列。
 * 回傳播了哪些（給自動測試用）。
 */
export function playEvents(events, { find, panel, mana, field, perm }) {
  const played = [];
  if (!fxEnabled() || !available.size) return played;
  const add = (x) => { if (x) played.push(x.dataset.fx); };
  for (const e of events ?? []) {
    const [k, v] = Object.entries(e)[0] ?? [];
    switch (k) {
      case 'damageDealt': {
        if (!(v.amount > 0)) break;
        const card = v.target != null && v.target > 0 ? find(v.target) : null;
        if (card) {
          const [s, tinted] = SPARK[v.sourceFaction] ?? SPARK.jianghu;
          const color = FACTION_COLOR[v.sourceFaction] ?? FACTION_COLOR.jianghu;
          add(play(s, { at: card, w: 110, anim: 'fx-burst', ms: 400, tint: tinted ? color : null }));
          add(play('slash_body', { at: card, w: 190, h: 48, anim: 'fx-slash', ms: 300, tint: color }));
          if (perm(v.target)?.keywords?.includes('bulwark')) add(play('shield_ward', { at: card, w: 120, anim: 'fx-ripple', ms: 450 }));
        } else {
          const p = panel(v.side);
          if (p) {
            add(play(v.amount >= 5 ? 'crack_heavy' : 'crack_light', { at: p, w: 320, h: 80, anim: 'fx-fade', ms: 600 }));
            add(play('shockwave_ring', { at: p, w: 160, anim: 'fx-ring', ms: 500 }));
          }
        }
        break;
      }
      case 'attackDodged': { const c = find(v.target); if (c) add(play('dodge_feather', { at: c, w: 140, h: 70, anim: 'fx-drift', ms: 600 })); break; }
      case 'manaAdded': case 'wildManaAdded': { if (v.side === 'player') { const m = mana(); if (m) add(play('mote_mana', { at: m, w: 48, anim: 'fx-rise', ms: 600 })); } break; }
      case 'convalescenceEnded': { const c = v.pulled != null ? find(v.pulled) : null; if (c) add(play('mote_heal', { at: c, w: 80, anim: 'fx-rise', ms: 600 })); break; }
      case 'cured': { const c = find(v.permanent); if (c) add(play('mote_heal', { at: c, w: 80, anim: 'fx-rise', ms: 600 })); break; }
      case 'formationActivated': { const f = field(v.side); if (f) add(play('formation_circle', { at: f, w: 260, anim: 'fx-glyph', ms: 600 })); break; }
      case 'qiDeviation': case 'forcedQiDeviation': add(play('screen_crack', { w: Math.min(innerWidth, innerHeight) * 0.9, anim: 'fx-fade', ms: 600 })); break;
      case 'battleEnded': {
        const r = typeof v === 'string' ? v : (v?._0 ?? Object.keys(v ?? {})[0]);
        const won = r === 'playerWon', lost = r === 'playerLost';
        if (won) add(play('gold_rays', { w: Math.min(innerWidth, 700), anim: 'fx-rays', ms: 1600 }));
        if (won || lost) add(play(won ? 'banner_victory' : 'banner_defeat', { w: Math.min(innerWidth * 0.9, 640), h: Math.min(innerWidth * 0.9, 640) * 0.3125, anim: 'fx-banner', ms: 1600 }));
        break;
      }
      default: break;
    }
  }
  return played;
}
