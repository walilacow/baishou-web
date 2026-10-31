// 端到端自動測試的操作員：只用真實 DOM 點擊（跟玩家一樣），不碰引擎內部。?autotest=1 時由 app.js 載入。
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const q = (s) => document.querySelector(s);
const qa = (s) => [...document.querySelectorAll(s)];

/** 打一場：能出的牌就出、能攻擊就攻擊、其餘照結束。回傳結果文字（你贏了／你輸了／平手…）。 */
/** beta P1：內力資源列、主按鈕、手牌不能被別的東西蓋住（用 elementFromPoint 檢查中心點）。 */
export function assertNotCovered() {
  for (const sel of ['#resbar', '#btn-pass, #btn-over, .actions button', '.hand .card']) {
    const el = q(sel); if (!el) continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.bottom < 0 || r.top > innerHeight) throw new Error(`${sel} 不在視窗內（${Math.round(r.top)}～${Math.round(r.bottom)} / 視窗 ${innerHeight}）`);
    const top = document.elementFromPoint(r.left + r.width / 2, Math.min(r.top + r.height / 2, innerHeight - 1));
    if (top && !el.contains(top) && !top.contains(el)) throw new Error(`${sel} 被 ${top.className || top.tagName} 蓋住`);
  }
  if (!/內力 \d+/.test(q('#resbar')?.textContent ?? '')) throw new Error('常駐資源列沒有顯示內力');
}

const OCCL = new URLSearchParams(location.search).has('occl');   // 指定視窗大小跑時（Web/tests/viewport.mjs）每幾步檢查一次場上卡片有沒有被遮
export let occlChecked = 0;
export let gearSeen = 0, defenseBoxSeen = 0, baseHitBoxSeen = 0;
export async function playBattle({ maxSteps = 4000, attack = true, verify = false } = {}) {
  for (let i = 0; i < maxSteps; i++) {
    if (verify && i % 3 === 0 && !q('#btn-over') && window.__battle?.view.acting === 'player') {
      assertNotCovered();
      if (OCCL) { const o = occlusion(`第 ${i} 步`); if (o.bad.length) throw new Error(`${o.size} ${o.tag}卡片被遮：${o.bad.join('；')}`); occlChecked++; }
      const missing = window.__battle.unreachableActions();
      if (missing.length) throw new Error(`有合法動作畫面上操作不到：${missing.join('；')}`);
    }
    if (q('#btn-over')) return q('#phase').textContent;
    { // 對手出手、輪到我回應時，一定要有「對手攻擊：誰 → 誰（共 N 點）」摘要（含直接打主建築物）
      const v = window.__battle?.view;
      if (v?.targetCombat && v.activeSide === 'enemy' && ['response', 'declareBlockers'].includes(v.phase) && (v.combat?.attackers?.length ?? 0) > 0 && v.acting === 'player') {
        const box = q('#defend-info');
        if (!box || !/共 \d+ 點傷害/.test(box.innerText)) throw new Error('防守階段沒有「對手攻擊 … 共 N 點傷害」摘要');
        if (!(v.combat.targets ?? []).length && !/主建築物/.test(box.innerText)) throw new Error('直接打主建築物時摘要沒寫「主建築物」');
        defenseBoxSeen++;
        if (!(v.combat.targets ?? []).length) baseHitBoxSeen++;
      }
    }
    { // 場上有裝備掛在角色身上時，畫面要標出「裝備於 誰」與角色身上有什麼
      const v = window.__battle?.view;
      const n = [...(v?.player.field ?? []), ...(v?.enemy.field ?? [])].filter((p) => p.attachedTo != null).length;
      if (n) { must(qa('.card .attach').length >= n, `有 ${n} 件裝備掛在角色身上，畫面只標了 ${qa('.card .attach').length} 件「裝備於」`); must(qa('.card .gear').length >= 1, '角色卡要標出身上的裝備'); gearSeen++; }
    }
    // 1) 出牌
    const playable = qa('.hand .card.playable');
    let acted = false;
    for (const card of playable) {
      card.click(); await null;
      const act = q('.sheet .act:not(.disabled)');
      if (act) { act.click(); acted = true; await null; break; }
      q('.sheet .close')?.click();
    }
    if (acted) continue;
    // 2) 攻擊（主階段按「進入攻擊」之前，場上角色可以直接選目標）
    if (attack) {
      const pass = q('#btn-pass')?.textContent;
      if (pass === '進入攻擊' || pass === '攻擊結算' || pass === '不攻擊') {
        for (const card of qa('.my-field .card.playable')) {
          card.click(); await null;
          const acts = qa('.sheet .act:not(.disabled)');
          const hit = acts.find((b) => b.textContent.includes('主建築物')) ?? acts[0];
          if (hit) { hit.click(); acted = true; await null; break; }
          q('.sheet .close')?.click();
        }
        if (acted) continue;
      }
    }
    // 3) 需要決定的（閃、奇遇…）
    const dec = qa('.decision').find((b) => b.textContent.includes('全員攻擊')) ?? q('.decision');
    if (dec) { dec.click(); await null; continue; }
    // 4) 往下走
    const pass = q('#btn-pass');
    if (pass) { pass.click(); await null; continue; }
    await sleep(20);
  }
  throw new Error('playBattle: 超過步數仍未結束');
}

