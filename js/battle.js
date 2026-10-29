import { h, clear, toast } from './ui.js';

import { costText, costTotal, SHORT } from './cost.js';
export { costText };
const PHASE_TITLE = {
  main1: ['我方回合 · 主階段', '對手回合 · 主階段'],
  declareAttackers: ['我方回合 · 指定攻擊', '對手宣告攻擊'],
  declareBlockers: ['對手防禦階段', '防禦階段 · 選擇反應'],
  response: ['對手防禦階段', '防禦階段 · 選擇反應'],
  main2: ['我方回合 · 第二主階段', '對手回合 · 第二主階段'],
  retarget: ['我方回合 · 重選目標', '對手重選目標…'],
  finished: ['對局結束', '對局結束'],
};

/** 卡圖預載：手牌、場上這種馬上要看的卡先載好，避免畫面先空白再補上。留著參照，瀏覽器才不會丟掉解碼好的圖。 */
const CHEAT = ['localhost', '127.0.0.1'].includes(location.hostname) && new URLSearchParams(location.search).has('cheat');   // 測試快捷：只在本機、網址帶 ?cheat 才出現
const preloaded = new Map();
export function preloadArt(engine, ids) {
  for (const id of ids) {
    if (!id || preloaded.has(id) || !engine.artSet?.has(id)) continue;
    const img = new Image();
    img.decoding = 'async';
    img.src = `art/${id}.webp`;
    preloaded.set(id, img);
  }
}
window.__artPreloaded = preloaded;


/** 一張卡的外觀。perm 有值就是場上的角色（顯示實際攻防）。 */
export function cardEl(engine, cardID, { perm = null, instance = null, mini = false, selected = false, hint = '', onClick = null } = {}) {
  const def = engine.cards[cardID] ?? { name: cardID, type: 'character', faction: 'jianghu', text: '' };
  const isChar = def.type === 'character';
  const art = h('div.art', { style: engine.artSet?.has(cardID) ? `background-image:url(art/${cardID}.webp)` : '' });
  const lvl = (perm?.level ?? instance?.level ?? 1);
  const upg = (perm?.upgrade ?? instance?.upgrade ?? 0);
  const el = h(`div.card.f-${def.faction}.t-${def.type}`, {
    class: [mini ? 'mini' : '', selected ? 'selected' : '', perm?.tapped ? 'tapped' : '', hint].join(' '),
    'data-card': cardID, 'data-id': perm?.id ?? instance?.id ?? '', tabindex: onClick ? '0' : null, role: onClick ? 'button' : null,
    'aria-label': def.name,
    on: onClick ? { click: onClick, keydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(e); } } } : {},
  },
  art,
  h('div.name', def.name + (upg ? ` +${upg}` : '')),
  def.cost && costText(def.cost) ? h('div.cost', costText(def.cost)) : null,
  isChar ? h('div.pt', perm ? `${perm.power}/${Math.max(0, perm.toughness - perm.damage)}` : `${def.power ?? 0}/${def.toughness ?? 0}`) : h('div.tp', engine.typeNames[def.type] ?? def.type),
  perm && lvl > 1 ? h('div.lvl', `Lv${lvl}`) : null,
  perm?.fresh ? h('div.fresh', { title: '剛上場保護：到對手下一個回合結束前，敵方角色不能指定它為攻擊目標' }, '保護') : null,
  perm && perm.keywords?.length ? h('div.kw', perm.keywords.map((k) => engine.keywords.find((x) => x.id === k)?.name ?? k).join('·')) : null);
  return el;
}

export function cardDetail(engine, cardID, perm = null) {
  const def = engine.cards[cardID];
  if (!def) return h('div', cardID);
  const kws = (perm?.keywords ?? def.keywords ?? []).map((k) => engine.keywords.find((x) => x.id === k)).filter(Boolean);
  return h('div.detail-body',
    h('div.d-title', def.name, h('span.d-type', ` ${engine.factionNames[def.faction] ?? ''} · ${engine.typeNames[def.type] ?? def.type}`)),
    costText(def.cost) ? h('div.d-cost', `內力：${costText(def.cost)}`) : null,
    def.type === 'character' ? h('div.d-pt', perm ? `攻 ${perm.power}／氣血 ${perm.toughness - perm.damage}（上限 ${perm.toughness}）` : `攻 ${def.power ?? 0}／氣血 ${def.toughness ?? 0}`) : null,
    def.text ? h('p.d-text', def.text) : null,
    ...(def.skills ?? []).map((s) => h('p.d-skill', h('b', `技能・${s.name}`), costText(s.cost) ? `（內力 ${costText(s.cost)}）` : '', s.text ? `：${s.text}` : '')),
    ...kws.map((k) => h('p.d-kw', h('b', `天賦・${k.name}`), `：${k.text}`)),
    def.flavor ? h('p.d-flavor', def.flavor) : null);
}

