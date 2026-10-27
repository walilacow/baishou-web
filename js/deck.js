// 自己組牌：從該派的基本牌組出發，牌庫是全部的卡，任意增減。合法性（張數、同名上限、本門主角必帶、客卿、法寶、高內力牌、內功 12–13 張）全交給引擎驗。
import { h, clear, store, toast } from './ui.js';
import { cardEl, cardDetail } from './battle.js';
import { costText, costTotal } from './cost.js';

const TYPE_ORDER = ['character', 'technique', 'equipment', 'formation', 'trap', 'talisman', 'elixir', 'innerArt'];
const FACTION_ORDER = ['tiger', 'dragon', 'crane', 'wolf', 'scorpion', 'bat', 'jiao', 'jianghu'];
const KEY = (f) => `baishou.deck.v1.${f}`;

export class DeckBuilder {
  constructor(engine, root, { mine, theirs, onStart }) {
    this.engine = engine; this.root = root; this.mine = mine; this.theirs = theirs; this.onStart = onStart;
    this.rules = engine.call({ cmd: 'deck.rules' }).rules;
    this.pool = engine.call({ cmd: 'deck.pool' }).ids;
    this.starter = engine.call({ cmd: 'deck.starter', faction: mine }).starter;
    const saved = store.get(KEY(mine), null);
    this.deck = saved?.deck?.every((id) => engine.cards[id]) ? [...saved.deck] : [...this.starter.deck];
    this.loadout = saved?.loadout ? { ...saved.loadout } : { ...this.starter.loadout };
    this.filter = { q: '', type: '', faction: '', tab: 'deck' };
    this.shown = 80;
    this.render();
  }

  fname(f) { return this.engine.factionNames?.[f] ?? f; }
  tname(t) { return this.engine.typeNames?.[t] ?? t; }
  def(id) { return this.engine.cards[id]; }
  count(id) { return this.deck.filter((x) => x === id).length; }
  loadoutTotal() { return Object.values(this.loadout).reduce((a, n) => a + (n > 0 ? n : 0), 0); }
  isHero(id) { return id === this.starter.heroID; }

  validate() {
    return this.engine.call({ cmd: 'deck.validate', faction: this.mine, deck: this.deck, loadout: this.loadout }).problems;
  }
  persist() { store.set(KEY(this.mine), { deck: this.deck, loadout: this.loadout }); }

  add(id) {
    if (this.deck.length >= this.rules.maxDeckSize) { toast(`牌組已滿（上限 ${this.rules.maxDeckSize} 張）`); return; }
    this.deck.push(id); this.persist(); this.render();
  }
  remove(id) {
    if (this.isHero(id) && this.count(id) <= 1) { toast('本門主角必帶 1 張'); return; }
    const i = this.deck.lastIndexOf(id); if (i >= 0) this.deck.splice(i, 1); this.persist(); this.render();
  }
  reset() { this.deck = [...this.starter.deck]; this.loadout = { ...this.starter.loadout }; this.persist(); this.render(); }

  sortCards(ids) {
    const key = (id) => { const d = this.def(id); return [TYPE_ORDER.indexOf(d?.type), costTotal(d?.cost), d?.name ?? id]; };
    return [...ids].sort((a, b) => { const x = key(a), y = key(b); return x[0] - y[0] || x[1] - y[1] || x[2].localeCompare(y[2], 'zh-Hant'); });
  }

  row(id, { inDeck }) {
    const d = this.def(id); const n = this.count(id);
    const stat = d.type === 'character' ? `${d.power ?? 0}/${d.toughness ?? 0}` : this.tname(d.type);
    return h('div.drow', { 'data-card': id, class: n > 0 && !inDeck ? 'has' : '' },
      h('div.dthumb', { style: this.engine.artSet?.has(id) ? `background-image:url(art/${id}.webp)` : '' }),
      h('button.dinfo', { 'aria-label': `${d.name}說明`, on: { click: () => this.info(id) } },
        h('b', d.name), h('span.dmeta', `${this.fname(d.faction)}・${stat}${costText(d.cost) ? `・${costText(d.cost)}` : ''}`)),
      h('div.dctl',
        inDeck ? h('span.cnt', `×${n}`) : (n > 0 ? h('span.cnt', `牌組 ${n}`) : null),
        h('button.step', { 'aria-label': `${d.name}減一張`, 'data-dec': id, disabled: n <= 0 || (this.isHero(id) && n <= 1), on: { click: () => this.remove(id) } }, '−'),
        inDeck ? null : h('button.step', { 'aria-label': `${d.name}加一張`, 'data-add': id, on: { click: () => this.add(id) } }, '＋')));
  }

