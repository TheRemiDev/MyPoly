// ============================================================================
//  MyPoly — Blackjack : table de jeu (vue client)
//  Le serveur est seul maître du jeu : ce module affiche et anime.
//  Aide au calcul (option personnelle) : total de chaque main et de la banque.
// ============================================================================
import { h, toast, modal, roleTags, roleRibbons, nameClass, sleep, confetti, duration, storage } from './util.js';
import { store, emit } from './store.js';
import * as Sound from './sound.js';
import { navigate } from './app.js';
import { webglAvailable } from './board3d.js';
import { Blackjack3D } from './blackjack3d.js';
import { cardImg, chipImg, chipURL, REACTIONS, reactionEl, initials } from './poker-art.js';

export const BJ_SETTINGS_UI = [
  { group: 'Partie', items: [
    { key: 'maxPlayers', label: 'Joueurs max', type: 'select', options: [1, 2, 3, 4, 5].map((n) => [n, n === 1 ? 'Seul contre la banque' : n + ' joueurs']) },
    { key: 'rounds', label: 'Nombre de manches', type: 'select', options: [5, 8, 12, 20, 30].map((n) => [n, n + ' manches']), hint: 'À la fin, le joueur le plus riche gagne' },
    { key: 'startChips', label: 'Jetons de départ', type: 'select', options: [500, 1000, 2000, 5000].map((n) => [n, n.toLocaleString('fr-FR') + ' jetons']) },
    { key: 'minBet', label: 'Mise minimum', type: 'select', options: [5, 10, 25, 50, 100].map((n) => [n, n + ' jetons']) },
    { key: 'maxBet', label: 'Mise maximum', type: 'select', options: [[100, '100'], [250, '250'], [500, '500'], [1000, '1 000'], [0, 'Sans limite']] },
    { key: 'turnTime', label: 'Temps par décision', type: 'select', options: [[15, '15 s'], [20, '20 s'], [30, '30 s'], [45, '45 s'], [0, 'Illimité']] },
  ] },
  { group: 'Règles de la banque', items: [
    { key: 'decks', label: 'Jeux dans le sabot', type: 'select', options: [1, 2, 4, 6, 8].map((n) => [n, n + (n > 1 ? ' jeux' : ' jeu')]) },
    { key: 'bjPays', label: 'Un blackjack paie', type: 'select', options: [[150, '3 pour 2'], [120, '6 pour 5']] },
    { key: 'hitSoft17', label: 'La banque tire sur 17 souple', type: 'toggle', hint: 'As + 6 : la banque tire encore une carte (un peu plus dur pour les joueurs)' },
  ] },
  { group: 'Salle', items: [
    { key: 'isPublic', label: 'Salle publique', type: 'toggle', hint: 'Visible dans la liste des salles de l\'accueil' },
    { key: 'allowSpectators', label: 'Spectateurs autorisés', type: 'toggle' },
  ] },
];

export const BJ_PRESETS = {
  Casino: { rounds: 12, startChips: 1000, minBet: 10, maxBet: 500, decks: 6, bjPays: 150, hitSoft17: false, turnTime: 20 },
  'Partie rapide': { rounds: 5, startChips: 1000, minBet: 25, maxBet: 0, decks: 6, bjPays: 150, hitSoft17: false, turnTime: 15 },
  'Grosse soirée': { rounds: 20, startChips: 2000, minBet: 25, maxBet: 1000, decks: 8, bjPays: 150, hitSoft17: false, turnTime: 20 },
  'Banque coriace': { rounds: 12, startChips: 1000, minBet: 10, maxBet: 500, decks: 8, bjPays: 120, hitSoft17: true, turnTime: 20 },
};

const fmt = (n) => Math.round(n || 0).toLocaleString('fr-FR');
const rankOf = (c) => (c >> 2) + 2;
const cardValue = (c) => {
  const r = rankOf(c);
  return r === 14 ? 1 : r >= 10 ? 10 : r;
};
/** Total d'une main (l'As vaut 1 ou 11). */
export function handValue(cards) {
  let sum = 0;
  let ace = false;
  for (const c of cards) {
    if (c == null) continue;
    sum += cardValue(c);
    if (rankOf(c) === 14) ace = true;
  }
  if (ace && sum + 10 <= 21) return { total: sum + 10, soft: true, low: sum };
  return { total: sum, soft: false, low: sum };
}
const OUTCOME = { win: 'Gagné', blackjack: 'Blackjack !', push: 'Égalité', lose: 'Perdu', bust: 'Sauté' };
const CHIP_VALUES = [1, 5, 25, 100, 500, 1000, 5000];

export class BlackjackTable {
  constructor(view) {
    this.v = view;
    this.state = null;
    this.queue = [];
    this.busy = false;
    this.help = storage('bjHelp') === 'on';
    this.betDraft = 0;
  }
  get me() {
    return store.key;
  }
  get room() {
    return this.v.room;
  }
  player(id) {
    return this.state && this.state.players.find((p) => p.id === id);
  }