export class Battle {
  /**
   * @param engine 已載入的 Engine
   * @param root 掛畫面的元素
   * @param snap 引擎回傳的局面（newBattle／resume 的結果）
   * @param opts { title, onEnd(result, snap), onExit() , onSnap(snap) }
   */
  constructor(engine, root, snap, opts = {}) {
    this.engine = engine; this.root = root; this.opts = opts;
    if (window.__autotest) window.__battle = this;
    this.selected = null;   // { zone: 'hand'|'field', id }
    this.logLines = [];
    this.ended = false;
    try { preloadArt(engine, engine.call({ cmd: 'deckIDs' }).ids); } catch { /* 沒有也沒關係 */ }   // 整副牌先載（約 40 張）
    this.apply_(snap, false);
  }

  get view() { return this.snap.view; }

  apply_(snap, animate = true) {
    this.snap = snap;
    {   // 手牌整理：這個回合新抽到的牌（含開局後第一回合之後新進手的）放最右；其餘照類別排，內功最左
      const ids = snap.view.player.hand.map((c) => c.id);
      if (this.lastHandTurn !== snap.view.turn + '/' + snap.view.enemyTurn) {
        if (this.lastHandTurn != null) this.newIds = new Set();   // 換回合：上一回合抽的變成「舊卡」，歸類排序
        this.lastHandTurn = snap.view.turn + '/' + snap.view.enemyTurn;
      }
      this.newIds = this.newIds ?? new Set();
      if (this.knownIds) for (const id of ids) if (!this.knownIds.has(id)) this.newIds.add(id);
      this.knownIds = new Set(ids);
      for (const id of [...this.newIds]) if (!this.knownIds.has(id)) this.newIds.delete(id);   // 打出去的就不用記了
    }
    preloadArt(this.engine, [...snap.view.player.hand, ...snap.view.player.field, ...snap.view.enemy.field, ...snap.view.player.wounded].map((c) => c.cardID));
    this.idNames = this.idNames ?? new Map();
    for (const side of [snap.view.player, snap.view.enemy]) for (const p of [...side.field, ...side.hand, ...side.wounded]) this.idNames.set(p.id, this.engine.cards[p.cardID]?.name ?? '角色');
    const enemyBase = snap.view.enemy.baseName;
    for (const raw of snap.log ?? []) {
      if (raw.startsWith(`${enemyBase} 抽到 `) || raw.startsWith('江湖 抽到 ')) continue;   // 對手抽到什麼是祕密
      const l = raw.replace(/\s*\[(main1|main2|declareAttackers|declareBlockers|response|retarget|finished)\]\s*$/, '')
        .replace(/([一-鿿A-Za-z0-9]+)#\d+/g, '$1').replace(/#(\d+)/g, (_, n) => this.idNames.get(Number(n)) ?? '某角色').replace(/=== 戰鬥開始：[^=]*===/, '=== 戰鬥開始 ===');
      if (l.trim()) this.logLines.push(l);
    }
    if (this.logLines.length > 400) this.logLines.splice(0, this.logLines.length - 400);
    this.opts.onSnap?.(snap);
    this.render();
    if (snap.over && !this.ended) { this.ended = true; this.opts.onEnd?.(snap.view.result, snap); }
  }

  act(action) {
    if (this.busy) return;
    try {
      this.selected = null;
      const snap = this.engine.call({ cmd: 'apply', action });
      this.apply_(snap);
    } catch (err) { toast(`動作失敗：${err.message}`); this.render(); }
  }

  endTurn() {
    try { this.selected = null; this.apply_(this.engine.call({ cmd: 'endTurn' })); } catch (err) { toast(`動作失敗：${err.message}`); }
  }

  // ---- 名稱 ----
  nameOf(id) {
    if (id === -1) return `${this.view.player.baseName}（主建築物）`;
    if (id === -2) return `${this.view.enemy.baseName}（主建築物）`;
    for (const side of [this.view.player, this.view.enemy]) {
      const p = side.field.find((x) => x.id === id) ?? side.hand.find((x) => x.id === id);
      if (p) {
        const name = this.engine.cards[p.cardID]?.name ?? p.cardID;
        const same = side.field.filter((x) => x.cardID === p.cardID && this.engine.cards[x.cardID]?.type === 'character');
        // 同名角色：標「左起第 N 隻（攻/血）」才分得出是誰
        if (same.length > 1 && side.field.includes(p)) return `${name}（左起第${same.findIndex((x) => x.id === id) + 1}隻，${p.power}/${p.toughness - p.damage}）`;
        return name;
      }
    }
    return '某個角色';
  }

  // ---- 合法動作分類 ----
  /** 動作的「主角」：選了它才會列出這個動作。 */
  subjectOf(a) {
    const [k, v] = Object.entries(a)[0];
    switch (k) {
      case 'playInnerArt': case 'castCard': return { zone: 'hand', id: v.card };
      case 'equip': return { zone: 'hand', id: v.weapon };
      case 'useSkill': return { zone: 'field', id: v.character };
      case 'attack': return { zone: 'field', id: v.attacker };
      default: return null;
    }
  }

  actionLabel(a) {
    const [k, v] = Object.entries(a)[0];
    const tg = (ids) => (ids?.length ? ` → ${ids.map((i) => this.nameOf(i)).join('、')}` : '');
    switch (k) {
      case 'playInnerArt': return '修練（每回合一張）';
      case 'castCard': return `出牌${tg(v.targets)}`;
      case 'equip': return `裝備給 ${this.nameOf(v.to)}`;
      case 'useSkill': {
        const p = this.findField(v.character);
        const sk = p?.skills?.find((s) => s.index === v.skill);
        return `技能「${sk?.name ?? v.skill}」${tg(v.targets)}`;
      }
      case 'attack': return `攻擊 → ${this.nameOf(v.target)}`;
      case 'dodge': {
        const tgt = (this.view.combat?.targets ?? []).find(([att]) => att === v.attacker)?.[1];
        return tgt != null ? `${this.nameOf(tgt)} 閃開 ${this.nameOf(v.attacker)}` : `閃開 ${this.nameOf(v.attacker)}`;
      }
      case 'retarget': return `改打 ${this.nameOf(v.target)}`;
      case 'acceptAdventure': return '收下';
      case 'declineAdventure': return '婉拒';
      case 'dismantleFormation': return '收回陣腳';
      case 'declareAttackers': return v._0.length ? `全員攻擊（${v._0.length} 人）` : '不攻擊';
      case 'declareBlockers': return v._0.length ? `阻擋（${v._0.map((b) => `${this.nameOf(b.blocker)} 擋 ${this.nameOf(b.attacker)}`).join('、')}）` : '不阻擋';
      default: return k;
    }
  }

  findField(id) { return this.view.player.field.find((x) => x.id === id) ?? this.view.enemy.field.find((x) => x.id === id); }

  attackedBy() { return new Map((this.view.combat?.targets ?? []).map(([att, tgt]) => [att, tgt])); }

  // ---- 畫面 ----
  /** 重畫前記下焦點在哪（哪張卡／哪顆按鈕），重畫後放回去，鍵盤使用者才不會每按一次就掉到頁面頂端。 */
  focusKey() {
    const a = document.activeElement;
    if (!a || a === document.body || !this.root.contains(a)) return null;
    if (a.id) return `#${a.id}`;
    if (a.dataset?.id) return `.card[data-id="${a.dataset.id}"]`;
    return null;
  }

  render() {
    const key = this.focusKey();
    this.render_();
    if (this.selected) this.root.querySelector('.sheet .close')?.focus();
    else if (key) this.root.querySelector(key)?.focus();
  }

  /** 舊式攻防的防禦階段：玩家自己決定誰擋誰。起點是引擎的最小合法阻擋（鎮守必擋），可再加減。 */
  blockPlan() {
    const v = this.view;
    if (v.phase !== 'declareBlockers' || v.acting !== 'player' || !(v.blockOptions?.length)) { this.plan = null; this.planKey = null; return null; }
    const key = `${v.turn}/${v.enemyTurn}/${(v.combat?.attackers ?? []).join(',')}`;
    if (this.planKey !== key) {
      const def = (this.snap.legal ?? []).find((a) => a.declareBlockers)?.declareBlockers?._0 ?? [];
      this.plan = new Map(def.map((b) => [b.blocker, b.attacker]));   // blocker → attacker
      this.planKey = key;
    }
    return this.plan;
  }

  /** 舊式攻防的攻擊階段：玩家自己挑哪些角色出戰（引擎只列「全不打／全上」兩個，但任何合法子集都收）。 */
  attackPlan() {
    const v = this.view;
    if (v.phase !== 'declareAttackers' || v.acting !== 'player' || v.targetCombat || !(v.attackers?.length)) { this.atk = null; this.atkKey = null; return null; }
    const key = `${v.turn}/${v.enemyTurn}`;
    if (this.atkKey !== key) { this.atk = new Set(); this.atkKey = key; }
    return this.atk;
  }

  planAction() { return { declareBlockers: { _0: [...this.plan].map(([blocker, attacker]) => ({ blocker, attacker })) } }; }

  render_() {
    const v = this.view; const legal = this.snap.legal ?? [];
    this.blockPlan(); this.attackPlan();
    const myTurn = v.acting === 'player' && !v.result;
    const subjects = new Set(legal.map((a) => this.subjectOf(a)).filter(Boolean).map((s) => `${s.zone}:${s.id}`));
    for (const o of v.blockOptions ?? []) subjects.add(`field:${o.blocker}`);
    if (this.atk) for (const id of v.attackers) subjects.add(`field:${id}`);
    const handScroll = this.root.querySelector('.hand')?.scrollLeft ?? 0;
    const bar = this.actionBar(myTurn, legal);
    const root = clear(this.root);
    const wrap = h('div.battle');

    // 敵方
    wrap.append(this.sidePanel(v.enemy, 'enemy'));
    wrap.append(h('div.field.enemy-field', { 'aria-label': '敵方場上' }, ...v.enemy.field.filter((p) => this.isUnit(p)).map((p) => this.fieldCard(p, 'enemy', subjects))));
    wrap.append(h('div.field.support.enemy-support', ...v.enemy.field.filter((p) => !this.isUnit(p) && !this.isInnerArt(p)).map((p) => this.fieldCard(p, 'enemy', subjects, true))));

    // 中央狀態
    const idx = v.activeSide === 'player' ? 0 : 1;
    let title = (PHASE_TITLE[v.phase] ?? ['', ''])[v.phase === 'response' || v.phase === 'declareBlockers' ? (v.activeSide === 'player' ? 0 : 1) : idx];
    if (v.result) title = { playerWon: '你贏了！', playerLost: '你輸了', draw: '平手（僵局）' }[v.result] ?? '對局結束';
    wrap.append(h('div.status', h('div.phase', { id: 'phase' }, title), h('div.turn', `第 ${v.turn + v.enemyTurn} 回合`), h('button.link', { on: { click: () => this.toggleLog() } }, '紀錄'), CHEAT ? h('button.link', { id: 'cheat-win', title: '測試用', on: { click: () => this.apply_(this.engine.call({ cmd: 'cheat' })) } }, '[測試]對方剩1血') : null));
    wrap.append(h('div.lastlog', { id: 'lastlog', 'aria-live': 'polite' }, this.logLines.slice(-2).join('　')));
    if (this.guide.length) wrap.append(h('div.guide', ...this.guide));

    // 我方
    wrap.append(h('div.field.support.my-support', ...v.player.field.filter((p) => !this.isUnit(p) && !this.isInnerArt(p)).map((p) => this.fieldCard(p, 'player', subjects, true))));
    wrap.append(h('div.field.my-field', { 'aria-label': '我方場上' }, ...v.player.field.filter((p) => this.isUnit(p)).map((p) => this.fieldCard(p, 'player', subjects))));
    wrap.append(this.sidePanel(v.player, 'player'));
    const dock = h('div.dock', this.resBar(v), bar);
    dock.append(h('div.hand', { 'aria-label': '手牌' }, ...this.sortedHand(v.player.hand).map((c) => cardEl(this.engine, c.cardID, {
      instance: c, selected: this.selected?.zone === 'hand' && this.selected.id === c.id,
      hint: (subjects.has(`hand:${c.id}`) ? 'playable' : 'dim') + (this.affordable(this.engine.cards[c.cardID]) ? '' : ' poor'),
      onClick: () => { this.selected = { zone: 'hand', id: c.id }; this.render(); },
    }))));
    wrap.append(dock);

    root.append(wrap);
    const hand = wrap.querySelector('.hand'); if (hand) hand.scrollLeft = handScroll;   // 出牌後保留手牌捲動位置
    if (this.selected) root.append(this.detailSheet(legal));
    if (this.logOpen) { root.append(this.logPanel()); const lp = root.querySelector('.logpanel'); lp?.querySelector('.loglines')?.scrollTo(0, 1e9); lp?.focus(); }
    this.floatFeedback();
  }

  /** 手牌排序：舊卡照類別從左到右（內功最左、角色、招式、裝備…），同類依費用再依名稱；新抽到的牌依抽牌順序接在最右。 */
  sortedHand(hand) {
    const RANK = { innerArt: 0, character: 1, technique: 2, equipment: 3, formation: 4, trap: 5, talisman: 6, elixir: 7 };
    const key = (c) => { const d = this.engine.cards[c.cardID]; return [RANK[d?.type] ?? 9, costTotal(d?.cost), d?.name ?? c.cardID]; };
    const cmp = (a, b) => { const x = key(a), y = key(b); return x[0] - y[0] || x[1] - y[1] || x[2].localeCompare(y[2], 'zh-Hant') || a.id - b.id; };
    const fresh = hand.filter((c) => this.newIds?.has(c.id));
    const old = hand.filter((c) => !this.newIds?.has(c.id)).sort(cmp);
    return [...old, ...fresh];
  }

  isInnerArt(p) { return this.engine.cards[p.cardID]?.type === 'innerArt'; }

  /** 場上的內功合併成一行字（白鶴內功 ×3），不佔一整排卡牌的高度。 */
  artsLine(side) {
    const m = new Map();
    for (const p of side.field.filter((x) => this.isInnerArt(x))) { const k = p.cardID; const e = m.get(k) ?? { n: 0, tapped: 0 }; e.n++; if (p.tapped) e.tapped++; m.set(k, e); }
    return [...m].map(([id, e]) => `${this.engine.cards[id]?.name ?? id} ×${e.n}`).join('、');
  }

  isUnit(p) { return this.engine.cards[p.cardID]?.type === 'character'; }

  sidePanel(s, who) {
    const pct = Math.max(0, Math.min(100, (s.life / Math.max(1, s.maxLife)) * 100));
    const isEnemy = who === 'enemy';
    const targetable = (this.snap.legal ?? []).some((a) => a.attack && a.attack.target === (isEnemy ? -2 : -1));
    return h(`div.side.${who}`, { 'data-testid': `${who}-panel` },
      h('div.base', h('b', s.baseName), h('span.life', { id: `${who}-life` }, `耐久 ${Math.max(0, s.life)}/${s.maxLife}`)),
      h('div.bar', h('i', { style: `width:${pct}%` })),
      this.artsLine(s) ? h('div.arts', `內功：${this.artsLine(s)}`) : null,
      h('div.meta', isEnemy ? `內力 ${s.mana}　牌庫 ${s.libraryCount}　手牌 ${s.hand.length}` : '', s.wounded.length ? `${isEnemy ? '　' : ''}傷兵 ${s.wounded.length}` : '',
        this.formationText(s)),
      targetable ? h('div.hint', '可攻擊主建築物：選一個你的角色') : null,
      isEnemy && this.view.targetCombat && !targetable && s.field.some((p) => this.isUnit(p)) ? h('div.hint.locked', { id: 'base-locked' }, this.lockText(s)) : null);
  }

  formationText(s) {
    const f = [s.smallFormation, s.bigFormation].filter(Boolean).map((x) => this.engine.cards[x.formationID]?.name ?? x.formationID);
    return f.length ? `　陣：${f.join('、')}` : '';
  }

  fieldCard(p, who, subjects, mini = false) {
    const attacking = this.view.combat?.attackers?.includes(p.id);
    const targeted = [...this.attackedBy().values()].includes(p.id);
    const sel = this.selected?.zone === 'field' && this.selected.id === p.id;
    const el = cardEl(this.engine, p.cardID, {
      perm: p, mini, selected: sel,
      hint: [subjects.has(`field:${p.id}`) ? 'playable' : '', attacking || this.atk?.has(p.id) ? 'attacking' : '', targeted ? 'targeted' : '', p.convalescing ? 'heal' : ''].join(' '),
      onClick: () => { this.selected = { zone: 'field', id: p.id, who }; this.render(); },
    });
    if (p.damage) el.append(h('div.dmg', `-${p.damage}`));
    return el;
  }

  /** 勝負白話說明（同 App）：主建築物被攻陷，或走火入魔自毀（必定走火與內力過滿分開寫）。 */
  resultReason(v) {
    const me = v.player.baseName; const foe = v.enemy.baseName;
    if (v.result === 'playerWon') return v.lostToDeviation === 'enemy' ? `${foe} 走火入魔，自己崩毀` : `攻下了 ${foe}`;
    if (v.result === 'draw') return '雙方都沒角色也沒牌，耐久相同。';
    if (v.lostToDeviation !== 'player') return `${me} 被攻陷了`;
    return v.lostToForced ? `鬥過第 ${v.forcedDeviationTurn ?? 16} 回合，氣壓不住，${me} 走火入魔崩毀` : `內力積太多，${me} 走火入魔崩毀`;
  }

  /** 常駐資源列：內力是最重要的數字，永遠在手牌上方看得到。 */
  resBar(v) {
    const me = v.player;
    const by = Object.entries(me.manaByFaction ?? {}).map(([f, n]) => `${SHORT[f] ?? f}${n}`).join(' ');
    return h('div.resbar', { id: 'resbar' }, h('b', `內力 ${me.mana}`), by ? h('span', `（${by}）`) : null,
      h('span', `・牌庫 ${me.libraryCount}`), h('span', `・耐久 ${Math.max(0, me.life)}/${me.maxLife}`), this.forcedNote(v));
  }

  /** 必定走火倒數：第 N 回合起，雙方每個自己的回合開始都走火入魔（不看內力）。獸母關不套。 */
  forcedNote(v) {
    const t = v.forcedDeviationTurn;
    if (!t || v.result) return null;
    if (v.myTurn >= t) return h('span.warnfx', { id: 'forced-note' }, `・⚠ 第 ${t} 回合起：每回合開始必定走火，主建築物扣 ${v.deviationDamage ?? 5}`);
    const left = t - v.myTurn;
    if (left <= 3) return h('span.warnfx', { id: 'forced-note' }, `・再 ${left} 回合：第 ${t} 回合起必定走火`);
    return null;
  }

  /** 這張牌現在付得起嗎（有色內力要對；通用內力用剩下的）。 */
  affordable(def) {
    if (!def?.cost) return true;
    const have = this.view.player.manaByFaction ?? {};
    let colored = 0;
    for (const [k, n] of Object.entries(def.cost)) {
      if (k === 'generic' || !(n > 0)) continue;
      if ((have[k] ?? 0) < n) return false;
      colored += n;
    }
    return this.view.player.mana >= costTotal(def.cost);
  }

  /** 出不了的原因：不要只寫「沒有可用的動作」。 */
  whyNot(sel, perm, cardID) {
    const v = this.view; const def = this.engine.cards[cardID];
    if (v.result) return '對局已結束。';
    if (sel.who === 'enemy') return '這是對手的角色，只能看。';
    if (v.acting !== 'player') return '現在是對手的回合。';
    if (sel.zone === 'hand') {
      if (def?.type === 'innerArt' && v.player.innerArtPlayed) return '這回合已經修練過內功了（每回合一張）。';
      if (!this.affordable(def)) return `內力不足：需要 ${costText(def.cost)}，你目前有 ${v.player.mana}${Object.keys(v.player.manaByFaction ?? {}).length ? `（${Object.entries(v.player.manaByFaction).map(([f, n]) => `${SHORT[f]}${n}`).join(' ')}）` : ''}。`;
      if (!['main1', 'main2'].includes(v.phase) && def?.type !== 'technique' && def?.type !== 'elixir') return '現在不是主階段，這張牌只能在你的主階段出。';
      return '現在沒有合法的目標或條件不符（例如場上還沒有可以選的對象）。';
    }
    if (perm?.convalescing) return '療傷中，不能行動。';
    if (perm?.attacked) return '這回合已經攻擊過了。';
    if (perm?.sick) return '剛出場，下回合才能攻擊（有「迅捷」才能當回合攻擊）。';
    if (!['declareAttackers', 'main1'].includes(v.phase)) return '現在不是攻擊階段。';
    return '現在沒有可用的動作。';
  }

  /** 防守摘要（新式攻防）：同一目標的攻擊合併，寫出總傷害與可能後果；直接打主建築物要明寫。 */
  defenseSummary(legal) {
    const v = this.view;
    const groups = new Map();   // target → { attackers:[], total }
    // 打主建築物的攻擊引擎不記在 targets 裡（只有打角色才有），所以由 attackers 補上，沒有目標的就是打主建築物
    const tmap = new Map(v.combat.targets.map(([a, t]) => [a, t]));
    for (const att of v.combat.attackers ?? []) {
      const tgt = tmap.get(att) ?? -1;
      const g = groups.get(tgt) ?? { names: new Map(), total: 0 };
      const ap = v.enemy.field.find((p) => p.id === att);
      const n = this.engine.cards[ap?.cardID]?.name ?? '攻擊者';
      g.names.set(n, (g.names.get(n) ?? 0) + 1); g.total += ap?.power ?? 0; groups.set(tgt, g);
    }
    const lines = [...groups].map(([tgt, g]) => {
      const who = [...g.names].map(([n, c]) => (c > 1 ? `${n}×${c}` : n)).join('、');
      if (tgt === -1) return `${who} → 你的主建築物（共 ${g.total} 點傷害）`;
      const tp = v.player.field.find((p) => p.id === tgt);
      const left = tp ? tp.toughness - tp.damage : 0;
      const after = tp ? (g.total >= left ? `，${this.nameOf(tgt)}目前 ${left} 血，扛不住` : `（${this.nameOf(tgt)}目前 ${left} 血，扛得住）`) : '';
      return `${who} → ${this.nameOf(tgt)}（共 ${g.total} 點傷害${after}）`;
    });
    const canDodge = (legal ?? []).some((a) => a.dodge);
    return h('div.defend', { id: 'defend-info' }, h('b', '對手攻擊：'), ...lines.map((l) => h('div', l)),
      h('div.muted', canDodge ? '你的輕功角色可以「閃」：那一擊改打你的主建築物。不閃就按「承受」。' : '你沒有可以閃的角色，只能按「承受」。（有「破陣」的攻擊者，溢出的傷害會打到你的主建築物。）'));
  }

  /** 結算回饋：傷害飄字（卡上 −N、主建築物耐久 −N）。 */
  floatFeedback() {
    for (const e of this.snap.events ?? []) {
      const d = e.damageDealt; if (!d || !(d.amount > 0)) continue;
      const target = d.target != null && d.target > 0 ? this.root.querySelector(`.card[data-id="${d.target}"]`) : this.root.querySelector(`[data-testid=${d.side}-panel]`);
      if (!target) continue;
      const f = h('div.float', `−${d.amount}`);
      target.append(f); setTimeout(() => f.remove(), 1600);
    }
  }

  actionBar(myTurn, legal) {
    const bar = h('div.actions', { role: 'group', 'aria-label': '動作' });
    this.guide = [];
    const v = this.view;
    if (v.result) {
      const win = v.result === 'playerWon';
      this.guide.push(h('div.defend.result', { id: 'result-info' }, h('b', { playerWon: '你贏了！', playerLost: '你輸了', draw: '平手（僵局）' }[v.result] ?? '對局結束'),
        h('div', `共 ${v.turn + v.enemyTurn} 回合｜你的主建築物 ${Math.max(0, v.player.life)}/${v.player.maxLife}｜對手的主建築物 ${Math.max(0, v.enemy.life)}/${v.enemy.maxLife}`),
        h('div.muted', { id: 'result-reason' }, this.resultReason(v))));
      bar.append(h('button.primary', { id: 'btn-over', on: { click: () => this.opts.onExit?.() } }, this.opts.exitLabel ?? '回首頁'));
      if (this.opts.onAgain) bar.append(h('button.secondary', { id: 'btn-again', on: { click: () => this.opts.onAgain() } }, '再來一局（同門派）'));
      if (this.opts.onChange) bar.append(h('button.secondary', { id: 'btn-change', on: { click: () => this.opts.onChange() } }, '換門派'));
      return bar;
    }
    if (!myTurn) { bar.append(h('div.waiting', '對手行動中…')); return bar; }
    const nonSubject = legal.filter((a) => !this.subjectOf(a) && !(this.plan && a.declareBlockers) && !(this.atk && a.declareAttackers));
    if (this.atk) {
      const names = [...this.atk].map((id) => this.nameOf(id));
      this.guide.push(h('div.defend', { id: 'atk-info' }, h('b', '出戰：'), names.length ? names.join('、') : '（還沒選人）',
        h('div.muted', '點你的角色決定誰出戰（亮框的才能出戰）；選好按「確認攻擊」，不想打就直接按「不攻擊」。')));
      bar.append(h('button.secondary', { id: 'btn-atk-all', on: { click: () => { for (const id of v.attackers) this.atk.add(id); this.render(); } } }, '全員出戰'));
      bar.append(h('button.primary', { id: 'btn-atk', on: { click: () => this.act({ declareAttackers: { _0: [...this.atk] } }) } }, this.atk.size ? `確認攻擊（${this.atk.size} 人）` : '不攻擊'));
    }
    if (this.plan) {
      const lines = [...this.plan].map(([b, a]) => `${this.nameOf(b)} 擋 ${this.nameOf(a)}`);
      this.guide.push(h('div.defend', { id: 'block-info' }, h('b', '對手攻擊：'), (v.combat?.attackers ?? []).map((a) => this.nameOf(a)).join('、'),
        h('div', lines.length ? `你的阻擋：${lines.join('、')}` : '你的阻擋：不擋'),
        h('div.muted', '點你的角色，選它要擋哪一個；輕功的攻擊者只有輕功、鎮守、射擊的角色擋得住；有鎮守的必須擋。選好按「確認阻擋」。')));
      bar.append(h('button.primary', { id: 'btn-block', on: { click: () => this.act(this.planAction()) } }, lines.length ? '確認阻擋' : '不擋（直接承受）'));
    }
    // 需要玩家決定的動作：閃、重選目標、奇遇
    for (const a of nonSubject) {
      const k = Object.keys(a)[0];
      if (k === 'pass') continue;
      bar.append(h('button.decision', { on: { click: () => this.act(a) } }, this.actionLabel(a)));
    }
    // 防守階段：寫清楚誰打誰，以及這個階段能做什麼（新攻防制沒有阻擋，只有輕功角色可以「閃」）
    if ((v.phase === 'response') && v.activeSide === 'enemy' && !v.targetCombat && (v.combat?.targets?.length ?? 0) > 0) {
      this.guide.push(h('div.defend', { id: 'defend-info' }, h('b', '阻擋結果：'), v.combat.targets.map(([att, blk]) => `${this.nameOf(blk)} 擋 ${this.nameOf(att)}`).join('、'),
        h('div.muted', '現在可以出反招（亮框的招式）；不出就按「承受」，直接結算傷害。')));
    }
    if ((v.phase === 'response' || v.phase === 'declareBlockers') && v.activeSide === 'enemy' && v.targetCombat && (v.combat?.attackers?.length ?? 0) > 0) {
      this.guide.push(this.defenseSummary(legal));
    }
    if (v.phase === 'declareAttackers' && v.activeSide === 'player' && v.targetCombat) {
      this.guide.push(h('div.defend', { id: 'attack-info' }, '指定攻擊：點你的角色，選要打誰；每個角色每回合打一次。選完按「攻擊結算」；不想打就按「不攻擊」。'));
    }
    if (v.adventure) bar.prepend(h('div.advent', '江湖奇遇：', h('b', this.engine.cards[v.adventure.cardID]?.name ?? v.adventure.cardID)));
    const hasPass = legal.some((a) => 'pass' in a);
    if (hasPass) {
      const pass = legal.find((a) => 'pass' in a);
      const canAttack = legal.some((a) => a.attack) || (v.attackers?.length ?? 0) > 0;
      let label = '確定';
      switch (v.phase) {
        case 'main1': label = canAttack ? '進入攻擊' : '結束回合'; break;
        case 'declareAttackers': label = (v.combat?.attackers?.length ?? 0) ? '攻擊結算' : '不攻擊'; break;
        case 'main2': label = '結束回合'; break;
        case 'response': label = v.combat?.pendingDodge || (v.activeSide === 'enemy' && v.combat) ? (v.targetCombat ? '承受（不閃）' : '承受，結算傷害') : '略過反應'; break;
        case 'declareBlockers': label = '略過反應'; break;
        default: break;
      }
      // 主階段沒有能攻擊的角色：「結束回合」就是真的結束回合（不要先掉進空的指定攻擊階段）
      const endsTurn = v.phase === 'main1' && !canAttack;
      bar.append(h('button.primary', { id: 'btn-pass', on: { click: () => (endsTurn ? this.endTurn() : this.act(pass)) } }, label));
      if (v.phase === 'main1' && canAttack) bar.append(h('button.secondary', { id: 'btn-end', on: { click: () => this.endTurn() } }, '結束回合'));
    }
    return bar;
  }

  detailSheet(legal) {
    const sel = this.selected;
    let cardID; let perm = null;
    if (sel.zone === 'hand') {
      cardID = this.view.player.hand.find((c) => c.id === sel.id)?.cardID;
    } else {
      perm = this.findField(sel.id); cardID = perm?.cardID;
    }
    if (!cardID) { this.selected = null; return h('div'); }
    const acts = legal.filter((a) => { const s = this.subjectOf(a); return s && s.zone === sel.zone && s.id === sel.id; });
    const atkOpt = this.atk && sel.zone === 'field' && this.view.attackers.includes(sel.id);
    const blockOpt = this.plan && sel.zone === 'field' ? (v => (v.blockOptions ?? []).find((o) => o.blocker === sel.id))(this.view) : null;
    const sheet = h('div.sheet', { role: 'dialog', 'aria-modal': 'true', 'aria-label': '卡片資訊', on: { keydown: (e) => { if (e.key === 'Escape') { this.selected = null; this.render(); } } } },
      h('button.close', { 'aria-label': '關閉', on: { click: () => { this.selected = null; this.render(); } } }, '✕'),
      cardDetail(this.engine, cardID, perm),
      atkOpt ? h('div.sheet-actions', h('button.act', { 'data-atk': sel.id, on: { click: () => { if (this.atk.has(sel.id)) this.atk.delete(sel.id); else this.atk.add(sel.id); this.selected = null; this.render(); } } }, this.atk.has(sel.id) ? '取消出戰' : '出戰')) :
      blockOpt ? h('div.sheet-actions', ...blockOpt.attackers.map((att) => h('button.act', { 'data-block': att, on: { click: () => { this.plan.set(sel.id, att); this.selected = null; this.render(); } } }, `擋 ${this.nameOf(att)}${this.plan.get(sel.id) === att ? '（已選）' : ''}`)),
        this.plan.has(sel.id) ? h('button.act', { on: { click: () => { this.plan.delete(sel.id); this.selected = null; this.render(); } } }, '這個角色不擋') : null) :
      acts.length ? h('div.sheet-actions', ...acts.map((a) => h('button.act', { on: { click: () => this.act(a) } }, this.actionLabel(a))), this.baseBlockedNote(acts)) : h('div.muted.why', { id: 'why-not' }, this.whyNot(sel, perm, cardID)));
    return sheet;
  }

  /** 測試用：每個引擎合法動作都要能從畫面操作到（有按鈕或選到卡片後有按鈕）。回傳找不到的動作清單。 */
  unreachableActions() {
    const missing = [];
    for (const a of this.snap.legal ?? []) {
      const [k] = Object.keys(a);
      const label = this.actionLabel(a);
      const subj = this.subjectOf(a);
      if (k === 'pass') { if (!this.root.querySelector('#btn-pass')) missing.push(`${k}`); continue; }
      if (!subj && k === 'declareAttackers' && this.root.querySelector('#btn-atk')) continue;
      if (!subj && k === 'declareBlockers' && this.root.querySelector('#btn-block')) continue;   // 防禦計畫的「確認阻擋」
      if (!subj) { if (![...this.root.querySelectorAll('.decision')].some((b) => b.textContent === label)) missing.push(`${k}:${label}`); continue; }
      const sel = subj.zone === 'hand' ? `.hand .card[data-id="${subj.id}"]` : `.card[data-id="${subj.id}"]`;
      const card = this.root.querySelector(sel);
      if (!card) { missing.push(`${k}:無卡片 ${subj.id}`); continue; }
      card.click();
      if (![...this.root.querySelectorAll('.sheet .act')].some((b) => b.textContent === label)) missing.push(`${k}:${label}`);
      this.selected = null; this.render();
    }
    return missing;
  }

  /** 選到能攻擊的角色，但目標清單沒有主建築物：寫出原因（敵方場上還有角色在場就打不到）。 */
  /** 主建築物打不到的說明：一般攻擊者只算不在保護中的角色；只剩保護中的角色卻還是打不到＝你選的是有「埋伏」的攻擊者（埋伏連剛上場的也要先清）。 */
  lockText(s) {
    const units = s.field.filter((p) => this.isUnit(p)); const open = units.filter((p) => !p.fresh);
    return open.length ? `🔒 場上還有 ${open.length} 個角色，主建築物暫時打不到（要先清場；剛上場、保護中的角色不算）` : `🔒 場上還有 ${units.length} 個剛上場的角色。有「埋伏」的攻擊者連他們也要先清；其他攻擊者可以直接打主建築物。`;
  }

  baseBlockedNote(acts) {
    if (!acts.some((a) => a.attack)) return null;
    if (acts.some((a) => a.attack?.target === -2)) return null;
    const units = this.view.enemy.field.filter((p) => this.isUnit(p)); const open = units.filter((p) => !p.fresh).length;
    if (!units.length) return null;
    return h('button.act.disabled', { disabled: true, id: 'base-blocked' }, open ? `攻擊 ${this.view.enemy.baseName}（主建築物）：敵方還有 ${open} 個角色在場，要先清場` : `攻擊 ${this.view.enemy.baseName}（主建築物）：這個角色有「埋伏」，要先清掉場上剛上場的 ${units.length} 個角色`);
  }

  toggleLog() { this.logOpen = !this.logOpen; this.render(); }
  logPanel() {
    return h('div.logpanel', { tabindex: '-1', role: 'dialog', 'aria-label': '戰鬥紀錄', on: { keydown: (e) => { if (e.key === 'Escape') this.toggleLog(); } } }, h('div.logbar', h('b', '戰鬥紀錄'), h('button.close', { on: { click: () => this.toggleLog() } }, '✕')),
      h('div.loglines', ...this.logLines.slice(-120).map((l) => h('div', l))));
  }
}
