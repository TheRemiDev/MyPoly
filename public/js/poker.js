// ============================================================================
//  MyPoly — Poker (Texas Hold'em sans limite) : table de jeu (vue client)
//  Le serveur est seul maître du jeu : ce module affiche, anime et conseille.
//  Mode Débutant : force de la main, chances de gagner, cote du pot, conseil.
// ============================================================================
import './poker-eval.js';
import { h, toast, modal, roleTags, roleRibbons, nameClass, sleep, confetti, duration, storage } from './util.js';
import { store, emit } from './store.js';
import * as Sound from './sound.js';
import { navigate } from './app.js';
import { webglAvailable } from './board3d.js';
import { Poker3D } from './poker3d.js';
import { cardImg, chipImg, handChart, displayCat, HAND_RANKS, REACTIONS, reactionEl, initials, suitURL } from './poker-art.js';
import { icon } from './icons.js';

const E = globalThis.PokerEval;

export const POKER_SETTINGS_UI = [
  { group: 'Partie', items: [
    { key: 'maxPlayers', label: 'Joueurs max', type: 'select', options: [2, 3, 4, 5, 6].map((n) => [n, n + ' joueurs']) },
    { key: 'startStack', label: 'Jetons de départ', type: 'select', options: [500, 1000, 2000, 5000, 10000].map((n) => [n, n.toLocaleString('fr-FR') + ' jetons']) },
    { key: 'bigBlind', label: 'Blindes de départ', type: 'select', options: [10, 20, 40, 50, 100, 200].map((n) => [n, `${n / 2} / ${n}`]), hint: 'Petite blinde / grosse blinde : les mises obligatoires de chaque main' },
    { key: 'blindUp', label: 'Montée des blindes', type: 'select', options: [[0, 'Jamais'], [4, 'Toutes les 4 mains'], [6, 'Toutes les 6 mains'], [8, 'Toutes les 8 mains'], [12, 'Toutes les 12 mains'], [20, 'Toutes les 20 mains']], hint: 'Les blindes doublent régulièrement pour que la partie avance' },
    { key: 'turnTime', label: 'Temps par décision', type: 'select', options: [[15, '15 s'], [20, '20 s'], [25, '25 s'], [30, '30 s'], [45, '45 s'], [60, '60 s'], [0, 'Illimité']] },
    { key: 'maxHands', label: 'Fin de partie', type: 'select', options: [[0, 'Jusqu\'au dernier joueur'], [20, 'Après 20 mains'], [30, 'Après 30 mains'], [50, 'Après 50 mains'], [100, 'Après 100 mains']], hint: 'Avec une limite, le plus gros tapis gagne à la fin' },
  ] },
  { group: 'Salle', items: [
    { key: 'isPublic', label: 'Salle publique', type: 'toggle', hint: 'Visible dans la liste des salles de l\'accueil' },
    { key: 'allowSpectators', label: 'Spectateurs autorisés', type: 'toggle' },
  ] },
];

export const POKER_PRESETS = {
  Classique: { startStack: 1000, bigBlind: 20, blindUp: 8, turnTime: 25, maxHands: 0 },
  Turbo: { startStack: 1000, bigBlind: 40, blindUp: 4, turnTime: 15, maxHands: 0 },
  'Gros tapis': { startStack: 5000, bigBlind: 20, blindUp: 12, turnTime: 30, maxHands: 0 },
  'Partie courte': { startStack: 1000, bigBlind: 20, blindUp: 6, turnTime: 20, maxHands: 30 },
  Apprentissage: { startStack: 2000, bigBlind: 20, blindUp: 0, turnTime: 60, maxHands: 40 },
};

const fmt = (n) => Math.round(n || 0).toLocaleString('fr-FR');
const ACT_LABEL = { fold: 'Couché', check: 'Parole', call: 'Suit', bet: 'Mise', raise: 'Relance', allin: 'Tapis', sb: 'Petite blinde', bb: 'Grosse blinde' };
const STREET_LABEL = { preflop: 'Pré-flop', flop: 'Flop', turn: 'Turn', river: 'River', showdown: 'Abattage' };
/** Explications du mode Débutant pour chaque étape d'une main. */
const STREET_HELP = {
  preflop: 'Chacun a reçu 2 cartes cachées. Les deux joueurs à gauche du donneur ont payé les blindes (mises obligatoires). Tu peux suivre la mise, relancer ou te coucher.',
  flop: 'Le flop : 3 cartes communes, que tout le monde peut utiliser avec ses 2 cartes. Ta main = les 5 meilleures cartes parmi tes 2 + les cartes communes.',
  turn: 'Le turn : une 4e carte commune. Plus que deux cartes à venir… ou une seule après celle-ci.',
  river: 'La river : la 5e et dernière carte commune. Après ce tour d\'enchères, on compare les mains.',
  showdown: 'L\'abattage : les joueurs encore en jeu montrent leurs cartes, la meilleure main de 5 cartes gagne le pot.',
};
/** Une phrase simple pour chaque type de main (mode Débutant). */
const CAT_HELP = [
  'Pas de combinaison : seule ta carte la plus haute compte.',
  'Deux cartes de même hauteur.',
  'Deux paires différentes.',
  'Trois cartes de même hauteur.',
  'Cinq cartes qui se suivent.',
  'Cinq cartes de la même couleur.',
  'Un brelan et une paire en même temps.',
  'Quatre cartes de même hauteur : très rare !',
  'Cinq cartes qui se suivent, de la même couleur : exceptionnel !',
  'La meilleure main possible !',
];

