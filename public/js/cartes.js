// ============================================================================
//  MyPoly — « Carton ! » : table de jeu de cartes (vue client)
//  Le serveur est seul maître du jeu : ce module ne fait qu'afficher et animer.
// ============================================================================
import { h, toast, modal, roleTags, roleRibbons, nameClass, sleep, confetti, duration } from './util.js';
import { store, emit } from './store.js';
import * as Sound from './sound.js';
import { navigate, toggleFullscreen } from './app.js';
import { webglAvailable } from './board3d.js';
import { Card3D } from './cards3d.js';

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
    { key: 'noSpecialFinish', label: 'Finir sur un chiffre', type: 'toggle', hint: 'Interdit de poser sa dernière carte si c\'est une carte spéciale (Stop, Demi-tour, +2, Jokers) : il faut piocher' },
    { key: 'cartonPenalty', label: 'Pénalité « Carton ! » oublié', type: 'select', options: [[2, '+2 cartes'], [4, '+4 cartes']] },
  ] },
  { group: 'Salle', items: [
    { key: 'isPublic', label: 'Salle publique', type: 'toggle', hint: 'Visible dans la liste des salles de l\'accueil' },
    { key: 'allowSpectators', label: 'Spectateurs autorisés', type: 'toggle' },
  ] },
];