  // =============================================================== structure
  build() {
    const v = this.v;
    v.toolbar = h('div.toolbar');
    v.logEl = h('div.log');
    v.chatBox = v.buildChat();
    v.emoteGrid = h('div.emote-grid.pk-emotes', Object.keys(REACTIONS).map((k) => h('button.emote.pk-emote', { title: REACTIONS[k].label, onclick: () => {
      store.socket.emit('game:emote', { emoji: k });
      v.togglePop(null);
    } }, reactionEl(k))));
    v.popTitle = h('b');
    v.popover = h('div.popover', { hidden: true },
      h('div.pop-head', v.popTitle, h('button.icon-btn.pop-close', { title: 'Fermer', onclick: () => v.togglePop(null) }, '✕')),
      h('div.pop-body', v.logEl, v.chatBox, v.emoteGrid, (v.musicPop = v.buildMusic()))
    );
    v.pop = null;
    v.endOverlay = h('div.end-overlay', { hidden: true });
    v.playersEl = h('div.pk-layer');
    this.host = h('div.board3d-host');
    this.cornersEl = h('div.corners');
    this.fx = h('div.pk-fx');
    this.labels = h('div.pk-labels');
    this.banner = h('div.pk-banners');
    this.statusEl = h('div.pk-status');
    this.myEl = h('div.bj-me');
    this.panelEl = h('div.bj-panel');
    this.dock = h('div.pk-dock.bj-dock', this.statusEl, this.myEl, this.panelEl);
    this.felt2d = h('div.bj-felt2d', h('div.bj2d-dealer'), h('div.bj2d-seats'));
    v.notifStacks = Object.fromEntries(['tl', 'tr', 'bl', 'br', 'mid'].map((k) => [k, h('div.notif-stack.ns-' + k)]));
    v.gameEl = h('div.game.poker-game.bj-game', this.host, this.felt2d, this.labels, v.playersEl, this.cornersEl, this.fx, this.dock, ...Object.values(v.notifStacks), this.banner, h('div.topbar', v.toolbar, v.popover));
    v.root.append(v.gameEl, v.endOverlay);
    if (webglAvailable()) {
      try {
        this.b3 = new Blackjack3D(this.host, {
          onDeal: () => Sound.play('card'),
          onChip: () => Sound.play('chip'),
          onChips: () => Sound.play('chips'),
          onCamera: () => this.renderLabels(),
          onLayout: () => this.state && (this.renderSeats(), this.syncTable(), this.renderLabels()),
        });
        v.gameEl.classList.add('webgl', 'pk3d');
      } catch (e) {
        console.error('WebGL indisponible', e);
        this.b3 = null;
      }
    }
    if (!this.b3) v.gameEl.classList.add('pk2d');
    v.renderTabs();
    v.renderChat();
    this.renderToolbar();
    this.onKey = (e) => {
      if (e.target.matches('input, textarea, select') || !this.state) return;
      const L = this.state.legal;
      const k = e.key.toLowerCase();
      if (L && !this.lock) {
        if (k === 't' || k === 'h') this.act('hit');
        else if (k === 'r' || k === 's') this.act('stand');
        else if (k === 'd' && L.canDouble) this.act('double');
        else if (k === 'p' && L.canSplit) this.act('split');
      } else if (this.state.canBet && k === 'enter' && this.betDraft) this.sendBet(this.betDraft);
    };
    document.addEventListener('keydown', this.onKey);
    this.onResize = () => {
      if (!this.state) return;
      this.renderSeats();
      this.renderLabels();
    };
    window.addEventListener('resize', this.onResize);
  }

  destroy() {
    document.removeEventListener('keydown', this.onKey);
    window.removeEventListener('resize', this.onResize);
    if (this.b3) this.b3.destroy();
    this.dead = true;
  }

  renderToolbar() {
    const v = this.v;
    if (!v.toolbar) return;
    const st = this.state;
    const me = this.player(this.me);
    v.buildToolbar({
      info: st ? `Manche ${st.round}/${st.rounds}` : 'Blackjack',
      camera: this.b3 ? () => this.b3.resetView() : null,
      rules: () => this.showRules(),
      forfeit: me && !me.out && this.room.state === 'playing' ? () => this.forfeit() : null,
      extra: [{ name: 'coach', title: this.help ? 'Aide au calcul activée (cliquer pour la couper)' : 'Afficher le total des cartes', onclick: () => this.setHelp(!this.help), on: this.help, label: 'Aide' }],
    });
  }
  setHelp(on) {
    this.help = on;
    storage('bjHelp', on ? 'on' : 'off');
    toast(on ? 'Aide au calcul activée : le total de chaque main est affiché.' : 'Aide au calcul désactivée.', 'info', 3000);
    this.renderAll();
  }

