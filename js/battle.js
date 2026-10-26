import { h, clear, toast } from './ui.js';

const SHORT = { tiger: '虎', dragon: '龍', crane: '鶴', wolf: '狼', scorpion: '蠍', bat: '蝠', jiao: '鮫', jianghu: '通' };
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

export function costText(cost) {
  if (!cost) return '';
  const parts = [];
  if (cost.generic) parts.push(`通${cost.generic}`);
  for (const [f, n] of Object.entries(cost.colored ?? {})) parts.push(`${SHORT[f] ?? f}${n}`);
  return parts.join(' ');
}

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
    ...(def.skills ?? []).map((s) => h('p.d-skill', h('b', `技能・${s.name}`), s.text ? `：${s.text}` : '')),
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
    preloadArt(this.engine, [...snap.view.player.hand, ...snap.view.player.field, ...snap.view.enemy.field, ...snap.view.player.wounded].map((c) => c.cardID));
    for (const l of snap.log ?? []) this.logLines.push(l.replace(/\s*\[(main1|main2|declareAttackers|declareBlockers|response|retarget|finished)\]\s*$/, ''));
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
      if (p) return this.engine.cards[p.cardID]?.name ?? p.cardID;
    }
    return `#${id}`;
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
      case 'dodge': return `閃開 ${this.nameOf(v.attacker)} 這一擊`;
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

  render_() {
    const v = this.view; const legal = this.snap.legal ?? [];
    const myTurn = v.acting === 'player' && !v.result;
    const subjects = new Set(legal.map((a) => this.subjectOf(a)).filter(Boolean).map((s) => `${s.zone}:${s.id}`));
    const root = clear(this.root);
    const wrap = h('div.battle');

    // 敵方
    wrap.append(this.sidePanel(v.enemy, 'enemy'));
    wrap.append(h('div.field.enemy-field', { 'aria-label': '敵方場上' }, ...v.enemy.field.filter((p) => this.isUnit(p)).map((p) => this.fieldCard(p, 'enemy', subjects))));
    wrap.append(h('div.field.support.enemy-support', ...v.enemy.field.filter((p) => !this.isUnit(p)).map((p) => this.fieldCard(p, 'enemy', subjects, true))));

    // 中央狀態
    const idx = v.activeSide === 'player' ? 0 : 1;
    let title = (PHASE_TITLE[v.phase] ?? ['', ''])[v.phase === 'response' || v.phase === 'declareBlockers' ? (v.activeSide === 'player' ? 0 : 1) : idx];
    if (v.result) title = { playerWon: '你贏了！', playerLost: '你輸了', draw: '平手（僵局）' }[v.result] ?? '對局結束';
    wrap.append(h('div.status', h('div.phase', { id: 'phase' }, title), h('div.turn', `第 ${v.turn + v.enemyTurn} 回合`), h('button.link', { on: { click: () => this.toggleLog() } }, '紀錄')));
    wrap.append(h('div.lastlog', { id: 'lastlog', 'aria-live': 'polite' }, this.logLines.slice(-2).join('　')));

    wrap.append(this.actionBar(myTurn, legal));

    // 我方
    wrap.append(h('div.field.support.my-support', ...v.player.field.filter((p) => !this.isUnit(p)).map((p) => this.fieldCard(p, 'player', subjects, true))));
    wrap.append(h('div.field.my-field', { 'aria-label': '我方場上' }, ...v.player.field.filter((p) => this.isUnit(p)).map((p) => this.fieldCard(p, 'player', subjects))));
    wrap.append(this.sidePanel(v.player, 'player'));
    wrap.append(h('div.hand', { 'aria-label': '手牌' }, ...v.player.hand.map((c) => cardEl(this.engine, c.cardID, {
      instance: c, selected: this.selected?.zone === 'hand' && this.selected.id === c.id,
      hint: subjects.has(`hand:${c.id}`) ? 'playable' : 'dim',
      onClick: () => { this.selected = { zone: 'hand', id: c.id }; this.render(); },
    }))));

    root.append(wrap);
    if (this.selected) root.append(this.detailSheet(legal));
    if (this.logOpen) root.append(this.logPanel());
    this.root.scrollTop = this.root.scrollTop;
  }

  isUnit(p) { return this.engine.cards[p.cardID]?.type === 'character'; }

  sidePanel(s, who) {
    const pct = Math.max(0, Math.min(100, (s.life / Math.max(1, s.maxLife)) * 100));
    const isEnemy = who === 'enemy';
    const targetable = (this.snap.legal ?? []).some((a) => a.attack && a.attack.target === (isEnemy ? -2 : -1));
    return h(`div.side.${who}`, { 'data-testid': `${who}-panel` },
      h('div.base', h('b', s.baseName), h('span.life', { id: `${who}-life` }, `耐久 ${Math.max(0, s.life)}/${s.maxLife}`)),
      h('div.bar', h('i', { style: `width:${pct}%` })),
      h('div.meta', `內力 ${s.mana}`, `　牌庫 ${s.libraryCount}`, isEnemy ? `　手牌 ${s.hand.length}` : '', s.wounded.length ? `　傷兵 ${s.wounded.length}` : '',
        this.formationText(s)),
      targetable ? h('div.hint', '可攻擊主建築物：選一個你的角色') : null);
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
      hint: [subjects.has(`field:${p.id}`) ? 'playable' : '', attacking ? 'attacking' : '', targeted ? 'targeted' : '', p.convalescing ? 'heal' : ''].join(' '),
      onClick: () => { this.selected = { zone: 'field', id: p.id, who }; this.render(); },
    });
    if (p.damage) el.append(h('div.dmg', `-${p.damage}`));
    return el;
  }

  actionBar(myTurn, legal) {
    const bar = h('div.actions', { role: 'group', 'aria-label': '動作' });
    const v = this.view;
    if (v.result) {
      bar.append(h('button.primary', { id: 'btn-over', on: { click: () => this.opts.onExit?.() } }, this.opts.exitLabel ?? '回首頁'));
      return bar;
    }
    if (!myTurn) { bar.append(h('div.waiting', '對手行動中…')); return bar; }
    const nonSubject = legal.filter((a) => !this.subjectOf(a));
    // 需要玩家決定的動作：閃、重選目標、奇遇
    for (const a of nonSubject) {
      const k = Object.keys(a)[0];
      if (k === 'pass') continue;
      bar.append(h('button.decision', { on: { click: () => this.act(a) } }, this.actionLabel(a)));
    }
    if (v.adventure) bar.prepend(h('div.advent', '江湖奇遇：', h('b', this.engine.cards[v.adventure.cardID]?.name ?? v.adventure.cardID)));
    const hasPass = legal.some((a) => 'pass' in a);
    if (hasPass) {
      const pass = legal.find((a) => 'pass' in a);
      const canAttack = legal.some((a) => a.attack);
      let label = '確定';
      switch (v.phase) {
        case 'main1': label = canAttack ? '進入攻擊' : '結束回合'; break;
        case 'declareAttackers': label = (v.combat?.attackers?.length ?? 0) ? '攻擊結算' : '不攻擊'; break;
        case 'main2': label = '結束回合'; break;
        case 'response': label = v.combat?.pendingDodge ? '承受這一擊' : '略過反應'; break;
        case 'declareBlockers': label = '略過反應'; break;
        default: break;
      }
      bar.append(h('button.primary', { id: 'btn-pass', on: { click: () => this.act(pass) } }, label));
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
    const sheet = h('div.sheet', { role: 'dialog', 'aria-modal': 'true', 'aria-label': '卡片資訊', on: { keydown: (e) => { if (e.key === 'Escape') { this.selected = null; this.render(); } } } },
      h('button.close', { 'aria-label': '關閉', on: { click: () => { this.selected = null; this.render(); } } }, '✕'),
      cardDetail(this.engine, cardID, perm),
      acts.length ? h('div.sheet-actions', ...acts.map((a) => h('button.act', { on: { click: () => this.act(a) } }, this.actionLabel(a)))) : h('div.muted', sel.who === 'enemy' ? '敵方角色' : '現在沒有可用的動作'));
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

  toggleLog() { this.logOpen = !this.logOpen; this.render(); }
  logPanel() {
    return h('div.logpanel', { role: 'dialog', 'aria-label': '戰鬥紀錄', on: { keydown: (e) => { if (e.key === 'Escape') this.toggleLog(); } } }, h('div.logbar', h('b', '戰鬥紀錄'), h('button.close', { on: { click: () => this.toggleLog() } }, '✕')),
      h('div.loglines', ...this.logLines.slice(-120).map((l) => h('div', l))));
  }
}
