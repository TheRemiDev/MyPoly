// ============================================================================
//  MyPoly — Petits chevaux : plateau de course (vue client)
//  Le serveur est seul maître du jeu (dé, déplacements) : ce module affiche et anime.
// ============================================================================
import { h, toast, modal, roleTags, nameClass, sleep, confetti, duration } from './util.js';
import { store, emit } from './store.js';
import * as Sound from './sound.js';
import { navigate, toggleFullscreen } from './app.js';

export const HORSE_SETTINGS_UI = [
  { group: 'Course', items: [
    { key: 'maxPlayers', label: 'Joueurs max', type: 'select', options: [2, 3, 4].map((n) => [n, n + ' joueurs']) },
    { key: 'horsesToWin', label: 'Chevaux à ramener', type: 'select', options: [[1, '1 cheval (éclair)'], [2, '2 chevaux'], [3, '3 chevaux'], [4, '4 chevaux (classique)']] },
    { key: 'turnTime', label: 'Temps par décision', type: 'select', options: [[10, '10 s'], [15, '15 s'], [20, '20 s'], [30, '30 s'], [0, 'Illimité']] },
  ] },
  { group: 'Règles', items: [
    { key: 'sixToExit', label: 'Un 6 pour sortir', type: 'toggle', hint: 'Sinon, un 1 ou un 6 fait sortir un cheval de l\'écurie' },
    { key: 'threeTries', label: '3 essais pour faire un 6', type: 'toggle', hint: 'Quand aucun cheval n\'est en jeu' },
    { key: 'sixReplay', label: 'Un 6 fait rejouer', type: 'toggle' },
    { key: 'strictLadder', label: 'Échelle classique', type: 'toggle', hint: 'Il faut s\'arrêter pile devant l\'échelle, puis faire 1, 2, 3… 6 pour monter, et 6 pour le centre' },
    { key: 'noPassing', label: 'Interdit de doubler', type: 'toggle', hint: 'Un cheval ne peut pas passer par-dessus un autre' },
    { key: 'captureReplay', label: 'Rejouer après une prise', type: 'toggle', hint: 'Renvoyer un cheval à l\'écurie fait rejouer' },
  ] },
  { group: 'Salle', items: [
    { key: 'isPublic', label: 'Salle publique', type: 'toggle', hint: 'Visible dans la liste des salles de l\'accueil' },
    { key: 'allowSpectators', label: 'Spectateurs autorisés', type: 'toggle' },
  ] },
];

export const HORSE_PRESETS = {
  '⚡ Éclair': { horsesToWin: 1, turnTime: 15, sixToExit: true, threeTries: true, sixReplay: true, strictLadder: false, noPassing: false, captureReplay: false },
  '🏇 Standard': { horsesToWin: 2, turnTime: 20, sixToExit: true, threeTries: true, sixReplay: true, strictLadder: false, noPassing: false, captureReplay: false },
  '🏰 Classique': { horsesToWin: 4, turnTime: 20, sixToExit: true, threeTries: true, sixReplay: true, strictLadder: true, noPassing: false, captureReplay: false },
  '🌪️ Bagarre': { horsesToWin: 2, turnTime: 20, sixToExit: false, threeTries: true, sixReplay: true, strictLadder: false, noPassing: false, captureReplay: true },
};

const EMOTES = ['👍', '😂', '😱', '😡', '🔥', '💸', '🎉', '😎', '🙏', '💀'];
const N = 17; // grille 17 × 17
const TRACK = 60;
const ENTRY = 58;
const CENTER = 65;
const QNAMES = ['Rouge', 'Vert', 'Jaune', 'Bleu'];
const PIPS = { 1: [5], 2: [1, 9], 3: [1, 5, 9], 4: [1, 3, 7, 9], 5: [1, 3, 5, 7, 9], 6: [1, 3, 4, 6, 7, 9] };

