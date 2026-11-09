// ============================================================================
//  MyPoly — Petits chevaux : plateau de course (vue client)
//  Le serveur est seul maître du jeu (dé, déplacements) : ce module affiche et anime.
// ============================================================================
import { h, toast, modal, roleTags, roleRibbons, nameClass, sleep, confetti, duration } from './util.js';
import { store, emit } from './store.js';
import * as Sound from './sound.js';
import { navigate, toggleFullscreen } from './app.js';
import { webglAvailable } from './board3d.js';
import { Horse3D, TOP, BOARD_TOP, TILE_H } from './horses3d.js';

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
const QCOLORS = ['#ff5a5f', '#2ecc71', '#ffb020', '#3fa7ff'];
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
  /** Même structure que l'écran MyPoly : plateau 3D plein écran, fiches dans les coins, notifications. */
  build() {
    const v = this.v;
    this.host = h('div.board3d-host');
    // Plateau 2D de secours (navigateurs sans WebGL)
    this.boardEl = h('div.hz-board');
    this.horseLayer = h('div.hz-horses');
    this.boardEl.append(this.horseLayer);
    this.boardWrap = h('div.hz-board-wrap', this.boardEl);
    this.die = makeDie();
    this.rollBtn = h('button.btn.roll-btn.hz-rollbtn', { onclick: () => this.roll() }, '🎲 Lancer le dé');
    this.hintEl = h('div.hz-hint');
    this.actionEl = h('div.hz-action', this.die, this.hintEl, this.rollBtn);
    this.fx = h('div.fx-layer.hz-fx');

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
    v.notifStacks = Object.fromEntries(['tl', 'tr', 'bl', 'br', 'mid'].map((k) => [k, h('div.notif-stack.ns-' + k)]));
    v.playersEl = h('div.corners');
    v.gameEl = h('div.game.horses-game', this.host, this.boardWrap, this.fx, ...Object.values(v.notifStacks), v.playersEl, this.actionEl, h('div.topbar', v.toolbar, v.popover));
    v.root.append(v.gameEl, v.endOverlay);
    if (webglAvailable()) {
      try {
        this.b3 = new Horse3D(this.host, {
          onFollow: (on) => v.setZoomFab(on),
          onClick: (key) => {
            const [pid, i] = key.split('|');
            this.move(Number(i), pid);
          },
          onHover: (key) => {
            if (!key) return this.preview(null);
            const [pid, i] = key.split('|');
            this.preview(this.player(pid), Number(i));
          },
        });
        v.gameEl.classList.add('webgl');
        // Loupe : zoom qui suit le cheval du joueur dont c'est le tour
        v.addZoomFab(() => this.b3.toggleZoomOn(this.leadKey(this.state ? this.state.current : this.me)));
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
      if (e.key === ' ' || e.key === 'Enter') {
        // Empêche aussi Espace d'« appuyer » sur le dernier bouton cliqué (chat, musique…)
        e.preventDefault();
        if (!e.repeat) this.roll();
        return;
      }
      const n = Number(e.key);
      if (!e.repeat && n >= 1 && n <= 4 && this.myMove()) this.move(n - 1);
    };
    document.addEventListener('keydown', this.onKey);
  }

  /** Cheval le plus avancé d'un joueur (pour la loupe), sinon son premier cheval. */
  leadKey(pid) {
    const p = this.player(pid);
    if (!p) return null;
    let key = pid + '|0';
    let best = -2;
    p.horses.forEach((r, i) => {
      if (r > best && r < CENTER) {
        best = r;
        key = pid + '|' + i;
      }
    });
    return key;
  }

  destroy() {
    document.removeEventListener('keydown', this.onKey);
    if (this.b3) this.b3.destroy();
    this.dead = true;
  }

  // ============================================================ barre d'outils
  renderToolbar() {
    const v = this.v;
    if (!v.toolbar) return;
    const st = this.state;
    const me = this.player(this.me);
    v.buildToolbar({
      info: st ? `${st.settings.horsesToWin} cheva${st.settings.horsesToWin > 1 ? 'ux' : 'l'} à ramener` : '',
      camera: this.b3 ? () => this.b3.resetView() : null,
      rules: () => this.showRules(),
      forfeit: me && !me.out && this.room.state === 'playing' ? () => this.forfeit() : null,
    });
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
        h('div.muted', 'Raccourcis : Espace pour lancer le dé, 1 à 4 pour choisir un cheval. Faites glisser pour tourner la caméra, double-clic pour la recentrer.')
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
    this.pending = false;
    const first = !this.state;
    this.state = st;
    this.v.state = st;
    this.disp = { horses: Object.fromEntries(st.players.map((p) => [p.id, p.horses.slice()])), dice: st.dice };
    if (first || instant) {
      this.v.logEl.innerHTML = '';
      for (const l of st.log) this.addLog(l, true);
    }
    if (first) {
      this.buildBoard();
      if (this.b3 && st.dice) this.b3.setDie(st.dice);
    }
    this.renderAll(!first && !instant);
  }

  renderAll(animate = false) {
    this.renderPlayers();
    this.renderHorses(animate);
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
  owners() {
    const o = {};
    for (const p of this.state.players) o[p.quad] = p;
    return o;
  }
  buildBoard() {
    if (this.b3) return this.build3d();
    this.build2d();
  }
  /** Plateau 3D : parcours, échelles, écuries et arrivée, orientés selon ma place. */
  build3d() {
    const owner = this.owners();
    const starts = {};
    for (let q = 0; q < 4; q++) starts[startOf(q)] = { color: QCOLORS[q], angle: this.arrowAngle(startOf(q)) };
    const ladders = [];
    for (let q = 0; q < 4; q++) for (let s = 1; s <= 6; s++) ladders.push({ rc: this.view(ladderCell(q, s)), color: QCOLORS[q], n: s });
    const yards = [];
    for (let q = 0; q < 4; q++) {
      const [r0, c0] = this.view(rot([0, 0], q));
      const [r1, c1] = this.view(rot([6, 6], q));
      const rm = Math.min(r0, r1);
      const cm = Math.min(c0, c1);
      const slots = YARD_SLOTS.map((s) => {
        const [sr, sc] = this.view(rot(s, q));
        return [(sc - cm + 0.5) / 7, (sr - rm + 0.5) / 7];
      });
      const p = owner[q];
      yards.push({ rc0: [rm, cm], color: p ? QCOLORS[q] : '#6d7487', name: p ? p.name : QNAMES[q], slots, slotsKey: slots.flat().join(',') });
    }
    // Couleurs de l'arrivée : haut, droite, bas, gauche (le côté d'où arrive chaque échelle)
    const colors = ['', '', '', ''];
    for (let q = 0; q < 4; q++) colors[([3, 0, 1, 2][q] + this.turnView) % 4] = QCOLORS[q];
    this.b3.buildBoard({ track: TRACK_CELLS.map((rc) => this.view(rc)), starts: Object.fromEntries(Object.entries(starts).map(([g, s]) => [Number(g), s])), ladders, yards, center: { colors } });
  }
  /** Plateau 2D de secours. */
  build2d() {
    const b = this.boardEl;
    b.querySelectorAll('.hz-cell, .hz-yard, .hz-center').forEach((e) => e.remove());
    const owner = this.owners();
    const place = (el, [r, c], w = 1, hgt = 1) => {
      el.style.left = (c / N) * 100 + '%';
      el.style.top = (r / N) * 100 + '%';
      el.style.width = (w / N) * 100 + '%';
      el.style.height = (hgt / N) * 100 + '%';
      b.insertBefore(el, this.horseLayer);
      return el;
    };
    for (let q = 0; q < 4; q++) {
      const p = owner[q];
      const [r0, c0] = this.view(rot([0, 0], q));
      const [r1, c1] = this.view(rot([6, 6], q));
      const yard = h('div.hz-yard.q' + q + (p ? '' : '.empty'), h('div.hz-yard-name', p ? p.name : QNAMES[q]), ...YARD_SLOTS.map(() => h('i.hz-slot')));
      place(yard, [Math.min(r0, r1), Math.min(c0, c1)], 7, 7);
      [...yard.querySelectorAll('.hz-slot')].forEach((s, i) => {
        const [sr, sc] = this.view(rot(YARD_SLOTS[i], q));
        s.style.left = ((sc - Math.min(c0, c1) + 0.5) / 7) * 100 + '%';
        s.style.top = ((sr - Math.min(r0, r1) + 0.5) / 7) * 100 + '%';
      });
    }
    TRACK_CELLS.forEach((rc, g) => {
      const q = [0, 1, 2, 3].find((k) => startOf(k) === g);
      const el = h('div.hz-cell.track' + (q !== undefined ? '.start.q' + q : ''), q !== undefined ? h('span.hz-arrow', '➜') : null);
      if (q !== undefined) el.firstChild.style.rotate = this.arrowAngle(g) + 'deg';
      place(el, this.view(rc));
    });
    for (let q = 0; q < 4; q++) for (let s = 1; s <= 6; s++) place(h('div.hz-cell.ladder.q' + q, h('b', String(s))), this.view(ladderCell(q, s)));
    const center = h('div.hz-center', h('div.hz-center-tri'), h('span.hz-center-icon', '🏆'));
    center.style.setProperty('--rot', this.turnView * 90 + 'deg');
    place(center, [7, 7], 3, 3);
  }
  arrowAngle(g) {
    const a = this.view(TRACK_CELLS[g]);
    const b = this.view(TRACK_CELLS[(g + 1) % TRACK]);
    return (Math.atan2(b[0] - a[0], b[1] - a[1]) * 180) / Math.PI;
  }
  cellOf(p, r, i) {
    if (r === -1) return this.view(rot(YARD_SLOTS[i], p.quad));
    if (r <= ENTRY) return this.view(TRACK_CELLS[(startOf(p.quad) + r) % TRACK]);
    if (r < CENTER) return this.view(ladderCell(p.quad, r - ENTRY));
    return this.view(rot(CENTER_SLOTS[i], p.quad));
  }
  /** Hauteur du sol (3D) sous un cheval selon sa position. */
  floorOf(r) {
    if (r === -1) return BOARD_TOP + TILE_H * 0.7;
    if (r === CENTER) return this.b3.centerTop;
    if (r > ENTRY) return BOARD_TOP + TILE_H + (r - ENTRY) * 0.012;
    return TOP;
  }

  renderHorses(animate = false, flight = null) {
    const st = this.state;
    const d = this.disp;
    if (!st || !d) return;
    const opts = new Set(this.myMove() ? st.options : []);
    // Empilement de plusieurs chevaux sur la même case
    const stacks = {};
    const items = [];
    for (const p of st.players) {
      if (p.out) continue;
      (d.horses[p.id] || p.horses).forEach((r, i) => {
        const rc = this.cellOf(p, r, i);
        const key = rc.join(':');
        (stacks[key] ||= []).push(p.id + '|' + i);
        items.push({ p, r, i, rc, key });
      });
    }
    if (this.b3) {
      const list = items.map(({ p, r, i, rc, key }) => {
        const stack = stacks[key];
        const k = stack.indexOf(p.id + '|' + i);
        const n = stack.length;
        const a = (k / Math.max(1, n)) * Math.PI * 2 + Math.PI / 4;
        const off = n > 1 ? [Math.cos(a) * 0.13, Math.sin(a) * 0.13] : null;
        return { key: p.id + '|' + i, color: p.color, rc, top: this.floorOf(r), off, can: p.id === this.me && opts.has(i), mine: p.id === this.me, home: r === CENTER, flight: flight === p.id + '|' + i };
      });
      this.b3.sync(list, animate);
      return;
    }
    this.horseEls ||= {};
    const seen = new Set();
    for (const { p, r, i, rc, key } of items) {
      const id = p.id + '|' + i;
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
      const stack = stacks[key];
      const k = stack.indexOf(id);
      const off = stack.length > 1 ? (k - (stack.length - 1) / 2) * 0.28 : 0;
      el.style.left = ((rc[1] + 0.5 + off) / N) * 100 + '%';
      el.style.top = ((rc[0] + 0.5 - Math.abs(off) * 0.3) / N) * 100 + '%';
      el.classList.toggle('home', r === CENTER);
      el.classList.toggle('yard', r === -1);
      el.classList.toggle('can', p.id === this.me && opts.has(i));
      el.classList.toggle('mine', p.id === this.me);
      el.style.zIndex = String(10 + Math.round(rc[0]));
    }
    for (const [id, el] of Object.entries(this.horseEls)) {
      if (!seen.has(id)) {
        el.remove();
        delete this.horseEls[id];
      }
    }
  }

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
  /** Repère de la case d'arrivée du cheval survolé. */
  preview(p, i) {
    if (this.previewEl) this.previewEl.remove();
    this.previewEl = null;
    if (this.b3) this.b3.showTarget(null);
    if (!p || p.id !== this.me || !this.myMove() || !this.state.options.includes(i)) return;
    const to = this.targetOf(p, i, this.state.dice);
    if (to === null) return;
    const rc = this.cellOf(p, to, i);
    if (this.b3) return this.b3.showTarget(rc, p.color, this.floorOf(to));
    const mark = h('div.hz-target', { style: { '--c': p.color, left: ((rc[1] + 0.5) / N) * 100 + '%', top: ((rc[0] + 0.5) / N) * 100 + '%' } });
    this.horseLayer.append(mark);
    this.previewEl = mark;
  }

  /** Fiches des joueurs dans les coins (comme MyPoly), du côté de leur écurie. */
  renderPlayers() {
    const st = this.state;
    if (!st) return;
    const v = this.v;
    v.playersEl.innerHTML = '';
    const corner = (q) => {
      const [r, c] = this.view(rot([3, 3], q));
      return (r < 8 ? 't' : 'b') + (c < 8 ? 'l' : 'r');
    };
    const need = st.settings.horsesToWin;
    for (const p of st.players) {
      const turn = st.current === p.id && !st.over;
      const isMe = p.id === this.me;
      const onBoard = p.horses.filter((r) => r >= 0 && r < CENTER).length;
      const card = h('div.pcard.corner.c-' + corner(p.quad) + (turn ? '.turn' : '') + (p.out ? '.out' : '') + (isMe ? '.me' : '') + (p.vip ? '.vip' : ''),
        { 'data-pid': p.id, style: { '--c': p.color } },
        h('div.pc-face'),
        roleRibbons(p),
        h('div.pc-avatar', h('span.pc-pawn', p.out ? '💀' : p.pawn)),
        h('div.pc-body',
          h('div.pc-name', h('span.pc-name-text.' + (nameClass(p) || 'plain'), p.name), ...roleTags(p, { level: false, compact: true })),
          h('div.pc-cash.hz-home', Array.from({ length: need }, (_, k) => h('span.hz-home-ico' + (k < p.home ? '.on' : ''), '♞')), h('span.hz-home-n', `${p.home}/${need}`)),
          h('div.pc-chips',
            p.out ? h('span.pc-chip.off', 'Abandon') : h('span.pc-chip', { title: 'Chevaux en course' }, `🏇 ${onBoard} en course`),
            !p.isBot && !p.connected ? h('span.pc-chip.off', { title: 'Déconnecté' }, '📡') : p.afk ? h('span.pc-chip.off', { title: 'Absent' }, '💤') : null
          )
        ),
        turn ? h('div.pcard-turn', isMe ? '🎲 À VOUS !' : 'JOUE…') : null,
        turn ? h('div.pcard-timer') : null
      );
      v.playersEl.append(card);
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
    this.actionEl.style.setProperty('--c', cur ? cur.color : '#fff');
    if (!this.rolling) showFace(this.die, (this.disp && this.disp.dice) || st.dice || 6);
    this.die.hidden = !!this.b3;
    this.rollBtn.hidden = !(mine && st.phase === 'roll');
    let hint = '';
    if (st.over) hint = '🏁 Course terminée';
    else if (mine && st.phase === 'roll') hint = st.tries ? `Encore ${3 - st.tries} essai${3 - st.tries > 1 ? 's' : ''} pour faire un 6 !` : 'Espace pour lancer';
    else if (mine && st.phase === 'move') hint = `🎲 ${st.dice} : cliquez sur un cheval qui brille`;
    else if (cur) hint = `${cur.name} ${st.phase === 'move' ? 'choisit un cheval…' : 'lance le dé…'}`;
    this.hintEl.textContent = hint;
    this.actionEl.classList.toggle('mine', mine);
  }

  updateTimer() {
    const st = this.state;
    if (!st || st.over) return;
    const bar = this.v.playersEl.querySelector('.pcard.turn .pcard-timer');
    if (!bar) return;
    if (!st.deadline || this.busy) {
      bar.style.transform = 'scaleX(1)';
      return;
    }
    const total = (this.room.settings.turnTime || 20) * 1000;
    const left = st.deadline - (Date.now() + this.v.clockOffset);
    bar.style.transform = `scaleX(${Math.max(0, Math.min(1, left / total))})`;
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
  async roll() {
    if (this.pending || !this.myTurn() || this.state.phase !== 'roll') return;
    this.pending = true;
    this.rollBtn.hidden = true;
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    Sound.play('click');
    const res = await this.act('roll');
    // En cas d'erreur, on rend la main ; sinon on attend la mise à jour du serveur
    if (res && res.error) {
      this.pending = false;
      this.renderControls();
    }
  }
  async move(i, pid = this.me) {
    if (pid !== this.me || this.pending) return;
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
    this.pending = true;
    const res = await this.act('move', { horse: i });
    if (res && res.error) this.pending = false;
  }

  // ============================================================ animations
  screenOf(rc, r = 0) {
    if (this.b3) return this.b3.toScreen(rc, this.floorOf(r) + 0.45);
    const b = this.boardEl.getBoundingClientRect();
    return { x: b.left + ((rc[1] + 0.5) / N) * b.width, y: b.top + ((rc[0] + 0.5) / N) * b.height };
  }
  bubble(pt, content, cls = '', ms = 1500) {
    if (!pt) return;
    const el = h('div.ct-bubble' + cls, content);
    el.style.left = pt.x + 'px';
    el.style.top = pt.y + 'px';
    this.fx.append(el);
    setTimeout(() => el.remove(), ms);
  }
  announce(o) {
    this.v.evPid = o.pid;
    this.v.announce(o);
  }

  async play(ev, st) {
    const p = this.player(ev.pid) || st.players.find((x) => x.id === ev.pid);
    const d = this.disp;
    switch (ev.t) {
      case 'turn':
        if (this.b3) this.b3.setFollow(this.leadKey(ev.pid));
        this.state = { ...this.state, current: ev.pid, phase: 'roll', dice: null };
        d.dice = null;
        this.renderPlayers();
        this.renderControls();
        if (ev.pid === this.me) Sound.play('turn');
        return;
      case 'dice': {
        Sound.play('dice');
        d.dice = ev.value;
        if (this.b3) {
          await this.b3.rollDie(ev.value, p ? p.color : '#fff');
        } else {
          this.rolling = true;
          this.die.classList.add('rolling');
          for (let k = 0; k < 8; k++) {
            showFace(this.die, 1 + Math.floor(Math.random() * 6));
            await sleep(85);
          }
          this.die.classList.remove('rolling');
          this.rolling = false;
          showFace(this.die, ev.value);
        }
        const pt = this.b3 ? this.b3.dieScreen() : this.rectOf(this.die);
        this.bubble({ x: pt.x, y: pt.y - 50 }, `🎲 ${ev.value}`, ev.value === 6 ? '.warn' : '', 1100);
        await sleep(250);
        return;
      }
      case 'noMove':
        if (p) this.announce({ icon: '🎲', title: `${p.name} fait ${ev.value}`, text: ev.tries ? `Raté… encore ${3 - ev.tries} essai${3 - ev.tries > 1 ? 's' : ''} pour faire un 6` : 'Aucun cheval ne peut bouger', color: p.color, pid: p.id, ms: 2000 });
        await sleep(400);
        return;
      case 'replay':
        if (p) this.announce({ icon: '🔁', title: `${p.name} rejoue !`, text: 'Un 6, ça se fête', color: p.color, pid: p.id, kind: 'gold', ms: 2000 });
        await sleep(250);
        return;
      case 'exit': {
        if (this.b3) this.b3.setFollow(ev.pid + '|' + ev.horse);
        d.horses[ev.pid][ev.horse] = 0;
        this.renderHorses(true, ev.pid + '|' + ev.horse);
        Sound.play('buy');
        if (p) {
          this.announce({ icon: '🐎', title: `${p.name} sort un cheval !`, text: 'Direction la piste', color: p.color, pid: p.id, ms: 2200 });
          await sleep(650);
          if (this.b3) this.b3.burst(this.cellOf(p, 0, ev.horse), p.color, 14);
        }
        await sleep(150);
        return;
      }
      case 'move': {
        if (this.b3) this.b3.setFollow(ev.pid + '|' + ev.horse);
        for (const r of ev.path) {
          d.horses[ev.pid][ev.horse] = r;
          this.renderHorses(true);
          Sound.play('step');
          await sleep(175);
        }
        await sleep(80);
        return;
      }
      case 'capture': {
        const victim = this.player(ev.victim);
        const rc = this.view(TRACK_CELLS[ev.cell]);
        Sound.play('takeover');
        this.bubble(this.screenOf(rc), '💥 PAF !', '.hit', 1300);
        if (this.b3) {
          this.b3.burst(rc, victim ? victim.color : '#fff', 26);
          this.b3.shake(0.45);
        }
        if (d.horses[ev.victim]) d.horses[ev.victim][ev.horse] = -1;
        await sleep(200);
        this.renderHorses(true, ev.victim + '|' + ev.horse);
        if (victim && p) this.announce({ icon: '💥', title: `${p.name} renvoie un cheval de ${victim.name} !`, text: 'Retour à l\'écurie', color: p.color, pid: p.id, kind: 'danger', ms: 3000 });
        await sleep(750);
        return;
      }
      case 'finish': {
        Sound.play('festival');
        if (this.b3) this.b3.burst([8, 8], p ? p.color : '#ffd166', 40, this.b3.centerTop);
        if (p) this.announce({ icon: '🏁', title: `Un cheval de ${p.name} arrive !`, text: `${ev.home}/${st.settings.horsesToWin} au centre`, color: p.color, pid: p.id, kind: 'gold', ms: 3000 });
        const sp = this.state.players.find((x) => x.id === ev.pid);
        if (sp) sp.home = ev.home;
        this.renderPlayers();
        await sleep(900);
        return;
      }
      case 'win':
        Sound.play('win');
        return;
      case 'out':
        if (p) this.announce({ icon: '🏳️', title: `${p.name} abandonne`, color: '#888', pid: p.id });
        return;
    }
  }
  rectOf(el) {
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  onEmote({ key, emoji }) {
    const card = this.v.playersEl.querySelector(`[data-pid="${CSS.escape(key)}"]`);
    if (!card) return;
    const b = h('div.emote-card', emoji);
    card.append(b);
    setTimeout(() => b.remove(), 2200);
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
