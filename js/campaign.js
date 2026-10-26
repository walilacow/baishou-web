// 劇情模式（網頁版）：序章加八關，共九場。組局、獎勵、存檔都在引擎橋接層（Swift），這裡只畫畫面。
import { Battle, cardEl, cardDetail, preloadArt } from './battle.js';
import { h, clear, toast, store, battleShell, betaBadge, footer } from './ui.js';

const SAVE_KEY = 'baishou.campaign.v1';
const INTRO = [
  '雪落在石階上，沒有聲音。守衛站在門洞裡，沒有退。',
  '三百年來，七卷經文分在七座山門；陸上的人，只記得六卷。',
  '江湖上有一句話：經卷合了，百獸就回來了。',
  '今夜山風往東吹，七座山門的燈，一齊暗了一下。',
  '門開著。進來的人，自己挑一座山門。',
];
const INTRO_ART = ['panshi_hall', 'heifeng_fort', 'chiyan_lair', 'daoxuan_temple', 'chenyuan_palace'];
const BOSS_VICTORY = [
  '沙停了。地底下的拍子慢下來，像很多很小的腳一起轉身。',
  '她沒有叫。她說的最後一句不是恨：「環，我拆了。你們自己排。」',
  '你低頭看那個圈：六個卷還在，缺東南那一角還在。',
  '走出沙地的時候，你數了一下自己身上，有沒有多一道紅。',
];
const ENDING = [
  '天亮的時候，六座山門的燈先後熄了。',
  '沒有人說話。有人把甲解下來，放在石獅腳邊；有人蹲下去，把地上的卷按平。',
  '有人問：「她死了嗎？」沒有人答得出來。',
  '你走回自己的山門，站上那一尺青石。',
  '雪落下來，落在肩上，不化。',
  '有個比你年輕的人問你：「守到什麼時候？」',
  '你說：「守到有人來換。」',
  '——這一句，你師父也對你說過。',
];
const BUILDING = { dragon: '磐石殿', tiger: '嘯風虎穴', crane: '雲頂鶴巢', wolf: '月狼窟', scorpion: '赤岩蠍窟', bat: '倒懸古寺', jiao: '沉淵宮' };
const HERO = { dragon: '石恆', tiger: '花小刀', crane: '雲蘿', wolf: '狼巫', scorpion: '紫鳶', bat: '烏夜', jiao: '滄汐' };
const NAMES = { tiger: '猛虎派', dragon: '地龍門', crane: '白鶴門', wolf: '群狼幫', scorpion: '毒蠍教', bat: '血蝠教', jiao: '碧鮫宮' };
const FACTION_LINE = {
  dragon: '山門朝北，石頭是溫的。守衛站在那裡，不退。', tiger: '風從嶺上下來，帶著血的味。刀比人快。', crane: '山頂在雲上，進山沒有路，只有一條白索。',
  wolf: '長城外，夜裡有狼嚎。有人聽得懂。', scorpion: '流沙海，日曬夜寒，沙裡有蠍。', bat: '南邊的瘴林，白日見不到太陽。有人不怕。', jiao: '東海底下有一片沉船。陸上的人忘了那一派。',
};
const ROUTE_LINE = {
  dragon: '山道往下，石階結冰。有人在門洞裡生了一盞燈。', tiger: '嶺上風大，鼓聲從很遠的地方來。', crane: '白索從雲裡垂下來。抓上去，它自己會往上收。',
  wolf: '草坡上都是腳印，沒有一個是人走的。', scorpion: '沙面上一層薄霜。霜底下有東西在動。', bat: '窪地裡半座殘殿，樑上倒懸著一個影子。', jiao: '水退下去，露出一條沉船的龍骨。',
};
const HOME_LINE = {
  dragon: '龍脊前的燈一夜沒熄。長老坐在燈旁，說的不是他的聲音：「把卷給我。」',
  tiger: '嘯風嶺的血碗空了三天。掌門的眼睛成了豎線，他喚她「小刀」，用的卻是別人的聲音。',
  crane: '長老背上的翎一夜長成翅。她每天剪一次絨；今夜要剪的是長老的翎。',
  wolf: '狼王不再說話，白狼對著月亮嗚了整夜。兩種都聽懂了。',
  scorpion: '鄔娘咳出來的小蠍不再認人。她笑著叫紫鳶「女兒」，手裡在數她的骨頭。',
  bat: '長老倒懸在樑上兩百年，笑聲在空殿裡盪：「你還是人嗎？」',
  jiao: '沉淵君三百年沒哭過。他在珠前等她：「你來取，還是來還？」',
};
const KW = { swift: '迅捷', ambush: '偷襲', bulwark: '鎮守', breakthrough: '破陣', drain: '噬血', ironBody: '護體', qinggong: '輕功' };