export class PokerTable {
  constructor(view) {
    this.v = view;
    this.state = null;
    this.queue = [];
    this.busy = false;
    this.coach = storage('pokerCoach') !== 'off';
    // Sur téléphone, le panneau Débutant démarre replié (une ligne de résumé)
    this.coachMin = window.innerWidth < 1100;
    this.raiseOpen = false;
    this.eqCache = {};
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
  isPlaying() {
    const me = this.player(this.me);
    return !!(me && !me.out);
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
    // Zone du joueur (bas de l'écran) : ma main, mes actions
    this.statusEl = h('div.pk-status');
    this.myHandEl = h('div.pk-myhand');
    this.actionsEl = h('div.pk-actions');
    this.raiseEl = h('div.pk-raise', { hidden: true });
    this.dock = h('div.pk-dock', this.statusEl, this.myHandEl, this.raiseEl, this.actionsEl);
    // Mode Débutant : panneau de conseils
    this.coachEl = h('div.pk-coach', { hidden: true });
    // Table 2D de secours (sans WebGL)
    this.felt2d = h('div.pk-felt2d', h('div.pk-felt2d-board'), h('div.pk-felt2d-pot'));
    v.notifStacks = Object.fromEntries(['tl', 'tr', 'bl', 'br', 'mid'].map((k) => [k, h('div.notif-stack.ns-' + k)]));
    v.gameEl = h('div.game.poker-game', this.host, this.felt2d, this.labels, v.playersEl, this.cornersEl, this.fx, this.coachEl, this.dock, ...Object.values(v.notifStacks), this.banner, h('div.topbar', v.toolbar, v.popover));
    v.root.append(v.gameEl, v.endOverlay);
    if (webglAvailable()) {
      try {
        this.b3 = new Poker3D(this.host, {
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
      if (!L || this.lock) return;
      const k = e.key.toLowerCase();
      if (k === 'f') this.act('fold');
      else if (k === 'c') this.act(L.canCheck ? 'check' : 'call');
      else if (k === 'r' && L.canRaise) this.toggleRaise(true);
      else if (k === 'escape') this.toggleRaise(false);
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

  // =========================================================== barre d'outils
  renderToolbar() {
    const v = this.v;
    if (!v.toolbar) return;
    const st = this.state;
    const me = this.player(this.me);
    v.buildToolbar({
      info: st ? `Main ${st.hand} · ${fmt(st.blinds.sb)}/${fmt(st.blinds.bb)}` : 'Poker',
      camera: this.b3 ? () => this.b3.resetView() : null,
      rules: () => this.showRules(),
      forfeit: me && !me.out && this.room.state === 'playing' ? () => this.forfeit() : null,
      extra: [{ name: 'coach', title: this.coach ? 'Mode Débutant activé (cliquer pour le couper)' : 'Activer le mode Débutant : conseils et explications', onclick: () => this.setCoach(!this.coach), on: this.coach, label: 'Débutant' }],
    });
  }

  setCoach(on) {
    this.coach = on;
    storage('pokerCoach', on ? 'on' : 'off');
    toast(on ? 'Mode Débutant activé : conseils, chances de gagner et explications à chaque étape.' : 'Mode Débutant désactivé.', 'info', 3500);
    this.renderAll();
  }

  showRules() {
    const s = this.room.settings;
    modal({
      title: 'Règles du poker (Texas Hold\'em)',
      className: 'pk-rules-modal',
      body: h('div.rules-summary.pk-rules',
        h('p', 'Chaque joueur reçoit ', h('b', '2 cartes cachées'), '. Puis 5 ', h('b', 'cartes communes'), ' sont retournées au milieu (3, puis 1, puis 1). Ta main, ce sont les ', h('b', '5 meilleures cartes'), ' parmi tes 2 cartes et les 5 communes.'),
        h('p', 'À chaque étape, on mise à tour de rôle : ', h('b', 'parler'), ' (ne rien miser si personne n\'a misé), ', h('b', 'suivre'), ' (égaler la mise), ', h('b', 'relancer'), ' (miser plus) ou ', h('b', 'se coucher'), ' (abandonner la main). Le dernier joueur en jeu, ou la meilleure main à la fin, remporte le pot.'),
        h('p', 'Les ', h('b', 'blindes'), ' sont deux mises obligatoires payées à gauche du donneur (bouton D) : elles lancent le pot. ', h('b', 'Tapis'), ' : miser tous ses jetons. Un joueur sans jetons est éliminé ; le dernier en lice gagne la partie.'),
        h('div.muted', `${fmt(s.startStack)} jetons au départ · blindes ${fmt(s.bigBlind / 2)}/${fmt(s.bigBlind)}${s.blindUp ? `, qui doublent toutes les ${s.blindUp} mains` : ''} · ${s.turnTime ? s.turnTime + ' s par décision' : 'temps illimité'}${s.maxHands ? ` · fin après ${s.maxHands} mains` : ''}`),
        h('h3', 'Classement des mains'),
        handChart(this.myCat()),
        h('div.muted', 'Raccourcis : F se coucher · C parler / suivre · R relancer')
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
      this.renderActions();
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
    // Modèle affiché (mis à jour pas à pas pendant les animations)
    this.disp = {
      players: Object.fromEntries(st.players.map((p) => [p.id, { stack: p.stack, bet: p.bet, folded: p.folded, hasCards: p.hasCards, cards: p.cards, last: p.last, allIn: p.allIn }])),
      board: st.board.slice(),
      pot: st.potBefore,
      dealer: st.dealer,
    };
    if (first || instant) {
      this.v.logEl.innerHTML = '';
      for (const l of st.log) this.addLog(l, true);
    }
    if (!st.legal) this.raiseOpen = false;
    this.renderAll();
    this.syncTable();
  }

  syncTable() {
    const st = this.state;
    if (!st || !this.b3) return;
    const d = this.disp;
    this.b3.sync({
      players: st.players.map((p) => ({ id: p.id, ...d.players[p.id] })),
      board: d.board,
      pot: d.pot,
      dealer: d.dealer,
      current: st.current,
      hole: st.hole,
      me: this.me,
      highlight: this.highlightCards(),
    });
    const cur = this.player(st.current);
    this.b3.setTurnColor(cur && cur.color);
  }

  /** Cartes à mettre en valeur : main gagnante après l'abattage, sinon ma meilleure main (mode Débutant). */
  highlightCards() {
    const st = this.state;
    if (!st) return [];
    if (st.phase === 'between' && st.lastShowdown && st.lastShowdown.hands.length) {
      const pot = st.lastShowdown.pots[0];
      const w = st.lastShowdown.hands.find((x) => pot && pot.winners.includes(x.pid));
      return w ? w.best : [];
    }
    if (this.coach && st.hole && st.board.length >= 3 && !this.player(this.me)?.folded) return E.coreCards(st.hole.concat(st.board));
    return [];
  }

  renderAll() {
    this.renderSeats();
    this.renderLabels();
    this.renderDock();
    this.renderActions();
    this.renderCoach();
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
  /** Moi en bas, les autres dans l'ordre de jeu (sens des aiguilles d'une montre). */
  seatOrder() {
    const list = this.state.players.filter((p) => !p.out || p.id === this.me || this.state.over);
    const all = this.state.players;
    const i = all.findIndex((p) => p.id === this.me);
    const ordered = i < 0 ? all : all.slice(i).concat(all.slice(0, i));
    const shown = ordered.filter((p) => list.includes(p));
    if (i < 0) return { mine: shown[0] || null, others: shown.slice(1), spectator: true };
    return { mine: shown[0], others: shown.slice(1), spectator: false };
  }
  seatMap() {
    const { mine, others } = this.seatOrder();
    const slots = Poker3D.slotsFor(others.length);
    const map = {};
    if (mine) map[mine.id] = 'me';
    others.forEach((p, k) => (map[p.id] = slots[k]));
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
      const d = this.disp.players[p.id] || p;
      const turn = st.current === p.id && !st.over;
      const isMe = p.id === this.me;
      const pos = [st.dealer === p.id ? h('span.pk-pos.d', { title: 'Donneur (bouton) : parle en dernier après le flop' }, 'D') : null,
        st.sbPid === p.id ? h('span.pk-pos.sb', { title: `Petite blinde : mise obligatoire de ${fmt(st.blinds.sb)}` }, 'PB') : null,
        st.bbPid === p.id ? h('span.pk-pos.bb', { title: `Grosse blinde : mise obligatoire de ${fmt(st.blinds.bb)}` }, 'GB') : null];
      const last = d.last && d.last.a;
      const card = h('div.pcard.corner.pk-seat.c-' + (slot === 'me' ? 'bl' : slot) + (turn ? '.turn' : '') + (d.folded ? '.folded' : '') + (p.out ? '.out' : '') + (isMe ? '.me' : '') + (p.vip ? '.vip' : '') + (d.allIn && !d.folded ? '.allin' : ''),
        { 'data-pid': p.id, style: { '--c': p.color } },
        h('div.pc-face'),
        roleRibbons(p),
        h('div.pc-avatar.pk-avatar', h('span.pk-initials', p.out ? '×' : initials(p.name))),
        h('div.pc-body',
          h('div.pc-name', h('span.pc-name-text.' + (nameClass(p) || 'plain'), p.name), ...roleTags(p, { level: false, compact: true })),
          h('div.pc-cash.pk-stack', chipImg(1000, '.sm'), p.out ? (p.rank ? `Éliminé · ${p.rank}e` : 'Éliminé') : fmt(d.stack)),
          h('div.pc-chips.pk-tags',
            ...pos,
            last && !p.out ? h('span.pk-act.a-' + last, ACT_LABEL[last] + (d.last.amount && last !== 'fold' && last !== 'check' ? ' ' + fmt(d.last.amount) : '')) : null,
            !p.isBot && !p.connected ? h('span.pk-act.off', { title: 'Déconnecté' }, 'Hors ligne') : p.afk ? h('span.pk-act.off', 'Absent') : null
          )
        ),
        turn ? h('div.pcard-turn', isMe ? 'À VOUS' : 'PARLE…') : null,
        turn ? h('div.pcard-timer') : null,
        // Cartes montrées (abattage) : visibles aussi sur la fiche
        d.cards && !isMe && !this.b3 ? h('div.pk-seatcards', d.cards.map((c) => cardImg(c, '.mini'))) : null,
        !this.b3 && d.hasCards && !d.cards && !isMe ? h('div.pk-seatcards', cardImg(null, '.mini'), cardImg(null, '.mini')) : null
      );
      this.cornersEl.append(card);
    }
    this.placeSeatCards();
  }

  /** Fiches collées au bord de la table, derrière les cartes de chaque joueur. */
  placeSeatCards() {
    const box = this.cornersEl.getBoundingClientRect();
    // Place réservée à droite (panneau du mode Débutant sur grand écran)
    const safeR = parseFloat(getComputedStyle(this.v.gameEl).getPropertyValue('--safe-r')) || 0;
    for (const card of this.cornersEl.querySelectorAll('.pcard.corner:not(.me)')) {
      const pid = card.dataset.pid;
      let a = this.b3 ? this.b3.seatAnchor(pid) : this.anchor2d(pid);
      if (!a) continue;
      let x = a.x - box.left;
      let y = a.y - box.top;
      card.classList.remove('seat-compact');
      if (/^t/.test(a.slot) && y - card.offsetHeight < 70) card.classList.add('seat-compact');
      const w = card.offsetWidth;
      const hh = card.offsetHeight;
      if (a.slot === 'bl' || a.slot === 'tl') x -= w * 0.85;
      else if (a.slot === 'br' || a.slot === 'tr') x -= w * 0.15;
      else x -= w / 2;
      y -= /^t/.test(a.slot) ? hh : hh * 0.35;
      x = Math.max(8, Math.min(box.width - safeR - w - 8, x));
      y = Math.max(70, Math.min(box.height - hh - 8, y));
      Object.assign(card.style, { left: Math.round(x) + 'px', top: Math.round(y) + 'px', right: 'auto', bottom: 'auto', translate: 'none' });
    }
  }
  /** Sans WebGL : places sur une ellipse dessinée en CSS. */
  anchor2d(pid) {
    const map = this.seatMap();
    const slot = map[pid];
    const P = { tm: [0.5, 0.2], tl: [0.2, 0.28], tr: [0.8, 0.28], bl: [0.16, 0.66], br: [0.84, 0.66] };
    const p = P[slot];
    if (!p) return null;
    const r = this.felt2d.getBoundingClientRect();
    return { slot, x: r.left + p[0] * r.width, y: r.top + p[1] * r.height + (/^t/.test(slot) ? 0 : 0) };
  }

  /** Étiquettes flottantes : mises devant chaque joueur et montant du pot. */
  renderLabels() {
    const st = this.state;
    this.labels.innerHTML = '';
    if (!st) return;
    const box = this.v.gameEl.getBoundingClientRect();
    const place = (el, pt) => {
      if (!pt) return;
      el.style.left = pt.x - box.left + 'px';
      el.style.top = pt.y - box.top + 'px';
      this.labels.append(el);
    };
    const map = this.seatMap();
    for (const p of st.players) {
      const d = this.disp.players[p.id];
      if (!d || !d.bet || !map[p.id]) continue;
      const pt = this.b3 ? this.b3.betScreen(p.id) : this.bet2d(p.id);
      place(h('div.pk-betlabel', { style: { '--c': p.color } }, fmt(d.bet)), pt);
    }
    const pot = this.disp.pot;
    if (pot > 0) place(h('div.pk-potlabel', h('small', 'Pot'), fmt(pot)), this.b3 ? this.b3.potScreen() : this.pot2d());
    // Nom de ma main, sous mes cartes
    if (this.b3 && st.hole && !this.player(this.me)?.folded) {
      const pt = this.b3.seatScreen(this.me);
      const name = this.myHandName();
      if (pt && name) place(h('div.pk-handlabel', name), { x: pt.x, y: pt.y + 4 });
    }
  }
  bet2d(pid) {
    const a = this.anchor2d(pid);
    const r = this.felt2d.getBoundingClientRect();
    if (!a) {
      if (pid !== this.me) return null;
      return { x: r.left + r.width / 2, y: r.top + r.height * 0.78 };
    }
    return { x: a.x + (r.left + r.width / 2 - a.x) * 0.35, y: a.y + (r.top + r.height / 2 - a.y) * 0.35 };
  }
  pot2d() {
    const r = this.felt2d.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height * 0.3 };
  }
  render2d() {
    if (this.b3 || !this.state) return;
    const [boardEl, potEl] = this.felt2d.children;
    const board = this.disp.board;
    boardEl.replaceChildren(...[0, 1, 2, 3, 4].map((k) => (board[k] != null ? cardImg(board[k], '.board' + (this.highlightCards().includes(board[k]) ? '.hl' : '')) : h('div.pk-slot'))));
    potEl.textContent = '';
  }

  /** Nom de ma meilleure main actuelle. */
  myHandName() {
    const st = this.state;
    if (!st || !st.hole) return '';
    if (!st.board.length) {
      const sh = E.startingHand(st.hole);
      return sh.code.charAt(0).toUpperCase() + sh.code.slice(1);
    }
    return E.describe(E.evaluate(st.hole.concat(st.board)));
  }
  myCat() {
    const st = this.state;
    if (!st || !st.hole || st.board.length < 3) return -1;
    return displayCat(E.evaluate(st.hole.concat(st.board)));
  }

  // ================================================================ zone du joueur
  renderDock() {
    const st = this.state;
    if (!st) return;
    const me = this.player(this.me);
    const cur = this.player(st.current);
    // Ligne d'état
    let status = '';
    if (st.over) status = 'Partie terminée';
    else if (st.phase === 'between') status = 'Main suivante dans un instant…';
    else if (!me) status = `Vous regardez la partie${cur ? ` · ${cur.name} réfléchit…` : ''}`;
    else if (me.out) status = me.rank ? `Vous êtes éliminé(e) (${me.rank}e) : vous pouvez continuer à regarder.` : 'Vous avez quitté la table.';
    else if (me.folded && st.phase === 'bet') status = `Vous êtes couché(e) pour cette main${cur ? ` · ${cur.name} réfléchit…` : ''}`;
    else if (st.current === this.me) status = st.legal && st.legal.toCall ? `À vous : ${fmt(st.legal.toCall)} pour suivre` : 'À vous de parler';
    else if (cur) status = `${cur.name} réfléchit…`;
    this.statusEl.replaceChildren(h('span', status), st.current && st.deadline ? h('div.pk-timer', h('i')) : null);
    this.statusEl.classList.toggle('mine', st.current === this.me);
    // Ma main (cartes en grand sur petit écran, nom de la main)
    this.myHandEl.innerHTML = '';
    if (st.hole && me && !me.out) {
      const best = this.coach ? this.highlightCards() : [];
      this.myHandEl.append(
        h('div.pk-mycards' + (me.folded ? '.folded' : ''), st.hole.map((c) => cardImg(c, '.hole' + (best.includes(c) ? '.hl' : '')))),
        h('div.pk-myhand-text', h('small', me.folded ? 'Couché' : 'Ta main'), h('b', this.myHandName()))
      );
    }
    this.dock.classList.toggle('empty', !this.myHandEl.childElementCount && !st.legal);
  }

  renderActions() {
    const st = this.state;
    const el = this.actionsEl;
    el.innerHTML = '';
    this.raiseEl.hidden = true;
    if (!st || !st.legal || this.lock || st.over) return;
    const L = st.legal;
    const me = this.player(this.me);
    const pick = this.coach ? this.advice()?.key : null;
    const sub = (t) => (this.coach ? h('small', t) : null);
    const btn = (key, cls, label, s, fn) => h('button.btn.pk-btn.' + cls + (pick === key ? '.coach-pick' : ''), { onclick: fn }, h('span', label), sub(s));
    el.append(
      btn('fold', 'fold', 'Se coucher', 'Abandonner la main', () => this.act('fold')),
      L.canCheck
        ? btn('check', 'check', 'Parler', 'Ne rien miser', () => this.act('check'))
        : btn('call', 'call', `Suivre ${fmt(L.toCall)}`, me && L.toCall >= me.stack ? 'Tous tes jetons' : 'Égaler la mise', () => this.act('call')),
      L.canRaise && L.maxTo > L.minTo ? btn('raise', 'raise', L.currentBet ? 'Relancer' : 'Miser', L.currentBet ? 'Augmenter la mise' : 'Mettre des jetons', () => this.toggleRaise(!this.raiseOpen)) : null,
      L.canRaise ? btn('allin', 'allin', `Tapis ${fmt(L.maxTo)}`, 'Miser tous tes jetons', () => this.act('allin')) : null
    );
    if (this.raiseOpen) this.renderRaise();
  }

  toggleRaise(open) {
    this.raiseOpen = open && !!(this.state && this.state.legal);
    this.renderActions();
  }

  renderRaise() {
    const st = this.state;
    const L = st.legal;
    const pot = st.pot;
    const step = Math.max(1, st.blinds.sb);
    const clamp = (x) => Math.max(L.minTo, Math.min(L.maxTo, Math.round(x / step) * step));
    if (this.raiseTo == null || this.raiseTo < L.minTo || this.raiseTo > L.maxTo) this.raiseTo = L.minTo;
    const amount = h('b.pk-raise-amount');
    const range = h('input.pk-range', { type: 'range', min: L.minTo, max: L.maxTo, step, value: this.raiseTo });
    const go = h('button.btn.primary.pk-raise-go');
    const update = (val) => {
      this.raiseTo = clamp(val);
      range.value = this.raiseTo;
      amount.textContent = fmt(this.raiseTo);
      const all = this.raiseTo >= L.maxTo;
      go.textContent = all ? `Tapis : ${fmt(L.maxTo)}` : `${L.currentBet ? 'Relancer à' : 'Miser'} ${fmt(this.raiseTo)}`;
      go.classList.toggle('allin', all);
    };
    range.addEventListener('input', () => update(Number(range.value)));
    // Taille d'une relance « au pot » : le pot après avoir suivi
    // Relance « au pot » : le montant du pot une fois la mise suivie, ajouté à la mise en cours
    const potTo = (frac) => L.currentBet + (pot + L.toCall) * frac;
    const presets = [
      ['Min', L.minTo],
      ['½ pot', potTo(0.5)],
      ['¾ pot', potTo(0.75)],
      ['Pot', potTo(1)],
      ['Tapis', L.maxTo],
    ];
    go.addEventListener('click', () => this.act(this.raiseTo >= L.maxTo ? 'allin' : 'raise', { to: this.raiseTo }));
    this.raiseEl.replaceChildren(
      h('div.pk-raise-top', h('span', L.currentBet ? 'Relancer à' : 'Miser'), amount, h('button.icon-btn.pk-raise-close', { title: 'Fermer', onclick: () => this.toggleRaise(false) }, '✕')),
      h('div.pk-raise-row',
        h('button.btn.ghost.sm.pk-step', { onclick: () => update(this.raiseTo - Math.max(step, st.blinds.bb)) }, '−'),
        range,
        h('button.btn.ghost.sm.pk-step', { onclick: () => update(this.raiseTo + Math.max(step, st.blinds.bb)) }, '+')
      ),
      h('div.pk-presets', presets.map(([label, val]) => h('button.btn.ghost.sm', { onclick: () => update(val) }, label))),
      this.coach ? h('div.pk-raise-help', 'Une relance oblige les autres à remettre des jetons pour rester dans le coup. « Pot » = miser autant que ce qu\'il y a déjà au milieu.') : null,
      go
    );
    update(this.raiseTo);
    this.raiseEl.hidden = false;
  }

  async act(type, data = {}) {
    if (!this.state || !this.state.legal || this.lock) return;
    Sound.play('click');
    this.lock = true;
    this.raiseOpen = false;
    this.renderActions();
    const res = await emit('game:action', { type, ...data });
    this.lock = false;
    if (res && res.error) {
      Sound.play('error');
      toast(res.error, 'error');
      this.renderActions();
    }
  }

  // ================================================================ mode Débutant
  /** Mes chances de gagner (simulation), mises en cache pour une même situation. */
  equity() {
    const st = this.state;
    if (!st || !st.hole) return null;
    const opp = st.players.filter((p) => p.id !== this.me && p.inHand && !p.folded).length;
    if (!opp) return null;
    const key = st.hole.join(',') + '|' + st.board.join(',') + '|' + opp;
    if (!this.eqCache[key]) {
      const keys = Object.keys(this.eqCache);
      if (keys.length > 40) delete this.eqCache[keys[0]];
      this.eqCache[key] = { ...E.equity(st.hole, st.board, opp, 1600), opp };
    }
    return this.eqCache[key];
  }
  /** Conseil simple : quoi faire, et pourquoi. */
  advice() {
    const st = this.state;
    if (!st || !st.legal || !st.hole) return null;
    const eq = this.equity();
    if (!eq) return null;
    const L = st.legal;
    const p = eq.win + eq.tie;
    const rel = p * (eq.opp + 1);
    const pot = st.pot;
    if (L.canCheck) {
      if (rel >= 1.5 && L.canRaise) return { key: 'raise', label: 'Miser', why: 'Ta main est au-dessus de la moyenne : mise pour faire grossir le pot pendant que tu es devant.' };
      return { key: 'check', label: 'Parler', why: 'Personne n\'a misé : tu vois la suite gratuitement. Pas besoin de te coucher !' };
    }
    const need = L.toCall / (pot + L.toCall);
    if (L.canRaise && rel >= 1.8 && p >= need + 0.15) return { key: 'raise', label: 'Relancer', why: 'Ta main est forte : relance pour gagner plus quand tu es devant.' };
    if (p >= need) return { key: 'call', label: 'Suivre', why: `Tu gagnes assez souvent (${Math.round(p * 100)} %) pour le prix demandé (il faut ${Math.round(need * 100)} %) : suivre est rentable à long terme.` };
    return { key: 'fold', label: 'Se coucher', why: `Suivre coûte trop cher pour tes chances (${Math.round(p * 100)} % alors qu\'il faudrait ${Math.round(need * 100)} %). Économise tes jetons pour une meilleure main.` };
  }

  renderCoach() {
    const st = this.state;
    const el = this.coachEl;
    const me = this.player(this.me);
    el.hidden = !this.coach || !st || !me || st.over;
    // Grand écran : la table se décale pour laisser la place au panneau
    const on = !el.hidden;
    if (this.v.gameEl.classList.contains('coach-on') !== on) {
      this.v.gameEl.classList.toggle('coach-on', on);
      if (this.b3) requestAnimationFrame(() => {
        this.b3.resize();
        this.renderSeats();
        this.renderLabels();
      });
    }
    if (el.hidden) return;
    el.innerHTML = '';
    // Résumé (toujours visible, seul affiché quand le panneau est replié)
    const adv0 = st.legal ? this.advice() : null;
    const eq0 = st.hole && !me.folded && !me.out ? this.equity() : null;
    const sum = [adv0 ? h('b.pk-sum-adv', adv0.label) : null, eq0 ? h('span.pk-sum-eq', Math.round((eq0.win + eq0.tie) * 100) + ' % de chances') : null].filter(Boolean);
    el.classList.toggle('min', this.coachMin);
    const head = h('div.pk-coach-head', { onclick: () => {
      this.coachMin = !this.coachMin;
      el.classList.toggle('min', this.coachMin);
    } },
      h('span.pk-coach-ico', { html: icon('coach') }),
      h('div.pk-coach-headtxt', h('b', 'Mode Débutant'), sum.length ? h('span.pk-coach-sum', ...sum) : h('span.pk-coach-sum', 'Touchez pour les explications')),
      h('span.pk-coach-x', { title: this.coachMin ? 'Déplier' : 'Replier' }, this.coachMin ? '+' : '–'));
    el.append(head);
    const body = h('div.pk-coach-body');
    el.append(body);
    const street = st.phase === 'between' ? 'showdown' : st.street;
    body.append(h('div.pk-coach-step', h('span.pk-street', STREET_LABEL[street] || ''), h('p', STREET_HELP[street] || '')));
    if (me.out) {
      body.append(h('p.muted', 'Tu es éliminé(e) : regarde comment jouent les autres, et ouvre le classement des mains pour réviser.'));
    } else if (st.hole && !me.folded) {
      // Ma main
      if (!st.board.length) {
        const sh = E.startingHand(st.hole);
        body.append(h('div.pk-coach-block',
          h('div.pk-coach-title', 'Tes cartes de départ'),
          h('div.pk-meter', h('i', { style: { width: Math.max(4, sh.pct) + '%', '--m': meterColor(sh.pct / 100) } })),
          h('p', h('b', sh.label), ` (${sh.code}). `, sh.pct >= 45 ? 'Tu peux jouer cette main avec confiance.' : sh.pct >= 25 ? 'Jouable, surtout si ça ne coûte pas cher.' : 'Souvent mieux de se coucher si quelqu\'un relance.')
        ));
      } else {
        const ev = E.evaluate(st.hole.concat(st.board));
        const cat = displayCat(ev);
        body.append(h('div.pk-coach-block',
          h('div.pk-coach-title', 'Ta main'),
          h('p', h('b', E.describe(ev)), ' : ', CAT_HELP[cat]),
          h('small.muted', 'Les cartes qui forment ta main brillent sur la table.')
        ));
      }
      const eq = this.equity();
      if (eq) {
        const p = eq.win + eq.tie;
        body.append(h('div.pk-coach-block',
          h('div.pk-coach-title', `Chances de gagner contre ${eq.opp} adversaire${eq.opp > 1 ? 's' : ''}`),
          h('div.pk-meter.big', h('i', { style: { width: Math.max(3, p * 100) + '%', '--m': meterColor(p * (eq.opp + 1) / 2) } }), h('span', Math.round(p * 100) + ' %')),
          h('small.muted', `En moyenne, avec ${eq.opp + 1} joueurs, chacun gagne ${Math.round(100 / (eq.opp + 1))} % du temps.`)
        ));
      }
      if (st.legal) {
        const L = st.legal;
        if (L.toCall > 0) {
          const need = L.toCall / (st.pot + L.toCall);
          body.append(h('div.pk-coach-block',
            h('div.pk-coach-title', 'Le calcul'),
            h('p', `Suivre coûte ${fmt(L.toCall)} pour un pot de ${fmt(st.pot)}. Il faut gagner au moins `, h('b', Math.round(need * 100) + ' %'), ' du temps pour que ce soit rentable.')
          ));
        }
        const adv = this.advice();
        if (adv) body.append(h('div.pk-coach-advice', h('small', 'Conseil'), h('b', adv.label), h('p', adv.why)));
      } else if (st.phase === 'bet') {
        body.append(h('p.muted', 'Attends ton tour : observe qui mise et combien, ça en dit long sur leurs cartes.'));
      }
    } else if (me.folded && st.phase === 'bet') {
      body.append(h('p.muted', 'Tu t\'es couché(e) pour cette main. Regarde la suite : à l\'abattage, tu verras ce que les autres avaient.'));
    }
    // Rappels sur ma position
    if (st.phase === 'bet' && (st.sbPid === this.me || st.bbPid === this.me || st.dealer === this.me)) {
      const pos = st.dealer === this.me ? 'Tu es le donneur (bouton D) : après le flop, tu parles en dernier, c\'est un avantage.' : st.sbPid === this.me ? `Tu es petite blinde : tu as déjà mis ${fmt(st.blinds.sb)} obligatoirement.` : `Tu es grosse blinde : tu as déjà mis ${fmt(st.blinds.bb)} obligatoirement. Si personne ne relance, tu peux parler sans rien ajouter.`;
      body.append(h('p.pk-coach-pos', pos));
    }
    body.append(h('button.btn.ghost.sm.pk-coach-chart', { onclick: () => modal({ title: 'Classement des mains', className: 'pk-rules-modal', body: handChart(this.myCat()) }) }, h('span', { html: icon('ranks') }), 'Classement des mains'));
  }

  // ================================================================ animations
  pointOf(pid) {
    const host = this.v.gameEl.getBoundingClientRect();
    const card = this.cornersEl.querySelector(`[data-pid="${CSS.escape(pid)}"]`);
    if (pid === this.me && this.b3) {
      const p = this.b3.seatScreen(pid);
      if (p) return { x: p.x - host.left, y: p.y - host.top - 40 };
    }
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
  setDisp(pid, patch) {
    const d = this.disp.players[pid];
    if (d) Object.assign(d, patch);
  }
  refresh() {
    this.renderSeats();
    this.renderLabels();
  }

  async play(ev, st) {
    const d = this.disp;
    const p = st.players.find((x) => x.id === ev.pid) || this.player(ev.pid);
    switch (ev.t) {
      case 'hand': {
        this.closeShowdown();
        this.handNo = ev.hand;
        d.board = [];
        d.pot = 0;
        d.dealer = ev.dealer;
        for (const [id, dp] of Object.entries(d.players)) Object.assign(dp, { bet: 0, folded: !ev.order.includes(id), hasCards: false, cards: null, last: null, allIn: false });
        if (this.b3) {
          this.b3.setHighlight([]);
          this.b3.setBoard([]);
          this.b3.setPot(0);
          for (const s of Object.values(this.b3.seats)) {
            for (const m of s.cards) this.b3.world.remove(m);
            s.cards = [];
          }
          await this.b3.setDealer(ev.dealer, true);
        }
        this.refresh();
        Sound.play('shuffle');
        this.showBanner(`Main n°${ev.hand}`, `Blindes ${fmt(ev.sb)} / ${fmt(ev.bb)}`, '#ffd166', 1100, '.small');
        await sleep(350);
        return;
      }
      case 'blind': {
        this.setDisp(ev.pid, { bet: ev.amount, stack: ev.stack, last: { a: ev.kind, amount: ev.amount } });
        if (this.b3) await this.b3.bet(ev.pid, ev.amount, ev.amount, ev.stack);
        else Sound.play('chip');
        this.refresh();
        return;
      }
      case 'deal': {
        for (const id of ev.order) this.setDisp(id, { hasCards: true });
        const myCards = st.hand === this.handNo ? st.hole : null;
        if (this.b3) await this.b3.dealHole(ev.order, this.me, myCards);
        else {
          for (let k = 0; k < ev.order.length * 2; k++) {
            Sound.play('card');
            await sleep(110);
          }
        }
        this.refresh();
        return;
      }
      case 'act': {
        const label = ACT_LABEL[ev.a];
        this.setDisp(ev.pid, { stack: ev.stack, bet: ev.to, last: { a: ev.a, amount: ev.to }, folded: ev.a === 'fold' || this.disp.players[ev.pid]?.folded, allIn: ev.a === 'allin' });
        if (ev.a === 'fold') {
          Sound.play('fold');
          this.seatBubble(ev.pid, label, '.fold');
          if (this.b3) await this.b3.fold(ev.pid);
          this.setDisp(ev.pid, { hasCards: false });
        } else if (ev.a === 'check') {
          Sound.play('check');
          this.seatBubble(ev.pid, label, '.check');
          await sleep(300);
        } else {
          this.seatBubble(ev.pid, `${label} ${fmt(ev.to)}`, '.' + ev.a);
          if (this.b3) await this.b3.bet(ev.pid, ev.put, ev.to, ev.stack);
          else Sound.play('chips');
          if (ev.a === 'allin') {
            Sound.play('alarm');
            this.showBanner('TAPIS !', `${p ? p.name : ''} mise tout : ${fmt(ev.to)}`, p ? p.color : '#ff5a5f', 1500, '.allin');
            if (this.b3) await sleep(500);
          }
        }
        this.refresh();
        return;
      }
      case 'collect': {
        for (const dp of Object.values(d.players)) {
          dp.bet = 0;
          if (dp.last && dp.last.a !== 'fold' && dp.last.a !== 'allin') dp.last = null;
        }
        d.pot = ev.pot;
        if (this.b3) await this.b3.collect(ev.pot);
        this.refresh();
        return;
      }
      case 'street': {
        d.board = ev.board.slice();
        this.showBanner(STREET_LABEL[ev.street], this.coach ? STREET_HELP[ev.street].split('.')[0] + '.' : '', '#3fa7ff', 1200, '.small');
        if (this.b3) await this.b3.dealBoard(ev.cards, ev.board);
        else Sound.play('card');
        this.render2d();
        this.refresh();
        return;
      }
      case 'reveal': {
        Sound.play('card');
        for (const x of ev.hands) this.setDisp(x.pid, { cards: x.cards, hasCards: true });
        if (this.b3) await Promise.all(ev.hands.map((x) => this.b3.reveal(x.pid, x.cards)));
        this.showBanner('Cartes sur table', 'Plus personne ne peut miser : le tableau se déroule', '#a66bff', 1300, '.small');
        this.refresh();
        await sleep(400);
        return;
      }
      case 'showdown':
        await this.showShowdown(ev, st);
        return;
      case 'win': {
        Sound.play(ev.pid === this.me ? 'cash' : 'chips');
        this.seatBubble(ev.pid, `+${fmt(ev.amount)}`, '.win', 1800);
        if (this.b3) await this.b3.payout(ev.pid, ev.amount, 0);
        d.pot = 0;
        this.setDisp(ev.pid, { stack: (this.disp.players[ev.pid]?.stack || 0) + ev.amount });
        this.refresh();
        await sleep(400);
        return;
      }
      case 'blinds':
        Sound.play('turn');
        this.showBanner('Les blindes montent', `${fmt(ev.sb)} / ${fmt(ev.bb)}`, '#ff8a3d', 1600);
        await sleep(700);
        return;
      case 'bust':
        Sound.play('bankrupt');
        this.showBanner(ev.pid === this.me ? 'Vous êtes éliminé(e)' : `${p ? p.name : ''} est éliminé(e)`, `${ev.rank}e place`, '#9aa0c7', 1600);
        await sleep(600);
        return;
      case 'out':
        this.showBanner(`${p ? p.name : ''} quitte la table`, '', '#9aa0c7', 1200, '.small');
        return;
      case 'over':
        Sound.play('win');
        return;
    }
  }

  /** Abattage : les cartes se retournent, les mains sont nommées, chaque pot va à son gagnant. */
  async showShowdown(ev, st) {
    const d = this.disp;
    for (const x of ev.hands) this.setDisp(x.pid, { cards: x.cards, hasCards: true });
    if (this.b3) await Promise.all(ev.hands.map((x) => this.b3.reveal(x.pid, x.cards)));
    Sound.play('card');
    this.refresh();
    this.closeShowdown();
    const rows = ev.hands.slice().sort((a, b) => {
      const wa = ev.pots.some((p) => p.winners.includes(a.pid)) ? 1 : 0;
      const wb = ev.pots.some((p) => p.winners.includes(b.pid)) ? 1 : 0;
      return wb - wa || b.cat - a.cat;
    }).map((x) => {
      const q = this.player(x.pid) || {};
      const won = ev.pots.reduce((s, p) => s + (p.shares[x.pid] || 0), 0);
      return h('div.pk-sd-row' + (won ? '.win' : ''), { style: { '--c': q.color } },
        h('span.pk-avatar.sm', initials(q.name)),
        h('div.pk-sd-who', h('b', q.name), h('small', x.name)),
        h('div.pk-sd-cards', x.cards.map((c) => cardImg(c, '.mini'))),
        h('span.pk-sd-won', won ? '+' + fmt(won) : '')
      );
    });
    const mainWin = ev.pots[0] && ev.hands.find((x) => ev.pots[0].winners.includes(x.pid));
    const loser = mainWin && ev.hands.filter((x) => x.pid !== mainWin.pid).sort((a, b) => b.cat - a.cat)[0];
    let why = null;
    if (this.coach && mainWin && loser) {
      why = mainWin.cat > loser.cat
        ? `${mainWin.name} bat ${loser.name.toLowerCase()} : ${HAND_RANKS.find((r) => r.cat === mainWin.cat)?.name || ''} est plus forte dans le classement des mains.`
        : 'Même type de main : c\'est la hauteur des cartes (puis les cartes d\'accompagnement) qui départage.';
    }
    this.sdEl = h('div.pk-showdown',
      h('div.pk-sd-title', 'Abattage'),
      h('div.pk-sd-list', rows),
      why ? h('div.pk-sd-why', why) : null
    );
    this.v.gameEl.append(this.sdEl);
    // Les pots, un par un, vers leurs gagnants
    let left = d.pot || ev.pots.reduce((s, p) => s + p.amount, 0);
    for (const pot of ev.pots) {
      const w = ev.hands.find((x) => pot.winners.includes(x.pid));
      if (this.b3) this.b3.setHighlight(pot.contested && w ? w.best : []);
      await sleep(pot.contested ? 900 : 200);
      for (const id of pot.winners) {
        const amt = pot.shares[id];
        left -= amt;
        if (this.b3) await this.b3.payout(id, amt, Math.max(0, left));
        this.setDisp(id, { stack: (this.disp.players[id]?.stack || 0) + amt });
        d.pot = Math.max(0, left);
        if (pot.contested) this.seatBubble(id, `+${fmt(amt)}`, '.win', 1800);
      }
      this.refresh();
    }
    const iWon = ev.pots.some((p) => p.contested && p.winners.includes(this.me));
    if (iWon) {
      Sound.play('cash');
      confetti(1200);
    }
    await sleep(1300);
  }
  closeShowdown() {
    if (this.sdEl) {
      const el = this.sdEl;
      el.classList.add('out');
      setTimeout(() => el.remove(), 300);
      this.sdEl = null;
    }
  }

  onEmote({ key, emoji }) {
    this.seatBubble(key, REACTIONS[emoji] ? reactionEl(emoji) : h('span', emoji), '.emote', 2200);
  }

  updateTimer() {
    const st = this.state;
    if (!st || st.over) return;
    const bars = [this.cornersEl.querySelector('.pcard.corner.turn .pcard-timer'), this.statusEl.querySelector('.pk-timer i')].filter(Boolean);
    if (!bars.length) return;
    const left = st.deadline ? st.deadline - (Date.now() + this.v.clockOffset) : 0;
    if (st.deadline !== this.dlSeen) {
      this.dlSeen = st.deadline;
      this.dlTotal = Math.max(1000, Math.min(left, (this.room.settings.turnTime || 25) * 1000));
    }
    const frac = Math.max(0, Math.min(1, left / (this.dlTotal || 25000)));
    for (const b of bars) {
      b.hidden = !st.deadline;
      b.style.transform = `scaleX(${frac})`;
      b.classList.toggle('urgent', left < 5000);
    }
    const secs = Math.ceil(left / 1000);
    if (st.current === this.me && left < 5000 && left > 0 && secs !== this.lastTick) {
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
    const medal = (n) => h('span.pk-medal.m' + n, String(n));
    const podium = h('div.podium', [ranked[1], ranked[0], ranked[2]].map((pl) => {
      if (!pl) return h('div.podium-slot.empty');
      const i = info(pl);
      return h('div.podium-slot.p' + pl.rank,
        h('div.avatar.lg.pk-avatar', { style: { '--c': i.color } }, h('span.pk-initials', initials(pl.name))),
        h('div.podium-name', h('span.' + (nameClass(i) || 'plain'), pl.name), ...roleTags(i, { level: false })),
        h('div.podium-step', medal(pl.rank)),
        h('div.podium-worth', pl.stack ? `${fmt(pl.stack)} jetons` : 'Éliminé')
      );
    }));
    const rw = v.rewards;
    ov.append(
      h('div.end-card',
        h('div.end-title', winner.id === this.me ? 'VICTOIRE !' : `${winner.name} gagne !`),
        h('div.end-sub', `Poker · ${res.hands || res.rounds} main${(res.hands || res.rounds) > 1 ? 's' : ''} · ${duration(res.duration)}`),
        podium,
        h('div.end-list', ranked.slice(3).map((pl) => h('div.end-row', `${pl.rank}. ${pl.name}`, h('span', pl.stack ? fmt(pl.stack) : 'Éliminé')))),
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

/** Couleur d'une jauge de force : rouge → orange → vert. */
function meterColor(x) {
  const t = Math.max(0, Math.min(1, x));
  return t < 0.45 ? '#ff5a5f' : t < 0.65 ? '#ffb020' : '#2ecc71';
}

export { suitURL };