// --------------------------------------------------------------- géométrie
/** Les 60 cases du parcours (sens horaire), en [ligne, colonne] du quadrant 0. */
const TRACK_CELLS = (() => {
  const t = [];
  for (let c = 0; c <= 6; c++) t.push([7, c]);
  for (let r = 6; r >= 0; r--) t.push([r, 7]);
  t.push([0, 8]);
  for (let r = 0; r <= 6; r++) t.push([r, 9]);
  for (let c = 10; c <= 16; c++) t.push([7, c]);
  t.push([8, 16]);
  for (let c = 16; c >= 10; c--) t.push([9, c]);
  for (let r = 10; r <= 16; r++) t.push([r, 9]);
  t.push([16, 8]);
  for (let r = 16; r >= 10; r--) t.push([r, 7]);
  for (let c = 6; c >= 0; c--) t.push([9, c]);
  t.push([8, 0]);
  return t;
})();
/** Rotation d'un quart de tour dans le sens horaire, k fois. */
function rot([r, c], k) {
  for (let i = 0; i < ((k % 4) + 4) % 4; i++) [r, c] = [c, N - 1 - r];
  return [r, c];
}
const startOf = (q) => 1 + 15 * q;
const ladderCell = (q, step) => rot([8, step], q); // marches 1 à 6
const YARD_SLOTS = [[2, 2], [2, 4], [4, 2], [4, 4]];
// Chevaux arrivés : rangés dans le triangle de leur couleur (côté gauche pour le quadrant 0)
const CENTER_SLOTS = [[7.25, 7.05], [8.0, 7.05], [8.75, 7.05], [8.0, 7.55]];

function makeDie() {
  const face = h('div.hz-die-face');
  const el = h('div.hz-die', face);
  el._face = face;
  return el;
}
function showFace(die, v) {
  die._face.innerHTML = '';
  for (let k = 1; k <= 9; k++) die._face.append(h('i' + ((PIPS[v] || []).includes(k) ? '.on' : '')));
}

export class HorseTable {
  constructor(view) {
    this.v = view;
    this.state = null;
    this.queue = [];
    this.busy = false;
    this.disp = null;
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
  /** Rotation de la vue : mon écurie toujours en bas à gauche. */
  get turnView() {
    const me = this.player(this.me);
    return me ? (3 - me.quad + 4) % 4 : 0;
  }
  /** Position (ligne, colonne) affichée d'une cellule logique. */
  view(rc) {
    return rot(rc, this.turnView);
  }

  // ============================================================== structure
  build() {
    const v = this.v;
    this.boardEl = h('div.hz-board');
    this.horseLayer = h('div.hz-horses');
    this.boardEl.append(this.horseLayer);
    this.die = makeDie();
    this.rollBtn = h('button.hz-roll', { onclick: () => this.roll() }, '🎲 Lancer le dé');
    this.hintEl = h('div.hz-hint');
    this.dicePanel = h('div.hz-dice-panel', this.die, h('div.hz-dice-side', this.hintEl, this.rollBtn));
    this.platesEl = h('div.hz-plates');
    this.fx = h('div.ct-fx');
    this.banner = h('div.ct-banners');
    const sparks = Array.from({ length: 22 }, () => h('i.ct-spark', { style: {
      left: Math.random() * 100 + '%',
      '--s': (2 + Math.random() * 4).toFixed(1) + 'px',
      '--d': (9 + Math.random() * 14).toFixed(1) + 's',
      '--delay': (-Math.random() * 20).toFixed(1) + 's',
    } }));
    this.bg = h('div.ct-bg', h('i.ct-blob.b1'), h('i.ct-blob.b2'), h('i.ct-blob.b3'), h('div.ct-floor'), h('div.ct-sparks', sparks));

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
    v.playersEl = h('div.hz-stage', h('div.hz-board-wrap', this.boardEl), this.dicePanel, this.platesEl);
    v.gameEl = h('div.game.cards-game.horses-game', this.bg, v.playersEl, this.fx, this.banner, h('div.topbar', v.toolbar, v.popover));
    v.root.append(v.gameEl, v.endOverlay);
    v.renderTabs();
    v.renderChat();
    this.renderToolbar();
    this.onKey = (e) => {
      if (e.target.matches('input, textarea, select') || !this.state) return;
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        this.roll();
      }
      const n = Number(e.key);
      if (n >= 1 && n <= 4 && this.myMove()) this.move(n - 1);
    };
    document.addEventListener('keydown', this.onKey);
  }

