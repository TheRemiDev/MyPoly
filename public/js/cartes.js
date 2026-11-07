// ============================================================================
//  MyPoly — « Carton ! » : table de jeu de cartes (vue client)
//  Le serveur est seul maître du jeu : ce module ne fait qu'afficher et animer.
// ============================================================================
import { h, toast, modal, roleTags, nameClass, sleep, confetti, duration } from './util.js';
import { store, emit } from './store.js';
import * as Sound from './sound.js';
import { navigate, toggleFullscreen } from './app.js';

export const CARD_SETTINGS_UI = [
  { group: 'Partie', items: [
    { key: 'maxPlayers', label: 'Joueurs max', type: 'select', options: [2, 3, 4, 5, 6].map((n) => [n, n + ' joueurs']) },
    { key: 'startCards', label: 'Cartes en main au départ', type: 'select', options: [5, 7, 10].map((n) => [n, n + ' cartes']) },
    { key: 'turnTime', label: 'Temps par décision', type: 'select', options: [[10, '10 s'], [15, '15 s'], [20, '20 s'], [30, '30 s'], [45, '45 s'], [0, 'Illimité']] },
    { key: 'targetScore', label: 'Fin de partie', type: 'select', options: [[0, 'Une seule manche'], [100, 'Premier à 100 points'], [200, 'Premier à 200 points'], [500, 'Premier à 500 points']] },
  ] },
  { group: 'Règles', items: [
    { key: 'stacking', label: 'Cumul des +2 / +4', type: 'toggle', hint: 'Répondre à un +2 par un +2 (ou un +4) : le suivant pioche tout' },
    { key: 'drawToPlay', label: 'Piocher jusqu\'à pouvoir jouer', type: 'toggle', hint: 'Sinon, on pioche une seule carte' },
    { key: 'sevenZero', label: 'Règle du 7 et du 0', type: 'toggle', hint: '7 : échange ta main avec un joueur · 0 : toutes les mains tournent' },
    { key: 'cartonPenalty', label: 'Pénalité « Carton ! » oublié', type: 'select', options: [[2, '+2 cartes'], [4, '+4 cartes']] },
  ] },
  { group: 'Salle', items: [
    { key: 'isPublic', label: 'Salle publique', type: 'toggle', hint: 'Visible dans la liste des salles de l\'accueil' },
    { key: 'allowSpectators', label: 'Spectateurs autorisés', type: 'toggle' },
  ] },
];

export const CARD_PRESETS = {
  '⚖️ Classique': { startCards: 7, turnTime: 20, targetScore: 0, stacking: true, drawToPlay: false, sevenZero: false, cartonPenalty: 2 },
  '⚡ Éclair': { startCards: 5, turnTime: 10, targetScore: 0, stacking: true, drawToPlay: false, sevenZero: false, cartonPenalty: 2 },
  '🌪️ Chaos': { startCards: 7, turnTime: 20, targetScore: 0, stacking: true, drawToPlay: true, sevenZero: true, cartonPenalty: 4 },
  '🏆 Tournoi': { startCards: 7, turnTime: 30, targetScore: 200, stacking: true, drawToPlay: false, sevenZero: false, cartonPenalty: 2 },
};

const EMOTES = ['👍', '😂', '😱', '😡', '🔥', '💸', '🎉', '😎', '🙏', '💀'];
export const CCOLORS = { r: '#ff5a5f', b: '#3fa7ff', g: '#2ecc71', y: '#ffb020' };
const CNAMES = { r: 'Rouge', b: 'Bleu', g: 'Vert', y: 'Jaune' };
const ORDER = { r: 0, b: 1, g: 2, y: 3, w: 4 };
const VORDER = (v) => (/^\d$/.test(v) ? Number(v) : { skip: 10, rev: 11, '+2': 12, wild: 13, '+4': 14 }[v]);

const SVG_SKIP = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.2" fill="none" stroke="currentColor" stroke-width="3.2"/><path d="M6.4 17.6 17.6 6.4" stroke="currentColor" stroke-width="3.2" stroke-linecap="round"/></svg>';
const SVG_REV = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9.5h13.5M14 5.5l3.8 4-3.8 4"/><path d="M20 15.5H6.5M10 11.5l-3.8 4 3.8 4"/></svg>';
const SVG_WILD = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 12V2.6A9.4 9.4 0 0 1 21.4 12z" fill="#ff5a5f"/><path d="M12 12h9.4A9.4 9.4 0 0 1 12 21.4z" fill="#3fa7ff"/><path d="M12 12v9.4A9.4 9.4 0 0 1 2.6 12z" fill="#2ecc71"/><path d="M12 12H2.6A9.4 9.4 0 0 1 12 2.6z" fill="#ffb020"/><circle cx="12" cy="12" r="9.4" fill="none" stroke="#fff" stroke-width="1.6"/></svg>';

function glyph(card, small) {
  if (card.v === 'skip') return h('span.cc-svg', { html: SVG_SKIP });
  if (card.v === 'rev') return h('span.cc-svg', { html: SVG_REV });
  if (card.v === 'wild') return small ? h('span.cc-svg', { html: SVG_WILD }) : h('span.cc-svg.wild', { html: SVG_WILD });
  if (card.v === '+4') return small ? h('span', '+4') : h('span.cc-plus4', h('span.cc-svg.wild', { html: SVG_WILD }), h('b', '+4'));
  return h('span', card.v);
}
export function cardName(card) {
  const n = { skip: 'Stop', rev: 'Demi-tour', '+2': '+2', wild: 'Joker', '+4': 'Super Joker +4' }[card.v] || card.v;
  return card.c === 'w' ? n : `${n} ${CNAMES[card.c].toLowerCase()}`;
}

