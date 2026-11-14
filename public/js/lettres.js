// ============================================================================
//  MyPoly — « Lettres d'Or » : table de jeu (vue client)
//  Le serveur est seul maître du jeu : ce module affiche, anime, et prépare les coups.
// ============================================================================
import { h, toast, modal, roleTags, roleRibbons, nameClass, sleep, confetti, duration } from './util.js';
import { store, emit } from './store.js';
import * as Sound from './sound.js';
import { navigate } from './app.js';
import { webglAvailable } from './board3d.js';
import { Letters3D, BONUS_STYLE, N } from './lettres3d.js';
import { REACTIONS, reactionEl, initials } from './poker-art.js';

export const LETTERS_SETTINGS_UI = [
  { group: 'Partie', items: [
    { key: 'maxPlayers', label: 'Joueurs max', type: 'select', options: [2, 3, 4].map((n) => [n, n + ' joueurs']) },
    { key: 'turnTime', label: 'Temps par coup', type: 'select', options: [[60, '1 min'], [90, '1 min 30'], [120, '2 min'], [180, '3 min'], [300, '5 min'], [0, 'Illimité']] },
    { key: 'targetScore', label: 'Fin de partie', type: 'select', options: [[0, 'Partie complète (sac vide)'], [100, 'Premier à 100 points'], [150, 'Premier à 150 points'], [250, 'Premier à 250 points']], hint: 'Pour des parties plus courtes' },
    { key: 'bingo', label: 'Bonus Lettres d\'Or', type: 'select', options: [[50, '+50 points'], [30, '+30 points'], [0, 'Aucun']], hint: 'Quand on pose ses 7 lettres d\'un coup' },
  ] },
  { group: 'Salle', items: [
    { key: 'isPublic', label: 'Salle publique', type: 'toggle', hint: 'Visible dans la liste des salles de l\'accueil' },
    { key: 'allowSpectators', label: 'Spectateurs autorisés', type: 'toggle' },
  ] },
];
export const LETTERS_PRESETS = {
  Classique: { turnTime: 120, targetScore: 0, bingo: 50 },
  'Partie éclair': { turnTime: 60, targetScore: 150, bingo: 50 },
  'Tranquille': { turnTime: 0, targetScore: 0, bingo: 50 },
};

const fmt = (n) => Math.round(n || 0).toLocaleString('fr-FR');
const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

/** Lettre du chevalet en HTML (même dessin que les lettres du plateau). */
function tileEl(t, cls = '') {
  const joker = t.l === '*';
  return h('div.lt-tile' + (joker ? '.joker' : '') + cls, { 'data-id': t.id },
    h('span.lt-letter', joker ? (t.as || '★') : t.l),
    joker ? null : h('span.lt-val', String(t.v))
  );
}