  info(id) {
    const sheet = h('div.sheet', { role: 'dialog', 'aria-modal': 'true', on: { keydown: (e) => { if (e.key === 'Escape') sheet.remove(); } } },
      h('button.close', { 'aria-label': '關閉', on: { click: () => sheet.remove() } }, '✕'), cardDetail(this.engine, id),
      h('div.sheet-actions', h('button.act', { on: { click: () => { this.add(id); sheet.remove(); } } }, '加入牌組')));
    this.root.append(sheet); sheet.querySelector('.close').focus();
  }

  render() {
    const problems = this.validate();
    const f = this.filter;
    const deckSorted = this.sortCards([...new Set(this.deck)]);
    const facOrder = [this.mine, ...FACTION_ORDER.filter((x) => x !== this.mine)];
    const fi = (id) => { const i = facOrder.indexOf(this.def(id)?.faction); return i < 0 ? 99 : i; };
    const matchQ = (id) => { const d = this.def(id); return !!d && (!f.q || d.name.includes(f.q) || (d.text ?? '').includes(f.q)); };
    const base = this.pool.filter(matchQ);
    const facCount = (x) => base.filter((id) => (!f.type || this.def(id).type === f.type) && (!x || this.def(id).faction === x)).length;
    const typeCount = (t) => base.filter((id) => (!f.faction || this.def(id).faction === f.faction) && (!t || this.def(id).type === t)).length;
    const poolFiltered = this.sortCards(base.filter((id) => (!f.type || this.def(id).type === f.type) && (!f.faction || this.def(id).faction === f.faction)))
      .sort((a, b) => fi(a) - fi(b));
    const chip = (attr, val, label, n, on) => h('button.chip', { type: 'button', [attr]: val, class: (attr === 'data-pf' ? f.faction : f.type) === val ? 'on' : '', 'aria-pressed': String((attr === 'data-pf' ? f.faction : f.type) === val), on: { click: () => { if (attr === 'data-pf') f.faction = val; else f.type = val; this.shown = 80; this.render(); } } }, `${label} ${n}`);
    const shownList = poolFiltered.slice(0, this.shown);
    const poolBody = [];
    let lastF = null, lastT = null;
    for (const id of shownList) {
      const d = this.def(id);
      if (d.faction !== lastF) { lastF = d.faction; lastT = null; poolBody.push(h('h3.pfac', this.fname(d.faction))); }
      if (d.type !== lastT) { lastT = d.type; poolBody.push(h('h4.ptype', this.tname(d.type))); }
      poolBody.push(this.row(id, { inDeck: false }));
    }
    const root = clear(this.root);
    const loadoutRows = Object.keys(this.starter.loadout).concat(FACTION_ORDER.filter((x) => !(x in this.starter.loadout))).filter((x, i, a) => a.indexOf(x) === i).map((fa) => {
      const n = this.loadout[fa] ?? 0;
      return h('div.lrow', { 'data-lf': fa }, h('span', `${this.fname(fa)}`),
        h('button.step', { 'aria-label': `${this.fname(fa)}內功減一張`, 'data-ldec': fa, disabled: n <= 0, on: { click: () => { this.loadout[fa] = n - 1; this.persist(); this.render(); } } }, '−'),
        h('b', { 'data-lcount': fa }, String(n)),
        h('button.step', { 'aria-label': `${this.fname(fa)}內功加一張`, 'data-linc': fa, disabled: this.loadoutTotal() >= this.rules.loadoutMax, on: { click: () => { this.loadout[fa] = n + 1; this.persist(); this.render(); } } }, '＋'));
    });
    const ok = problems.length === 0;
    root.append(h('div.builder',
      h('div.bhead',
        h('h1', `組牌：${this.fname(this.mine)}`),
        h('p.muted', `基本牌組 ${this.starter.name}。任何門派的牌都能放，別派的牌出招付那一派的內力，記得配內功。`),
        h('div.bstat', { id: 'deck-stat' }, h('b', `牌組 ${this.deck.length}／${this.rules.maxDeckSize}`), h('span', `　內功 ${this.loadoutTotal()}（要 ${this.rules.loadoutMin}–${this.rules.loadoutMax}）`),
          h('button.link', { id: 'deck-reset', on: { click: () => this.reset() } }, '重設為基本牌組')),
        problems.length ? h('ul.problems', { id: 'deck-problems' }, ...problems.map((p) => h('li', p))) : h('div.okline', { id: 'deck-ok' }, '✓ 牌組合法，可以開戰')),
      h('div.btabs', { role: 'tablist' },
        h('button', { role: 'tab', 'aria-selected': f.tab === 'deck', class: f.tab === 'deck' ? 'on' : '', id: 'tab-deck', on: { click: () => { f.tab = 'deck'; this.render(); } } }, `我的牌組（${this.deck.length}）`),
        h('button', { role: 'tab', 'aria-selected': f.tab === 'pool', class: f.tab === 'pool' ? 'on' : '', id: 'tab-pool', on: { click: () => { f.tab = 'pool'; this.render(); } } }, `牌庫（${poolFiltered.length}）`)),
      h('div.bcols', { class: `show-${f.tab}` },
        h('section.bdeck', { id: 'bdeck' },
          h('details', { open: '', class: 'loadbox' }, h('summary', '內功配置'), h('div.lgrid', ...loadoutRows)),
          ...TYPE_ORDER.map((t) => { const ids = deckSorted.filter((id) => this.def(id)?.type === t); if (!ids.length) return null;
            return h('div.dgroup', h('h3', `${this.tname(t)}（${ids.reduce((a, id) => a + this.count(id), 0)}）`), ...ids.map((id) => this.row(id, { inDeck: true }))); })),
        h('section.bpool', { id: 'bpool' },
          h('div.bfilters',
            h('input', { type: 'search', id: 'pool-q', placeholder: '搜尋名稱或卡面文字', value: f.q, 'aria-label': '搜尋牌庫', on: { input: (e) => { f.q = e.target.value; this.shown = 80; this.renderKeepFocus(); } } }),
            h('div.chips', { id: 'pool-faction', role: 'group', 'aria-label': '門派目錄' }, chip('data-pf', '', '全部門派', facCount(''), 0), ...facOrder.map((x) => chip('data-pf', x, this.fname(x), facCount(x)))),
            h('div.chips', { id: 'pool-type', role: 'group', 'aria-label': '類型目錄' }, chip('data-pt', '', '全部類型', typeCount(''), 0), ...TYPE_ORDER.map((t) => chip('data-pt', t, this.tname(t), typeCount(t))))),
          ...poolBody,
          poolFiltered.length > this.shown ? h('button.secondary', { id: 'pool-more', on: { click: () => { this.shown += 80; this.render(); } } }, `再顯示 80 張（還有 ${poolFiltered.length - this.shown} 張，也可以用篩選縮小）`) : null)),
      h('div.bfoot', { id: 'deck-foot' }, h('b', '猜潮信：猜中先手　'),
        h('button.primary', { id: 'build-high', disabled: !ok, on: { click: () => this.onStart(true, this.deck, this.loadout) } }, '猜漲潮開戰'), ' ',
        h('button.primary', { id: 'build-low', disabled: !ok, on: { click: () => this.onStart(false, this.deck, this.loadout) } }, '猜退潮開戰'))));
  }

  renderKeepFocus() { this.render(); const q = this.root.querySelector('#pool-q'); if (q) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); } }
}