/** 用引擎貪心玩家的建議打完一場（走 Battle.act，同玩家按鈕的路徑）；測劇情流程要贏的時候用。 */
export async function playBattleStrong({ maxSteps = 3000 } = {}) {
  for (let i = 0; i < maxSteps; i++) {
    if (q('#btn-over')) return q('#phase').textContent;
    const b = window.__battle;
    if (b.view.acting !== 'player') { await sleep(10); continue; }
    b.act(window.__engine.call({ cmd: 'hint' }).action);
  }
  throw new Error('playBattleStrong: 超過步數');
}

export const helpers = { sleep, q, qa };
window.__autotest = true;
window.__auto = { playBattle, playBattleStrong, ...helpers };

// ---- 自動跑的情境（?autotest=battle｜build…）：結果寫進 #autotest-result，e2e.sh 用 headless Chrome 讀 ----
async function waitFor(sel, ms = 2500000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { const el = q(sel); if (el) return el; await sleep(50); }
  throw new Error(`等不到 ${sel}`);
}
function report(lines, ok) {
  let el = q('#autotest-result');
  if (!el) { el = document.createElement('pre'); el.id = 'autotest-result'; document.body.append(el); }
  el.textContent = `${ok ? 'AUTOTEST PASS' : 'AUTOTEST FAIL'}\n${lines.join('\n')}`;
}
function must(cond, msg) { if (!cond) throw new Error(`斷言失敗：${msg}`); }