  destroy() {
    document.removeEventListener('keydown', this.onKey);
    this.dead = true;
  }

  // ============================================================ barre d'outils
  renderToolbar() {
    const v = this.v;
    if (!v.toolbar) return;
    const st = this.state;
    const me = this.player(this.me);
    v.toolbar.innerHTML = '';
    v.toolbar.append(
      h('div.tb-code', { title: 'Copier le lien d\'invitation', onclick: () => copy(location.origin + '/r/' + v.code, 'Lien copié !') }, '🔗 ', v.code),
      h('div.tb-info', st ? `🐴 ${st.settings.horsesToWin} cheva${st.settings.horsesToWin > 1 ? 'ux' : 'l'} à ramener` : '🐴'),
      h('button.icon-btn' + (v.pop === 'chat' ? '.on' : ''), { title: 'Discussion', onclick: () => v.togglePop('chat') }, '💬', v.unread ? h('span.tb-badge', String(v.unread)) : null),
      h('button.icon-btn' + (v.pop === 'log' ? '.on' : ''), { title: 'Journal de la partie', onclick: () => v.togglePop('log') }, '📜'),
      h('button.icon-btn' + (v.pop === 'emote' ? '.on' : ''), { title: 'Réagir', onclick: () => v.togglePop('emote') }, '😀'),
      h('button.icon-btn.music-btn' + (v.pop === 'music' ? '.on' : '') + (v.music && v.music.track ? '.playing' : ''), { title: 'Musique', onclick: () => v.togglePop('music') }, v.music && v.music.track && (v.music.muted || v.music.volume === 0) ? '🔇' : '🎵'),
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
      title: '🐴 Règles des Petits chevaux',
      body: h('div.rules-summary',
        h('p', 'Chaque joueur a 4 chevaux dans son écurie. Lance le dé, sors tes chevaux et fais-leur faire le tour du plateau jusqu\'au centre. ', h('b', `Le premier à ramener ${s.horsesToWin} cheva${s.horsesToWin > 1 ? 'ux' : 'l'} gagne !`)),
        h('ul',
          h('li', s.sixToExit ? 'Il faut un 6 pour sortir un cheval de l\'écurie.' : 'Un 1 ou un 6 fait sortir un cheval de l\'écurie.'),
          s.threeTries ? h('li', 'Sans cheval en jeu, tu as 3 essais pour faire un 6.') : null,
          s.sixReplay ? h('li', 'Un 6 fait rejouer.') : null,
          h('li', '💥 Tomber sur un cheval adverse le renvoie à son écurie !'),
          h('li', s.strictLadder ? 'Échelle classique : arrête-toi pile devant ton échelle, puis fais 1, 2, 3… jusqu\'à 6 pour monter, et encore 6 pour atteindre le centre.' : 'Après un tour complet, ton cheval monte ton échelle colorée et doit atteindre le centre au nombre exact.'),
          s.noPassing ? h('li', 'Interdit de doubler : un cheval ne peut pas passer par-dessus un autre.') : null
        ),
        h('div', `${yes(s.sixToExit)} Un 6 pour sortir · ${yes(s.sixReplay)} Un 6 fait rejouer · ${yes(s.strictLadder)} Échelle classique · ${yes(s.noPassing)} Interdit de doubler · ${yes(s.captureReplay)} Rejouer après une prise`),
        h('div.muted', 'Raccourcis : Espace pour lancer le dé, 1 à 4 pour choisir un cheval.')
      ),
    });
  }

  async forfeit() {
    const ok = await modal({ title: '🏳️ Abandonner ?', body: h('p', 'Vos chevaux quitteront la course.'), buttons: [{ label: 'Annuler', value: false }, { label: 'Abandonner', value: true, class: 'danger' }] });
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
      this.renderControls();
      for (const ev of events) {
        if (ev.t === 'log') this.addLog(ev);
        if (fast) continue;
        try {
          await this.play(ev, state);
        } catch (e) {
          console.error(e);
        }
      }
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
    this.disp = { horses: Object.fromEntries(st.players.map((p) => [p.id, p.horses.slice()])), dice: st.dice };
    if (first || instant) {
      this.v.logEl.innerHTML = '';
      for (const l of st.log) this.addLog(l, true);
    }
    if (first) this.buildBoard();
    this.renderAll();
  }

  renderAll() {
    this.renderPlates();
    this.renderHorses();
    this.renderControls();
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

  // ================================================================ plateau
  /** Cases fixes du plateau (dessinées une fois, orientées selon ma place). */
  buildBoard() {
    const b = this.boardEl;
    b.querySelectorAll('.hz-cell, .hz-yard, .hz-center').forEach((e) => e.remove());
    const owner = {}; // quadrant de chaque joueur
    for (const p of this.state.players) owner[p.quad] = p;
    const place = (el, [r, c], w = 1, hgt = 1) => {
      el.style.left = (c / N) * 100 + '%';
      el.style.top = (r / N) * 100 + '%';
      el.style.width = (w / N) * 100 + '%';
      el.style.height = (hgt / N) * 100 + '%';
      b.insertBefore(el, this.horseLayer);
      return el;
    };
    // Écuries
    for (let q = 0; q < 4; q++) {
      const p = owner[q];
      const [r0, c0] = this.view(rot([0, 0], q));
      const [r1, c1] = this.view(rot([6, 6], q));
      const yard = h('div.hz-yard.q' + q + (p ? '' : '.empty'), p ? h('div.hz-yard-name', p.pawn, ' ', p.name) : h('div.hz-yard-name', QNAMES[q]),
        ...YARD_SLOTS.map(() => h('i.hz-slot')));
      place(yard, [Math.min(r0, r1), Math.min(c0, c1)], 7, 7);
      // Emplacements : positionnés comme les chevaux à l'écurie
      [...yard.querySelectorAll('.hz-slot')].forEach((s, i) => {
        const [sr, sc] = this.view(rot(YARD_SLOTS[i], q));
        s.style.left = ((sc - Math.min(c0, c1) + 0.5) / 7) * 100 + '%';
        s.style.top = ((sr - Math.min(r0, r1) + 0.5) / 7) * 100 + '%';
      });
    }
    // Parcours
    TRACK_CELLS.forEach((rc, g) => {
      const q = [0, 1, 2, 3].find((k) => startOf(k) === g);
      const el = h('div.hz-cell.track' + (q !== undefined ? '.start.q' + q : ''), { 'data-g': g }, q !== undefined ? h('span.hz-arrow', '➜') : null);
      if (q !== undefined) el.firstChild.style.rotate = this.arrowAngle(g) + 'deg';
      place(el, this.view(rc));
    });
    // Échelles
    for (let q = 0; q < 4; q++) {
      for (let s = 1; s <= 6; s++) place(h('div.hz-cell.ladder.q' + q, { 'data-q': q, 'data-step': s }, h('b', String(s))), this.view(ladderCell(q, s)));
    }
    // Centre
    const center = h('div.hz-center', h('div.hz-center-tri'), h('span.hz-center-icon', '🏆'));
    center.style.setProperty('--rot', this.turnView * 90 + 'deg');
    place(center, [7, 7], 3, 3);
  }
  /** Angle de la flèche d'une case de départ (sens de la course). */
  arrowAngle(g) {
    const a = this.view(TRACK_CELLS[g]);
    const b = this.view(TRACK_CELLS[(g + 1) % TRACK]);
    return (Math.atan2(b[0] - a[0], b[1] - a[1]) * 180) / Math.PI;
  }

  /** Cellule (ligne, colonne) affichée d'un cheval. */
  cellOf(p, r, i) {
    if (r === -1) return this.view(rot(YARD_SLOTS[i], p.quad));
    if (r <= ENTRY) return this.view(TRACK_CELLS[(startOf(p.quad) + r) % TRACK]);
    if (r < CENTER) return this.view(ladderCell(p.quad, r - ENTRY));
    return this.view(rot(CENTER_SLOTS[i], p.quad));
  }

  renderHorses() {
    const st = this.state;
    const d = this.disp;
    if (!st || !d) return;
    this.horseEls ||= {};
    const opts = new Set(this.myMove() ? st.options : []);
    const seen = new Set();
    // Empilement : plusieurs chevaux sur la même case
    const stacks = {};
    for (const p of st.players) {
      if (p.out) continue;
      (d.horses[p.id] || p.horses).forEach((r, i) => {
        const key = this.cellOf(p, r, i).join(':') + (r === -1 || r === CENTER ? ':' + p.id + i : '');
        (stacks[key] ||= []).push(p.id + ':' + i);
      });
    }
    for (const p of st.players) {
      if (p.out) continue;
      (d.horses[p.id] || p.horses).forEach((r, i) => {
        const id = p.id + ':' + i;
        seen.add(id);
        let el = this.horseEls[id];
        if (!el) {
          el = h('div.hz-horse', { style: { '--c': p.color } }, h('span.hz-horse-ico', '♞'), h('b.hz-horse-n', String(i + 1)));
          el.addEventListener('click', () => this.move(i, p.id));
          el.addEventListener('mouseenter', () => this.preview(p, i));
          el.addEventListener('mouseleave', () => this.preview(null));
          this.horseLayer.append(el);
          this.horseEls[id] = el;
        }
        const [rr, cc] = this.cellOf(p, r, i);
        const key = [rr, cc].join(':') + (r === -1 || r === CENTER ? ':' + p.id + i : '');
        const stack = stacks[key];
        const k = stack.indexOf(id);
        const off = stack.length > 1 ? (k - (stack.length - 1) / 2) * 0.28 : 0;
        el.style.left = ((cc + 0.5 + off) / N) * 100 + '%';
        el.style.top = ((rr + 0.5 - Math.abs(off) * 0.3) / N) * 100 + '%';
        el.classList.toggle('home', r === CENTER);
        el.classList.toggle('yard', r === -1);
        el.classList.toggle('can', p.id === this.me && opts.has(i));
        el.classList.toggle('mine', p.id === this.me);
        el.style.zIndex = String(10 + rr);
      });
    }
    for (const [id, el] of Object.entries(this.horseEls)) {
      if (!seen.has(id)) {
        el.remove();
        delete this.horseEls[id];
      }
    }
  }

  /** Destination d'un cheval (même règle que le serveur), pour l'aperçu au survol. */
  targetOf(p, i, dv) {
    const st = this.state.settings;
    const r = (this.disp.horses[p.id] || p.horses)[i];
    if (r === CENTER || !dv) return null;
    if (r === -1) return dv === 6 || (!st.sixToExit && dv === 1) ? 0 : null;
    if (st.strictLadder) {
      if (r < ENTRY) return r + dv > ENTRY ? null : r + dv;
      if (r === ENTRY) return dv === 1 ? ENTRY + 1 : null;
      const step = r - ENTRY;
      if (step < 6 && dv === step + 1) return r + 1;
      if (step === 6 && dv === 6) return CENTER;
      return null;
    }
    return r + dv > CENTER ? null : r + dv;
  }
  preview(p, i) {
    this.boardEl.querySelectorAll('.hz-cell.target').forEach((e) => e.classList.remove('target'));
    this.previewEl && this.previewEl.remove();
    if (!p || p.id !== this.me || !this.myMove() || !this.state.options.includes(i)) return;
    const to = this.targetOf(p, i, this.state.dice);
    if (to === null) return;
    const [r, c] = this.cellOf(p, to, i);
    const mark = h('div.hz-target', { style: { '--c': p.color, left: ((c + 0.5) / N) * 100 + '%', top: ((r + 0.5) / N) * 100 + '%' } });
    this.horseLayer.append(mark);
    this.previewEl = mark;
  }

  renderPlates() {
    const st = this.state;
    if (!st) return;
    this.platesEl.innerHTML = '';
    // Coin de l'écran correspondant à l'écurie (après rotation de la vue)
    const corner = (q) => {
      const [r, c] = this.view(rot([3, 3], q));
      return (r < 8 ? 't' : 'b') + (c < 8 ? 'l' : 'r');
    };
    for (const p of st.players) {
      const turn = st.current === p.id && !st.over;
      const isMe = p.id === this.me;
      const need = st.settings.horsesToWin;
      const plate = h('div.hz-plate.c-' + corner(p.quad) + (isMe ? '.me' : ''), { 'data-pid': p.id },
        h('div.ct-badge' + (turn ? '.turn' : '') + (p.out ? '.out' : '') + (isMe ? '.me' : ''), { style: { '--c': p.color } },
          h('div.ct-avatar', p.out ? '💀' : p.pawn),
          h('div.ct-binfo',
            h('div.ct-name', h('span.' + (nameClass(p) || 'plain'), p.name), ...roleTags(p, { level: false, compact: true })),
            h('div.hz-progress', Array.from({ length: need }, (_, k) => h('i' + (k < p.home ? '.on' : ''), '♞')), h('small', `${p.home}/${need}`)),
            !p.isBot && !p.connected ? h('div.ct-chips', h('span.pc-chip.off', '📡 Déconnecté')) : p.afk ? h('div.ct-chips', h('span.pc-chip.off', '💤 Absent')) : null
          ),
          turn ? h('div.ct-turn', isMe ? '🎲 À VOUS !' : 'JOUE…') : null,
          turn ? h('div.ct-timer', h('i')) : null
        )
      );
      this.platesEl.append(plate);
    }
  }

  myTurn() {
    const st = this.state;
    return st && !st.over && st.current === this.me && !this.busy;
  }
  myMove() {
    return this.myTurn() && this.state.phase === 'move';
  }

  renderControls() {
    const st = this.state;
    if (!st) return;
    const cur = this.player(st.current);
    const mine = this.myTurn();
    this.dicePanel.style.setProperty('--c', cur ? cur.color : '#fff');
    if (!this.rolling) showFace(this.die, (this.disp && this.disp.dice) || st.dice || 6);
    this.die.classList.toggle('idle', !st.dice);
    this.rollBtn.hidden = !(mine && st.phase === 'roll');
    this.dicePanel.classList.toggle('mine', mine && st.phase === 'roll');
    let hint = '';
    if (st.over) hint = '🏁 Course terminée';
    else if (mine && st.phase === 'roll') hint = st.tries ? `Encore ${3 - st.tries} essai${3 - st.tries > 1 ? 's' : ''} pour faire un 6 !` : 'À vous de lancer le dé !';
    else if (mine && st.phase === 'move') hint = `Vous avez fait ${st.dice} : choisissez un cheval`;
    else if (cur) hint = `${cur.name} ${st.phase === 'move' ? 'choisit un cheval…' : 'va lancer le dé…'}`;
    this.hintEl.textContent = hint;
  }

  updateTimer() {
    const st = this.state;
    if (!st || st.over) return;
    const bar = this.platesEl.querySelector('.ct-badge.turn .ct-timer i');
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

  // ============================================================== actions
  async act(type, data = {}) {
    const res = await emit('game:action', { type, ...data });
    if (res && res.resync) {
      await this.v.join();
      return emit('game:action', { type, ...data });
    }
    if (res && res.error) {
      Sound.play('error');
      toast(res.error, 'error');
    }
    return res;
  }
  roll() {
    if (!this.myTurn() || this.state.phase !== 'roll') return;
    this.rollBtn.hidden = true;
    this.act('roll');
  }
  move(i, pid = this.me) {
    if (pid !== this.me) return;
    if (!this.myMove()) {
      if (this.myTurn() && this.state.phase === 'roll') toast('Lancez d\'abord le dé !', 'info', 1500);
      return;
    }
    if (!this.state.options.includes(i)) {
      Sound.play('error');
      toast('Ce cheval ne peut pas bouger avec ce dé.', 'info', 1600);
      return;
    }
    this.preview(null);
    Sound.play('click');
    this.act('move', { horse: i });
  }

  // ============================================================ animations
  pointOfCell([r, c]) {
    const b = this.boardEl.getBoundingClientRect();
    return { x: b.left + ((c + 0.5) / N) * b.width, y: b.top + ((r + 0.5) / N) * b.height };
  }
  bubble(pt, content, cls = '', ms = 1500) {
    if (!pt) return;
    const el = h('div.ct-bubble' + cls, content);
    el.style.left = pt.x + 'px';
    el.style.top = pt.y + 'px';
    this.fx.append(el);
    setTimeout(() => el.remove(), ms);
  }
  showBanner(icon, title, sub, color = '#3fa7ff', ms = 1400) {
    const b = h('div.ct-banner', { style: { '--c': color } }, h('span.ct-banner-icon', icon), h('div', h('b', title), sub ? h('small', sub) : null));
    this.banner.append(b);
    setTimeout(() => b.classList.add('out'), ms);
    setTimeout(() => b.remove(), ms + 400);
  }
  plateOf(pid) {
    return this.platesEl.querySelector(`[data-pid="${CSS.escape(pid)}"] .ct-badge`);
  }

  async play(ev, st) {
    const p = this.player(ev.pid) || st.players.find((x) => x.id === ev.pid);
    const d = this.disp;
    switch (ev.t) {
      case 'turn':
        this.state = { ...this.state, current: ev.pid, phase: 'roll', dice: null };
        d.dice = null;
        this.renderPlates();
        this.renderControls();
        return;
      case 'dice': {
        this.rolling = true;
        this.die.classList.remove('idle');
        this.die.classList.add('rolling');
        this.dicePanel.style.setProperty('--c', p ? p.color : '#fff');
        Sound.play('dice');
        for (let k = 0; k < 8; k++) {
          showFace(this.die, 1 + Math.floor(Math.random() * 6));
          await sleep(85);
        }
        this.die.classList.remove('rolling');
        showFace(this.die, ev.value);
        d.dice = ev.value;
        this.rolling = false;
        this.die.classList.remove('land');
        void this.die.offsetWidth;
        this.die.classList.add('land');
        if (ev.value === 6) this.bubble(this.rectOf(this.die), '6 !', '.warn', 1000);
        await sleep(350);
        return;
      }
      case 'noMove':
        this.bubble(this.rectOf(this.die), ev.tries ? `Raté (${ev.tries}/3)` : 'Aucun coup possible', '.warn', 1200);
        await sleep(500);
        return;
      case 'replay':
        if (p) this.showBanner('🔁', `${p.name} rejoue !`, null, p.color, 1000);
        await sleep(300);
        return;
      case 'exit': {
        d.horses[ev.pid][ev.horse] = 0;
        this.renderHorses();
        Sound.play('buy');
        if (p) this.bubble(this.pointOfCell(this.cellOf(p, 0, ev.horse)), '🐎 Sortie !', '', 1100);
        await sleep(520);
        return;
      }
      case 'move': {
        const el = this.horseEls[ev.pid + ':' + ev.horse];
        if (el) el.classList.add('hopping');
        for (const r of ev.path) {
          d.horses[ev.pid][ev.horse] = r;
          this.renderHorses();
          Sound.play('step');
          await sleep(170);
        }
        if (el) el.classList.remove('hopping');
        await sleep(120);
        return;
      }
      case 'capture': {
        const victim = this.player(ev.victim);
        const g = TRACK_CELLS[ev.cell];
        const pt = this.pointOfCell(this.view(g));
        this.bubble(pt, '💥 PAF !', '.hit', 1300);
        Sound.play('takeover');
        if (d.horses[ev.victim]) d.horses[ev.victim][ev.horse] = -1;
        await sleep(250);
        this.renderHorses();
        if (victim && p) this.showBanner('💥', `${p.name} renvoie un cheval de ${victim.name} à l'écurie !`, null, p.color, 1500);
        await sleep(650);
        return;
      }
      case 'finish': {
        Sound.play('festival');
        const b = this.boardEl.getBoundingClientRect();
        this.bubble({ x: b.left + b.width / 2, y: b.top + b.height / 2 }, '🏁 Arrivé !', '.shout', 1500);
        if (p) this.showBanner('🏁', `Un cheval de ${p.name} arrive !`, `${ev.home}/${st.settings.horsesToWin}`, p.color, 1500);
        const pl = st.players.find((x) => x.id === ev.pid);
        if (pl && this.state) {
          const sp = this.state.players.find((x) => x.id === ev.pid);
          if (sp) sp.home = ev.home;
        }
        this.renderPlates();
        await sleep(900);
        return;
      }
      case 'win':
        Sound.play('win');
        return;
      case 'out':
        if (p) this.showBanner('🏳️', `${p.name} abandonne`, null, '#888', 1200);
        return;
    }
  }
  rectOf(el) {
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  onEmote({ key, emoji }) {
    const plate = this.plateOf(key);
    if (!plate) return;
    this.bubble(this.rectOf(plate), emoji, '.emote', 2200);
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
    const detail = (pl) => `🏁 ${pl.home} cheva${pl.home > 1 ? 'ux' : 'l'} arrivé${pl.home > 1 ? 's' : ''}`;
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
        h('div.end-title', winner.id === this.me ? '🎉 VICTOIRE ! 🎉' : `🏆 ${winner.name} gagne la course !`),
        h('div.end-sub', `🐴 Petits chevaux · ${res.turns} coups · ${duration(res.duration)}`),
        podium,
        h('div.end-list', ranked.slice(3).map((pl) => h('div.end-row', `#${pl.rank} ${pl.name}`, h('span', detail(pl))))),
        rw ? h('div.rewards',
          h('div.reward', `+${rw.xp} XP`),
          rw.badges.length ? h('div.new-badges', h('div.small', 'Nouveaux badges débloqués !'), rw.badges.map((b) => h('div.badge.tier-' + b.tier, h('div.badge-icon', b.icon), h('div.badge-name', b.name)))) : null
        ) : !store.user ? h('div.hint', h('a', { href: '/register', 'data-link': true }, 'Créez un compte'), ' pour enregistrer vos victoires, gagner de l\'XP et des badges !') : null,
        h('div.btn-row.center',
          v.isHost ? h('button.btn.primary.lg', { onclick: () => v.cmd('room:rematch') }, '🔁 Rejouer') : h('div.muted', 'L\'hôte peut relancer une partie.'),
          h('button.btn.ghost', { onclick: () => (ov.hidden = true) }, '👁 Voir le plateau'),
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

function copy(text, msg) {
  (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject())
    .then(() => toast(msg, 'success'))
    .catch(() => modal({ title: 'Copier', body: h('input.input', { value: text, readonly: true, onfocus: (e) => e.target.select() }) }));
}