  showRules() {
    const s = this.room.settings;
    modal({
      title: 'Règles du Blackjack',
      className: 'pk-rules-modal',
      body: h('div.rules-summary.pk-rules',
        h('p', 'Le but : battre la banque en approchant ', h('b', '21'), ' sans le dépasser. Les cartes valent leur chiffre, les figures (Valet, Dame, Roi) valent ', h('b', '10'), ', l\'As vaut ', h('b', '1 ou 11'), ' au choix.'),
        h('p', 'Chaque manche : misez, puis recevez 2 cartes. La banque en a une visible et une cachée. À votre tour : ', h('b', 'tirer'), ' (une carte de plus), ', h('b', 'rester'), ', ', h('b', 'doubler'), ' (doubler la mise et recevoir une seule carte) ou ', h('b', 'séparer'), ' une paire en deux mains.'),
        h('p', 'Au-delà de 21, vous avez « sauté » : la mise est perdue. Ensuite la banque retourne sa carte et tire jusqu\'à 16, reste à 17. Si vous êtes plus près de 21 qu\'elle (ou si elle saute), vous gagnez votre mise. ', h('b', 'Blackjack'), ' (As + figure ou 10 d\'entrée) : payé ', s.bjPays === 150 ? '3 pour 2' : '6 pour 5', '.'),
        h('div.muted', `${s.rounds} manches · ${fmt(s.startChips)} jetons au départ · mise de ${fmt(s.minBet)} à ${s.maxBet ? fmt(s.maxBet) : 'tout son tapis'} · ${s.decks} jeu${s.decks > 1 ? 'x' : ''} dans le sabot${s.hitSoft17 ? ' · la banque tire sur 17 souple' : ''}`),
        h('div.muted', 'Raccourcis : T tirer · R rester · D doubler · P séparer · Entrée valider la mise')
      ),
    });
  }

  async forfeit() {
    const ok = await modal({ title: 'Quitter la table ?', body: h('p', 'Vous abandonnez la partie : vos jetons sont perdus et vous serez classé(e) dernier.'), buttons: [{ label: 'Annuler', value: false }, { label: 'Quitter la table', value: true, class: 'danger' }] });
    if (ok) this.v.cmd('game:forfeit');
  }

  // ======================================================= flux de mise à jour
  onUpdate(payload) {
    const st = payload.state;
    this.v.clockOffset = st.serverNow - Date.now();
    if (payload.sync || !this.state) {
      this.queue = [];
      this.apply(st, true);
      return;
    }
    this.queue.push(payload);
    if (!this.busy) this.process();
  }

  async process() {
    this.busy = true;
    while (this.queue.length && !this.dead) {
      const { events, state } = this.queue.shift();
      const fast = document.hidden || this.queue.length > 2;
      this.lock = true;
      this.renderPanel();
      for (const ev of events) {
        if (ev.t === 'log') this.addLog(ev);
        if (fast) continue;
        try {
          await this.play(ev, state);
        } catch (e) {
          console.error(e);
        }
      }
      this.lock = false;
      this.apply(state, fast);
    }
    this.busy = false;
    if (this.dead) return;
    this.renderAll();
    this.renderEnd();
  }

  apply(st, instant) {
    const first = !this.state;
    this.state = st;
    this.v.state = st;
    this.disp = {
      players: Object.fromEntries(st.players.map((p) => [p.id, { chips: p.chips, hands: p.hands.map((x) => ({ cards: x.cards.slice(), bet: x.bet, outcome: x.outcome, payout: x.payout })) }])),
      dealer: st.dealer.cards.slice(),
    };
    if (first || instant) {
      this.v.logEl.innerHTML = '';
      for (const l of st.log) this.addLog(l, true);
    }
    // Nouvelle manche de mises : on peut de nouveau miser
    if (!st.canBet) this.betSent = false;
    if (st.canBet && !this.betDraft) this.betDraft = Math.min(st.betLimits.max, Math.max(st.betLimits.min, st.betLimits.last || st.betLimits.min));
    this.renderAll();
    this.syncTable();
  }

  syncTable() {
    if (!this.b3 || !this.state) return;
    const st = this.state;
    this.b3.syncBj({
      players: st.players.filter((p) => this.b3.bj.seats[p.id]).map((p) => ({ id: p.id, chips: this.disp.players[p.id].chips, hands: this.disp.players[p.id].hands })),
      dealer: this.disp.dealer,
      current: st.current,
    });
    const cur = st.current && this.player(st.current.pid);
    this.b3.setTurnColor(cur && cur.color);
  }

  renderAll() {
    this.renderSeats();
    this.renderLabels();
    this.renderDock();
    this.renderPanel();
    this.renderToolbar();
    this.render2d();
  }

  addLog(l, silent) {
    const p = l.pid ? this.player(l.pid) : null;
    const line = h('div.log-line', p ? h('span.log-dot', { style: { background: p.color } }) : null, l.msg);
    const el = this.v.logEl;
    el.append(line);
    while (el.children.length > 120) el.firstChild.remove();
    if (!silent) el.scrollTop = el.scrollHeight;
  }

  // ================================================================ places
  seatMap() {
    const all = this.state.players;
    const i = all.findIndex((p) => p.id === this.me);
    const ordered = i < 0 ? all : all.slice(i).concat(all.slice(0, i));
    const shown = ordered.filter((p) => !p.out || p.id === this.me);
    const [mine, ...others] = shown;
    const map = {};
    if (mine) map[mine.id] = 'me';
    Blackjack3D.slotsFor(others.length).forEach((slot, k) => (map[others[k].id] = slot));
    return map;
  }