export function campaignPage(ctx) {
  const { engine, shell } = ctx;
  const box = h('div.campaign', { id: 'campaign-box' });
  const c = new Campaign(engine, box);
  c.start();
  return shell(box);
}

class Campaign {
  constructor(engine, box) { this.engine = engine; this.box = box; this.camp = null; this.battle = null; this.introShot = 0; }

  put(...kids) { clear(this.box).append(...kids.flat(Infinity).filter((k) => k != null && k !== false)); window.scrollTo(0, 0); }
  call(cmd, args = {}) { return this.engine.call({ cmd, ...args }); }

  // ---- 存檔 ----
  readSave() { return store.get(SAVE_KEY, null); }
  persist(step) {
    if (!this.camp || this.camp.finished) return;
    try { const r = this.call('campaign.save', { step }); store.set(SAVE_KEY, r.save); } catch (e) { console.warn('save failed', e); }
  }
  persistReplay() {
    try { store.set(SAVE_KEY, this.call('campaign.save', { step: 'battle', replay: true }).save); } catch (e) { console.warn('save failed', e); }
  }
  clearSave() { store.remove(SAVE_KEY); }

  // ---- 開頭 ----
  start() {
    const save = this.readSave();
    if (save) return this.modeScreen(save);
    this.intro();
  }

  intro() {
    let shot = 0;
    const render = () => {
      const art = h('div.intro-art', { style: `background-image:url(art/table/${INTRO_ART[shot]}.webp)` });
      this.put(h('div.intro', { id: 'intro', on: { click: () => { if (shot < INTRO.length - 1) { shot++; render(); } else this.factionScreen(); } } },
        art, h('div.intro-line', INTRO[shot]), h('div.intro-hint', shot < INTRO.length - 1 ? '點一下繼續' : '點一下進入'),
        h('button.secondary.skip', { id: 'intro-skip', on: { click: (e) => { e.stopPropagation(); this.factionScreen(); } } }, '跳過')));
    };
    render();
  }

  modeScreen(save) {
    this.put(h('h1', '劇情模式'),
      h('div.card-box', h('h2', '接著走'), h('p', `${NAMES[save.playerFaction]}・走到第 ${Math.min(save.stageIndex, 8) + 1}／9 場`),
        h('button.primary', { id: 'resume', on: { click: () => this.resume(save) } }, '接著走')),
      h('div.card-box', h('h2', '重新入江湖'), h('p.error', '重新開始，上一趟就不作數了。'),
        h('button.secondary', { id: 'restart', on: { click: () => { this.clearSave(); this.intro(); } } }, '重新開始')));
  }

  factionScreen() {
    const row = h('div.picker', { id: 'campaign-factions' });
    for (const f of Object.keys(NAMES)) {
      row.append(h('button.faction', { 'data-f': f, on: { click: () => this.newRun(f) } }, h('b', NAMES[f]), h('span', `${BUILDING[f]}｜${HERO[f]}`), h('span', FACTION_LINE[f])));
    }
    this.put(h('h1', '你從哪一座山門來'), h('p.sub', '一派一卷。選了，就從那裡開始。'), row);
  }

  newRun(faction) {
    const fixed = Number(new URLSearchParams(location.search).get('seed'));   // 測試用：?seed= 固定局種子
    const seed = fixed > 0 ? fixed : Math.floor(Math.random() * 2 ** 40) + 1;
    const startAt = new URLSearchParams(location.search).has('autotest') ? Number(new URLSearchParams(location.search).get('stage')) || 0 : 0;   // 測試用：?autotest=…&stage=N 直達第 N 場
    const r = this.call('campaign.new', { player: faction, seed, startAt });
    this.camp = r.campaign;
    this.persist('map');
    this.mapScreen();
  }

  resume(save) {
    try {
      const r = this.call('campaign.restore', { save });
      this.camp = r.campaign;
      if (r.step === 'battle') return r.battle ? this.battleScreen(r.battle) : this.begin();   // 沒帶局面＝平手或局面解不開：同一個對手重開，不回路線圖

      if (r.step === 'reward') return this.rewardScreen();
      if (r.step === 'victory') return this.victoryScreen();
      return this.mapScreen();
    } catch (e) {
      toast(e.message === 'tooNew' ? '這份存檔是新版寫的，這一版接不上。' : '存檔讀不出來，從頭開始。');
      this.clearSave(); this.intro();
    }
  }

