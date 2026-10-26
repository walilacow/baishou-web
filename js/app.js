import { Engine } from './engine.js';
import { Battle } from './battle.js';
import { h, clear, betaBadge, footer, toast, store, battleShell } from './ui.js';
import { BETA_NOTICE, VERSION, BUILD, STUDIO, COPYRIGHT } from './version.js';

const FACTIONS = [
  ['tiger', '猛虎派', '快攻'], ['dragon', '地龍門', '守護、高氣血'], ['crane', '白鶴門', '輕功、反招'], ['wolf', '群狼幫', '人海'],
  ['scorpion', '毒蠍教', '毒、直接傷害'], ['bat', '血蝠教', '吸血、犧牲'], ['jiao', '碧鮫宮', '潮汐、化元'],
];

const app = document.getElementById('app');
let engine = null;
let enginePromise = null;   // 載入中又換頁也只載一份引擎（兩份 wasm 會各有各的對局）
let current = null;   // 目前的對局

function shell(...kids) {
  return h('div.page',
    h('header.topbar', h('a.brand', { href: '#/' }, '百獸真經'), betaBadge(),
      h('nav', h('a', { href: '#/' }, '首頁'), h('a', { href: '#/rules' }, '規則'), h('a', { href: '#/about' }, '關於'))),
    h('main', ...kids), footer());
}

function randomSeed() { const a = new Uint32Array(2); crypto.getRandomValues(a); return (a[0] & 0xfffff) * 4294967296 + a[1]; }

function homePage() {
  return shell(
    h('section.hero', h('h1', '百獸真經'), h('p.sub', '武俠卡牌對戰'),
      h('p.notice', { id: 'beta-notice' }, BETA_NOTICE)),
    h('section.menu',
      h('a.big', { href: '#/pick', id: 'go-battle' }, h('b', '一般對戰'), h('span', '選門派，對上電腦')),
      h('a.big', { href: '#/campaign', id: 'go-campaign' }, h('b', '劇情模式'), h('span', '序章加八關，一路闖到獸母')),
      h('a.big', { href: '#/rules', id: 'go-rules' }, h('b', '遊戲規則'), h('span', '怎麼玩、名詞說明'))));
}

function pickPage() {
  let mine = null; let theirs = null;
  const out = h('div');
  const startBtn = h('button.primary', { id: 'start', disabled: true, on: { click: () => startBattle(mine, theirs) } }, '開戰');
  function pickRow(title, id, set) {
    const row = h('div.picker', { id });
    for (const [k, name, desc] of FACTIONS) {
      row.append(h('button.faction', { 'data-f': k, on: { click: (e) => {
        set(k);
        for (const b of row.children) b.classList.toggle('on', b === e.currentTarget);
        startBtn.disabled = !(mine && theirs);
      } } }, h('b', name), h('span', desc)));
    }
    return h('section', h('h2', title), row);
  }
  out.append(pickRow('你的門派', 'pick-mine', (k) => { mine = k; }), pickRow('對手門派', 'pick-theirs', (k) => { theirs = k; }),
    h('div.center', startBtn, ' ', h('button.secondary', { on: { click: () => {
      const r = () => FACTIONS[Math.floor(Math.random() * FACTIONS.length)][0];
      mine = r(); theirs = r(); startBattle(mine, theirs);
    } } }, '隨機')));
  return shell(h('h1', '一般對戰'), out);
}

function startBattle(player, enemy) {
  const fixed = Number(new URLSearchParams(location.search).get('seed'));   // 測試用：?seed= 固定局種子
  const seed = fixed > 0 ? fixed : randomSeed();
  const snap = engine.call({ cmd: 'newBattle', player, enemy, seed, guessHighTide: Math.random() < 0.5 });
  const root = h('div.battle-root');
  current = new Battle(engine, root, snap, {
    exitLabel: '回首頁',
    onExit: () => { location.hash = '#/'; },
    onEnd: (result) => { toast({ playerWon: '你贏了！', playerLost: '你輸了', draw: '平手' }[result] ?? '對局結束'); },
  });
  const page = battleShell(root);
  clear(app).append(page);
}

function aboutPage() {
  return shell(
    h('section.about',
      h('img.logo', { src: 'assets/studio-logo.png', alt: `${STUDIO}白貓 logo`, width: 200 }),
      h('h1', '百獸真經'), h('p', `測試版 ${VERSION}（Build ${BUILD}）　${STUDIO}（EngieStudio）`),
      h('div.card-box', h('p', '《百獸真經》是一款武俠卡牌對戰遊戲：七大門派、五百張卡，打掉對方主建築物就贏。網頁版把原版遊戲引擎直接編成 WebAssembly，規則與 App 完全相同。'),
        h('p', '資料聲明：遊戲只在你的瀏覽器裡執行，不需要登入，沒有伺服器，也不收集任何資料。劇情進度只存在這個瀏覽器的 localStorage，清除網站資料就會消失。')),
      h('p.notice', BETA_NOTICE),
      h('h2', '素材與授權'),
      h('ul', h('li', '遊戲引擎、網頁程式與卡面文字：小盜工作室，保留所有權利。'), h('li', '卡圖：小盜工作室委託創作，保留所有權利。'),
        h('li', 'Swift 與 SwiftWasm 工具鏈（Apache License 2.0 with Runtime Library Exception）：用來把遊戲引擎編成 WebAssembly，wasm 內含 Swift 執行環境與 swift-foundation。')),
      h('p', '問題回報：', h('a', { href: 'mailto:walilacow.hu@gmail.com' }, 'walilacow.hu@gmail.com')),
      h('p.small', COPYRIGHT)));
}

function loading(msg) { clear(app).append(h('div.page', h('main', h('p.center', { id: 'loading' }, msg)))); }

let routeSeq = 0;
async function route() {
  const seq = ++routeSeq;
  const hash = location.hash || '#/';
  if (hash.startsWith('#/rules')) { location.replace('rules.html'); return; }
  if (!engine && hash !== '#/about') {
    loading('載入遊戲引擎…');
    try { enginePromise ??= Engine.load('.'); engine = await enginePromise; } catch (err) {
      enginePromise = null;
      clear(app).append(h('div.page', h('main', h('p.error', `載入失敗：${err.message}`), h('p', '請重新整理，或換新版瀏覽器（需要支援 WebAssembly）。')))); return;
    }
    window.__engine = engine;
  }
  if (seq !== routeSeq) return;   // 載入期間又換了頁：只畫最新那一次
  if (hash === '#/about') clear(app).append(aboutPage());
  else if (hash === '#/pick') clear(app).append(pickPage());
  else if (hash === '#/campaign') {
    const { campaignPage } = await import('./campaign.js');
    clear(app).append(campaignPage({ engine, shell, app, h, clear, toast, store }));
  } else clear(app).append(homePage());
  window.scrollTo(0, 0);
}

if (new URLSearchParams(location.search).has('autotest')) import('./autotest.js');
window.addEventListener('hashchange', route);
route();
export { startBattle };