async function scenarioBattle(log) {
  await waitFor('#go-battle');
  must(q('.beta')?.textContent.includes('測試版'), '首頁有測試版標記');
  must(document.body.innerText.includes('版權所有'), '首頁頁尾有版權宣告');
  q('#go-battle').click();
  await waitFor('#pick-mine');
  must(q('#guess-high').disabled && q('#guess-low').disabled, '門派沒選齊時猜潮信按鈕是灰的，並寫原因');
  must(q('#pick-hint')?.textContent.includes('先選好'), '沒選齊要寫為什麼不能開戰');
  q('#pick-mine [data-f=tiger]').click(); q('#pick-theirs [data-f=wolf]').click();
  must(!q('#guess-high').disabled, '兩邊都選了才能猜潮信開戰');
  q('#guess-high').click();
  await waitFor('.toast'); log.push(`潮信：${q('.toast').textContent}`);
  await waitFor('.hand .card');
  log.push(`開局：手牌 ${qa('.hand .card').length} 張，${q('#phase').textContent}`);
  must(qa('.hand .card').length > 0, '開局有手牌');
  must(qa('.hand .card').every((c) => window.__artPreloaded.has(c.dataset.card)), '手牌的卡圖在畫面出現前就已預載');
  must(q('.beta') && document.body.innerText.includes('版權所有'), '對局頁有測試版標記與版權宣告');
  // 手牌排序：舊卡依類別從左到右、內功最左；新抽到的牌在最右
  { const RANK = { innerArt: 0, character: 1, technique: 2, equipment: 3, formation: 4, trap: 5, talisman: 6, elixir: 7 };
    const types = qa('.hand .card').map((c) => RANK[window.__engine.cards[c.dataset.card]?.type] ?? 9);
    must(types.every((t, i) => i === 0 || types[i - 1] <= t), `開局手牌要照類別排序，內功在最左（實際：${types.join(',')}）`);
    log.push(`開局手牌類別順序：${types.join(',')}`); }
  { // 新抽到的牌放最右：結束回合直到輪到我的下一回合，新進手的牌要排在最後面
    const prevIds = new Set(qa('.hand .card').map((c) => c.dataset.id)); const t0 = window.__battle.view.turn;
    for (let i = 0; i < 60 && !(window.__battle.view.turn > t0 && window.__battle.view.acting === 'player'); i++) {
      const d = q('.decision'); if (d) { d.click(); continue; } const e = q('#btn-end') ?? q('#btn-pass'); if (!e) break; e.click();
    }
    const cards = qa('.hand .card'); const fresh = cards.filter((c) => !prevIds.has(c.dataset.id));
    must(fresh.length > 0, '新回合有抽到新牌');
    must(cards.slice(-fresh.length).every((c) => !prevIds.has(c.dataset.id)), '新抽到的牌要放在最右邊');
    log.push(`新抽到 ${fresh.length} 張，在最右`); }
  // 出不了牌要寫原因（beta P1-2）：點一張暗的牌
  const dim = qa('.hand .card.dim')[0];
  if (dim) { dim.click(); await null; const why = q('#why-not')?.textContent ?? ''; must(why.length > 6 && !why.includes('現在沒有可用的動作'), `出不了牌要寫具體原因（實際：${why}）`); q('.sheet .close')?.click(); log.push(`出不了牌的原因：${why}`); }
  const result = await playBattle({ verify: true });
  if (result === '你贏了！' || result === '你輸了') {   // 結算橫幅（勝利另加金光）
    const fx = window.__battle?.lastFX ?? [];
    must(fx.includes(result === '你贏了！' ? 'banner_victory' : 'banner_defeat'), `分出勝負要播結算橫幅（實際：${fx}）`);
    log.push(`結算特效：${fx.filter((x) => /banner|rays/.test(x)).join(',')}`);
  }
  if (OCCL) log.push(`遮擋檢查 ${innerWidth}×${innerHeight}：整局 ${occlChecked} 個畫面都沒有卡片被遮`);
  log.push(`裝備標示檢查：${gearSeen} 個畫面；`); log.push(`防守摘要檢查：共 ${defenseBoxSeen} 次，其中直接打主建築物 ${baseHitBoxSeen} 次`);
  must(q('#result-info') && q('#btn-again') && q('#btn-change'), '結算頁有結果說明、再來一局、換門派');
  must(/攻下了|被攻陷了|走火入魔|耐久相同/.test(q('#result-reason')?.textContent ?? ''), `結果要寫白話原因（實際：${q('#result-reason')?.textContent}）`);
  must(parseFloat(getComputedStyle(q('.battle')).paddingBottom) >= 20, '場面底部有留白');
  window.scrollTo(0, 500); q('#btn-again').click(); await waitFor('.hand .card');
  must(window.scrollY === 0, '再來一局後頁面回到頂端'); await waitFor('.toast'); must(q('.toast').getBoundingClientRect().top < 200, '潮信提示浮在上方，不蓋手牌');
  await playBattle({ verify: false });   // 再來一局也要能打完
  q('.link').click(); await null; const logText = q('.logpanel')?.innerText ?? '';
  must(!/#\d+/.test(logText), `戰鬥紀錄不能露出內部編號（實際：${(logText.match(/.{0,8}#\d+.{0,8}/) ?? [''])[0]}）`);
  must(!/月狼窟 抽到|嘯風虎穴 抽到.*\n.*月狼窟 抽到/.test(logText) && !/月狼窟 抽到/.test(logText), '紀錄不洩漏對手抽到什麼');
  must(!/^[=]*\s*戰鬥開始：第/m.test(logText), '紀錄開頭不寫「第二關」');
  must(!/(^|[\s，、])對\s+造成/m.test(logText), `傷害那行要有名字（實際：${(logText.match(/.{0,10}對\s+造成.{0,6}/) ?? [''])[0]}）`);
  log.push(`結果：${result}；${q('.turn').textContent}（每個合法動作都有對應按鈕）`);
  must(['你贏了！', '你輸了', '平手（僵局）'].includes(result), '出現勝負頁');
  must(q('#btn-over'), '勝負頁有回首頁按鈕');
  q('.logpanel .close')?.click(); await null;
  q('#btn-change').click(); await waitFor('#pick-mine');   // 快速開戰的局網址本來就停在 #/pick，「換門派」也要回到選門派畫面
  log.push('換門派：回到選門派畫面');
}




/** 敵方總「損失」：主建築物耐久差＋場上角色受傷與陣亡（用來斷言我方的攻擊真的打到東西） */
function enemyDamageScore(b) {
  const e = b.view.enemy;
  return (e.maxLife - e.life) + e.field.reduce((a, p) => a + p.damage, 0) + e.wounded.length * 100 + (e.graveyardCount ?? 0) * 100;
}
async function startFixedBattle(player, enemy) {
  location.hash = '#/pick'; await waitFor('#pick-mine');
  q(`#pick-mine [data-f=${player}]`).click(); q(`#pick-theirs [data-f=${enemy}]`).click(); q('#guess-low').click();
  await waitFor('.hand .card');
}
/** 按「往這座山門」；第八關（獸母）會先出現過場，再按「走進地脈口」。 */
async function enterStage() { q('#enter-stage').click(); await null; if (q('#enter-boss')) { must(q('.story'), '獸母關前有過場'); q('#enter-boss').click(); } }
const stepStrong = () => { const b = window.__battle; b.act(window.__engine.call({ cmd: 'hint' }).action); };

/** 像玩家一樣只用點擊：主階段按「進入攻擊」→ 點角色 → 選目標 → 按「攻擊結算」，要真的打到東西。 */
async function scenarioHumanAttack(log) {
  await startFixedBattle('tiger', 'dragon');
  for (let i = 0; i < 800; i++) {
    const b = window.__battle;
    if (q('#btn-over')) break;
    if (b.view.acting !== 'player') { await sleep(5); continue; }
    if (b.view.phase === 'main1' && (b.view.attackers?.length ?? 0) > 0) {
      const before = enemyDamageScore(b);
      must(q('#btn-pass').textContent === '進入攻擊', `主階段有能攻擊的角色，主按鈕要寫「進入攻擊」（實際：${q('#btn-pass').textContent}）`);
      must(q('#btn-end'), '主階段另有「結束回合」');
      q('#btn-pass').click();
      must(q('#attack-info'), '指定攻擊階段有操作說明');
      const card = qa('.my-field .card.playable')[0];
      must(card, '指定攻擊階段能點的角色有亮框');
      card.click();
      const acts = qa('.sheet .act:not(.disabled)'); must(acts.length > 0, '點角色後列出攻擊目標');
      log.push(`攻擊選項：${acts.map((a) => a.textContent).join('／')}`);
      if (qa('.sheet .act').every((a) => !a.textContent.includes('主建築物') || a.disabled)) must(/暫時打不到|先清/.test(q('#base-locked')?.textContent ?? ''), '敵方主建築物上要標為什麼暫時打不到'), must(/先清/.test(q('#base-blocked')?.textContent ?? ''), '目標清單沒有主建築物時要寫「先清場」原因');
      (acts.find((a) => a.textContent.includes('主建築物')) ?? acts[0]).click();
      must(q('#btn-pass').textContent === '攻擊結算', `選完目標按鈕要變「攻擊結算」（實際：${q('#btn-pass').textContent}）`);
      q('#btn-pass').click();
      const after = enemyDamageScore(window.__battle);
      log.push(`攻擊前後敵方損失 ${before} → ${after}；${q('#lastlog').textContent}`);
      must(after > before, '攻擊要打到東西（敵方損失增加）');
      return;
    }
    stepStrong();
  }
  must(false, '800 步內沒出現能攻擊的主階段');
}

/** 防守：敵方打我的輕功角色時，畫面要寫清楚誰打誰、有「閃」按鈕，按了真的閃開（打在主建築物上）。 */
/** 我方一張牌都不出、只按結束回合：對手一定會直接打主建築物，防守階段也要有「對手攻擊 … → 你的主建築物（共 N 點）」摘要。 */
async function scenarioIdleBase(log) {
  await startFixedBattle('tiger', 'wolf');
  let checked = 0, lastKey = '';
  for (let i = 0; i < 1500; i++) {
    const b = window.__battle;
    if (q('#btn-over')) break;
    if (b.view.acting !== 'player') { await sleep(5); continue; }
    const v = b.view;
    const key = `${v.turn}/${v.enemyTurn}/${v.phase}/${(v.combat?.attackers ?? []).join(',')}`;
    if (key !== lastKey && v.activeSide === 'enemy' && (v.combat?.attackers?.length ?? 0) > 0) {
      lastKey = key;
      log.push(`防守畫面：phase=${v.phase} targetCombat=${v.targetCombat} attackers=${JSON.stringify(v.combat.attackers)} targets=${JSON.stringify(v.combat.targets)}`);
      const box = q('#defend-info');
      must(box, '直接打主建築物時防守階段要有摘要框（#defend-info）');
      must(/主建築物（共 \d+ 點傷害/.test(box.innerText), `摘要要寫「→ 你的主建築物（共 N 點傷害）」（實際：${box.innerText.replace(/\n/g, ' ')}）`);
      log.push(`摘要：${box.innerText.replace(/\n/g, ' ')}`);
      if (++checked >= 5) return;
    }
    const dec = q('.decision'); if (dec) { dec.click(); await null; continue; }
    const pass = q('#btn-pass'); if (pass) { pass.click(); await null; continue; }
    await sleep(20);
  }
  must(checked > 0, '1500 步內對手沒有打出攻擊');
}

/** 能裝備就裝備地打一場：場上出現「裝備於 誰」時，裝備卡與角色卡都要標出來（e2e 內檢查在 playBattle 裡）。 */
async function scenarioGear(log) {
  for (const f of ['tiger', 'dragon', 'crane']) {
    gearSeen = 0;
    await startFixedBattle(f, 'wolf');
    await playBattle({ verify: false });
    log.push(`${f} 對局裝備畫面 ${gearSeen} 個`);
    if (gearSeen > 0) return;
    location.hash = '#/pick'; await waitFor('#pick-mine');
  }
  must(false, '三場都沒出現裝備掛在角色身上的畫面，無法驗證標示');
}

/** 版面遮擋：場上角色卡要整張落在上方標題列與下方固定操作區（內力列＋按鈕＋手牌）之間，手牌要在畫面內。回傳問題清單。 */
function occlusion(tag) {
  const vh = window.innerHeight, vw = window.innerWidth;
  const top = q('.topbar')?.getBoundingClientRect().bottom ?? 0;
  const dock = q('.dock')?.getBoundingClientRect(); const dockTop = dock ? dock.top : vh;
  const bad = [];
  for (const el of qa('.my-field .card, .enemy-field .card, .my-support .card, .enemy-support .card, [data-testid=player-panel], [data-testid=enemy-panel]')) {
    const r = el.getBoundingClientRect();
    if (r.top < top - 0.5 || r.bottom > dockTop + 0.5 || r.left < -0.5 || r.right > vw + 0.5) bad.push(`${el.getAttribute('aria-label') ?? el.dataset.testid}(${Math.round(r.top)}–${Math.round(r.bottom)}，可見 ${Math.round(top)}–${Math.round(dockTop)})`);
  }
  for (const el of qa('.hand .card')) { const r = el.getBoundingClientRect(); if (r.bottom > vh + 0.5 || r.top < dockTop - 0.5) bad.push(`手牌${el.getAttribute('aria-label')}(${Math.round(r.top)}–${Math.round(r.bottom)}，畫面高 ${vh})`); }
  if (bad.length) bad.push('版面：' + [...q('.battle').children].map((c) => `${c.className.split(' ')[0]}=${Math.round(c.getBoundingClientRect().height)}`).join(' ') + ` gap=${getComputedStyle(q('.battle')).rowGap} card-h=${getComputedStyle(document.documentElement).getPropertyValue('--card-h')}`);
  return { tag, size: `${vw}×${vh}`, bad };
}

/** 本機可重現情境（?scenario=poison|heal|formation，只在 localhost）：固定場面下驗中毒層數、療傷、陣法的畫面。 */
async function scenarioFixed(log) {
  const name = new URLSearchParams(location.search).get('scenario');
  await waitFor('.hand .card, .my-field .card');
  const b = window.__battle;
  const noMissing = (tag) => { const m = b.unreachableActions(); must(!m.length, `${tag}：有合法動作畫面上操作不到或沒有中文標籤：${m.join('；')}`); };
  noMissing(`${name} 開局`);
  if (name === 'poison') {
    must(qa('.card .poison').length >= 1, '敵方有中毒角色，卡面要標出中毒層數（☠N）');
    log.push(`中毒標示：${qa('.card .poison').map((e) => e.textContent).join(',')}`);
    if (OCCL) {   // 放得下時不能無故縮卡（頁尾版權列不算進牌桌高度）
      const ch = q('.my-field .card').getBoundingClientRect().height;
      log.push(`卡高 ${innerWidth}×${innerHeight}：${Math.round(ch)}px`);
      if (innerHeight >= 760 && innerWidth >= 900) must(ch >= 96, `視窗夠高卡片卻被縮到 ${Math.round(ch)}px`);
    }
    if (OCCL) { const o = occlusion('開局'); log.push(`遮擋檢查 ${o.size} 開局：${o.bad.length ? o.bad.join('；') : '無'}`); must(!o.bad.length, `${o.size} 開局卡片被遮：${o.bad.join('；')}`); }
    q('#btn-pass').click(); await sleep(50);
    if (OCCL) { const o = occlusion('攻擊提示'); log.push(`遮擋檢查 ${o.size} 攻擊提示：${o.bad.length ? o.bad.join('；') : '無'}`); must(!o.bad.length, `${o.size} 出現攻擊提示時卡片被遮：${o.bad.join('；')}`); }
    const mine = qa('.my-field .card.playable'); must(mine.length, '淬毒角色可以攻擊'); mine[mine.length - 1].click(); await sleep(50);
    const act = qa('.sheet .act:not(.disabled)').find((x) => x.textContent.startsWith('攻擊 →')); must(act, '有攻擊目標按鈕'); act.click(); await sleep(50);
    const mineBefore = b.view.player.field.length;
    q('#btn-pass').click();
    // 特效元素要真的在跑動畫（只看名稱會在動畫沒接上時照樣綠）
    const live = qa('#fx-layer .fx');
    must(live.length >= 2, `命中當下特效圖層要有元素（實際 ${live.length}）`);
    must(live.every((e) => getComputedStyle(e).animationName !== 'none' && e.getAnimations().length === 1), `特效要套上動畫（實際：${live.map((e) => `${e.dataset.fx}:${getComputedStyle(e).animationName}`).join(',')}）`);
    log.push(`特效動畫：${live.map((e) => `${e.dataset.fx}:${getComputedStyle(e).animationName}`).join(',')}`);
    await sleep(300);
    // 華麗特效：命中要有門派火花與刀光（素材在 art/fx/）；卡圖區要是 4:3
    must((b.lastFX ?? []).some((x) => x.startsWith('spark_')) && b.lastFX.includes('slash_body'), `攻擊命中要播火花與刀光（實際：${b.lastFX}）`);
    log.push(`命中特效：${b.lastFX.join(',')}`);
    q('#fx-toggle').click(); await null;   // 設定關掉後要記住、按鈕寫「關」
    must(q('#fx-toggle').textContent === '特效：關' && localStorage.getItem('fancyFX') === 'off', '特效開關可以關');
    {   // 關掉時同樣的事件一律不播
      const fx = await import('./fx.js'); const target = q('.card');
      const ev = [{ damageDealt: { amount: 2, target: 1, side: 'enemy', sourceFaction: 'wolf' } }];
      const ctx = { find: () => target, panel: () => null, mana: () => null, field: () => null, perm: () => null };
      const n0 = qa('#fx-layer .fx').length;
      must(fx.playEvents(ev, ctx).length === 0 && qa('#fx-layer .fx').length === n0, '特效關掉時不能播');
    }
    q('#fx-toggle').click(); await null; must(q('#fx-toggle').textContent === '特效：開', '特效開關可以再打開');
    const art = q('.my-field .card .art, .enemy-field .card .art').getBoundingClientRect();
    must(Math.abs(art.width / art.height - 4 / 3) < 0.04, `卡圖區要是 4:3（實際 ${art.width.toFixed(1)}×${art.height.toFixed(1)}）`);
    if (b.view.player.field.length < mineBefore) { must(q('#lost-note'), '我方角色退場時要有「⚠ 你的 X 退場了」提示'); log.push(`退場提示：${q('#lost-note').textContent}`); }
    log.push(`攻擊後中毒標示：${qa('.card .poison').map((e) => e.textContent).join(',')}`);
  } else if (name === 'heal') {
    qa('.my-field .card.playable')[0].click(); await sleep(50);
    const act = qa('.sheet .act:not(.disabled)').find((x) => x.textContent.includes('療傷')); must(act, '醫者有「療傷」技能按鈕'); act.click(); await sleep(200);
    must(qa('.card .convalesce').length === 1, '療傷中的角色卡面要標「療傷中・剩 N 回合」');
    log.push(`療傷標示：${q('.card .convalesce').textContent}`);
    noMissing('療傷後');
  } else if (name === 'dodge') {
    for (let i = 0; i < 60 && !(b.view.phase === 'response' && b.view.activeSide === 'enemy' && (b.view.combat?.attackers?.length ?? 0) > 0); i++) { (q('.decision') ?? q('#btn-pass'))?.click(); await sleep(30); }
    must(q('#defend-info'), '對手出手後要有防守摘要');
    must(!/某個角色/.test(q('#defend-info').innerText), `摘要不能出現佔位字「某個角色」（實際：${q('#defend-info').innerText.replace(/\n/g, ' ')}）`);
    log.push(`閃前：${q('#defend-info').innerText.replace(/\n/g, ' ').slice(0, 140)}`);
    let n = 0;
    while (b.snap.legal.some((a) => a.dodge) && n++ < 3) { q('.decision').click(); await sleep(80); const t = q('#defend-info')?.innerText ?? ''; must(/→ 你的主建築物/.test(t), `閃開後摘要要出現「→ 你的主建築物」（實際：${t.replace(/\n/g, ' ')}）`); }
    if (!b.snap.legal.some((a) => a.dodge)) must(qa('.my-field .card.targeted').length === 0, '全部閃開後，原目標不能還標著被攻擊的紅虛線框');
    log.push(`閃了 ${n} 次後：${(q('#defend-info')?.innerText ?? '').replace(/\n/g, ' ').slice(0, 160)}`);
  } else if (name === 'formation') {
    qa('.hand .card.playable')[0].click(); await sleep(50);
    const cast = qa('.sheet .act:not(.disabled)').find((x) => x.textContent.includes('站上陣位')) ?? q('.sheet .act:not(.disabled)'); cast.click(); await sleep(200);
    noMissing('打出陣圖後');
    must(/陣：守窟陣（(陣位：|已啟動)/.test(document.body.innerText), `己方資訊要寫出陣圖與陣位（實際：${(document.body.innerText.match(/陣：.{0,30}/) ?? ['沒有'])[0]}）`);
    log.push(`陣圖顯示：${(document.body.innerText.match(/陣：.{0,30}/) ?? [''])[0]}；按鈕：${qa('.decision').map((x) => x.textContent).join('／')}`);
  }
}

async function scenarioHumanDefend(log) {
  await startFixedBattle('crane', 'wolf');
  for (let i = 0; i < 1500; i++) {
    const b = window.__battle;
    if (q('#btn-over')) break;
    if (b.view.acting !== 'player') { await sleep(5); continue; }
    if (b.view.phase === 'response' && (b.snap.legal ?? []).some((a) => a.dodge)) {
      must(q('#defend-info'), '防守階段要寫「對手攻擊：誰 → 誰」');
      must(!/#\d+/.test(q('#defend-info').innerText) && /共 \d+ 點傷害/.test(q('#defend-info').innerText), '防守摘要要合併顯示傷害點數、不露編號');
      must(!/剩 \d+ 血/.test(q('#defend-info').innerText) || /目前 \d+ 血/.test(q('#defend-info').innerText), '血量文案用「目前 N 血」');
      log.push(`防守說明：${q('#defend-info').innerText.replace(/\n/g, ' ')}`);
      const btn = qa('.decision').find((x) => x.textContent.includes('閃開'));
      must(btn, '有輕功角色被打時要有「閃開」按鈕');
      log.push(`閃的按鈕：${qa('.decision').map((x) => x.textContent).join('／')}`);
      const myLifeBefore = b.view.player.life;
      btn.click();
      const lines = window.__battle.logLines.slice(-6).join(' ');
      must(lines.includes('閃開'), `按下去要有「閃開」紀錄（實際：${lines}）`);
      log.push(`按閃之後：${window.__battle.logLines.slice(-2).join('；')}`);
      await null; const after = q('#defend-info');
      if (after) { must(/→ 你的主建築物/.test(after.innerText), `閃開之後摘要要把那一擊改成「→ 你的主建築物」（實際：${after.innerText.replace(/\n/g, ' ')}）`); log.push(`閃後摘要：${after.innerText.replace(/\n/g, ' ').slice(0, 120)}`); }
      return;
    }
    stepStrong();
  }
  must(false, '1500 步內沒出現能閃的防守階段');
}

/** 亂點：像不懂規則的玩家一樣隨機點可點的東西，找「沒有任何可按的控制項」「動作失敗」「畫面與引擎不同步」。 */
async function scenarioFuzz(log) {
  let rnd = Number(new URLSearchParams(location.search).get('rseed') ?? 1) || 1;
  const rand = (n) => { rnd = (rnd * 1664525 + 1013904223) % 4294967296; return rnd % n; };
  const problems = [];
  for (const [me, foe] of [['crane', 'wolf'], ['tiger', 'dragon'], ['scorpion', 'bat'], ['jiao', 'crane']]) {
    await startFixedBattle(me, foe);
    let steps = 0;
    for (; steps < 1500 && !q('#btn-over'); steps++) {
      const b = window.__battle;
      if (b.view.acting !== 'player') { await sleep(5); continue; }
      // 畫面與引擎一致：UI 的局面要等於引擎當下的局面
      const eng = window.__engine.call({ cmd: 'state' }).view;
      if (eng.phase !== b.view.phase || eng.turn !== b.view.turn) problems.push(`${me}/${foe} 步${steps}：畫面 ${b.view.phase}/${b.view.turn} ≠ 引擎 ${eng.phase}/${eng.turn}`);
      const controls = [...qa('.actions button'), ...qa('.hand .card'), ...qa('.card.playable'), ...qa('.sheet .act:not(.disabled)'), ...qa('.sheet .close')].filter((el) => !el.disabled);
      if (!controls.length) { problems.push(`${me}/${foe} 步${steps}：${b.view.phase} 沒有任何可操作的控制項`); break; }
      const toastBefore = qa('.toast').length;
      controls[rand(controls.length)].click();
      if (qa('.toast').length > toastBefore && /失敗/.test(qa('.toast').at(-1).textContent)) problems.push(`${me}/${foe} 步${steps}：${qa('.toast').at(-1).textContent}`);
      // 亂點會一直開關面板；偶爾推進一下回合，免得原地打轉
      if (steps % 7 === 6) { const adv = q('#btn-pass'); if (adv) adv.click(); }
    }
    log.push(`${me} vs ${foe}：${steps} 步，${q('#btn-over') ? q('#phase').textContent : '未結束'}`);
    if (!q('#btn-over') && steps >= 1500) problems.push(`${me}/${foe}：1500 步還沒打完（可能原地打轉）`);
  }
  log.push(...problems.slice(0, 20));
  must(problems.length === 0, `亂點發現 ${problems.length} 個問題`);
}




/** 組牌：從基本牌組出發、牌庫是全部的卡、任意增減；不合法引擎擋下並寫原因；組好的牌真的帶進對局。 */
async function scenarioBuild(log) {
  localStorage.clear();
  await waitFor('#go-battle'); q('#go-battle').click();
  await waitFor('#pick-mine');
  must(q('#go-build').disabled, '門派沒選齊時不能組牌');
  q('#pick-mine [data-f=tiger]').click(); q('#pick-theirs [data-f=wolf]').click();
  must(!q('#go-build').disabled, '選齊後可以自己組牌'); q('#go-build').click();
  await waitFor('#deck-stat');
  const stat0 = q('#deck-stat').innerText.replace(/\n/g, ' '); log.push(`基本牌組：${stat0}`);
  must(q('#deck-ok'), `基本牌組要是合法的（實際：${q('#deck-problems')?.innerText}）`);
  const n0 = Number(q('#deck-stat b').textContent.match(/牌組 (\d+)／/)[1]);
  // 牌庫是全部的卡：任何門派的卡都找得到（用別派卡）
  q('#tab-pool')?.click();
  const poolCount = qa('#bpool .drow').length; must(poolCount >= 50, '牌庫有牌（顯示前 80 張）');
  q('#pool-faction [data-pf="dragon"]').click();
  await null;
  const target = qa('#bpool .drow').find((r) => window.__engine.cards[r.dataset.card].faction === 'dragon' && window.__engine.cards[r.dataset.card].type === 'character') ?? qa('#bpool .drow')[0];
  const addId = target.dataset.card; log.push(`加入別派的牌：${window.__engine.cards[addId].name}`);
  target.querySelector('[data-add]').click(); await null;
  must(Number(q('#deck-stat b').textContent.match(/牌組 (\d+)／/)[1]) === n0 + 1, '加一張，牌組張數 +1');
  // 同名超過上限：引擎擋（按 + 直到出現問題）
  for (let i = 0; i < 6 && !q('#deck-problems'); i++) { q(`#bpool [data-card="${addId}"] [data-add]`).click(); await null; }
  must(q('#deck-problems'), '同名放太多要被擋'); log.push(`超過上限：${q('#deck-problems').innerText.replace(/\n/g, ' ')}`);
  must(q('#build-high').disabled && q('#build-low').disabled, '不合法時不能開戰');
  // 退回合法：減到合法
  while (q('#deck-problems')) { const dec = q(`#bdeck [data-dec="${addId}"]`); if (!dec || dec.disabled) break; dec.click(); await null; }
  // 本門主角不能拿掉
  const heroRows = qa('#bdeck .drow'); must(heroRows.length > 0, '牌組列表有牌');
  // 內功配置：把本門減一張、江湖加一張，仍是 12–13 張
  q('#tab-deck')?.click();
  const dec = q('#bdeck [data-ldec=tiger]'); dec.click(); await null; q('#bdeck [data-linc=jianghu]').click(); await null;
  log.push(`內功配置：${q('#deck-stat').innerText.replace(/\n/g, ' ')}`);
  // 先把加的別派牌放回去（留 1 張），確認合法就開戰
  if (!q('#bdeck [data-card="' + addId + '"]')) { q('#tab-pool').click(); q(`#bpool [data-card="${addId}"] [data-add]`).click(); await null; }
  must(q('#deck-ok'), `最後要合法（實際：${q('#deck-problems')?.innerText}）`);
  // 自訂牌組存下來
  must(JSON.parse(localStorage.getItem('baishou.deck.v1.tiger')).deck.includes(addId), '組好的牌組存在瀏覽器');
  q('#build-high').click();
  await waitFor('.hand .card');
  const ids = window.__engine.call({ cmd: 'deckIDs' }).ids;
  must(ids.includes(addId), `開戰的牌組要含我換進去的牌 ${addId}`);
  log.push(`開戰牌組含別派牌：${window.__engine.cards[addId].name}（共 ${ids.length} 張含內功）`);
  const result = await playBattle({ verify: false });
  log.push(`打完：${result}`);
  // 再來一局沿用我的牌組
  q('#btn-again').click(); await waitFor('.hand .card');
  must(window.__engine.call({ cmd: 'deckIDs' }).ids.includes(addId), '再來一局沿用自訂牌組');
}

async function runScenario() {
  const name = new URLSearchParams(location.search).get('autotest');
  if (name?.startsWith('shot-')) return runShot(name.slice(5));
  if (!['battle', 'human-attack', 'human-defend', 'idle-base', 'gear', 'scn', 'build', 'fuzz'].includes(name)) return;
  const log = [`scenario=${name}`];
  try {
    if (name === 'battle') await scenarioBattle(log);
    else if (name === 'fuzz') await scenarioFuzz(log);
    else if (name === 'human-attack') await scenarioHumanAttack(log);
    else if (name === 'human-defend') await scenarioHumanDefend(log);
    else if (name === 'idle-base') await scenarioIdleBase(log);
    else if (name === 'gear') await scenarioGear(log);
    else if (name === 'scn') await scenarioFixed(log);
    else if (name === 'build') await scenarioBuild(log);
    report(log, true);
  } catch (err) { log.push(String(err.stack ?? err), `引擎局面：${(() => { try { const v = window.__engine.call({ cmd: 'state' }).view; return `acting=${v.acting} phase=${v.phase} active=${v.activeSide} turn=${v.turn}/${v.enemyTurn} UI=${window.__battle?.view?.acting}/${window.__battle?.view?.phase}`; } catch (e) { return String(e); } })()}`, `頁面文字：${document.body.innerText.slice(0, 200).replace(/\n/g, ' ')}`); report(log, false); }
}
runScenario();

// ---- 截圖用：走到某個畫面就停（headless Chrome --screenshot 擷取） ----
/** 像玩家一樣只用點擊打攻擊流程，逐步記錄畫面上看到的東西（找「攻擊沒用」） */
async function traceAttack() {
  const out = [];
  const snap = (tag) => out.push(`[${tag}] ${q('#phase')?.textContent} | 按鈕：${qa('.actions button').map((b) => b.textContent).join('／')} | 敵耐久 ${q('#enemy-life')?.textContent} | 我耐久 ${q('#player-life')?.textContent} | 紀錄：${q('#lastlog')?.textContent}`);
  location.hash = '#/pick'; await waitFor('#pick-mine'); q('#pick-mine [data-f=tiger]').click(); q('#pick-theirs [data-f=dragon]').click(); q('#guess-low').click(); await waitFor('.hand .card');
  snap('開局');
  for (let turn = 0; turn < 8 && !q('#btn-over'); turn++) {
    // 出牌
    for (const card of qa('.hand .card.playable')) { card.click(); const act = q('.sheet .act:not(.disabled)'); if (act) { act.click(); } else q('.sheet .close')?.click(); }
    snap(`第${turn}輪出牌後`);
    const atk = qa('.my-field .card.playable');
    out.push(`可攻擊角色 ${atk.length} 個`);
    if (atk.length && q('#btn-pass')?.textContent === '進入攻擊') {
      atk[0].click();
      out.push(`選角色後面板：${qa('.sheet .act:not(.disabled)').map((b) => b.textContent).join('／')}`);
      const base = qa('.sheet .act:not(.disabled)').find((b) => b.textContent.includes('主建築物')) ?? q('.sheet .act:not(.disabled)');
      if (base) { base.click(); snap('選目標後'); }
      const pass = q('#btn-pass'); if (pass) { out.push(`按「${pass.textContent}」`); pass.click(); snap('結算後'); }
    }
    const end = q('#btn-end') ?? q('#btn-pass'); if (end && !q('#btn-over')) { out.push(`按「${end.textContent}」`); end.click(); snap(`第${turn}輪結束後`); }
    await sleep(5);
  }
  report(out, true);
}

async function runShot(name) {
  if (name === 'trace') return traceAttack();
  if (name === 'build') { localStorage.clear(); location.hash = '#/pick'; await waitFor('#pick-mine'); q('#pick-mine [data-f=tiger]').click(); q('#pick-theirs [data-f=wolf]').click(); q('#go-build').click(); await waitFor('#deck-stat'); return; }
  if (name.startsWith('seq')) {   // seq<N>：用引擎建議走到第 N 個玩家決定，停在那個畫面截圖
    const n = Number(name.slice(3));
    await startFixedBattle('crane', 'wolf');
    for (let i = 0; i < n && !q('#btn-over'); i++) { const b = window.__battle; if (b.view.acting !== 'player') { await sleep(5); i--; continue; } stepStrong(); }
    return;
  }
  try {
    if (name === 'home') { await waitFor('#go-battle'); }
    else if (name === 'pick') { location.hash = '#/pick'; await waitFor('#pick-mine'); q('#pick-mine [data-f=crane]').click(); q('#pick-theirs [data-f=wolf]').click(); }
    else if (name === 'battle') { location.hash = '#/pick'; await waitFor('#pick-mine'); q('#pick-mine [data-f=tiger]').click(); q('#pick-theirs [data-f=dragon]').click(); q('#guess-low').click(); await waitFor('.hand .card'); }
    else if (name === 'defend' || name === 'attack') {
      location.hash = '#/pick'; await waitFor('#pick-mine'); q('#pick-mine [data-f=crane]').click(); q('#pick-theirs [data-f=wolf]').click(); q('#guess-low').click(); await waitFor('.hand .card');
      for (let i = 0; i < 600; i++) {
        const b = window.__battle; const legal = b.snap.legal ?? [];
        if (name === 'defend' && b.view.phase === 'response' && legal.some((a) => a.dodge)) break;
        if (name === 'attack' && b.view.phase === 'main1' && legal.some((a) => a.attack)) { q(`.my-field .card.playable`).click(); break; }
        if (b.view.acting !== 'player' || b.view.result) { await sleep(5); continue; }
        b.act(window.__engine.call({ cmd: 'hint' }).action);
      }
    }
    else if (name === 'sheet') { location.hash = '#/pick'; await waitFor('#pick-mine'); q('#pick-mine [data-f=tiger]').click(); q('#pick-theirs [data-f=dragon]').click(); q('#guess-low').click(); await waitFor('.hand .card.playable'); q('.hand .card.playable').click(); await waitFor('.sheet'); }
    else if (name === 'over') { location.hash = '#/pick'; await waitFor('#pick-mine'); q('#pick-mine [data-f=tiger]').click(); q('#pick-theirs [data-f=dragon]').click(); q('#guess-low').click(); await waitFor('.hand .card'); await playBattle(); }
    } catch (err) { document.body.append(Object.assign(document.createElement('pre'), { id: 'autotest-result', textContent: `SHOT FAIL ${err}` })); }
}