  // ---- 路線圖 ----
  mapScreen() {
    const c = this.camp;
    if (c.finished) return this.endingScreen();
    const stage = c.stages[c.stageIndex];
    const body = [];
    body.push(h('div.maphead', h('h1', '路引'), h('span.muted', c.progress), h('button.link', { id: 'leave', on: { click: () => { this.persist('map'); location.hash = '#/'; } } }, '離開')));
    body.push(h('div.stagebar', ...c.stages.map((s) => h('i', { class: s.done ? 'done' : (s.index === c.stageIndex ? 'now' : ''), title: s.displayName }))));
    if (stage.kind === 'choice') {
      const pending = stage.opponent === 'jianghu';
      body.push(h('p.sub', `${stage.displayName}${pending ? '（還沒挑山門）' : ''}`), h('p.muted', '六座山門，六場。走哪一條，你挑。'));
      const grid = h('div.choices', { id: 'choices' });
      for (const ch of c.choices) {
        grid.append(h('button.choice', { 'data-f': ch.faction, on: { click: () => this.choose(ch.faction) } },
          h('div', h('b', NAMES[ch.faction]), ' ', h('span.muted', BUILDING[ch.faction])), h('div.muted', ROUTE_LINE[ch.faction]),
          ch.mark !== 'none' ? h('span.mark.' + ch.mark, ch.markLabel) : null));
      }
      body.push(grid, h('button.secondary', { id: 'random-choice', on: { click: () => { this.call('campaign.randomChoice'); this.begin(); } } }, '讓路自己走'));
    } else {
      body.push(h('div.card-box.single', h('h2', stage.displayName), h('p', stage.opponentName),
        stage.kind === 'home' ? h('p.muted', HOME_LINE[c.playerFaction] ?? '') : null,
        stage.kind === 'boss' ? [h('span.mark.none', '相剋不作用'), h('p.warn', `耐久 ${c.bossLife}｜先清場才打得到主建築物`)] : null,
        h('button.primary', { id: 'enter-stage', on: { click: () => this.begin() } }, '往這座山門')));
    }
    this.put(...body);
  }

  choose(faction) {
    const r = this.call('campaign.choose', { opponent: faction });
    this.camp = r.campaign;
    this.begin();
  }

  // ---- 對局 ----
  begin() {
    try {
      const r = this.call('campaign.begin');
      this.camp = r.campaign;
      this.battleScreen(r.battle);
    } catch (e) { toast(`開局失敗：${e.message}`); this.mapScreen(); }
  }

  battleScreen(snap) {
    const root = h('div.battle-root');
    this.battle = new Battle(this.engine, root, snap, {
      exitLabel: '繼續',
      onSnap: (s) => { if (!s.over) this.persist('battle'); },
      onExit: () => this.afterBattle(),
      // 依引擎真局面的結果存檔：輸了刪檔、贏了存領獎（獸母存勝利頁）、平手存「同一個對手重開」
      onEnd: (result) => {
        if (result === 'playerLost') this.clearSave();
        else if (result === 'playerWon') this.persist(this.camp.grantsReward ? 'reward' : 'victory');
        else this.persistReplay();
      },
    });
    clear(this.box).append(h('div.battle-wrap', h('div.battle-bar', h('span.muted', this.camp.progress), h('button.link', { id: 'leave-battle', on: { click: () => { if (!this.battle?.view.result) this.persist('battle'); location.hash = '#/'; } } }, '離開（會存檔）')), root));
    window.scrollTo(0, 0);
  }

  afterBattle() {
    const result = this.battle?.view.result;
    if (result === 'playerWon') {
      if (this.camp.grantsReward) this.rewardScreen(); else this.victoryScreen();
    } else if (result === 'draw') {
      toast('平手，重開這一場。'); this.begin();
    } else this.defeatScreen();
  }

  // ---- 獎勵 ----
  rewardScreen() {
    const r = this.call('campaign.rewards');
    this.camp = r.campaign;
    const done = this.camp.picked.length;
    preloadArt(this.engine, [...r.rewards.flatMap((o) => o.candidates), ...this.camp.deck.map((d) => d.cardID)]);
    const list = h('div.rewards', { id: 'rewards' });
    for (const opt of r.rewards) {
      const taken = this.camp.picked.includes(opt.id);
      list.append(h('button.reward', { 'data-kind': opt.id, disabled: taken || !opt.available || done >= 2, on: { click: () => this.pickReward(opt) } },
        h('b', opt.title), ...opt.lines.map((l) => h('div.muted', l)), taken ? h('span.mark.sidewind', '已挑') : (!opt.available ? h('span.mark.none', '這一輪沒有可挑的') : null)));
    }
    this.put(h('h1', '戰後｜挑兩樣'), h('p.muted', '五樣裡挑兩樣。挑完就收。'), h('p', `已挑 ${done}／2`), list,
      done >= 2 ? h('button.primary', { id: 'reward-continue', on: { click: () => this.afterRewards() } }, '繼續') : null);
  }