export const CARD_PRESETS = {
  '⚖️ Classique': { startCards: 7, turnTime: 20, targetScore: 0, stacking: true, drawToPlay: false, sevenZero: false, cartonPenalty: 2, noSpecialFinish: true },
  '⚡ Éclair': { startCards: 5, turnTime: 10, targetScore: 0, stacking: true, drawToPlay: false, sevenZero: false, cartonPenalty: 2, noSpecialFinish: true },
  '🌪️ Chaos': { startCards: 7, turnTime: 20, targetScore: 0, stacking: true, drawToPlay: true, sevenZero: true, cartonPenalty: 4, noSpecialFinish: false },
  '🏆 Tournoi': { startCards: 7, turnTime: 30, targetScore: 200, stacking: true, drawToPlay: false, sevenZero: false, cartonPenalty: 2, noSpecialFinish: true },
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

/** Illustrations vectorielles des évènements de partie (animées en CSS). */
function eventArt(kind, color, extra) {
  const C = { r: '#ff5a5f', b: '#3fa7ff', g: '#2ecc71', y: '#ffb020' };
  const card = (x, y, rot, fill, cls = '') => `<g class="${cls}" transform="translate(${x} ${y}) rotate(${rot})"><rect x="-17" y="-25" width="34" height="50" rx="6" fill="#fff"/><rect x="-14" y="-22" width="28" height="44" rx="4" fill="${fill}"/><rect x="-7" y="-7" width="14" height="14" rx="3" transform="rotate(45)" fill="#fff" opacity=".9"/></g>`;
  const back = (x, y, rot, cls = '') => `<g class="${cls}" transform="translate(${x} ${y}) rotate(${rot})"><rect x="-17" y="-25" width="34" height="50" rx="6" fill="#f0a522"/><rect x="-14" y="-22" width="28" height="44" rx="4" fill="#1d2466"/><circle r="9" fill="none" stroke="#ffd166" stroke-width="2" stroke-dasharray="3 3"/></g>`;
  switch (kind) {
    case 'reverse':
      return `<svg viewBox="-60 -60 120 120"><defs><linearGradient id="fxr" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="${color}"/></linearGradient></defs>
        <g class="spin"><path d="M-34 -18 A38 38 0 0 1 30 -26" fill="none" stroke="url(#fxr)" stroke-width="11" stroke-linecap="round"/><path d="M22 -42 L42 -24 L16 -14 Z" fill="#fff"/>
        <path d="M34 18 A38 38 0 0 1 -30 26" fill="none" stroke="url(#fxr)" stroke-width="11" stroke-linecap="round"/><path d="M-22 42 L-42 24 L-16 14 Z" fill="#fff"/></g></svg>`;
    case 'skip':
      return `<svg viewBox="-60 -60 120 120"><circle class="ring" r="40" fill="none" stroke="${color}" stroke-width="4"/><g class="stamp"><circle r="38" fill="#ff3b4e" stroke="#fff" stroke-width="7"/><rect x="-24" y="-7" width="48" height="14" rx="4" fill="#fff"/></g></svg>`;
    case 'color':
      return `<svg viewBox="-60 -60 120 120"><g class="wheel">${['r', 'b', 'g', 'y'].map((k, i) => `<path d="M0 0 L${(Math.cos((i * Math.PI) / 2 - Math.PI / 2) * 44).toFixed(1)} ${(Math.sin((i * Math.PI) / 2 - Math.PI / 2) * 44).toFixed(1)} A44 44 0 0 1 ${(Math.cos(((i + 1) * Math.PI) / 2 - Math.PI / 2) * 44).toFixed(1)} ${(Math.sin(((i + 1) * Math.PI) / 2 - Math.PI / 2) * 44).toFixed(1)} Z" fill="${C[k]}"/>`).join('')}</g>
        <circle r="44" fill="none" stroke="#fff" stroke-width="5"/><circle class="fill" r="44" fill="${C[extra] || color}"/><circle class="shine" r="44" fill="url(#fxc)"/><defs><radialGradient id="fxc" cx=".35" cy=".3" r=".7"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset=".6" stop-color="#fff" stop-opacity="0"/></radialGradient></defs></svg>`;
    case 'caught':
      return `<svg viewBox="-60 -60 120 120"><g class="beam"><path d="M0 0 L-60 -22 L-60 22 Z" fill="#ff3b4e" opacity=".55"/><path d="M0 0 L60 -22 L60 22 Z" fill="#3fa7ff" opacity=".55"/></g>
        <rect x="-26" y="12" width="52" height="12" rx="4" fill="#2a2f5a"/><path d="M-20 12 V-6 A20 20 0 0 1 20 -6 V12 Z" fill="#ff3b4e" stroke="#fff" stroke-width="4"/><circle cx="-6" cy="-6" r="5" fill="#fff" opacity=".7"/></svg>`;
    case 'swap':
      return `<svg viewBox="-60 -60 120 120">${back(-22, 0, -12, 'sw-a')}${back(22, 0, 12, 'sw-b')}<path d="M-18 -40 Q0 -54 18 -40" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round"/><path d="M12 -46 L20 -38 L10 -34 Z" fill="#fff"/><path d="M18 40 Q0 54 -18 40" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round"/><path d="M-12 46 L-20 38 L-10 34 Z" fill="#fff"/></svg>`;
    case 'rotate':
      return `<svg viewBox="-60 -60 120 120"><g class="spin-slow">${[0, 1, 2, 3].map((k) => back(Math.cos((k * Math.PI) / 2) * 30, Math.sin((k * Math.PI) / 2) * 30, k * 90)).join('')}</g></svg>`;
    case 'shuffle':
      return `<svg viewBox="-60 -60 120 120">${back(0, 6, -14, 'sh-1')}${back(0, 2, 0, 'sh-2')}${back(0, -2, 14, 'sh-3')}</svg>`;
    case 'out':
      return `<svg viewBox="-60 -60 120 120"><rect x="-26" y="-40" width="5" height="82" rx="2" fill="#d8dcf5"/><path class="flag" d="M-21 -38 C0 -46 10 -30 34 -38 L34 -6 C10 2 0 -14 -21 -6 Z" fill="#fff" stroke="#c9cdf0" stroke-width="2"/></svg>`;
    case 'win':
      return `<svg viewBox="-60 -60 120 120"><g class="rays">${Array.from({ length: 12 }, (_, k) => `<rect x="-3" y="-58" width="6" height="18" rx="3" fill="#ffd166" transform="rotate(${k * 30})"/>`).join('')}</g><path d="M-22 -30 H22 V-8 A22 22 0 0 1 -22 -8 Z" fill="#ffd166" stroke="#fff" stroke-width="4"/><rect x="-6" y="12" width="12" height="12" fill="#ffd166"/><rect x="-18" y="24" width="36" height="9" rx="3" fill="#f0a522" stroke="#fff" stroke-width="3"/></svg>`;
    default: // start
      return `<svg viewBox="-60 -60 120 120">${card(-26, 6, -18, C.r, 'f-1')}${card(-9, 0, -6, C.b, 'f-2')}${card(9, 0, 6, C.g, 'f-3')}${card(26, 6, 18, C.y, 'f-4')}</svg>`;
  }
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
    this.dirEl = h('div.ct-dir', { html: `<svg viewBox="0 0 200 200" aria-hidden="true">
      <circle cx="100" cy="100" r="92" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="1 9" stroke-linecap="round"/>
      ${[0, 120, 240].map((a) => `<g transform="rotate(${a} 100 100)"><path d="M58 21 A92 92 0 0 1 100 8" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round"/><path d="M96 1 l9 7 -9 8" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></g>`).join('')}
    </svg>` });
    this.pendingEl = h('div.ct-pending', { hidden: true });
    this.deckCount = h('div.ct-deck-count');
    // Arène centrale : anneau lumineux (tourne dans le sens du jeu) et pointeur vers le joueur actif
    this.arena = h('div.ct-arena', h('div.ct-arena-ring'), h('div.ct-arena-disc'));
    this.pointer = h('div.ct-pointer', h('i'));
    this.center = h('div.ct-center', this.arena, this.pointer, this.dirEl, this.colorEl, h('div.ct-piles', h('div.ct-deck-wrap', this.deckEl, this.deckCount), this.discardEl), this.pendingEl);
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
    // Décor vivant : halos de couleur, sol néon, particules
    const sparks = Array.from({ length: 26 }, () => h('i.ct-spark', { style: {
      left: Math.random() * 100 + '%',
      '--s': (2 + Math.random() * 4).toFixed(1) + 'px',
      '--d': (9 + Math.random() * 14).toFixed(1) + 's',
      '--delay': (-Math.random() * 20).toFixed(1) + 's',
    } }));
    this.bg = h('div.ct-bg', h('i.ct-blob.b1'), h('i.ct-blob.b2'), h('i.ct-blob.b3'), h('div.ct-floor'), h('div.ct-sparks', sparks));
    // Table 3D façon MyPoly (fiches des joueurs dans les coins), sinon table 2D de secours
    this.host = h('div.board3d-host');
    this.cornersEl = h('div.corners');
    v.notifStacks = Object.fromEntries(['tl', 'tr', 'bl', 'br', 'mid'].map((k) => [k, h('div.notif-stack.ns-' + k)]));
    v.gameEl = h('div.game.cards-game', this.host, this.bg, h('div.ct-room', v.playersEl), this.cornersEl, ...Object.values(v.notifStacks), this.fx, this.banner, h('div.topbar', v.toolbar, v.popover));
    v.root.append(v.gameEl, v.endOverlay);
    if (webglAvailable()) {
      try {
        this.b3 = new Card3D(this.host, { onDeck: () => this.draw() });
        v.gameEl.classList.add('c3d', 'webgl');
        this.bg.remove();
        this.fx.append(this.pendingEl);
        this.colorTag = h('div.c3-color');
        this.deckTag = h('div.c3-deck');
        this.fx.append(this.colorTag, this.deckTag);
      } catch (e) {
        console.error('WebGL indisponible', e);
        this.b3 = null;
      }
    }
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
      if (!this.state) return;
      if (!this.busy) {
        this.renderSeats();
        this.renderHand();
        this.aimPointer();
      }
      this.renderCenter();
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
      info: st ? (st.settings.targetScore ? `Manche ${st.round} · ${st.settings.targetScore} pts` : 'Carton !') : '',
      camera: this.b3 ? () => this.b3.resetView() : null,
      rules: () => this.showRules(),
      forfeit: me && !me.out && this.room.state === 'playing' ? () => this.forfeit() : null,
    });
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
        h('div', `${yes(s.stacking)} Cumul des +2/+4 · ${yes(s.drawToPlay)} Pioche jusqu'à pouvoir jouer · ${yes(s.sevenZero)} Règle du 7 et du 0 · ${yes(s.noSpecialFinish)} Finir sur un chiffre`),
        s.noSpecialFinish ? h('div.muted', '🚫 Ta dernière carte doit être un chiffre : impossible de finir sur Stop, Demi-tour, +2 ou un Joker (il faut piocher).') : null,
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
    this.aimPointer();
  }

  /** Oriente le faisceau de l'arène vers le joueur dont c'est le tour. */
  aimPointer() {
    if (this.b3) return;
    const st = this.state;
    const ptr = this.pointer;
    if (!st || !ptr) return;
    // Vers un adversaire uniquement : quand c'est mon tour, ma main et « À VOUS ! » suffisent
    const id = st.over || st.phase === 'roundEnd' || st.current === this.me ? null : st.current;
    const target = id === this.me ? this.handEl : id ? this.seatsEl.querySelector(`.ct-seat[data-pid="${CSS.escape(id)}"] .ct-badge`) : null;
    if (!target) {
      ptr.classList.remove('on');
      return;
    }
    requestAnimationFrame(() => {
      const c = this.center.getBoundingClientRect();
      const t = target.getBoundingClientRect();
      const cx = c.left + c.width / 2;
      const cy = c.top + c.height / 2;
      const dx = t.left + t.width / 2 - cx;
      const dy = t.top + t.height / 2 - cy;
      let deg = (Math.atan2(dy, dx) * 180) / Math.PI;
      // Rotation par le plus court chemin
      const prev = this.ptrDeg ?? deg;
      deg = prev + ((((deg - prev) % 360) + 540) % 360) - 180;
      this.ptrDeg = deg;
      const p = this.player(id);
      ptr.style.setProperty('--pc', p ? p.color : '#fff');
      const half = id === this.me ? t.height / 2 : Math.max(t.width, t.height) / 2;
      ptr.style.setProperty('--len', Math.max(40, Math.hypot(dx, dy) - half - 10) + 'px');
      ptr.style.transform = `rotate(${deg}deg)`;
      ptr.classList.add('on');
    });
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
        return [((j + 0.5) / m) * 100, second ? 30 : 10, 't'];
      });
    }
    // Plaques posées sur le rebord de la table (en pourcentage du tapis)
    const L = { l: [0, 48, 'l'], r: [100, 48, 'r'], t: [50, 5, 't'], tl: [22, 9, 't'], tr: [78, 9, 't'], tl2: [32, 6, 't'], tr2: [68, 6, 't'], t1: [39, 5, 't'], t2: [61, 5, 't'] };
    const map = { 1: ['t'], 2: ['tl2', 'tr2'], 3: ['l', 't', 'r'], 4: ['l', 'tl2', 'tr2', 'r'], 5: ['l', 'tl', 't', 'tr', 'r'], 6: ['l', 'tl', 't1', 't2', 'tr', 'r'] };
    return (map[n] || map[5]).map((k) => L[k]);
  }

  renderSeats() {
    const st = this.state;
    if (!st) return;
    if (this.b3) return this.renderCorners();
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

  /** Emplacements des adversaires autour de la table (sens horaire depuis moi). */
  slotsFor(n) {
    return { 1: ['tm'], 2: ['tl', 'tr'], 3: ['ml', 'tm', 'mr'], 4: ['ml', 'tl', 'tr', 'mr'], 5: ['ml', 'tl', 'tm', 'tr', 'mr'] }[n] || [];
  }
  /** Fiches des joueurs dans les coins, exactement comme dans MyPoly. */
  renderCorners() {
    const st = this.state;
    const { mine, others } = this.seatOrder();
    const slots = this.slotsFor(others.length);
    const map = {};
    others.forEach((p, k) => (map[p.id] = slots[k]));
    if (mine) map[mine.id] = 'me';
    this.b3.setSeats(map);
    this.cornersEl.innerHTML = '';
    const counts = {};
    const me = this.player(this.me);
    for (const p of st.players) {
      const slot = map[p.id];
      if (!slot) continue;
      const count = this.disp ? this.disp.counts[p.id] ?? p.count : p.count;
      counts[p.id] = p.out ? 0 : count;
      const turn = st.current === p.id && !st.over && st.phase !== 'roundEnd';
      const isMe = p.id === this.me;
      const corner = slot === 'me' ? 'bl' : slot;
      // Téléphone : adversaires en grille de 2 colonnes sous la barre d'outils
      const k = others.indexOf(p);
      const card = h('div.pcard.corner.c-' + corner + (turn ? '.turn' : '') + (p.out ? '.out' : '') + (isMe ? '.me' : '') + (p.vip ? '.vip' : ''),
        { 'data-pid': p.id, style: { '--c': p.color } },
        h('div.pc-face'),
        roleRibbons(p),
        h('div.pc-avatar', h('span.pc-pawn', p.out ? '💀' : p.pawn)),
        h('div.pc-body',
          h('div.pc-name', h('span.pc-name-text.' + (nameClass(p) || 'plain'), p.name), ...roleTags(p, { level: false, compact: true })),
          h('div.pc-cash.c3-count' + (count === 1 ? '.one' : ''), h('span.c3-cards', '🃏'), p.out ? 'Abandon' : `${count} carte${count > 1 ? 's' : ''}`),
          h('div.pc-chips',
            st.settings.targetScore ? h('span.pc-chip', { title: 'Points' }, `🏆 ${p.score} pts`) : null,
            p.carton && count === 1 ? h('span.pc-chip.c3-carton', '📣 CARTON !') : null,
            !p.isBot && !p.connected ? h('span.pc-chip.off', { title: 'Déconnecté' }, '📡') : p.afk ? h('span.pc-chip.off', { title: 'Absent' }, '💤') : null
          )
        ),
        turn ? h('div.pcard-turn', isMe ? '🎴 À VOUS !' : 'JOUE…') : null,
        turn ? h('div.pcard-timer') : null
      );
      // Oubli de « Carton ! » : bouton pour prendre le joueur, sur sa fiche
      if (p.exposed && me && !me.out && !isMe && !st.over) {
        const left = p.exposedUntil ? p.exposedUntil - (Date.now() + this.v.clockOffset) : 5000;
        if (left > 0) {
          const btn = h('button.ct-catch.c3-catch', { title: 'Ce joueur a oublié de crier « Carton ! »', onclick: () => {
            btn.disabled = true;
            this.act('catch', { target: p.id });
          } }, '🚨 ', h('span.ct-catch-long', 'Carton oublié ! '), h('b', 'Prendre'), h('i.ct-catch-bar', { style: { animationDuration: Math.round(left) + 'ms' } }));
          card.append(btn);
          setTimeout(() => btn.remove(), left);
        }
      }
      if (k >= 0) card.style.setProperty('--gr', String(Math.floor(k / 2))), card.style.setProperty('--gc', String(k % 2));
      this.cornersEl.append(card);
    }
    this.v.gameEl.style.setProperty('--rows', String(Math.ceil(others.length / 2)));
    this.b3.setHands(counts);
    const cur = this.player(st.current);
    this.b3.setTurn(st.over || st.phase === 'roundEnd' ? null : st.current, cur && cur.color);
  }

  badgeEl(p, isMe) {
    const st = this.state;
    const turn = st.current === p.id && !st.over && st.phase !== 'roundEnd';
    const count = this.disp ? this.disp.counts[p.id] ?? p.count : p.count;
    return h('div.ct-badge' + (turn ? '.turn' : '') + (p.out ? '.out' : '') + (isMe ? '.me' : ''), { style: { '--c': p.color } },
      h('div.ct-avatar', p.out ? '💀' : p.pawn, p.out ? null : h('span.ct-count' + (count === 1 ? '.one' : ''), { title: 'Cartes en main' }, String(count))),
      h('div.ct-binfo',
        h('div.ct-name', h('span.' + (nameClass(p) || 'plain'), p.name), ...roleTags(p, { level: false, compact: true })),
        h('div.ct-chips',
          p.out ? h('span.pc-chip.off', 'Abandon') : h('span.pc-chip', { title: 'Cartes en main' }, `${count} carte${count > 1 ? 's' : ''}`),
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
    if (this.b3) return this.renderCenter3d();
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
    // Toute l'ambiance prend la couleur en cours
    this.v.gameEl.style.setProperty('--cc', CCOLORS[d.color] || '#a66bff');
    this.arena.classList.toggle('ccw', d.dir < 0);
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

  renderCenter3d() {
    const st = this.state;
    const d = this.disp;
    const b = this.b3;
    b.setDeck(d.deck);
    b.setPile(this.pile);
    b.setColor(CCOLORS[d.color] || '#ffffff');
    b.setDirection(d.dir);
    const canDraw = this.myTurn() && st.phase === 'play';
    b.deckActive = canDraw;
    // Étiquettes posées sur la table : couleur en cours, pioche cumulée
    requestAnimationFrame(() => {
      const pile = b.pileScreen();
      const deck = b.deckScreen();
      this.colorTag.textContent = CNAMES[d.color] || '';
      this.colorTag.style.setProperty('--cc', CCOLORS[d.color] || '#fff');
      // Couleur en cours sous la défausse, compteur sous la pioche
      this.colorTag.style.left = pile.x + 'px';
      this.colorTag.style.top = pile.y + 58 + 'px';
      const mustDraw = canDraw && !st.playable.length;
      this.deckTag.classList.toggle('draw', mustDraw);
      this.deckTag.textContent = mustDraw ? '👆 Piochez !' : `${d.deck} cartes`;
      this.deckTag.style.left = deck.x + 'px';
      this.deckTag.style.top = deck.y + 62 + 'px';
      this.pendingEl.hidden = !d.pending;
      this.pendingEl.textContent = '+' + d.pending;
      this.pendingEl.style.left = pile.x + 60 + 'px';
      this.pendingEl.style.top = pile.y - 90 + 'px';
    });
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
    // Même taille que la variable CSS --hw ; sur grand écran, ma plaque occupe le coin gauche
    const W = window.innerWidth;
    const H = window.innerHeight;
    // Téléphone en paysage (écran bas) : cartes plus petites pour laisser voir la table
    const shortLandscape = H <= 560 && W / H >= 1.25;
    const cw = shortLandscape ? Math.min(64, Math.max(46, H * 0.14)) : W <= 700 ? Math.min(96, Math.max(70, H * 0.11)) : Math.min(132, Math.max(84, H * 0.125));
    const width = Math.min(W > 1100 ? W - 2 * 290 : W <= 700 ? W - 64 : W - 40, 1100);
    const overlap = n > 1 ? Math.min(cw * 0.15, (width - cw) / (n - 1) - cw) : 0;
    this.handEl.style.setProperty('--cw', cw + 'px');
    this.v.gameEl.style.setProperty('--hw', cw + 'px');
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
        const last = st.hand.length === 1 ? st.hand[0] : null;
        const blocked = last && st.settings.noSpecialFinish && !/^\d$/.test(last.v);
        el.append(h('div.ct-hint' + (blocked ? '.warn' : ''), blocked ? '🚫 Interdit de finir sur une carte spéciale : piochez !' : 'Aucune carte jouable…'), h('button.btn.primary.ct-btn.pulse', { onclick: () => this.draw() }, '🂠 Piocher (D)'));
      } else {
        el.append(h('div.ct-hint', 'À vous ! Posez une carte (pioche interdite : vous pouvez jouer)'));
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
    // Plateau 3D : barre de la fiche du joueur actif (dans son coin)
    const cbar = this.cornersEl && this.cornersEl.querySelector('.pcard.corner.turn .pcard-timer');
    if (!bar && !cbar) return;
    const left = st.deadline ? st.deadline - (Date.now() + this.v.clockOffset) : 0;
    // Durée réelle de ce tour (temps normal, joueur absent : 5 s…), mesurée à l'arrivée de l'échéance
    if (st.deadline !== this.dlSeen) {
      this.dlSeen = st.deadline;
      this.dlTotal = Math.max(1000, Math.min(left, (this.room.settings.turnTime || 20) * 1000));
    }
    const total = this.dlTotal || (this.room.settings.turnTime || 20) * 1000;
    const frac = Math.max(0, Math.min(1, left / total));
    if (cbar) {
      cbar.hidden = !st.deadline;
      cbar.style.transform = `scaleX(${frac})`;
      cbar.classList.toggle('urgent', left < 5000);
    }
    if (!st.deadline || this.busy) {
      if (bar) bar.parentElement.hidden = true;
      return;
    }
    if (bar) {
      bar.parentElement.hidden = false;
      bar.style.transform = `scaleX(${frac})`;
      bar.parentElement.classList.toggle('urgent', left < 5000);
    }
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
    const st = this.state;
    // Une carte jouable en main : pas le droit de piocher (sauf pénalité +2/+4 en attente)
    const canPlay = st && st.phase === 'play' && !st.pendingDraw && st.playable && st.playable.length;
    if (!this.myTurn() || st.phase !== 'play' || canPlay) {
      if (canPlay && this.myTurn()) toast('Vous avez une carte jouable : posez-la !', 'error');
      if (this.state && !this.state.over) this.nope(this.b3 ? (() => { const p = this.b3.deckScreen(); return { left: p.x, top: p.y }; })() : this.deckEl);
      return;
    }
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
    if (!this.myTurn() || !st.playable.includes(card.id)) {
      // Pas mon tour, ou carte non jouable : sens interdit sur la carte + petit son
      el.classList.remove('nope');
      void el.offsetWidth;
      el.classList.add('nope');
      this.nope(el);
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

  /**
   * Fenêtre de choix plein écran, dans le style des annonces de partie :
   * grand titre façon logo, choix en grandes cartes, Échap ou clic à côté pour annuler.
   */
  picker(kind, title, sub, items, color) {
    return new Promise((resolve) => {
      let done = false;
      const finish = (v) => {
        if (done) return;
        done = true;
        document.removeEventListener('keydown', onKey, true);
        ov.classList.add('out');
        setTimeout(() => ov.remove(), 220);
        resolve(v);
      };
      const onKey = (e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          finish(null);
        }
        const n = Number(e.key);
        if (n >= 1 && n <= items.length) {
          e.preventDefault();
          e.stopPropagation();
          finish(items[n - 1].value);
        }
      };
      const ov = h('div.pk.pk-' + kind, { style: { '--c': color }, onclick: (e) => e.target === ov && finish(null) },
        h('div.pk-head',
          h('div.fx-art.pk-art', { html: eventArt(kind === 'color' ? 'color' : 'swap', color, null) }),
          h('div.fx-title', title),
          h('div.pk-sub', sub)
        ),
        h('div.pk-list', items.map((it, k) => {
          const b = h('button.pk-item', { style: { '--c': it.color, '--d': k * 60 + 'ms' }, onclick: () => finish(it.value) }, ...it.content, h('kbd.pk-key', String(k + 1)));
          return b;
        })),
        h('button.pk-cancel', { onclick: () => finish(null) }, 'Annuler', h('kbd', 'Échap'))
      );
      document.addEventListener('keydown', onKey, true);
      this.v.gameEl.append(ov);
    });
  }

  pickColor() {
    const counts = { r: 0, b: 0, g: 0, y: 0 };
    for (const c of this.state.hand) if (c.c !== 'w') counts[c.c]++;
    const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
    return this.picker('color', 'Quelle couleur ?', 'Choisissez la couleur à jouer', Object.entries(CCOLORS).map(([k, col]) => ({
      value: k,
      color: col,
      content: [
        h('span.pk-swatch', h('i')),
        h('b.pk-name', CNAMES[k]),
        h('small.pk-meta', counts[k] ? `${counts[k]} carte${counts[k] > 1 ? 's' : ''} en main` : 'aucune en main'),
        k === best && counts[k] ? h('span.pk-tag', 'Conseillé') : null,
      ],
    })), '#a66bff');
  }

  pickTarget() {
    const mine = this.state.hand ? this.state.hand.length - 1 : 0; // après avoir posé le 7
    const others = this.state.players.filter((p) => p.id !== this.me && !p.out);
    const fan = (n) => h('span.pk-fan', Array.from({ length: Math.min(n, 9) }, (_, k) => {
      const t = Math.min(n, 9) > 1 ? k / (Math.min(n, 9) - 1) - 0.5 : 0;
      return h('i', { style: { transform: `rotate(${t * 50}deg)` } });
    }));
    return this.picker('swap', 'Échange !', `Votre main : ${mine} carte${mine > 1 ? 's' : ''} — avec qui échanger ?`, others.map((p) => {
      const n = this.disp.counts[p.id] ?? p.count;
      const diff = n - mine;
      return {
        value: p.id,
        color: p.color,
        content: [
          fan(n),
          h('span.pk-avatar', p.pawn),
          h('b.pk-name', p.name),
          h('small.pk-meta', `${n} carte${n > 1 ? 's' : ''}`),
          h('span.pk-deal' + (diff < 0 ? '.good' : diff > 0 ? '.bad' : ''), diff < 0 ? `${diff} pour vous` : diff > 0 ? `+${diff} pour vous` : 'égalité'),
        ],
      };
    }), '#2ecc71');
  }

  // ============================================================ animations
  /** Position (écran) d'un joueur : siège adverse, ou ma main. */
  pointOf(pid) {
    if (pid === this.me && this.disp && this.disp.hand) {
      const r = this.handEl.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }
    const el = this.b3 ? this.cornersEl.querySelector(`[data-pid="${CSS.escape(pid)}"]`) : this.v.playersEl.querySelector(`.ct-seat[data-pid="${CSS.escape(pid)}"] .ct-fan`) || this.v.playersEl.querySelector(`[data-pid="${CSS.escape(pid)}"]`);
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
  /** Centre de la table à l'écran (au-dessus des piles). */
  tableCenter() {
    if (this.b3) {
      const p = this.b3.pileScreen();
      const d = this.b3.deckScreen();
      return { x: (p.x + d.x) / 2, y: Math.min(p.y, d.y) - 30 };
    }
    const r = this.center.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 - 30 };
  }
  /**
   * Annonce d'un évènement de partie : une illustration vectorielle animée propre à
   * l'évènement (flèches qui tournent, panneau qui s'abat, roue des couleurs…) et un
   * grand titre dans le style du logo, posés au centre de la table. Un seul à la fois.
   */
  showBanner(kind, title, sub, color = '#3fa7ff', ms = 1500, extra = null) {
    if (document.hidden) return;
    const old = this.flashEl;
    if (old) {
      old.classList.add('out');
      setTimeout(() => old.remove(), 240);
    }
    const host = this.v.gameEl.getBoundingClientRect();
    const c = this.tableCenter();
    const el = h('div.fx-event.k-' + kind + (kind === 'reverse' && extra < 0 ? '.ccw' : ''), { style: { '--c': color, left: c.x - host.left + 'px', top: c.y - host.top + 'px' } },
      h('div.fx-glow'),
      h('div.fx-art', { html: eventArt(kind, color, extra) }),
      h('div.fx-title', { 'data-text': title }, title),
      sub ? h('div.fx-sub', sub) : null
    );
    this.v.gameEl.append(el);
    this.flashEl = el;
    setTimeout(() => {
      el.classList.add('out');
      setTimeout(() => el.remove(), 260);
      if (this.flashEl === el) this.flashEl = null;
    }, Math.max(ms, 1500));
  }
  /** « Sens interdit » sur une carte ou la pioche : action impossible maintenant. */
  nope(target) {
    Sound.play('nope');
    if (!target) return;
    const r = target.getBoundingClientRect ? target.getBoundingClientRect() : target;
    const host = this.v.gameEl.getBoundingClientRect();
    const el = h('div.ct-nope', { style: { left: r.left + (r.width || 0) / 2 - host.left + 'px', top: r.top + (r.height || 0) / 2 - host.top + 'px' } },
      h('span', { html: '<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="21" fill="#ff3b4e" stroke="#fff" stroke-width="4"/><rect x="11" y="20" width="26" height="8" rx="2" fill="#fff"/></svg>' }));
    this.v.gameEl.append(el);
    setTimeout(() => el.remove(), 750);
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
        if (this.b3) this.b3.setPile([]);
        for (let k = 0; k < n; k++) {
          for (const id of ids) {
            if (this.b3) {
              if (k < 3) this.b3.drawCards(id, 1, id === this.me);
            } else this.flyCard(backEl(), deck, this.pointOf(id), 300, { scaleTo: 0.6 });
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
        this.showBanner('start', st.round > 1 ? `Manche ${st.round}` : 'C\'est parti !', `${p ? p.name : ''} commence`, p ? p.color : '#ffd166');
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
        if (this.b3) await this.b3.playCard(ev.pid, ev.card, isMe);
        else await this.flyCard(cardEl(ev.card), from, this.rectCenter(this.discardEl), 380, { rot: (Math.random() - 0.5) * 16, scaleFrom: isMe ? 1 : 0.6 });
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
        if (this.b3) {
          await this.b3.drawCards(ev.pid, ev.n, ev.pid === this.me);
          for (let k = 0; k < shown; k++) Sound.play('step');
        }
        for (let k = 0; k < (this.b3 ? 0 : shown); k++) {
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
        if (p) this.showBanner('skip', 'Passe ton tour !', p.name, p.color, 1300);
        await sleep(700);
        return;
      case 'reverse':
        d.dir = ev.dir;
        this.renderCenter();
        this.dirEl.classList.remove('flip');
        void this.dirEl.offsetWidth;
        this.dirEl.classList.add('flip');
        if (this.b3) this.b3.spinArrows();
        Sound.play('turn');
        this.showBanner('reverse', 'Demi-tour !', ev.dir > 0 ? 'Sens des aiguilles d\'une montre' : 'Sens inverse', '#a66bff', 1400, ev.dir);
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
        if (this.b3) this.b3.burst(this.b3.pilePos.clone().setY(0.6), CCOLORS[ev.color], 30);
        Sound.play('festival');
        this.showBanner('color', CNAMES[ev.color] + ' !', p ? `Couleur choisie par ${p.name}` : null, CCOLORS[ev.color], 1500, ev.color);
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
        if (p && by) this.showBanner('caught', 'Pris !', `${p.name} a oublié « Carton ! » · +${ev.n} cartes`, '#ff3b4e', 1800);
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
        if (a && b) this.showBanner('swap', 'Échange !', `${a.name} ⇄ ${b.name}`, a.color, 1600);
        await sleep(700);
        this.renderSeats();
        this.renderHand();
        return;
      }
      case 'rotate': {
        Sound.play('takeover');
        this.showBanner('rotate', 'Tout le monde tourne !', 'Chacun passe sa main au suivant', '#1dd3c0', 1600);
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
        if (this.b3) {
          this.b3.deckLayers = 0;
          this.b3.setDeck(ev.n);
        }
        this.showBanner('shuffle', 'Mélange !', 'La défausse repart dans la pioche', '#3fa7ff', 1300);
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
        if (p) this.showBanner('out', 'Abandon', p.name, '#9aa0c7', 1300);
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
      this.showBanner('win', 'Main vide !', p ? p.name : '', p ? p.color : '#ffd166', 2200);
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
          v.isHost ? h('button.btn.ghost', { onclick: () => v.openGameChooser() }, '🎮 Changer de jeu') : null,
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