/** Carte face visible. */
export function cardEl(card, extra = '') {
  const num = /^\d$/.test(card.v);
  return h('div.ccard.c-' + card.c + (num ? '.num' : '.act') + (card.v === '6' || card.v === '9' ? '.underline' : '') + extra, { 'data-id': card.id },
    h('div.cc-face',
      h('span.cc-idx.tl', glyph(card, true)),
      h('div.cc-center', h('div.cc-gem', glyph(card, false))),
      h('span.cc-idx.br', glyph(card, true))
    )
  );
}
/** Dos de carte. */
export function backEl(extra = '') {
  return h('div.ccard.back' + extra, h('div.cc-back', h('div.cc-back-ring'), h('span.cc-back-logo', h('b', 'Car'), h('i', 'ton!'))));
}

function sortHand(hand) {
  return hand.slice().sort((a, b) => ORDER[a.c] - ORDER[b.c] || VORDER(a.v) - VORDER(b.v));
}

export class CardTable {
  constructor(view) {
    this.v = view;
    this.state = null;
    this.queue = [];
    this.busy = false;
    this.disp = null;
    this.armed = false; // « Carton ! » pré-annoncé pour l'avant-dernière carte
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
    this.deckEl = h('div.ct-deck', { title: 'Piocher (D)', onclick: () => this.draw() });
    this.discardEl = h('div.ct-discard');
    this.colorEl = h('div.ct-color');
    const ringText = '★ CARTON ! ★ VIDE TA MAIN ★ CRIE « CARTON ! » ★ CARTON ! ★ VIDE TA MAIN ★ CRIE « CARTON ! » ';
    this.dirEl = h('div.ct-dir', { html: `<svg viewBox="0 0 200 200" aria-hidden="true"><defs><path id="ctRingPath" d="M100 100 m-84 0 a84 84 0 1 1 168 0 a84 84 0 1 1 -168 0"/></defs>
      <circle cx="100" cy="100" r="95" fill="none" stroke="currentColor" stroke-width="1.2" stroke-dasharray="2 5" opacity=".6"/>
      <circle cx="100" cy="100" r="74" fill="none" stroke="currentColor" stroke-width="1" opacity=".45"/>
      <text font-size="9.5" font-weight="900" letter-spacing="2.2" fill="currentColor"><textPath href="#ctRingPath">${ringText}</textPath></text>
      ${[0, 90, 180, 270].map((a) => `<path transform="rotate(${a} 100 100)" d="M100 3 l7 5 -7 5" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>`).join('')}
    </svg>` });
    this.pendingEl = h('div.ct-pending', { hidden: true });
    this.deckCount = h('div.ct-deck-count');
    this.center = h('div.ct-center', this.dirEl, this.colorEl, h('div.ct-piles', h('div.ct-deck-wrap', this.deckEl, this.deckCount), this.discardEl), this.pendingEl);
    this.seatsEl = h('div.ct-seats');
    this.felt = h('div.ct-felt', this.center, this.seatsEl);
    this.handEl = h('div.ct-hand');
    this.meBar = h('div.ct-mebar');
    this.actionsEl = h('div.ct-actions');
    this.meZone = h('div.ct-me', this.actionsEl, this.handEl, this.meBar);
    this.fx = h('div.ct-fx');
    this.banner = h('div.ct-banners');

    // Barre d'outils et fenêtres (partagées avec la vue de salle)
    v.toolbar = h('div.toolbar');
    v.logEl = h('div.log');
    v.chatBox = v.buildChat();
    v.emoteGrid = h('div.emote-grid', EMOTES.map((e) => h('button.emote', { onclick: () => {
      store.socket.emit('game:emote', { emoji: e });
      v.togglePop(null);
    } }, e)));
    v.popTitle = h('b');
    v.popover = h('div.popover', { hidden: true },
      h('div.pop-head', v.popTitle, h('button.icon-btn.pop-close', { title: 'Fermer', onclick: () => v.togglePop(null) }, '✕')),
      h('div.pop-body', v.logEl, v.chatBox, v.emoteGrid, (v.musicPop = v.buildMusic()))
    );
    v.pop = null;
    v.endOverlay = h('div.end-overlay', { hidden: true });
    v.playersEl = h('div.ct-layer', this.felt, this.meZone);
    v.gameEl = h('div.game.cards-game', h('div.ct-room', v.playersEl), this.fx, this.banner, h('div.topbar', v.toolbar, v.popover));
    v.root.append(v.gameEl, v.endOverlay);
    v.renderTabs();
    v.renderChat();
    this.renderToolbar();
    this.onKey = (e) => {
      if (e.target.matches('input, textarea, select') || !this.state) return;
      const k = e.key.toLowerCase();
      if (k === 'd') this.draw();
      else if (k === 'p' && this.state.phase === 'drawn') this.act('pass');
      else if (k === 'c') this.shout();
    };
    document.addEventListener('keydown', this.onKey);
    this.onResize = () => {
      if (!this.state || this.busy) return;
      this.renderSeats();
      this.renderHand();
    };
    window.addEventListener('resize', this.onResize);
  }

  destroy() {
    document.removeEventListener('keydown', this.onKey);
    window.removeEventListener('resize', this.onResize);
    this.dead = true;
  }

