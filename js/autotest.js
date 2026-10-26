// 端到端自動測試的操作員：只用真實 DOM 點擊（跟玩家一樣），不碰引擎內部。?autotest=1 時由 app.js 載入。
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const q = (s) => document.querySelector(s);
const qa = (s) => [...document.querySelectorAll(s)];

/** 打一場：能出的牌就出、能攻擊就攻擊、其餘照結束。回傳結果文字（你贏了／你輸了／平手…）。 */
export async function playBattle({ maxSteps = 4000, attack = true, verify = false } = {}) {
  for (let i = 0; i < maxSteps; i++) {
    if (verify && i % 3 === 0 && !q('#btn-over') && window.__battle?.view.acting === 'player') {
      const missing = window.__battle.unreachableActions();
      if (missing.length) throw new Error(`有合法動作畫面上操作不到：${missing.join('；')}`);
    }
    if (q('#btn-over')) return q('#phase').textContent;
    // 1) 出牌
    const playable = qa('.hand .card.playable');
    let acted = false;
    for (const card of playable) {
      card.click(); await null;
      const act = q('.sheet .act');
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
          const acts = qa('.sheet .act');
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

// ---- 自動跑的情境（?autotest=battle｜campaign）：結果寫進 #autotest-result，e2e.sh 用 headless Chrome 讀 ----
async function waitFor(sel, ms = 300000) {
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
  q('#pick-mine [data-f=tiger]').click(); q('#pick-theirs [data-f=wolf]').click();
  must(!q('#start').disabled, '兩邊都選了才能開戰');
  q('#start').click();
  await waitFor('.hand .card');
  log.push(`開局：手牌 ${qa('.hand .card').length} 張，${q('#phase').textContent}`);
  must(qa('.hand .card').length > 0, '開局有手牌');
  must(qa('.hand .card').every((c) => window.__artPreloaded.has(c.dataset.card)), '手牌的卡圖在畫面出現前就已預載');
  must(q('.beta') && document.body.innerText.includes('版權所有'), '對局頁有測試版標記與版權宣告');
  const result = await playBattle({ verify: true });
  log.push(`結果：${result}；${q('.turn').textContent}（每個合法動作都有對應按鈕）`);
  must(['你贏了！', '你輸了', '平手（僵局）'].includes(result), '出現勝負頁');
  must(q('#btn-over'), '勝負頁有回首頁按鈕');
}

async function scenarioCampaign(log) {
  localStorage.removeItem('baishou.campaign.v1');
  location.hash = '#/campaign';
  await waitFor('#intro');
  q('#intro-skip').click();
  await waitFor('#campaign-factions');
  q('#campaign-factions [data-f=dragon]').click();
  await waitFor('#enter-stage');
  must(localStorage.getItem('baishou.campaign.v1'), '選門派後已存檔');
  q('#enter-stage').click();
  await waitFor('.hand .card');
  log.push('序章開局');
  let result = await playBattleStrong();
  log.push(`序章：${result}`);
  must(localStorage.getItem('baishou.campaign.v1') !== null || result !== '你贏了！', '對局中有存檔');
  q('#btn-over').click();
  if (result !== '你贏了！') { await waitFor('#again'); log.push('序章輸了，走到失敗畫面（存檔應已清除）'); must(localStorage.getItem('baishou.campaign.v1') === null, '輸了清除存檔'); return; }
  await waitFor('#rewards');
  const kinds = qa('.reward:not(:disabled)').map((b) => b.dataset.kind);
  log.push(`獎勵可挑：${kinds.join(',')}`);
  // 挑「升級」「俘虜」之外最簡單的兩樣：奇遇與秘寶（點第一張卡）
  for (const kind of ['adventure', 'treasure']) {
    const b = q(`.reward[data-kind=${kind}]`);
    if (!b || b.disabled) continue;
    b.click(); await waitFor('#card-pick .card'); q('#card-pick .card').click(); await sleep(100);
    if (q('#reward-continue')) break;
  }
  await waitFor('#reward-continue');
  q('#reward-continue').click();
  await waitFor('#choices');
  log.push(`第 1 關選對手：${qa('#choices .choice').length} 個山門`);
  const save = JSON.parse(localStorage.getItem('baishou.campaign.v1'));
  must(save && save.stageIndex === 1 && save.step === 'map', '過序章後存檔停在第 1 關路線圖');
  q('#choices .choice').click();
  await waitFor('.hand .card');
  log.push('第 1 關開局，存檔步驟：battle');
  await sleep(100);
  const s2 = JSON.parse(localStorage.getItem('baishou.campaign.v1'));
  must(s2.step === 'battle' && s2.battle, '對局中存檔帶局面');
  // 重新整理後接著走
  sessionStorage.setItem('autotest-phase', 'resume'); sessionStorage.setItem('autotest-log', JSON.stringify(log));
  location.reload();
  await sleep(100000);
}

/** 九場全打：用引擎貪心玩家的建議打，獎勵挑奇遇＋秘寶（沒有就挑別的）。要贏的局種子用 ?seed=。 */
async function scenarioFull(log) {
  localStorage.removeItem('baishou.campaign.v1');
  location.hash = '#/campaign';
  await waitFor('#intro'); q('#intro-skip').click();
  await waitFor('#campaign-factions');
  q(`#campaign-factions [data-f=${new URLSearchParams(location.search).get('f') ?? 'dragon'}]`).click();
  for (let stage = 0; stage < 9; stage++) {
    await waitFor('#enter-stage, #choices');
    const name = q('.maphead + .stagebar') ? '' : '';
    if (q('#choices')) q('#choices .choice').click(); else q('#enter-stage').click();
    await waitFor('.hand .card');
    const result = await playBattleStrong({ maxSteps: 6000 });
    log.push(`第 ${stage} 場：${result}（${q('.turn').textContent}）`);
    q('#btn-over').click();
    if (result !== '你贏了！') { await waitFor('#again'); must(false, `第 ${stage} 場沒贏`); }
    if (stage === 8) break;
    await waitFor('#rewards');
    for (const kind of ['adventure', 'treasure', 'capture']) {
      if (q('#reward-continue')) break;
      const b = q(`.reward[data-kind=${kind}]`);
      if (!b || b.disabled) continue;
      b.click(); await waitFor('#card-pick .card'); q('#card-pick .card').click(); await sleep(50);
    }
    await waitFor('#reward-continue'); q('#reward-continue').click();
  }
  await waitFor('#victory-continue'); q('#victory-continue').click();
  await waitFor('#again');
  must(document.body.innerText.includes('劇情模式・完'), '看到結尾');
  must(localStorage.getItem('baishou.campaign.v1') === null, '走完清除存檔');
  log.push('九場全勝，結尾頁、存檔已清');
}

/** 直達第 7（自己門派）或第 8 關（獸母）：確認開局設定（對手名、耐久）正確，並打到出結果。?stage=7|8&f=門派 */
async function scenarioStage(log) {
  localStorage.removeItem('baishou.campaign.v1');
  location.hash = '#/campaign';
  await waitFor('#intro'); q('#intro-skip').click();
  await waitFor('#campaign-factions');
  q(`#campaign-factions [data-f=${new URLSearchParams(location.search).get('f') ?? 'dragon'}]`).click();
  await waitFor('#enter-stage');
  const stageText = q('.card-box.single').innerText;
  log.push(`關卡畫面：${stageText.replace(/\n/g, ' ')}`);
  q('#enter-stage').click();
  await waitFor('.hand .card');
  const enemy = q('[data-testid=enemy-panel]').innerText.replace(/\n/g, ' ');
  log.push(`敵方：${enemy}`);
  const stage = Number(new URLSearchParams(location.search).get('stage'));
  if (stage === 8) { must(enemy.includes('獸母'), '第八關敵方主建築物叫獸母'); const bossLife = (stageText.match(/耐久 (\d+)/) ?? [])[1];
    must(bossLife && enemy.includes(`耐久 ${bossLife}/${bossLife}`), `第八關耐久與關卡畫面一致（${bossLife}）`); }
  const result = await playBattleStrong({ maxSteps: 6000 });
  log.push(`結果：${result}（${q('.turn').textContent}）`);
}

async function scenarioResume(log) {
  await waitFor('#resume');
  q('#resume').click();
  await waitFor('.hand .card');
  log.push('重新整理後接著走：回到對局');
  must(q('.turn'), '回到對局畫面');
}

async function runScenario() {
  const name = new URLSearchParams(location.search).get('autotest');
  if (name?.startsWith('shot-')) return runShot(name.slice(5));
  if (!['battle', 'campaign', 'campaign-full', 'campaign-stage'].includes(name)) return;
  const log = [`scenario=${name}`];
  try {
    if (name === 'battle') await scenarioBattle(log);
    else if (name === 'campaign-full') await scenarioFull(log);
    else if (name === 'campaign-stage') await scenarioStage(log);
    else if (sessionStorage.getItem('autotest-phase') === 'resume') { sessionStorage.removeItem('autotest-phase'); log.push(...JSON.parse(sessionStorage.getItem('autotest-log') ?? '[]')); await scenarioResume(log); }
    else await scenarioCampaign(log);
    report(log, true);
  } catch (err) { log.push(String(err.stack ?? err), `引擎局面：${(() => { try { const v = window.__engine.call({ cmd: 'state' }).view; return `acting=${v.acting} phase=${v.phase} active=${v.activeSide} turn=${v.turn}/${v.enemyTurn} UI=${window.__battle?.view?.acting}/${window.__battle?.view?.phase}`; } catch (e) { return String(e); } })()}`, `頁面文字：${document.body.innerText.slice(0, 200).replace(/\n/g, ' ')}`); report(log, false); }
}
runScenario();

// ---- 截圖用：走到某個畫面就停（headless Chrome --screenshot 擷取） ----
async function runShot(name) {
  try {
    if (name === 'home') { await waitFor('#go-battle'); }
    else if (name === 'pick') { location.hash = '#/pick'; await waitFor('#pick-mine'); q('#pick-mine [data-f=crane]').click(); q('#pick-theirs [data-f=wolf]').click(); }
    else if (name === 'battle') { location.hash = '#/pick'; await waitFor('#pick-mine'); q('#pick-mine [data-f=tiger]').click(); q('#pick-theirs [data-f=dragon]').click(); q('#start').click(); await waitFor('.hand .card'); }
    else if (name === 'sheet') { location.hash = '#/pick'; await waitFor('#pick-mine'); q('#pick-mine [data-f=tiger]').click(); q('#pick-theirs [data-f=dragon]').click(); q('#start').click(); await waitFor('.hand .card.playable'); q('.hand .card.playable').click(); await waitFor('.sheet'); }
    else if (name === 'over') { location.hash = '#/pick'; await waitFor('#pick-mine'); q('#pick-mine [data-f=tiger]').click(); q('#pick-theirs [data-f=dragon]').click(); q('#start').click(); await waitFor('.hand .card'); await playBattle(); }
    else if (name === 'intro' || name === 'factions' || name === 'map' || name === 'stage' || name === 'reward') {
      localStorage.removeItem('baishou.campaign.v1'); location.hash = '#/campaign';
      await waitFor('#intro'); if (name === 'intro') return;
      q('#intro-skip').click(); await waitFor('#campaign-factions'); if (name === 'factions') return;
      q('#campaign-factions [data-f=dragon]').click(); await waitFor('#enter-stage'); if (name === 'map') return;
      q('#enter-stage').click(); await waitFor('.hand .card'); if (name === 'stage') return;
      await playBattleStrong(); q('#btn-over').click(); await waitFor('#rewards, #again');
    }
  } catch (err) { document.body.append(Object.assign(document.createElement('pre'), { id: 'autotest-result', textContent: `SHOT FAIL ${err}` })); }
}