  pickReward(opt) {
    if (['capture', 'adventure', 'treasure'].includes(opt.id)) return this.cardPickScreen(opt);
    if (opt.id === 'upgrade') return this.upgradeScreen(opt);
    if (opt.id === 'empower') return this.empowerScreen(opt);
  }

  applyReward(args) {
    const r = this.call('campaign.apply', args);
    this.camp = r.campaign;
    if (!r.applied) toast('這樣挑不行，再選一次。');
    this.persist('reward');
    this.rewardScreen();
  }

  cardPickScreen(opt) {
    const row = h('div.cardgrid', { id: 'card-pick' }, ...opt.candidates.map((id) => h('div.pickcell',
      cardEl(this.engine, id, { onClick: () => this.applyReward({ kind: opt.id, card: id }) }), h('div.small', this.engine.cards[id]?.text ?? ''))));
    this.put(h('h1', opt.title), ...opt.lines.map((l) => h('p.muted', l)), row, h('button.secondary', { on: { click: () => this.rewardScreen() } }, '返回'));
  }

  upgradeScreen(opt) {
    const picks = new Set();
    const grid = h('div.cardgrid', { id: 'upgrade-pick' });
    const ok = h('button.primary', { id: 'upgrade-ok', disabled: true, on: { click: () => this.applyReward({ kind: 'upgrade', picks: [...picks] }) } }, '就這兩張');
    for (const d of this.camp.deck.filter((x) => x.canUpgrade)) {
      const cell = cardEl(this.engine, d.cardID, { instance: { upgrade: d.upgrade, level: 1 }, onClick: () => {
        if (picks.has(d.index)) picks.delete(d.index); else if (picks.size < 2) picks.add(d.index);
        cell.classList.toggle('selected', picks.has(d.index)); ok.disabled = picks.size === 0;
      } });
      grid.append(cell);
    }
    this.put(h('h1', opt.title), h('p.muted', '最多挑兩張，各升一階。'), grid, ok, ' ', h('button.secondary', { on: { click: () => this.rewardScreen() } }, '返回'));
  }

  empowerScreen(opt) {
    const grid = h('div.cardgrid', { id: 'empower-pick' });
    const chars = this.camp.deck.filter((d) => d.empowerable.length && this.engine.cards[d.cardID]?.type === 'character');
    const kwBox = h('div.kwbox');
    for (const d of chars) {
      grid.append(cardEl(this.engine, d.cardID, { onClick: () => {
        clear(kwBox).append(h('p', `給「${this.engine.cards[d.cardID].name}」一個天賦：`), ...d.empowerable.map((k) => h('button.act', { 'data-kw': k, on: { click: () => this.applyReward({ kind: 'empower', picks: [d.index], keyword: k }) } }, KW[k] ?? k)));
      } }));
    }
    this.put(h('h1', opt.title), h('p.muted', '挑一個角色，再挑一個天賦。'), chars.length ? grid : h('p.warn', '沒有能賦能的角色。'), kwBox, h('button.secondary', { on: { click: () => this.rewardScreen() } }, '返回'));
  }

  afterRewards() {
    const r = this.call('campaign.advance');
    this.camp = r.campaign;
    this.persist('map');
    this.mapScreen();
  }

  // ---- 結局 ----
  victoryScreen() {
    this.put(h('h1', '獸母倒了'), ...BOSS_VICTORY.map((l) => h('p.story', l)),
      h('button.primary', { id: 'victory-continue', on: { click: () => { const r = this.call('campaign.advance'); this.camp = r.campaign; this.endingScreen(); } } }, '繼續'));
  }

  endingScreen() {
    this.clearSave();
    this.put(h('h1', '結尾'), ...ENDING.map((l) => h('p.story', l)), h('p', h('b', '劇情模式・完')),
      h('button.primary', { id: 'again', on: { click: () => this.factionScreen() } }, '再走一趟'), ' ', h('a.button', { href: '#/' }, '回首頁'));
  }

  defeatScreen() {
    this.clearSave();
    this.put(h('h1', '這一趟'), h('p.story', '山門的燈還亮著。你只是這一趟沒走到。'),
      h('button.primary', { id: 'again', on: { click: () => this.factionScreen() } }, '再走一趟'), ' ', h('a.button', { href: '#/' }, '回首頁'));
  }
}