  // =========================================================== barre d'outils
  renderToolbar() {
    const v = this.v;
    if (!v.toolbar) return;
    const st = this.state;
    const me = this.player(this.me);
    v.toolbar.innerHTML = '';
    v.toolbar.append(
      h('div.tb-code', { title: 'Copier le lien d\'invitation', onclick: () => copy(location.origin + '/r/' + v.code, 'Lien copié !') }, '🔗 ', v.code),
      h('div.tb-info', st ? (st.settings.targetScore ? `Manche ${st.round} · ${st.settings.targetScore} pts` : '🃏 Carton !') : ''),
      h('button.icon-btn' + (v.pop === 'chat' ? '.on' : ''), { title: 'Discussion', onclick: () => v.togglePop('chat') }, '💬', v.unread ? h('span.tb-badge', String(v.unread)) : null),
      h('button.icon-btn' + (v.pop === 'log' ? '.on' : ''), { title: 'Journal de la partie', onclick: () => v.togglePop('log') }, '📜'),
      h('button.icon-btn' + (v.pop === 'emote' ? '.on' : ''), { title: 'Réagir', onclick: () => v.togglePop('emote') }, '😀'),
      h('button.icon-btn.music-btn' + (v.pop === 'music' ? '.on' : '') + (v.music && v.music.track ? '.playing' : '') + (v.music && v.music.blocked ? '.blocked' : ''), { title: 'Musique', onclick: () => v.togglePop('music') }, v.music && v.music.track && (v.music.muted || v.music.volume === 0) ? '🔇' : '🎵'),
      h('button.icon-btn', { title: 'Règles', onclick: () => this.showRules() }, '📖'),
      h('button.icon-btn', { title: 'Son', onclick: (e) => (e.target.textContent = Sound.toggle() ? '🔊' : '🔇') }, Sound.isEnabled() ? '🔊' : '🔇'),
      h('button.icon-btn', { title: 'Plein écran (F)', onclick: toggleFullscreen }, '⛶'),
      me && !me.out && this.room.state === 'playing'
        ? h('button.icon-btn.danger', { title: 'Abandonner', onclick: () => this.forfeit() }, '🏳️')
        : h('button.icon-btn', { title: 'Quitter', onclick: () => navigate('/') }, '🚪')
    );
  }

  showRules() {
    const s = this.room.settings;
    const yes = (b) => (b ? '✅' : '❌');
    modal({
      title: '🃏 Règles de Carton !',
      body: h('div.rules-summary',
        h('p', 'Pose une carte de la même ', h('b', 'couleur'), ' ou du même ', h('b', 'symbole'), ' que celle du dessus. Le premier qui vide sa main gagne !'),
        h('div.ct-rules-cards',
          ruleCard({ c: 'r', v: 'skip' }, 'Stop', 'Le joueur suivant passe son tour'),
          ruleCard({ c: 'b', v: 'rev' }, 'Demi-tour', 'Le sens du jeu s\'inverse'),
          ruleCard({ c: 'g', v: '+2' }, '+2', 'Le suivant pioche 2 cartes et passe'),
          ruleCard({ c: 'w', v: 'wild' }, 'Joker', 'Tu choisis la couleur'),
          ruleCard({ c: 'w', v: '+4' }, 'Super Joker +4', 'Tu choisis la couleur, le suivant pioche 4')
        ),
        h('p', '📣 Quand il ne te reste qu\'une carte, crie ', h('b', '« CARTON ! »'), ` (bouton ou touche C). Si tu oublies et qu'un adversaire te prend, tu pioches ${s.cartonPenalty} cartes !`),
        h('div', `🃏 ${s.startCards} cartes au départ · ⏱️ ${s.turnTime ? s.turnTime + ' s par coup' : 'temps illimité'} · ${s.targetScore ? `🏆 premier à ${s.targetScore} points` : '🏁 une seule manche'}`),
        h('div', `${yes(s.stacking)} Cumul des +2/+4 · ${yes(s.drawToPlay)} Pioche jusqu'à pouvoir jouer · ${yes(s.sevenZero)} Règle du 7 et du 0`),
        s.targetScore ? h('div.muted', 'Points : le gagnant de la manche marque la valeur des cartes restées en main chez les autres (chiffres = valeur, Stop/Demi-tour/+2 = 20, Jokers = 50).') : null,
        h('div.muted', 'Raccourcis : D piocher · P passer · C crier « Carton ! »')
      ),
    });
  }