export class LettersTable {
  constructor(view) {
    this.v = view;
    this.state = null;
    this.queue = [];
    this.busy = false;
    this.pending = []; // [{ id, r, c, letter }]
    this.order = null; // ordre de mon chevalet (ids)
    this.selected = null;
    this.preview = null;
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
  myTurn() {
    return !!(this.state && !this.state.over && this.state.current === this.me && !this.busy);
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
    this.banner = h('div.pk-banners');
    this.statusEl = h('div.pk-status');
    this.previewEl = h('div.lt-preview', { hidden: true });
    this.rackEl = h('div.lt-rack');
    this.actionsEl = h('div.lt-actions');
    this.dock = h('div.pk-dock.lt-dock', this.statusEl, this.previewEl, this.rackEl, this.actionsEl);
    this.grid2d = h('div.lt-grid2d');
    v.notifStacks = Object.fromEntries(['tl', 'tr', 'bl', 'br', 'mid'].map((k) => [k, h('div.notif-stack.ns-' + k)]));
    v.gameEl = h('div.game.poker-game.lt-game', this.host, this.grid2d, v.playersEl, this.cornersEl, this.fx, this.dock, ...Object.values(v.notifStacks), this.banner, h('div.topbar', v.toolbar, v.popover));
    v.root.append(v.gameEl, v.endOverlay);
    if (webglAvailable()) {
      try {
        this.b3 = new Letters3D(this.host, {
          onCell: (r, c) => this.onCell(r, c),
          canHover: (r, c) => this.myTurn() && !this.cellTaken(r, c),
          onTile: () => Sound.play('step'),
          onLayout: () => {},
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
      const k = e.key;
      if (k === 'Enter' && this.pending.length) this.play();
      else if (k === 'Escape' || k === 'Backspace') this.recall();
      else if (/^[a-z]$/i.test(k) && this.myTurn()) this.selectByLetter(k.toUpperCase());
    };
    document.addEventListener('keydown', this.onKey);
    this.onResize = () => this.state && this.renderSeats();
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
      info: st ? `${st.bag} lettre${st.bag > 1 ? 's' : ''} dans le sac` : 'Lettres d\'Or',
      camera: this.b3 ? () => this.b3.resetView() : null,
      rules: () => this.showRules(),
      forfeit: me && !me.out && this.room.state === 'playing' ? () => this.forfeit() : null,
    });
  }

  showRules() {
    const s = this.room.settings;
    const vals = [['E A I N O R S T U', 1], ['L D M', 2], ['C P G B', 3], ['F H V', 4], ['J Q', 8], ['K W X Y Z', 10], ['Joker', 0]];
    modal({
      title: 'Règles de Lettres d\'Or',
      className: 'pk-rules-modal',
      body: h('div.rules-summary.pk-rules',
        h('p', 'Chacun a ', h('b', '7 lettres'), ' sur son chevalet. À ton tour, pose des lettres sur ', h('b', 'une même ligne ou une même colonne'), ' pour former un mot qui s\'appuie sur les lettres déjà posées (le premier mot passe par l\'étoile centrale). Tous les mots formés doivent exister.'),
        h('p', 'Les points : la valeur des lettres, multipliée par les cases ', h('b', 'Lettre ×2 / ×3'), ' (la lettre posée dessus) et ', h('b', 'Mot ×2 / ×3'), ' (tout le mot). Les cases ne comptent que pour les lettres que tu viens de poser. ', h('b', 'Lettres d\'Or'), ' : poser tes 7 lettres d\'un coup rapporte ', h('b', `+${s.bingo}`), '.'),
        h('p', 'Tu peux aussi ', h('b', 'échanger'), ' des lettres (s\'il en reste au moins 7 dans le sac) ou ', h('b', 'passer'), '. Le joker (★) remplace la lettre de ton choix mais vaut 0.'),
        h('p', 'Fin : sac vide et un joueur qui a posé toutes ses lettres (il gagne la valeur des lettres restantes des autres), ou tout le monde passe deux fois de suite', s.targetScore ? `, ou un joueur atteint ${s.targetScore} points` : '', '.'),
        h('h3', 'Valeur des lettres'),
        h('div.lt-values', vals.map(([l, v]) => h('div', h('b', v), h('span', l)))),
        h('div.muted', 'Astuces : glisse une lettre sur une case, ou touche une lettre puis une case. Touche une lettre posée pour la reprendre. Clavier : tape une lettre pour la choisir, Entrée pour jouer, Échap pour tout reprendre.')
      ),
    });
  }

  async forfeit() {
    const ok = await modal({ title: 'Quitter la partie ?', body: h('p', 'Vous abandonnez : vos lettres retournent dans le sac et vous serez classé(e) dernier.'), buttons: [{ label: 'Annuler', value: false }, { label: 'Quitter', value: true, class: 'danger' }] });
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
      for (const ev of events) {
        if (ev.t === 'log') this.addLog(ev);
        if (fast) continue;
        try {
          await this.animate(ev, state);
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
    const wasMine = this.state && this.state.current === this.me;
    this.state = st;
    this.v.state = st;
    if (first || instant) {
      this.v.logEl.innerHTML = '';
      for (const l of st.log) this.addLog(l, true);
    }
    // Mes lettres en attente ne doivent porter que sur des lettres encore à moi et des cases libres
    const ids = new Set((st.rack || []).map((t) => t.id));
    this.pending = this.pending.filter((p) => ids.has(p.id) && !st.board[p.r][p.c]);
    if (st.current !== this.me && wasMine) this.pending = [];
    if (this.b3) {
      this.b3.setBonus(st.bonus);
      this.b3.setBoard(st.board);
      this.b3.setHighlight(st.lastPlay ? st.lastPlay.cells : []);
    }
    if (st.current === this.me && !wasMine && !first) {
      Sound.play('turn');
    }
    this.renderAll();
  }

  renderAll() {
    this.renderSeats();
    this.renderRack();
    this.renderPending();
    this.renderDock();
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

  // ================================================================ joueurs
  seatOrder() {
    const all = this.state.players;
    const i = all.findIndex((p) => p.id === this.me);
    const ordered = i < 0 ? all : all.slice(i).concat(all.slice(0, i));
    return { mine: i < 0 ? null : ordered[0], others: i < 0 ? ordered : ordered.slice(1) };
  }
  renderSeats() {
    const st = this.state;
    if (!st) return;
    const { mine, others } = this.seatOrder();
    const slots = ['tl', 'tr', 'br'];
    this.cornersEl.innerHTML = '';
    const place = (p, slot) => {
      const turn = st.current === p.id && !st.over;
      const isMe = p.id === this.me;
      const lm = p.lastMove;
      const last = lm ? (lm.type === 'play' ? h('span.pk-act.a-call', `${lm.words[0]}${lm.words.length > 1 ? '…' : ''} +${lm.score}`) : lm.type === 'exchange' ? h('span.pk-act.a-check', `Échange ${lm.n}`) : h('span.pk-act.a-fold', 'Passe')) : null;
      this.cornersEl.append(h('div.pcard.corner.pk-seat.lt-seat.c-' + slot + (turn ? '.turn' : '') + (p.out ? '.out' : '') + (isMe ? '.me' : '') + (p.vip ? '.vip' : ''),
        { 'data-pid': p.id, style: { '--c': p.color } },
        h('div.pc-face'),
        roleRibbons(p),
        h('div.pc-avatar.pk-avatar', h('span.pk-initials', p.out ? '×' : initials(p.name))),
        h('div.pc-body',
          h('div.pc-name', h('span.pc-name-text.' + (nameClass(p) || 'plain'), p.name), ...roleTags(p, { level: false, compact: true })),
          h('div.pc-cash.lt-score', h('b', fmt(p.score)), h('small', ' pts')),
          h('div.pc-chips.pk-tags', h('span.pk-act.lt-count', `${p.tiles} lettre${p.tiles > 1 ? 's' : ''}`), last, !p.isBot && !p.connected ? h('span.pk-act.off', 'Hors ligne') : null)
        ),
        turn ? h('div.pcard-turn', isMe ? 'À VOUS' : 'RÉFLÉCHIT…') : null,
        turn ? h('div.pcard-timer') : null
      ));
    };
    if (mine) place(mine, 'bl');
    others.forEach((p, k) => place(p, slots[k] || 'tr'));
  }

  // ================================================================ chevalet
  rackTiles() {
    const st = this.state;
    if (!st || !st.rack) return [];
    const placed = new Set(this.pending.map((p) => p.id));
    let tiles = st.rack.filter((t) => !placed.has(t.id));
    if (this.order) {
      const pos = new Map(this.order.map((id, i) => [id, i]));
      tiles = tiles.slice().sort((a, b) => (pos.get(a.id) ?? 99) - (pos.get(b.id) ?? 99));
    }
    return tiles;
  }
  renderRack() {
    const el = this.rackEl;
    el.innerHTML = '';
    const st = this.state;
    if (!st || !st.rack) return;
    const tiles = this.rackTiles();
    for (const t of tiles) {
      const tile = tileEl(t, this.selected === t.id ? '.sel' : '');
      tile.addEventListener('pointerdown', (e) => this.startDrag(e, t));
      el.append(tile);
    }
    for (let k = tiles.length; k < 7; k++) el.append(h('div.lt-slot'));
  }
  shuffleRack() {
    const ids = this.rackTiles().map((t) => t.id);
    for (let i = ids.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [ids[i], ids[j]] = [ids[j], ids[i]];
    }
    this.order = ids;
    Sound.play('shuffle');
    this.renderRack();
  }
  selectByLetter(L) {
    const t = this.rackTiles().find((x) => x.l === L) || this.rackTiles().find((x) => x.l === '*');
    if (!t) return;
    this.selected = t.id;
    this.renderRack();
  }

  /** Glisser-déposer (souris et doigt) : une lettre suit le pointeur et se pose sur la case visée. */
  startDrag(e, t) {
    e.preventDefault();
    const start = { x: e.clientX, y: e.clientY };
    let ghost = null;
    const move = (ev) => {
      if (!ghost && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) > 6) {
        ghost = tileEl(t, '.ghost');
        document.body.append(ghost);
      }
      if (ghost) {
        ghost.style.left = ev.clientX + 'px';
        ghost.style.top = ev.clientY + 'px';
        const cell = this.cellFromPoint(ev.clientX, ev.clientY);
        if (this.b3) this.b3.showHover(cell && !this.cellTaken(cell.r, cell.c) ? cell : null);
      }
    };
    const up = (ev) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      if (ghost) {
        ghost.remove();
        if (this.b3) this.b3.showHover(null);
        const cell = this.cellFromPoint(ev.clientX, ev.clientY);
        if (cell) this.placeTile(t, cell.r, cell.c);
      } else {
        // Simple appui : sélection (puis toucher une case)
        this.selected = this.selected === t.id ? null : t.id;
        Sound.play('click');
        this.renderRack();
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }
  cellFromPoint(x, y) {
    if (this.b3) return this.b3.cellAt(x, y);
    const el = document.elementFromPoint(x, y);
    const cell = el && el.closest('[data-r]');
    return cell ? { r: Number(cell.dataset.r), c: Number(cell.dataset.c) } : null;
  }
  cellTaken(r, c) {
    return !!(this.state.board[r][c] || this.pending.some((p) => p.r === r && p.c === c));
  }

  onCell(r, c) {
    if (!this.state || this.state.over) return;
    // Toucher une de mes lettres posées : elle revient sur le chevalet
    const k = this.pending.findIndex((p) => p.r === r && p.c === c);
    if (k >= 0) {
      this.pending.splice(k, 1);
      Sound.play('click');
      this.changed();
      return;
    }
    if (this.selected == null) return;
    const t = this.state.rack.find((x) => x.id === this.selected);
    if (t) this.placeTile(t, r, c);
  }

  async placeTile(t, r, c) {
    if (!this.myTurn() && !this.toldPrep) {
      this.toldPrep = true;
      toast('Ce n\'est pas votre tour : préparez votre mot, vous le poserez à votre tour.', 'info', 2500);
    }
    if (this.cellTaken(r, c)) return Sound.play('nope');
    let letter = t.l;
    if (t.l === '*') {
      letter = await this.askJoker();
      if (!letter) return;
    }
    this.pending.push({ id: t.id, r, c, letter });
    this.selected = null;
    Sound.play('step');
    this.changed();
  }
  askJoker() {
    return new Promise((resolve) => {
      let done = false;
      const pick = (L) => {
        done = true;
        resolve(L);
        document.querySelector('#modals .modal-overlay:last-child')?._close(null);
      };
      modal({
        title: 'Lettre du joker',
        className: 'lt-joker-modal',
        body: h('div', h('p.muted', 'Le joker devient la lettre de votre choix (il vaut 0 point).'), h('div.lt-joker-grid', ALPHA.map((L) => h('button.lt-tile.joker.pick', { onclick: () => pick(L) }, h('span.lt-letter', L))))),
        buttons: [{ label: 'Annuler', value: null }],
      }).then(() => !done && resolve(null));
    });
  }
  recall() {
    if (!this.pending.length) return;
    this.pending = [];
    Sound.play('click');
    this.changed();
  }
  /** Après chaque changement : affichage et aperçu du score (demandé au serveur). */
  changed() {
    this.renderRack();
    this.renderPending();
    this.renderDock();
    this.render2d();
    clearTimeout(this.previewTimer);
    this.preview = null;
    this.renderPreview();
    if (!this.pending.length) return;
    this.previewTimer = setTimeout(async () => {
      const tiles = this.pending.map((p) => ({ id: p.id, r: p.r, c: p.c, letter: p.letter }));
      const res = await emit('game:action', { type: 'preview', tiles });
      if (JSON.stringify(tiles) !== JSON.stringify(this.pending.map((p) => ({ id: p.id, r: p.r, c: p.c, letter: p.letter })))) return;
      this.preview = res;
      this.renderPreview();
      this.renderPending();
    }, 160);
  }
  renderPending() {
    if (!this.b3 || !this.state) return;
    const rack = this.state.rack || [];
    const bad = this.preview && !this.preview.valid;
    this.b3.setPending(this.pending.map((p) => {
      const t = rack.find((x) => x.id === p.id) || {};
      return { r: p.r, c: p.c, l: p.letter, v: t.v || 0, joker: t.l === '*', bad };
    }));
  }
  renderPreview() {
    const el = this.previewEl;
    const p = this.preview;
    el.hidden = !this.pending.length;
    if (!this.pending.length) return;
    if (!p) {
      el.className = 'lt-preview';
      el.replaceChildren(h('span.muted', 'Calcul…'));
      return;
    }
    if (p.error && !p.words) {
      el.className = 'lt-preview bad';
      el.replaceChildren(h('span', p.error));
      return;
    }
    el.className = 'lt-preview' + (p.valid ? ' ok' : ' bad');
    el.replaceChildren(
      h('div.lt-words', (p.words || []).map((w) => h('span.lt-word' + (p.valid ? '' : '.bad'), w.word, h('small', ` ${w.score}`)))),
      p.valid ? h('b.lt-total', `+${p.score}${p.bingo ? ' · Lettres d\'Or !' : ''}`) : h('span.lt-err', p.error)
    );
  }

  renderDock() {
    const st = this.state;
    if (!st) return;
    const me = this.player(this.me);
    const cur = this.player(st.current);
    let status = '';
    if (st.over) status = 'Partie terminée';
    else if (!me) status = `Vous regardez la partie${cur ? ` · ${cur.name} réfléchit…` : ''}`;
    else if (this.myTurn()) status = this.pending.length ? 'Validez, ou touchez une lettre posée pour la reprendre' : 'À vous : glissez des lettres sur le plateau';
    else if (cur) status = `${cur.name} réfléchit… préparez votre prochain mot`;
    this.statusEl.replaceChildren(h('span', status), st.deadline ? h('div.pk-timer', h('i')) : null);
    this.statusEl.classList.toggle('mine', this.myTurn());
    const el = this.actionsEl;
    el.innerHTML = '';
    if (!me || me.out || st.over) return;
    const mine = this.myTurn();
    const valid = this.preview && this.preview.valid;
    el.append(
      h('button.btn.pk-btn.call.lt-play', { disabled: !mine || !this.pending.length, onclick: () => this.play() }, h('span', valid ? `Jouer +${this.preview.score}` : 'Jouer')),
      h('button.btn.ghost.lt-small', { disabled: !this.pending.length, onclick: () => this.recall(), title: 'Reprendre toutes les lettres (Échap)' }, 'Rappeler'),
      h('button.btn.ghost.lt-small', { onclick: () => this.shuffleRack(), title: 'Mélanger le chevalet' }, 'Mélanger'),
      h('button.btn.ghost.lt-small', { disabled: !mine || !st.canExchange, onclick: () => this.exchange(), title: st.canExchange ? 'Échanger des lettres (passe le tour)' : 'Moins de 7 lettres dans le sac' }, 'Échanger'),
      h('button.btn.ghost.lt-small', { disabled: !mine, onclick: () => this.pass() }, 'Passer')
    );
  }

  async play() {
    if (!this.myTurn() || !this.pending.length || this.sending) return;
    this.sending = true;
    const res = await emit('game:action', { type: 'play', tiles: this.pending.map((p) => ({ id: p.id, r: p.r, c: p.c, letter: p.letter })) });
    this.sending = false;
    if (res && res.error) {
      Sound.play('error');
      toast(res.error, 'error', 4500);
      return;
    }
    // Les lettres posées deviennent définitives (le serveur renvoie l'état)
    this.pending = [];
    this.changed();
  }
  async exchange() {
    const st = this.state;
    const chosen = new Set();
    const grid = h('div.lt-exchange', st.rack.map((t) => {
      const el = tileEl(t);
      el.addEventListener('click', () => {
        if (chosen.has(t.id)) chosen.delete(t.id);
        else chosen.add(t.id);
        el.classList.toggle('sel', chosen.has(t.id));
      });
      return el;
    }));
    const ok = await modal({ title: 'Échanger des lettres', body: h('div', h('p.muted', 'Choisissez les lettres à remettre dans le sac. Vous en piochez autant, et votre tour passe.'), grid), buttons: [{ label: 'Annuler', value: false }, { label: 'Échanger', value: true, class: 'primary' }] });
    if (!ok || !chosen.size) return;
    this.pending = [];
    const res = await emit('game:action', { type: 'exchange', ids: [...chosen] });
    if (res && res.error) toast(res.error, 'error');
  }
  async pass() {
    const ok = await modal({ title: 'Passer votre tour ?', body: h('p', 'Si tout le monde passe deux fois de suite, la partie s\'arrête.'), buttons: [{ label: 'Annuler', value: false }, { label: 'Passer', value: true, class: 'primary' }] });
    if (!ok) return;
    this.pending = [];
    const res = await emit('game:action', { type: 'pass' });
    if (res && res.error) toast(res.error, 'error');
  }

  // ================================================================ 2D (sans WebGL)
  render2d() {
    if (this.b3 || !this.state) return;
    const st = this.state;
    const cells = [];
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        const x = st.board[r][c];
        const p = this.pending.find((q) => q.r === r && q.c === c);
        const b = st.bonus[r][c];
        const style = b && BONUS_STYLE[b];
        const last = st.lastPlay && st.lastPlay.cells.some(([a, d]) => a === r && d === c);
        let inner = null;
        if (x) inner = h('div.lt-tile.small' + (x.j ? '.joker' : '') + (last ? '.last' : ''), h('span.lt-letter', x.l), x.j ? null : h('span.lt-val', String(x.v)));
        else if (p) {
          const t = (st.rack || []).find((y) => y.id === p.id) || {};
          inner = h('div.lt-tile.small.pending' + (t.l === '*' ? '.joker' : ''), h('span.lt-letter', p.letter), t.l === '*' ? null : h('span.lt-val', String(t.v)));
        } else if (style && b !== 'ST') inner = h('span.lt-bonus', style.b);
        else if (b === 'ST') inner = h('span.lt-bonus', '★');
        cells.push(h('div.lt-cell' + (b ? '.b-' + b : ''), { 'data-r': r, 'data-c': c, onclick: () => this.onCell(r, c), style: style ? { '--b': style.fill } : null }, inner));
      }
    }
    this.grid2d.replaceChildren(...cells);
  }

  // ================================================================ animations
  showBanner(title, sub, color = '#ffd166', ms = 1600, cls = '') {
    const el = h('div.pk-banner' + cls, { style: { '--c': color } }, h('div.pk-banner-title', title), sub ? h('div.pk-banner-sub', sub) : null);
    this.banner.append(el);
    setTimeout(() => {
      el.classList.add('out');
      setTimeout(() => el.remove(), 350);
    }, ms);
  }
  floatScore(cells, text, color) {
    if (!this.b3 || !cells.length) return;
    const mid = cells[Math.floor(cells.length / 2)];
    const pt = this.b3.cellScreen(mid[0], mid[1]);
    const host = this.v.gameEl.getBoundingClientRect();
    const el = h('div.lt-float', { style: { left: pt.x - host.left + 'px', top: pt.y - host.top + 'px', '--c': color } }, text);
    this.fx.append(el);
    setTimeout(() => el.remove(), 2000);
  }
  seatSide(pid) {
    const { mine, others } = this.seatOrder();
    if (mine && pid === mine.id) return 0;
    const k = others.findIndex((p) => p.id === pid);
    return [2, 1, 3][k] ?? 2;
  }

  async animate(ev, st) {
    const p = st.players.find((x) => x.id === ev.pid) || this.player(ev.pid);
    switch (ev.t) {
      case 'start':
        this.showBanner('Lettres d\'Or', `${p ? '' : ''}${(st.players.find((x) => x.id === ev.first) || {}).name || ''} commence`, '#ffd166', 1600);
        Sound.play('shuffle');
        await sleep(400);
        return;
      case 'play': {
        if (ev.pid === this.me) this.pending = [];
        if (this.b3) {
          this.b3.setPending(this.pending.map((q) => ({ r: q.r, c: q.c, l: q.letter, v: 0 })));
          await this.b3.dropTiles(ev.tiles, this.seatSide(ev.pid));
        } else {
          for (const t of ev.tiles) st.board[t.r][t.c] = { l: t.letter, v: t.value, j: t.joker };
          this.render2d();
        }
        Sound.play(ev.score >= 40 ? 'cash' : 'buy');
        for (const w of ev.words) if (this.b3) this.b3.wordFx(w.cells, ev.bingo ? 0xffd166 : 0x7ef0ac);
        const best = ev.words.slice().sort((a, b) => b.score - a.score)[0];
        this.floatScore(best.cells, `${ev.words.map((w) => w.word).join(' · ')} +${ev.score}`, p ? p.color : '#ffd166');
        if (ev.bingo) {
          Sound.play('festival');
          this.showBanner('LETTRES D\'OR !', `${p ? p.name : ''} pose ses 7 lettres : +${ev.bingo}`, '#ffd166', 2200, '.bj');
          confetti(2000);
        }
        await sleep(900);
        return;
      }
      case 'exchange':
        Sound.play('shuffle');
        this.showBanner(`${p ? p.name : ''} échange ${ev.n} lettre${ev.n > 1 ? 's' : ''}`, '', '#3fa7ff', 1100, '.small');
        await sleep(300);
        return;
      case 'pass':
        this.showBanner(`${p ? p.name : ''} passe`, '', '#9aa0c7', 900, '.small');
        await sleep(200);
        return;
      case 'final': {
        const lines = Object.entries(ev.left).filter(([, v]) => v > 0).map(([id, v]) => `${(st.players.find((x) => x.id === id) || {}).name} −${v}`);
        this.showBanner('Fin de la partie', lines.length ? `Lettres restantes : ${lines.join(' · ')}` : 'Toutes les lettres ont été posées !', '#ffd166', 2400);
        Sound.play('win');
        await sleep(1200);
        return;
      }
      case 'out':
        this.showBanner(`${p ? p.name : ''} quitte la partie`, '', '#9aa0c7', 1200, '.small');
        return;
    }
  }

  onEmote({ key, emoji }) {
    const card = this.cornersEl.querySelector(`[data-pid="${CSS.escape(key)}"]`);
    if (!card) return;
    const r = card.getBoundingClientRect();
    const host = this.v.gameEl.getBoundingClientRect();
    const b = h('div.pk-bubble.emote', { style: { left: r.left + r.width / 2 - host.left + 'px', top: r.top - host.top + 'px' } }, REACTIONS[emoji] ? reactionEl(emoji) : h('span', emoji));
    this.fx.append(b);
    setTimeout(() => b.remove(), 2200);
  }

  updateTimer() {
    const st = this.state;
    if (!st || st.over) return;
    const bars = [this.cornersEl.querySelector('.pcard.corner.turn .pcard-timer'), this.statusEl.querySelector('.pk-timer i')].filter(Boolean);
    if (!bars.length) return;
    const left = st.deadline ? st.deadline - (Date.now() + this.v.clockOffset) : 0;
    if (st.deadline !== this.dlSeen) {
      this.dlSeen = st.deadline;
      this.dlTotal = Math.max(1000, left);
    }
    const frac = Math.max(0, Math.min(1, left / (this.dlTotal || 120000)));
    for (const b of bars) {
      b.hidden = !st.deadline;
      b.style.transform = `scaleX(${frac})`;
      b.classList.toggle('urgent', left < 10000);
    }
    const secs = Math.ceil(left / 1000);
    if (this.myTurn() && left < 6000 && left > 0 && secs !== this.lastTick) {
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
        h('div.podium-worth', `${fmt(pl.score)} pts`)
      );
    }));
    const best = ranked.map((pl) => ({ pl, s: pl.stats || {} })).filter((x) => x.s.bestWord).sort((a, b) => b.s.bestScore - a.s.bestScore)[0];
    const rw = v.rewards;
    ov.append(
      h('div.end-card',
        h('div.end-title', winner.id === this.me ? 'VICTOIRE !' : `${winner.name} gagne !`),
        h('div.end-sub', `Lettres d'Or · ${res.turns} coups · ${duration(res.duration)}`),
        podium,
        best ? h('div.lt-bestword', 'Meilleur coup : ', h('b', best.s.bestWord), ` (${best.s.bestScore} pts) par ${best.pl.name}`) : null,
        h('div.end-list', ranked.slice(3).map((pl) => h('div.end-row', `${pl.rank}. ${pl.name}`, h('span', `${fmt(pl.score)} pts`)))),
        rw ? h('div.rewards',
          h('div.reward', `+${rw.xp} XP`),
          rw.badges.length ? h('div.new-badges', h('div.small', 'Nouveaux badges débloqués !'), rw.badges.map((b) => h('div.badge.tier-' + b.tier, h('div.badge-icon', b.icon), h('div.badge-name', b.name)))) : null
        ) : !store.user ? h('div.hint', h('a', { href: '/register', 'data-link': true }, 'Créez un compte'), ' pour enregistrer vos victoires, gagner de l\'XP et des badges !') : null,
        h('div.btn-row.center',
          v.isHost ? h('button.btn.primary.lg', { onclick: () => v.cmd('room:rematch') }, 'Rejouer') : h('div.muted', 'L\'hôte peut relancer une partie.'),
          v.isHost ? h('button.btn.ghost', { onclick: () => v.openGameChooser() }, 'Changer de jeu') : null,
          h('button.btn.ghost', { onclick: () => (ov.hidden = true) }, 'Voir le plateau'),
          h('button.btn.ghost', { onclick: () => navigate('/') }, 'Accueil')
        )
      )
    );
  }
}