  renderSeats() {
    const st = this.state;
    if (!st) return;
    const map = this.seatMap();
    if (this.b3) this.b3.setSeats(map);
    this.cornersEl.innerHTML = '';
    for (const p of st.players) {
      const slot = map[p.id];
      if (!slot) continue;
      const d = this.disp.players[p.id];
      const turn = st.current && st.current.pid === p.id;
      const isMe = p.id === this.me;
      const bet = d.hands.reduce((s, x) => s + x.bet, 0);
      const tag = p.out ? h('span.pk-act.off', p.rank ? `Éliminé · ${p.rank}e` : 'Éliminé')
        : st.phase === 'bet' ? (p.betDone ? (p.sitting ? h('span.pk-act.a-fold', 'Passe') : h('span.pk-act.a-call', 'Prêt')) : h('span.pk-act.a-check', 'Mise…'))
        : p.sitting ? h('span.pk-act.a-fold', 'Passe la manche') : bet ? h('span.pk-act.a-bet', `Mise ${fmt(bet)}`) : null;
      const card = h('div.pcard.corner.pk-seat.bj-seat.c-' + (slot === 'me' ? 'bl' : slot === 'r1' || slot === 'r2' ? 'br' : 'bl') + (turn ? '.turn' : '') + (p.out ? '.out' : '') + (isMe ? '.me' : '') + (p.vip ? '.vip' : ''),
        { 'data-pid': p.id, 'data-slot': slot, style: { '--c': p.color } },
        h('div.pc-face'),
        roleRibbons(p),
        h('div.pc-avatar.pk-avatar', h('span.pk-initials', p.out ? '×' : initials(p.name))),
        h('div.pc-body',
          h('div.pc-name', h('span.pc-name-text.' + (nameClass(p) || 'plain'), p.name), ...roleTags(p, { level: false, compact: true })),
          h('div.pc-cash.pk-stack', chipImg(0, '.sm'), fmt(d.chips)),
          h('div.pc-chips.pk-tags', tag, !p.isBot && !p.connected ? h('span.pk-act.off', 'Hors ligne') : null)
        ),
        turn ? h('div.pcard-turn', isMe ? 'À VOUS' : 'JOUE…') : null,
        turn || (st.phase === 'bet' && !p.betDone) ? h('div.pcard-timer') : null
      );
      this.cornersEl.append(card);
    }
    this.placeSeatCards();
  }