  async forfeit() {
    const ok = await modal({ title: '🏳️ Abandonner ?', body: h('p', 'Vous quitterez la partie et vos cartes retourneront dans la pioche.'), buttons: [{ label: 'Annuler', value: false }, { label: 'Abandonner', value: true, class: 'danger' }] });
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
      this.lockActions = true;
      this.renderActions();
      for (const ev of events) {
        if (ev.t === 'log') this.addLog(ev);
        if (fast) continue;
        try {
          await this.play(ev, state, events);
        } catch (e) {
          console.error(e);
        }
      }
      this.lockActions = false;
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
      top: st.top,
      color: st.color,
      dir: st.direction,
      pending: st.pendingDraw,
      deck: st.deckCount,
      counts: Object.fromEntries(st.players.map((p) => [p.id, p.count])),
      hand: st.hand ? st.hand.slice() : null,
    };
    if (first || instant) {
      this.v.logEl.innerHTML = '';
      for (const l of st.log) this.addLog(l, true);
    }
    if (!st.hand || st.hand.length !== 2) this.armed = false;
    this.renderAll();
  }

  renderAll() {
    this.renderSeats();
    this.renderCenter();
    this.renderHand();
    this.renderActions();
    this.renderToolbar();
  }

  addLog(l, silent) {
    const p = l.pid ? this.player(l.pid) : null;
    const line = h('div.log-line', p ? h('span.log-dot', { style: { background: p.color } }) : null, l.msg);
    const el = this.v.logEl;
    el.append(line);
    while (el.children.length > 120) el.firstChild.remove();
    if (!silent) el.scrollTop = el.scrollHeight;
  }

  // ================================================================ rendu
  /** Ordre d'affichage : moi en bas, les autres dans l'ordre du jeu (sens horaire). */
  seatOrder() {
    const list = this.state.players;
    const i = list.findIndex((p) => p.id === this.me);
    if (i < 0) return { mine: null, others: list };
    return { mine: list[i], others: list.slice(i + 1).concat(list.slice(0, i)) };
  }
  seatPositions(n) {
    if (window.innerWidth < 700) {
      // Téléphone : adversaires en ligne en haut de la table (deux rangées au-delà de 3)
      const row1 = n > 3 ? Math.ceil(n / 2) : n;
      return Array.from({ length: n }, (_, k) => {
        const second = k >= row1;
        const m = second ? n - row1 : row1;
        const j = second ? k - row1 : k;
        return [((j + 0.5) / m) * 100, second ? 33 : 15, 't'];
      });
    }
    const L = { l: [7, 50, 'l'], tl: [25, 19, 't'], t: [50, 15, 't'], tr: [75, 19, 't'], r: [93, 50, 'r'], t1: [38, 15, 't'], t2: [62, 15, 't'] };
    const map = { 1: ['t'], 2: ['tl', 'tr'], 3: ['l', 't', 'r'], 4: ['l', 'tl', 'tr', 'r'], 5: ['l', 'tl', 't', 'tr', 'r'], 6: ['l', 'tl', 't1', 't2', 'tr', 'r'] };
    return (map[n] || map[5]).map((k) => L[k]);
  }

  renderSeats() {
    const st = this.state;
    if (!st) return;
    const { mine, others } = this.seatOrder();
    const pos = this.seatPositions(others.length);
    this.seatsEl.innerHTML = '';
    others.forEach((p, k) => {
      const [x, y, side] = pos[k];
      this.seatsEl.append(this.seatEl(p, x, y, side));
    });
    // Ma fiche (en bas)
    this.meBar.innerHTML = '';
    if (mine) this.meBar.append(this.badgeEl(mine, true));
    else this.meBar.append(h('div.ct-spectate', '👁 Vous regardez la partie'));
    this.meBar.setAttribute('data-pid', mine ? mine.id : '');
  }

  badgeEl(p, isMe) {
    const st = this.state;
    const turn = st.current === p.id && !st.over && st.phase !== 'roundEnd';
    const count = this.disp ? this.disp.counts[p.id] ?? p.count : p.count;
    return h('div.ct-badge' + (turn ? '.turn' : '') + (p.out ? '.out' : '') + (isMe ? '.me' : ''), { style: { '--c': p.color } },
      h('div.ct-avatar', p.out ? '💀' : p.pawn),
      h('div.ct-binfo',
        h('div.ct-name', h('span.' + (nameClass(p) || 'plain'), p.name), ...roleTags(p, { level: false, compact: true })),
        h('div.ct-chips',
          p.out ? h('span.pc-chip.off', 'Abandon') : h('span.pc-chip', { title: 'Cartes en main' }, `🃏 ${count}`),
          st.settings.targetScore ? h('span.pc-chip', { title: 'Points' }, `🏆 ${p.score}`) : null,
          !p.isBot && !p.connected ? h('span.pc-chip.off', { title: 'Déconnecté' }, '📡') : p.afk ? h('span.pc-chip.off', { title: 'Absent' }, '💤') : null
        )
      ),
      p.carton && count === 1 ? h('div.ct-carton-tag', 'CARTON !') : null,
      turn ? h('div.ct-turn', isMe ? '🎴 À VOUS !' : 'JOUE…') : null,
      turn ? h('div.ct-timer', h('i')) : null
    );
  }

  seatEl(p, x, y, side = 't') {
    const count = this.disp ? this.disp.counts[p.id] ?? p.count : p.count;
    const shown = Math.min(count, 12);
    const fan = h('div.ct-fan', Array.from({ length: shown }, (_, k) => {
      const a = shown > 1 ? (k / (shown - 1) - 0.5) * Math.min(70, 8 * shown) : 0;
      const b = backEl('.mini');
      b.style.transform = `rotate(${a}deg)`;
      return b;
    }));
    const seat = h('div.ct-seat.s-' + side, { 'data-pid': p.id, style: { left: x + '%', top: y + '%', '--c': p.color } }, this.badgeEl(p, false), fan);
    // Joueur qui a oublié de crier « Carton ! » : tout le monde peut le prendre
    const me = this.player(this.me);
    if (p.exposed && me && !me.out && !this.state.over) {
      const left = p.exposedUntil ? p.exposedUntil - (Date.now() + this.v.clockOffset) : 5000;
      if (left > 0) {
        const btn = h('button.ct-catch', { title: 'Ce joueur a oublié de crier « Carton ! »', onclick: () => {
          btn.disabled = true;
          this.act('catch', { target: p.id });
        } }, '🚨 ', h('span.ct-catch-long', 'Carton oublié ! '), h('b', 'Prendre'), h('i.ct-catch-bar', { style: { animationDuration: Math.round(left) + 'ms' } }));
        seat.append(btn);
        // Le bouton disparaît de lui-même à la fin de la fenêtre
        setTimeout(() => btn.remove(), left);
      }
    }
    return seat;
  }

  renderCenter() {
    const st = this.state;
    const d = this.disp;
    if (!st || !d) return;
    // Défausse en vrac : les dernières cartes posées restent visibles dessous
    this.pile ||= [];
    if (!d.top) this.pile = [];
    else if (!this.pile.length || this.pile[this.pile.length - 1].id !== d.top.id) {
      if (!this.pile.some((c) => c.id === d.top.id)) this.pile.push(d.top);
      else this.pile = [d.top];
      if (this.pile.length > 5) this.pile = this.pile.slice(-5);
    }
    this.discardEl.innerHTML = '';
    this.pile.forEach((c, k) => {
      const el = cardEl(c, '.big' + (k === this.pile.length - 1 ? '.top' : ''));
      const r = ((c.id * 47) % 34) - 17;
      const dx = ((c.id * 13) % 18) - 9;
      const dy = ((c.id * 29) % 14) - 7;
      el.style.transform = `translate(${dx}px, ${dy}px) rotate(${r}deg)`;
      this.discardEl.append(el);
    });
    this.colorEl.style.setProperty('--cc', CCOLORS[d.color] || '#fff');
    this.colorEl.dataset.name = CNAMES[d.color] || '';
    this.dirEl.classList.toggle('ccw', d.dir < 0);
    this.dirEl.style.setProperty('--cc', CCOLORS[d.color] || '#fff');
    this.deckEl.innerHTML = '';
    const layers = Math.max(1, Math.min(6, Math.ceil(d.deck / 12)));
    for (let k = 0; k < layers; k++) {
      const b = backEl('.big');
      b.style.transform = `translate(${-k * 1.5}px, ${-k * 1.5}px)`;
      this.deckEl.append(b);
    }
    this.deckCount.textContent = `${d.deck} carte${d.deck > 1 ? 's' : ''}`;
    const canDraw = this.myTurn() && st.phase === 'play';
    this.deckEl.classList.toggle('can', canDraw && !st.playable.length);
    this.deckEl.classList.toggle('active', canDraw);
    this.pendingEl.hidden = !d.pending;
    this.pendingEl.textContent = '+' + d.pending;
  }

  myTurn() {
    const st = this.state;
    return st && !st.over && st.current === this.me && st.hand && st.phase !== 'roundEnd' && !this.busy && !this.lockActions;
  }

  renderHand() {
    const st = this.state;
    const d = this.disp;
    this.handEl.innerHTML = '';
    if (!st || !d || !d.hand) return;
    const hand = sortHand(d.hand);
    const playable = new Set(this.myTurn() ? st.playable : []);
    const n = hand.length;
    // Chevauchement selon la place disponible
    const width = Math.min(window.innerWidth - 32, 1100);
    const cw = Math.min(118, Math.max(70, window.innerHeight * 0.13));
    const overlap = n > 1 ? Math.min(cw * 0.15, (width - cw) / (n - 1) - cw) : 0;
    this.handEl.style.setProperty('--cw', cw + 'px');
    hand.forEach((c, k) => {
      const el = cardEl(c, (playable.has(c.id) ? '.playable' : this.myTurn() ? '.dim' : '') + (st.drawnCard === c.id ? '.drawn' : ''));
      const t = n > 1 ? k / (n - 1) - 0.5 : 0;
      el.style.setProperty('--rot', t * Math.min(16, n * 1.6) + 'deg');
      el.style.setProperty('--lift', Math.abs(t) * Math.min(18, n * 2) + 'px');
      if (k) el.style.marginLeft = overlap + 'px';
      el.addEventListener('click', () => this.clickCard(c, el));
      this.handEl.append(el);
    });
  }

  renderActions() {
    const st = this.state;
    const el = this.actionsEl;
    el.innerHTML = '';
    if (!st || !st.hand || st.over) return;
    const me = this.player(this.me);
    const n = this.disp ? this.disp.hand.length : st.hand.length;
    const mine = this.myTurn();
    if (mine) {
      if (st.phase === 'drawn') {
        el.append(h('div.ct-hint', '✨ Vous pouvez poser la carte piochée'), h('button.btn.ghost.ct-btn', { onclick: () => this.act('pass') }, 'Garder et passer (P)'));
      } else if (st.pendingDraw) {
        el.append(h('div.ct-hint.warn', st.playable.length ? `💥 +${st.pendingDraw} pour vous ! Contrez avec un ${st.pendingType === '+4' ? '+4' : '+2 ou +4'}… ou piochez` : `💥 Vous devez piocher ${st.pendingDraw} cartes`),
          h('button.btn.danger.ct-btn', { onclick: () => this.draw() }, `Piocher ${st.pendingDraw} cartes`));
      } else if (!st.playable.length) {
        el.append(h('div.ct-hint', 'Aucune carte jouable…'), h('button.btn.primary.ct-btn.pulse', { onclick: () => this.draw() }, '🂠 Piocher (D)'));
      } else {
        el.append(h('div.ct-hint', 'À vous ! Posez une carte'), h('button.btn.ghost.ct-btn', { onclick: () => this.draw() }, '🂠 Piocher'));
      }
    }
    // Bouton « CARTON ! » : avant de poser l'avant-dernière carte, ou si on l'a oublié
    if (me && !me.out && ((mine && n === 2 && st.playable.length) || (n === 1 && me.exposed))) {
      el.append(h('button.ct-shout' + (this.armed ? '.armed' : '') + (me.exposed ? '.urgent' : ''), { onclick: () => this.shout() }, this.armed ? '📣 CARTON ! ✓' : '📣 CARTON !'));
    }
  }

  updateTimer() {
    const st = this.state;
    if (!st || st.over) return;
    const bar = this.v.playersEl && this.v.playersEl.querySelector('.ct-badge.turn .ct-timer i');
    if (!bar) return;
    if (!st.deadline || this.busy) {
      bar.parentElement.hidden = true;
      return;
    }
    const total = (this.room.settings.turnTime || 20) * 1000;
    const left = st.deadline - (Date.now() + this.v.clockOffset);
    bar.parentElement.hidden = false;
    bar.style.transform = `scaleX(${Math.max(0, Math.min(1, left / total))})`;
    bar.parentElement.classList.toggle('urgent', left < 5000);
    const secs = Math.ceil(left / 1000);
    if (st.current === this.me && left < 5000 && left > 0 && secs !== this.lastTick) {
      this.lastTick = secs;
      Sound.play('tick');
    }
  }

  // ============================================================= actions
  async act(type, data = {}) {
    const res = await emit('game:action', { type, ...data });
    if (res && res.resync) {
      // Lien avec la salle perdu (reconnexion) : on rejoint et on réessaie une fois
      await this.v.join();
      const again = await emit('game:action', { type, ...data });
      if (again && again.error) {
        Sound.play('error');
        toast(again.error, 'error');
      }
      return again;
    }
    if (res && res.error) {
      Sound.play('error');
      toast(res.error, 'error');
    }
    return res;
  }
  draw() {
    if (!this.myTurn() || this.state.phase !== 'play') return;
    Sound.play('click');
    this.act('draw');
  }
  shout() {
    const st = this.state;
    const me = this.player(this.me);
    if (!st || !me || !st.hand) return;
    if (st.hand.length === 1 && me.exposed) return this.act('carton');
    if (st.hand.length === 2 && this.myTurn()) {
      this.armed = !this.armed;
      if (this.armed) Sound.play('click');
      this.renderActions();
    }
  }

  async clickCard(card, el) {
    const st = this.state;
    if (!this.myTurn()) {
      el.classList.remove('nope');
      void el.offsetWidth;
      el.classList.add('nope');
      if (st && st.hand && !st.over) toast(this.busy ? 'Un instant…' : 'Ce n\'est pas votre tour.', 'info', 1500);
      return;
    }
    if (!st.playable.includes(card.id)) {
      el.classList.remove('nope');
      void el.offsetWidth;
      el.classList.add('nope');
      Sound.play('error');
      return;
    }
    const data = { card: card.id, carton: this.armed };
    if (card.c === 'w') {
      const color = await this.pickColor();
      if (!color) return;
      data.color = color;
    }
    if (st.settings.sevenZero && card.v === '7' && st.hand.length > 1) {
      const target = await this.pickTarget();
      if (!target) return;
      data.target = target;
    }
    Sound.play('card');
    el.classList.add('leaving');
    const res = await this.act('play', data);
    if (res && res.error) el.classList.remove('leaving');
    else this.armed = false;
  }

  pickColor() {
    return new Promise((resolve) => {
      const counts = { r: 0, b: 0, g: 0, y: 0 };
      for (const c of this.state.hand) if (c.c !== 'w') counts[c.c]++;
      const ov = h('div.ct-picker',
        h('div.ct-picker-card',
          h('div.ct-picker-title', '🎨 Choisissez la couleur'),
          h('div.ct-colors', Object.entries(CCOLORS).map(([k, col]) => h('button.ct-colorbtn', { style: { '--cc': col }, onclick: () => done(k) }, h('b', CNAMES[k]), h('small', `${counts[k]} en main`)))),
          h('button.btn.ghost.sm', { onclick: () => done(null) }, 'Annuler')
        )
      );
      const done = (v) => {
        ov.remove();
        resolve(v);
      };
      this.v.gameEl.append(ov);
    });
  }
  pickTarget() {
    return new Promise((resolve) => {
      const others = this.state.players.filter((p) => p.id !== this.me && !p.out);
      const ov = h('div.ct-picker',
        h('div.ct-picker-card',
          h('div.ct-picker-title', '🔀 Échanger votre main avec…'),
          h('div.ct-targets', others.map((p) => h('button.ct-targetbtn', { style: { '--c': p.color }, onclick: () => done(p.id) }, h('span.ct-avatar', p.pawn), h('b', p.name), h('small', `🃏 ${this.disp.counts[p.id]} cartes`)))),
          h('button.btn.ghost.sm', { onclick: () => done(null) }, 'Annuler')
        )
      );
      const done = (v) => {
        ov.remove();
        resolve(v);
      };
      this.v.gameEl.append(ov);
    });
  }

  // ============================================================ animations
  /** Position (écran) d'un joueur : siège adverse, ou ma main. */
  pointOf(pid) {
    if (pid === this.me && this.disp && this.disp.hand) {
      const r = this.handEl.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }
    const el = this.v.playersEl.querySelector(`.ct-seat[data-pid="${CSS.escape(pid)}"] .ct-fan`) || this.v.playersEl.querySelector(`[data-pid="${CSS.escape(pid)}"]`);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }
  rectCenter(el) {
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width };
  }
  /** Fait voler une carte (face ou dos) d'un point à un autre. */
  flyCard(node, from, to, ms = 420, { rot = 0, scaleFrom = 0.7, scaleTo = 1 } = {}) {
    if (!from || !to) return sleep(ms);
    const w = this.rectCenter(this.discardEl).w || 100;
    node.classList.add('ct-flyer');
    node.style.setProperty('--w', w + 'px');
    node.style.left = from.x - w / 2 + 'px';
    node.style.top = from.y - w * 0.73 + 'px';
    node.style.transform = `scale(${scaleFrom}) rotate(${rot - 20}deg)`;
    this.fx.append(node);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      node.style.transition = `transform ${ms}ms cubic-bezier(.2,.8,.25,1), left ${ms}ms cubic-bezier(.2,.8,.25,1), top ${ms}ms cubic-bezier(.2,.8,.25,1), opacity 200ms`;
      node.style.left = to.x - w / 2 + 'px';
      node.style.top = to.y - w * 0.73 + 'px';
      node.style.transform = `scale(${scaleTo}) rotate(${rot}deg)`;
    }));
    return sleep(ms).then(() => node.remove());
  }
  showBanner(icon, title, sub, color = '#3fa7ff', ms = 1500) {
    const b = h('div.ct-banner', { style: { '--c': color } }, h('span.ct-banner-icon', icon), h('div', h('b', title), sub ? h('small', sub) : null));
    this.banner.append(b);
    setTimeout(() => b.classList.add('out'), ms);
    setTimeout(() => b.remove(), ms + 400);
  }
  seatBubble(pid, content, cls = '', ms = 1600) {
    const pt = this.pointOf(pid);
    if (!pt) return;
    const b = h('div.ct-bubble' + cls, content);
    b.style.left = pt.x + 'px';
    b.style.top = pt.y + 'px';
    this.fx.append(b);
    setTimeout(() => b.remove(), ms);
  }

  async play(ev, st, events) {
    const d = this.disp;
    const p = this.player(ev.pid) || (st.players.find((x) => x.id === ev.pid));
    switch (ev.t) {
      case 'deal': {
        // Distribution : quelques cartes volent vers chaque joueur
        this.v.endOverlay.hidden = true;
        this.roundOverlay && this.roundOverlay.remove();
        const later = new Set(events.filter((x) => x.t === 'draw' && x.pid === this.me && x.cards).flatMap((x) => x.cards.map((c) => c.id)));
        const ids = st.players.filter((q) => !q.out).map((q) => q.id);
        for (const id of ids) d.counts[id] = 0;
        d.hand = st.hand ? [] : null;
        d.top = null;
        d.deck = 108;
        this.renderAll();
        Sound.play('dice');
        const deck = this.rectCenter(this.deckEl);
        const n = ev.n;
        for (let k = 0; k < n; k++) {
          for (const id of ids) {
            const to = this.pointOf(id);
            this.flyCard(backEl(), deck, to, 300, { scaleTo: 0.6 });
            d.counts[id]++;
          }
          await sleep(Math.max(40, 220 - ids.length * 25));
          if (st.hand) d.hand = st.hand.filter((c) => !later.has(c.id)).slice(0, d.counts[this.me]);
          this.renderSeats();
          this.renderHand();
        }
        await sleep(300);
        d.top = ev.first;
        d.color = ev.first.c;
        d.deck = st.deckCount;
        this.renderCenter();
        Sound.play('card');
        this.showBanner('🃏', st.round > 1 ? `Manche ${st.round}` : 'C\'est parti !', `${p ? p.name : ''} commence`, p ? p.color : undefined);
        await sleep(500);
        return;
      }
      case 'play': {
        const isMe = ev.pid === this.me;
        let from = this.pointOf(ev.pid);
        if (isMe) {
          const mine = this.handEl.querySelector(`.ccard[data-id="${ev.card.id}"]`);
          if (mine) from = this.rectCenter(mine);
          if (d.hand) d.hand = d.hand.filter((c) => c.id !== ev.card.id);
          this.renderHand();
        }
        d.counts[ev.pid] = Math.max(0, (d.counts[ev.pid] || 1) - 1);
        this.renderSeats();
        if (!isMe) Sound.play('card');
        await this.flyCard(cardEl(ev.card), from, this.rectCenter(this.discardEl), 380, { rot: (Math.random() - 0.5) * 16, scaleFrom: isMe ? 1 : 0.6 });
        d.top = ev.card;
        d.color = ev.color;
        this.renderCenter();
        this.discardEl.classList.remove('hit');
        void this.discardEl.offsetWidth;
        this.discardEl.classList.add('hit');
        if (ev.left === 1 && !st.players.find((x) => x.id === ev.pid)?.carton) this.seatBubble(ev.pid, '1 carte !', '.warn', 1200);
        await sleep(120);
        return;
      }
      case 'draw': {
        const to = this.pointOf(ev.pid);
        const deck = this.rectCenter(this.deckEl);
        const shown = Math.min(ev.n, 8);
        if (ev.forced) {
          this.seatBubble(ev.pid, `+${ev.total || ev.n}`, '.hit', 1500);
          Sound.play('pay');
          d.pending = 0;
          this.renderCenter();
        }
        for (let k = 0; k < shown; k++) {
          const card = ev.pid === this.me && ev.cards ? ev.cards[k] : null;
          this.flyCard(card ? cardEl(card) : backEl(), deck, to, 360, { scaleTo: ev.pid === this.me ? 1 : 0.6 });
          Sound.play('step');
          await sleep(110);
        }
        d.counts[ev.pid] = (d.counts[ev.pid] || 0) + ev.n;
        if (ev.pid === this.me && ev.cards && d.hand) d.hand.push(...ev.cards);
        d.deck = Math.max(0, d.deck - ev.n);
        await sleep(260);
        this.renderSeats();
        this.renderHand();
        this.renderCenter();
        return;
      }
      case 'skip':
        this.seatBubble(ev.pid, h('span.ct-skipico', { html: SVG_SKIP }), '.skip', 1300);
        Sound.play('error');
        if (p) this.showBanner('🚫', `${p.name} passe son tour`, ev.rev ? 'Demi-tour à deux joueurs' : null, p.color, 1100);
        await sleep(700);
        return;
      case 'reverse':
        d.dir = ev.dir;
        this.renderCenter();
        this.dirEl.classList.remove('flip');
        void this.dirEl.offsetWidth;
        this.dirEl.classList.add('flip');
        Sound.play('turn');
        this.showBanner('🔄', 'Demi-tour !', ev.dir > 0 ? 'Sens des aiguilles d\'une montre' : 'Sens inverse', '#a66bff', 1200);
        await sleep(700);
        return;
      case 'stack':
        d.pending = ev.total;
        this.renderCenter();
        this.pendingEl.classList.remove('boom');
        void this.pendingEl.offsetWidth;
        this.pendingEl.classList.add('boom');
        Sound.play('takeover');
        await sleep(600);
        return;
      case 'color':
        d.color = ev.color;
        this.renderCenter();
        this.colorEl.classList.remove('flash');
        void this.colorEl.offsetWidth;
        this.colorEl.classList.add('flash');
        Sound.play('festival');
        this.showBanner('🎨', CNAMES[ev.color] + ' !', p ? `choisi par ${p.name}` : null, CCOLORS[ev.color], 1300);
        await sleep(600);
        return;
      case 'carton':
        this.seatBubble(ev.pid, h('span', '📣 CARTON !'), '.shout', 1900);
        Sound.play('monopoly');
        await sleep(700);
        return;
      case 'caught': {
        const by = this.player(ev.by);
        this.seatBubble(ev.pid, h('span', '🚨 PRIS !'), '.caught', 1700);
        Sound.play('alarm');
        if (p && by) this.showBanner('🚨', `${by.name} prend ${p.name} !`, `« Carton ! » oublié : +${ev.n} cartes`, '#ff3b4e', 1800);
        await sleep(900);
        return;
      }
      case 'swap': {
        const a = this.player(ev.a);
        const b = this.player(ev.b);
        const pa = this.pointOf(ev.a);
        const pb = this.pointOf(ev.b);
        for (let k = 0; k < 4; k++) {
          this.flyCard(backEl(), pa, pb, 600, { scaleTo: 0.6 });
          this.flyCard(backEl(), pb, pa, 600, { scaleTo: 0.6 });
          await sleep(70);
        }
        Sound.play('takeover');
        const ca = d.counts[ev.a];
        d.counts[ev.a] = d.counts[ev.b];
        d.counts[ev.b] = ca;
        if ((ev.a === this.me || ev.b === this.me) && st.hand) d.hand = st.hand.slice();
        if (a && b) this.showBanner('🔀', `${a.name} ⇄ ${b.name}`, 'Les mains sont échangées !', a.color, 1500);
        await sleep(700);
        this.renderSeats();
        this.renderHand();
        return;
      }
      case 'rotate': {
        Sound.play('takeover');
        this.showBanner('🌀', 'Toutes les mains tournent !', null, '#1dd3c0', 1500);
        for (const q of st.players) d.counts[q.id] = q.count;
        if (st.hand) d.hand = st.hand.slice();
        this.seatsEl.classList.add('spin');
        await sleep(900);
        this.seatsEl.classList.remove('spin');
        this.renderSeats();
        this.renderHand();
        return;
      }
      case 'reshuffle':
        d.deck = ev.n;
        this.renderCenter();
        this.deckEl.classList.add('shuffle');
        this.showBanner('🔀', 'La défausse est remélangée', null, '#3fa7ff', 1000);
        await sleep(650);
        this.deckEl.classList.remove('shuffle');
        return;
      case 'roundWin':
        await this.showRoundWin(ev, st);
        return;
      case 'win':
        Sound.play('win');
        return;
      case 'out':
        if (p) this.showBanner('🏳️', `${p.name} abandonne`, null, '#888', 1200);
        await sleep(300);
        return;
    }
  }

  async showRoundWin(ev, st) {
    const p = this.player(ev.pid);
    const target = st.settings.targetScore;
    Sound.play('win');
    confetti(1800);
    if (!target) {
      this.showBanner('🏁', `${p ? p.name : '?'} vide sa main !`, null, p ? p.color : undefined, 2200);
      await sleep(1600);
      return;
    }
    const pts = (c) => (c.c === 'w' ? 50 : /^\d$/.test(c.v) ? Number(c.v) : 20);
    const rows = ev.hands.map((x) => {
      const q = this.player(x.id) || {};
      const sum = x.cards.reduce((a, c) => a + pts(c), 0);
      return h('div.ct-rw-row' + (x.id === ev.pid ? '.win' : ''), { style: { '--c': q.color } },
        h('span.ct-avatar', q.pawn),
        h('b', q.name),
        h('div.ct-rw-cards', x.id === ev.pid ? h('span.ct-rw-empty', '🏁 Main vide !') : x.cards.slice(0, 12).map((c) => cardEl(c, '.tiny'))),
        h('span.ct-rw-pts', x.id === ev.pid ? `+${ev.points}` : sum ? `${sum} pts` : ''),
        h('span.ct-rw-total', `${x.score} / ${target}`)
      );
    });
    this.roundOverlay = h('div.ct-round',
      h('div.ct-round-card',
        h('div.ct-round-title', `🏁 Manche ${st.round} : ${p ? p.name : ''} gagne !`),
        h('div.ct-round-sub', `+${ev.points} points`),
        h('div.ct-rw', rows),
        st.over ? null : h('div.muted', 'La manche suivante commence…')
      )
    );
    this.v.gameEl.append(this.roundOverlay);
    await sleep(4600);
    this.roundOverlay.classList.add('out');
    const ov = this.roundOverlay;
    setTimeout(() => ov.remove(), 400);
  }

  onEmote({ key, emoji }) {
    this.seatBubble(key, emoji, '.emote', 2200);
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
    const target = this.state.settings.targetScore;
    const detail = (pl) => (target ? `${pl.score} pts` : pl.rank === 1 ? 'Main vide' : `${pl.cards} carte${pl.cards > 1 ? 's' : ''}`);
    const podium = h('div.podium', [ranked[1], ranked[0], ranked[2]].map((pl) => {
      if (!pl) return h('div.podium-slot.empty');
      const i = info(pl);
      return h('div.podium-slot.p' + pl.rank,
        h('div.avatar.lg', { style: { '--c': i.color } }, i.pawn),
        h('div.podium-name', h('span.' + (nameClass(i) || 'plain'), pl.name), ...roleTags(i, { level: false })),
        h('div.podium-step', ['🥇', '🥈', '🥉'][pl.rank - 1]),
        h('div.podium-worth', detail(pl))
      );
    }));
    const rw = v.rewards;
    ov.append(
      h('div.end-card',
        h('div.end-title', winner.id === this.me ? '🎉 VICTOIRE ! 🎉' : `🏆 ${winner.name} gagne !`),
        h('div.end-sub', `🃏 Carton ! · ${res.rounds} manche${res.rounds > 1 ? 's' : ''} · ${duration(res.duration)}`),
        podium,
        h('div.end-list', ranked.slice(3).map((pl) => h('div.end-row', `#${pl.rank} ${pl.name}`, h('span', detail(pl))))),
        rw ? h('div.rewards',
          h('div.reward', `+${rw.xp} XP`),
          rw.badges.length ? h('div.new-badges', h('div.small', 'Nouveaux badges débloqués !'), rw.badges.map((b) => h('div.badge.tier-' + b.tier, h('div.badge-icon', b.icon), h('div.badge-name', b.name)))) : null
        ) : !store.user ? h('div.hint', h('a', { href: '/register', 'data-link': true }, 'Créez un compte'), ' pour enregistrer vos victoires, gagner de l\'XP et des badges !') : null,
        h('div.btn-row.center',
          v.isHost ? h('button.btn.primary.lg', { onclick: () => v.cmd('room:rematch') }, '🔁 Rejouer') : h('div.muted', 'L\'hôte peut relancer une partie.'),
          h('button.btn.ghost', { onclick: () => (ov.hidden = true) }, '👁 Voir la table'),
          h('button.btn.ghost', { onclick: () => navigate('/') }, '🏠 Accueil')
        )
      )
    );
    if (rw && rw.badges.length && !this.badgeSound) {
      this.badgeSound = true;
      Sound.play('festival');
    }
  }
}

function ruleCard(card, title, text) {
  return h('div.ct-rule', cardEl(card, '.tiny'), h('div', h('b', title), h('small', text)));
}

function copy(text, msg) {
  (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject())
    .then(() => toast(msg, 'success'))
    .catch(() => modal({ title: 'Copier', body: h('input.input', { value: text, readonly: true, onfocus: (e) => e.target.select() }) }));
}