  placeSeatCards() {
    const box = this.cornersEl.getBoundingClientRect();
    for (const card of this.cornersEl.querySelectorAll('.pcard.corner:not(.me)')) {
      const pid = card.dataset.pid;
      const a = this.b3 ? this.b3.seatAnchor(pid) : this.anchor2d(pid);
      if (!a) continue;
      const w = card.offsetWidth;
      const hh = card.offsetHeight;
      let x = a.x - box.left - w / 2;
      let y = a.y - box.top + 6;
      x = Math.max(8, Math.min(box.width - w - 8, x));
      y = Math.max(70, Math.min(box.height - hh - 8, y));
      Object.assign(card.style, { left: Math.round(x) + 'px', top: Math.round(y) + 'px', right: 'auto', bottom: 'auto', translate: 'none' });
    }
  }
  anchor2d(pid) {
    const el = this.felt2d.querySelector(`[data-box="${CSS.escape(pid)}"]`);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.bottom };
  }

  /** Étiquettes : totaux (aide au calcul), résultats, mises, banque. */
  renderLabels() {
    const st = this.state;
    this.labels.innerHTML = '';
    if (!st || !this.b3) return;
    const box = this.v.gameEl.getBoundingClientRect();
    const place = (el, pt) => {
      if (!pt) return;
      el.style.left = pt.x - box.left + 'px';
      el.style.top = pt.y - box.top + 'px';
      this.labels.append(el);
    };
    // Banque
    const dc = this.disp.dealer;
    if (dc.length) {
      const v = handValue(dc);
      const hidden = dc.some((c) => c == null);
      const txt = this.help ? (hidden ? `${v.total}${v.soft ? ' / ' + v.low : ''} + ?` : this.totalText(v)) : null;
      place(h('div.bj-dealerlabel' + (v.total > 21 ? '.bust' : ''), h('small', 'Banque'), txt ? h('b', txt) : null, !hidden && v.total > 21 ? h('b', 'Saute !') : null), this.b3.dealerScreen());
    } else place(h('div.bj-dealerlabel.idle', h('small', 'Banque')), this.b3.dealerScreen());
    const map = this.seatMap();
    for (const p of st.players) {
      if (!map[p.id]) continue;
      const d = this.disp.players[p.id];
      const n = d.hands.length;
      d.hands.forEach((hand, k) => {
        // Le montant misé n'est affiché que tant que la mise est sur la table
        if (hand.bet && !hand.outcome) place(h('div.pk-betlabel', { style: { '--c': p.color } }, fmt(hand.bet)), this.b3.betScreen(p.id, k, n));
        if (!hand.cards.length) return;
        const v = handValue(hand.cards);
        const active = st.current && st.current.pid === p.id && st.current.hand === k;
        let txt = null;
        let cls = '';
        if (hand.outcome && hand.outcome !== 'bust') {
          txt = OUTCOME[hand.outcome] + (hand.outcome === 'win' || hand.outcome === 'blackjack' ? ` +${fmt(hand.payout - hand.bet)}` : '');
          cls = '.o-' + hand.outcome;
        } else if (v.total > 21) {
          txt = this.help ? `Sauté (${v.total})` : 'Sauté';
          cls = '.o-bust';
        } else if (hand.cards.length === 2 && v.total === 21 && n === 1) {
          txt = 'Blackjack !';
          cls = '.o-blackjack';
        } else if (this.help) txt = this.totalText(v);
        if (txt) place(h('div.bj-handlabel' + cls + (active ? '.active' : ''), txt), this.b3.handScreen(p.id, k, n, hand.cards.length - 1));
      });
    }
  }
  totalText(v) {
    return v.soft && v.total !== 21 ? `${v.low} / ${v.total}` : String(v.total);
  }

  /** Sans WebGL : table simple en HTML. */
  render2d() {
    if (this.b3 || !this.state) return;
    const st = this.state;
    const [dealerEl, seatsEl] = this.felt2d.children;
    const dv = handValue(this.disp.dealer);
    dealerEl.replaceChildren(h('div.bj2d-title', 'Banque', this.help && this.disp.dealer.length ? h('b', ' · ' + (this.disp.dealer.includes(null) ? dv.total + ' + ?' : this.totalText(dv))) : null), h('div.bj2d-cards', this.disp.dealer.map((c) => cardImg(c, '.board'))));
    const map = this.seatMap();
    const order = ['l2', 'l1', 'me', 'r1', 'r2'];
    seatsEl.replaceChildren(...order.map((slot) => {
      const p = st.players.find((x) => map[x.id] === slot);
      if (!p) return null;
      const d = this.disp.players[p.id];
      return h('div.bj2d-box', { 'data-box': p.id, style: { '--c': p.color } }, d.hands.map((hand) => {
        const v = handValue(hand.cards);
        return h('div.bj2d-hand', h('div.bj2d-cards', hand.cards.map((c) => cardImg(c, '.mini'))), h('small', [hand.bet ? fmt(hand.bet) : '', this.help && hand.cards.length ? ' · ' + this.totalText(v) : '', hand.outcome ? ' · ' + OUTCOME[hand.outcome] : ''].join('')));
      }));
    }));
  }

  // ================================================================ zone du joueur
  renderDock() {
    const st = this.state;
    if (!st) return;
    const me = this.player(this.me);
    const cur = st.current && this.player(st.current.pid);
    let status = '';
    if (st.over) status = 'Partie terminée';
    else if (st.phase === 'bet') status = st.canBet && !this.betSent ? 'Faites vos jeux : choisissez votre mise' : 'Mise placée : on attend les autres joueurs…';
    else if (st.phase === 'dealer') status = 'La banque joue…';
    else if (st.phase === 'between') status = 'Manche suivante dans un instant…';
    else if (st.legal) status = 'À vous de jouer';
    else if (cur) status = `${cur.name} joue…`;
    if (me && me.out) status = 'Vous n\'avez plus de jetons : vous regardez la fin de la partie.';
    this.statusEl.replaceChildren(h('span', status), st.deadline ? h('div.pk-timer', h('i')) : null);
    this.statusEl.classList.toggle('mine', !!(st.legal || st.canBet));
    this.myEl.innerHTML = '';
    if (me && !me.out) {
      const d = this.disp.players[me.id];
      this.myEl.append(h('div.pk-mystack', h('img.pk-chip', { src: chipURL(0), alt: '' }), h('span', fmt(d.chips), h('small', ' jetons')), d.hands.length ? h('span.pk-mybet', `mise ${fmt(d.hands.reduce((s, x) => s + x.bet, 0))}`) : null));
    }
  }

  renderPanel(force = false) {
    const st = this.state;
    const el = this.panelEl;
    // Mise : chacun mise à son rythme, même pendant que les jetons des autres arrivent sur la table
    if (st && !st.over && st.canBet && !this.betSent) {
      if (this.panelMode === 'bet' && !force) return;
      this.panelMode = 'bet';
      el.innerHTML = '';
      return this.renderBet();
    }
    this.panelMode = null;
    el.innerHTML = '';
    if (!st || this.lock || st.over) return;
    const L = st.legal;
    if (!L) return;
    const me = this.player(this.me);
    const hand = me.hands[L.hand];
    const v = handValue(hand.cards);
    const btn = (key, cls, label, sub, fn, ok = true) => (ok ? h('button.btn.pk-btn.' + cls, { onclick: fn }, h('span', label), h('small', sub)) : null);
    el.append(h('div.pk-actions',
      btn('hit', 'call', 'Tirer', this.help ? `Une carte de plus (${this.totalText(v)})` : 'Une carte de plus', () => this.act('hit')),
      btn('stand', 'check', 'Rester', 'Garder ma main', () => this.act('stand')),
      btn('double', 'raise', 'Doubler', `+${fmt(hand.bet)}, une seule carte`, () => this.act('double'), L.canDouble),
      btn('split', 'allin', 'Séparer', 'Deux mains', () => this.act('split'), L.canSplit)
    ));
  }

  renderBet() {
    const st = this.state;
    const { min, max, last } = st.betLimits;
    const clamp = (x) => Math.max(0, Math.min(max, x));
    const amount = h('b.bj-bet-amount', fmt(this.betDraft));
    const chips = CHIP_VALUES.filter((v) => v <= max && v >= Math.min(min, 5) && v * 200 >= min);
    const go = h('button.btn.primary.bj-bet-go', { disabled: this.betDraft < min, onclick: () => this.sendBet(this.betDraft) }, this.betDraft < min ? `Minimum ${fmt(min)}` : `Miser ${fmt(this.betDraft)}`);
    const set = (x) => {
      this.betDraft = clamp(x);
      this.renderPanel(true);
    };
    this.panelEl.append(h('div.bj-bet',
      h('div.bj-bet-top', h('span', 'Votre mise'), amount, h('small', `de ${fmt(min)} à ${fmt(max)}`)),
      h('div.bj-chips', chips.map((v) => h('button.bj-chipbtn', { title: `+${fmt(v)}`, onclick: () => {
        Sound.play('chip');
        set(this.betDraft + v);
      } }, h('img', { src: chipURL(v), alt: String(v) })))),
      h('div.bj-bet-row',
        h('button.btn.ghost.sm', { onclick: () => set(0) }, 'Effacer'),
        h('button.btn.ghost.sm', { onclick: () => set(min) }, 'Minimum'),
        last ? h('button.btn.ghost.sm', { onclick: () => set(last) }, `Même mise (${fmt(last)})`) : null,
        h('button.btn.ghost.sm', { onclick: () => set(this.betDraft * 2) }, '×2'),
        h('button.btn.ghost.sm', { onclick: () => set(max) }, 'Maximum')
      ),
      go
    ));
  }

  async sendBet(amount) {
    if (!this.state || !this.state.canBet || this.betSent) return;
    Sound.play('chips');
    this.betSent = true;
    this.renderPanel();
    const res = await emit('game:action', { type: 'bet', amount });
    if (res && res.error) {
      this.betSent = false;
      Sound.play('error');
      toast(res.error, 'error');
      this.renderPanel(true);
    }
  }

  async act(type) {
    if (!this.state || !this.state.legal || this.lock) return;
    Sound.play('click');
    this.lock = true;
    this.renderPanel();
    const res = await emit('game:action', { type });
    this.lock = false;
    if (res && res.error) {
      Sound.play('error');
      toast(res.error, 'error');
      this.renderPanel();
    }
  }

  // ================================================================ animations
  pointOf(pid) {
    const host = this.v.gameEl.getBoundingClientRect();
    if (this.b3) {
      const p = this.b3.seatScreen(pid);
      if (p) return { x: p.x - host.left, y: p.y - host.top - 30 };
    }
    const card = this.cornersEl.querySelector(`[data-pid="${CSS.escape(pid)}"]`);
    if (!card) return null;
    const r = card.getBoundingClientRect();
    return { x: r.left + r.width / 2 - host.left, y: r.top - host.top };
  }
  seatBubble(pid, content, cls = '', ms = 1500) {
    const pt = this.pointOf(pid);
    if (!pt) return;
    const b = h('div.pk-bubble' + cls, content);
    b.style.left = pt.x + 'px';
    b.style.top = pt.y + 'px';
    this.fx.append(b);
    setTimeout(() => b.remove(), ms);
  }
  showBanner(title, sub, color = '#ffd166', ms = 1600, cls = '') {
    const el = h('div.pk-banner' + cls, { style: { '--c': color } }, h('div.pk-banner-title', title), sub ? h('div.pk-banner-sub', sub) : null);
    this.banner.append(el);
    setTimeout(() => {
      el.classList.add('out');
      setTimeout(() => el.remove(), 350);
    }, ms);
  }
  refresh() {
    this.renderSeats();
    this.renderLabels();
    this.renderDock();
    this.render2d();
  }

  async play(ev, st) {
    const d = this.disp;
    const P = (id) => d.players[id];
    const p = st.players.find((x) => x.id === ev.pid);
    switch (ev.t) {
      case 'round': {
        if (this.b3) await this.b3.clearCards();
        for (const dp of Object.values(d.players)) dp.hands = [];
        d.dealer = [];
        this.refresh();
        this.showBanner(`Manche ${ev.round}`, `sur ${ev.rounds} · faites vos jeux !`, '#ffd166', 1200, '.small');
        return;
      }
      case 'shuffle':
        Sound.play('shuffle');
        this.showBanner('Nouveau sabot', 'La banque mélange les cartes', '#3fa7ff', 1300, '.small');
        await sleep(600);
        return;
      case 'bet': {
        const dp = P(ev.pid);
        dp.hands = [{ cards: [], bet: ev.amount, outcome: null, payout: 0 }];
        dp.chips = ev.chips;
        if (this.b3) await this.b3.placeBet(ev.pid, ev.amount, ev.chips);
        else Sound.play('chip');
        this.refresh();
        return;
      }
      case 'deal': {
        for (const x of ev.seq) if (x.to !== 'dealer') P(x.to).hands[0].cards = [];
        d.dealer = [];
        this.syncTable();
        for (const x of ev.seq) {
          if (x.to === 'dealer') {
            d.dealer.push(x.card);
            if (this.b3) await this.b3.dealCard('dealer', x.card);
          } else {
            P(x.to).hands[0].cards.push(x.card);
            if (this.b3) await this.b3.dealCard({ pid: x.to, hand: 0 }, x.card, { n: 1 });
          }
          if (!this.b3) Sound.play('card');
          this.renderLabels();
          this.render2d();
        }
        return;
      }
      case 'peek':
        this.showBanner('La banque vérifie…', ev.blackjack ? 'Blackjack de la banque !' : 'Pas de blackjack, on joue !', ev.blackjack ? '#ff5a5f' : '#2ecc71', 1100, '.small');
        await sleep(500);
        return;
      case 'blackjack':
        Sound.play('cash');
        this.seatBubble(ev.pid, 'Blackjack !', '.win', 1800);
        await sleep(400);
        return;
      case 'card': {
        const dp = P(ev.pid);
        dp.hands[ev.hand].cards.push(ev.card);
        if (this.b3) await this.b3.dealCard({ pid: ev.pid, hand: ev.hand }, ev.card, { n: dp.hands.length });
        else Sound.play('card');
        this.refresh();
        return;
      }
      case 'stand':
        Sound.play('check');
        this.seatBubble(ev.pid, 'Reste', '.check');
        await sleep(250);
        return;
      case 'double': {
        const dp = P(ev.pid);
        const hand = dp.hands[ev.hand];
        const add = ev.bet - hand.bet;
        hand.bet = ev.bet;
        dp.chips = ev.chips;
        this.seatBubble(ev.pid, 'Double !', '.raise');
        if (this.b3) await this.b3.placeBet(ev.pid, ev.bet, ev.chips, ev.hand, dp.hands.length, add);
        hand.cards.push(ev.card);
        if (this.b3) await this.b3.dealCard({ pid: ev.pid, hand: ev.hand }, ev.card, { n: dp.hands.length });
        this.refresh();
        return;
      }
      case 'split': {
        const dp = P(ev.pid);
        dp.chips = ev.chips;
        dp.hands = ev.cards.map((cards) => ({ cards: cards.slice(), bet: ev.bet, outcome: null, payout: 0 }));
        this.seatBubble(ev.pid, 'Sépare !', '.allin');
        Sound.play('chips');
        if (this.b3) {
          // On repose les deux mains côte à côte
          const s = this.b3.bj.seats[ev.pid];
          if (s) {
            for (const hand of s.hands) for (const m of hand) this.b3.world.remove(m);
            s.hands = [];
          }
          this.syncTable();
        }
        this.refresh();
        await sleep(500);
        return;
      }
      case 'bust': {
        Sound.play('fold');
        this.seatBubble(ev.pid, 'Sauté !', '.fold', 1500);
        const hand = P(ev.pid) && P(ev.pid).hands[ev.hand];
        if (hand) hand.outcome = 'bust';
        if (this.b3) await this.b3.collectLoss(ev.pid, ev.hand);
        this.renderLabels();
        await sleep(250);
        return;
      }
      case 'reveal':
        d.dealer[1] = ev.card;
        if (this.b3) await this.b3.revealHole(ev.card);
        else Sound.play('card');
        this.refresh();
        await sleep(250);
        return;
      case 'dealerCard':
        d.dealer.push(ev.card);
        if (this.b3) await this.b3.dealCard('dealer', ev.card);
        else Sound.play('card');
        this.refresh();
        return;
      case 'settle':
        await this.showSettle(ev);
        return;
      case 'broke':
        Sound.play('bankrupt');
        this.showBanner(ev.pid === this.me ? 'Plus de jetons !' : `${p ? p.name : ''} n'a plus de jetons`, `Éliminé(e) · ${ev.rank}e`, '#9aa0c7', 1500);
        await sleep(500);
        return;
      case 'out':
        this.showBanner(`${p ? p.name : ''} quitte la table`, '', '#9aa0c7', 1200, '.small');
        return;
      case 'over':
        Sound.play('win');
        return;
    }
  }

  /** Paiements : la banque paie, ramasse ou rend chaque mise, puis le résultat s'affiche. */
  async showSettle(ev) {
    const d = this.disp;
    if (ev.dealer > 21) this.showBanner('La banque saute !', `${ev.dealer} : toutes les mains en jeu gagnent`, '#2ecc71', 1500, '.small');
    for (const r of ev.results) {
      const hand = d.players[r.pid] && d.players[r.pid].hands[r.hand];
      if (hand) {
        hand.outcome = r.outcome;
        hand.payout = r.payout;
      }
    }
    this.renderLabels();
    const anims = ev.results.map(async (r, i) => {
      await sleep(i * 160);
      const n = d.players[r.pid] ? d.players[r.pid].hands.length : 1;
      if (this.b3) {
        if (r.outcome === 'win' || r.outcome === 'blackjack') await this.b3.payWin(r.pid, r.hand, n, r.bet, r.payout);
        else if (r.outcome === 'push') await this.b3.pushBack(r.pid, r.hand);
        else await this.b3.collectLoss(r.pid, r.hand);
      }
      d.players[r.pid].chips += r.payout;
      if (this.b3) this.b3.setChipsBj(r.pid, d.players[r.pid].chips);
      if (r.outcome === 'win' || r.outcome === 'blackjack') this.seatBubble(r.pid, `+${fmt(r.net)}`, '.win', 1600);
      this.renderSeats();
      this.renderDock();
    });
    await Promise.all(anims);
    const mine = ev.results.filter((r) => r.pid === this.me);
    if (mine.length) {
      const net = mine.reduce((s, r) => s + r.net, 0);
      if (net > 0) {
        Sound.play('cash');
        this.showBanner(mine.some((r) => r.outcome === 'blackjack') ? 'Blackjack !' : 'Gagné !', `+${fmt(net)} jetons`, '#2ecc71', 1500);
        if (net >= 100) confetti(900);
      } else if (net < 0) this.showBanner('Perdu', `${fmt(net)} jetons`, '#ff5a5f', 1300, '.small');
      else this.showBanner('Égalité', 'Mise rendue', '#3fa7ff', 1200, '.small');
    }
    this.renderLabels();
    await sleep(900);
  }

  onEmote({ key, emoji }) {
    this.seatBubble(key, REACTIONS[emoji] ? reactionEl(emoji) : h('span', emoji), '.emote', 2200);
  }

  updateTimer() {
    const st = this.state;
    if (!st || st.over) return;
    const bars = [...this.cornersEl.querySelectorAll('.pcard-timer'), this.statusEl.querySelector('.pk-timer i')].filter(Boolean);
    if (!bars.length) return;
    const left = st.deadline ? st.deadline - (Date.now() + this.v.clockOffset) : 0;
    if (st.deadline !== this.dlSeen) {
      this.dlSeen = st.deadline;
      this.dlTotal = Math.max(1000, left);
    }
    const frac = Math.max(0, Math.min(1, left / (this.dlTotal || 20000)));
    for (const b of bars) {
      b.hidden = !st.deadline;
      b.style.transform = `scaleX(${frac})`;
      b.classList.toggle('urgent', left < 5000);
    }
    const secs = Math.ceil(left / 1000);
    if ((st.legal || st.canBet) && left < 5000 && left > 0 && secs !== this.lastTick) {
      this.lastTick = secs;
      Sound.play('tick');
    }
  }

  // ========================================================= fin de partie
  renderEnd() {
    const v = this.v;
    if (!v.endOverlay || !this.room || this.room.state !== 'ended' || this.busy) return;
    const res = this.room.result;
    if (!res || !this.state) return;
    if (v.endPending) {
      v.endPending = false;
      confetti(4500);
    }
    const ov = v.endOverlay;
    ov.hidden = false;
    ov.innerHTML = '';
    const ranked = res.players.slice().sort((a, b) => a.rank - b.rank);
    const info = (pl) => this.state.players.find((x) => x.id === pl.id) || {};
    const winner = ranked[0];
    const start = this.room.settings.startChips;
    const medal = (n) => h('span.pk-medal.m' + n, String(n));
    const solo = ranked.length === 1;
    const podium = h('div.podium', [ranked[1], ranked[0], ranked[2]].map((pl) => {
      if (!pl) return h('div.podium-slot.empty');
      const i = info(pl);
      return h('div.podium-slot.p' + pl.rank,
        h('div.avatar.lg.pk-avatar', { style: { '--c': i.color } }, h('span.pk-initials', initials(pl.name))),
        h('div.podium-name', h('span.' + (nameClass(i) || 'plain'), pl.name), ...roleTags(i, { level: false })),
        h('div.podium-step', medal(pl.rank)),
        h('div.podium-worth', pl.chips ? `${fmt(pl.chips)} jetons` : 'Plus de jetons')
      );
    }));
    const rw = v.rewards;
    const title = solo ? (winner.chips > start ? 'Vous avez battu la banque !' : 'La banque gagne cette fois…') : winner.id === this.me ? 'VICTOIRE !' : `${winner.name} gagne !`;
    ov.append(
      h('div.end-card',
        h('div.end-title', title),
        h('div.end-sub', `Blackjack · ${res.rounds} manche${res.rounds > 1 ? 's' : ''} · ${duration(res.duration)}${solo ? ` · ${winner.chips >= start ? '+' : ''}${fmt(winner.chips - start)} jetons` : ''}`),
        podium,
        h('div.end-list', ranked.slice(3).map((pl) => h('div.end-row', `${pl.rank}. ${pl.name}`, h('span', fmt(pl.chips))))),
        rw ? h('div.rewards',
          h('div.reward', `+${rw.xp} XP`),
          rw.badges.length ? h('div.new-badges', h('div.small', 'Nouveaux badges débloqués !'), rw.badges.map((b) => h('div.badge.tier-' + b.tier, h('div.badge-icon', b.icon), h('div.badge-name', b.name)))) : null
        ) : !store.user ? h('div.hint', h('a', { href: '/register', 'data-link': true }, 'Créez un compte'), ' pour enregistrer vos victoires, gagner de l\'XP et des badges !') : null,
        h('div.btn-row.center',
          v.isHost ? h('button.btn.primary.lg', { onclick: () => v.cmd('room:rematch') }, 'Rejouer') : h('div.muted', 'L\'hôte peut relancer une partie.'),
          v.isHost ? h('button.btn.ghost', { onclick: () => v.openGameChooser() }, 'Changer de jeu') : null,
          h('button.btn.ghost', { onclick: () => (ov.hidden = true) }, 'Voir la table'),
          h('button.btn.ghost', { onclick: () => navigate('/') }, 'Accueil')
        )
      )
    );
    if (rw && rw.badges.length && !this.badgeSound) {
      this.badgeSound = true;
      Sound.play('festival');
    }
  }
}
