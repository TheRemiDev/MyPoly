// Vue d'une salle : salon d'attente + plateau de jeu animé
import { $, $$, h, fmt, toast, modal, roleTags, nameClass, sleep, confetti, duration } from './util.js';
import { store, on, emit } from './store.js';
import * as Sound from './sound.js';
import { navigate, toggleFullscreen, winLabel } from './app.js';

const EMOTES = ['👍', '😂', '😱', '😡', '🔥', '💸', '🎉', '😎', '🙏', '💀'];
const LEVEL_LABEL = ['Terrain', '1 maison', '2 maisons', '3 maisons', 'Hôtel'];

const SETTINGS_UI = [
  { group: 'Partie', items: [
    { key: 'maxPlayers', label: 'Joueurs max', type: 'select', options: [2, 3, 4, 5, 6].map((n) => [n, n + ' joueurs']) },
    { key: 'startMoney', label: 'Argent de départ', type: 'select', options: [1000, 1500, 2000, 2500, 3000, 4000, 5000].map((n) => [n, fmt(n)]) },
    { key: 'salary', label: 'Salaire au Départ', type: 'select', options: [0, 100, 200, 300, 400, 500].map((n) => [n, n ? fmt(n) : 'Aucun']) },
    { key: 'turnTime', label: 'Temps par décision', type: 'select', options: [[10, '10 s'], [15, '15 s'], [20, '20 s'], [30, '30 s'], [45, '45 s'], [60, '1 min'], [90, '1 min 30'], [0, 'Illimité']] },
    { key: 'gameDuration', label: 'Durée de partie', type: 'select', options: [[0, 'Illimitée'], [10, '10 min'], [15, '15 min'], [20, '20 min'], [30, '30 min'], [45, '45 min'], [60, '1 h'], [90, '1 h 30']] },
    { key: 'maxRounds', label: 'Tours maximum', type: 'select', options: [[0, 'Illimité'], [10, '10'], [15, '15'], [20, '20'], [30, '30'], [50, '50']] },
  ] },
  { group: 'Règles', items: [
    { key: 'takeover', label: 'Rachat des propriétés', type: 'toggle', hint: 'Racheter la ville d\'un adversaire après lui avoir payé le loyer' },
    { key: 'takeoverMult', label: 'Prix du rachat', type: 'select', options: [[1, '×1 la valeur'], [2, '×2 la valeur'], [3, '×3 la valeur']] },
    { key: 'buildOnPurchase', label: 'Construire dès l\'achat', type: 'toggle', hint: 'Poser jusqu\'à 3 maisons en achetant le terrain' },
    { key: 'countryDoubleRent', label: 'Pays complet = loyer ×2', type: 'toggle' },
    { key: 'festival', label: 'Festival actif', type: 'toggle', hint: 'La case Festival multiplie le loyer d\'une propriété' },
    { key: 'doubleReplay', label: 'Rejouer sur un double', type: 'toggle' },
    { key: 'startBonus', label: 'Bonus atterrissage Départ', type: 'toggle', hint: 'Salaire doublé en tombant pile sur le Départ' },
  ] },
  { group: 'Conditions de victoire', items: [
    { key: 'tripleMonopoly', label: 'Triple monopole', type: 'toggle', hint: 'Posséder 3 pays complets' },
    { key: 'lineMonopoly', label: 'Monopole de ligne', type: 'toggle', hint: 'Posséder tout un côté du plateau' },
    { key: 'resortMonopoly', label: 'Monopole balnéaire', type: 'toggle', hint: 'Posséder les 4 stations balnéaires' },
  ] },
  { group: 'Montants', items: [
    { key: 'jailFine', label: 'Amende de l\'Île', type: 'select', options: [0, 50, 100, 150, 200].map((n) => [n, n ? fmt(n) : 'Gratuit']) },
    { key: 'travelFee', label: 'Billet d\'avion', type: 'select', options: [0, 25, 50, 100, 200].map((n) => [n, n ? fmt(n) : 'Gratuit']) },
    { key: 'taxPercent', label: 'Impôts', type: 'select', options: [0, 5, 10, 15, 20].map((n) => [n, n + ' % de la fortune']) },
  ] },
  { group: 'Salle', items: [
    { key: 'isPublic', label: 'Salle publique', type: 'toggle', hint: 'Visible dans la liste des salles de l\'accueil' },
    { key: 'allowSpectators', label: 'Spectateurs autorisés', type: 'toggle' },
  ] },
];

const PRESETS = {
  '⚖️ Classique': { startMoney: 2000, salary: 300, turnTime: 30, gameDuration: 0, maxRounds: 0, takeover: true, takeoverMult: 2, tripleMonopoly: true, lineMonopoly: true, resortMonopoly: true, festival: true, buildOnPurchase: true, countryDoubleRent: true },
  '⚡ Blitz': { startMoney: 1500, salary: 200, turnTime: 15, gameDuration: 20, maxRounds: 0, takeover: true, takeoverMult: 2, tripleMonopoly: true, lineMonopoly: true, resortMonopoly: true, festival: true },
  '🏰 Longue': { startMoney: 3000, salary: 400, turnTime: 45, gameDuration: 0, maxRounds: 0, takeover: true, takeoverMult: 3, tripleMonopoly: false, lineMonopoly: false, resortMonopoly: false, festival: true },
  '🧘 Détente': { startMoney: 2500, salary: 300, turnTime: 0, gameDuration: 0, maxRounds: 0, takeover: false, tripleMonopoly: true, lineMonopoly: true, resortMonopoly: true },
};

export async function renderRoom(app, code) {
  const view = new RoomView(app, code);
  await view.init();
  return () => view.destroy();
}

// Position (ligne, colonne) d'une case dans la grille 9×9
function gridPos(i) {
  if (i === 0) return [9, 9];
  if (i < 8) return [9, 9 - i];
  if (i === 8) return [9, 1];
  if (i < 16) return [9 - (i - 8), 1];
  if (i === 16) return [1, 1];
  if (i < 24) return [1, i - 16 + 1];
  if (i === 24) return [1, 9];
  return [i - 24 + 1, 9];
}
function sideOf(i) {
  if (i % 8 === 0) return 'corner';
  return ['b', 'l', 't', 'r'][Math.floor(i / 8)];
}

// Rotation 3D d'un dé pour présenter une face
const DIE_ROT = { 1: [0, 0], 2: [0, -90], 3: [-90, 0], 4: [90, 0], 5: [0, 90], 6: [0, 180] };
const PIPS = { 1: [5], 2: [1, 9], 3: [1, 5, 9], 4: [1, 3, 7, 9], 5: [1, 3, 5, 7, 9], 6: [1, 3, 4, 6, 7, 9] };
function makeDie() {
  const cube = h('div.cube');
  const faces = { 1: 'f1', 2: 'f2', 3: 'f3', 4: 'f4', 5: 'f5', 6: 'f6' };
  for (const [v, cls] of Object.entries(faces)) {
    const face = h('div.face.' + cls);
    for (let k = 1; k <= 9; k++) face.append(h('span.pip' + (PIPS[v].includes(k) ? '.on' : '')));
    cube.append(face);
  }
  return h('div.die', cube);
}

class RoomView {
  constructor(app, code) {
    this.app = app;
    this.code = code;
    this.room = null;
    this.state = null;
    this.chat = [];
    this.queue = [];
    this.busy = false;
    this.mode = null;
    this.offs = [];
    this.spins = [0, 0];
    this.disp = { pos: {}, cash: {} };
    this.rewards = null;
    this.highlightOwner = null;
    this.clockOffset = 0;
    this.tab = 'log';
    this.unread = 0;
  }

  get meta() {
    return store.meta;
  }
  get me() {
    return store.key;
  }
  get isHost() {
    return this.room && this.room.host === this.me;
  }
  player(id) {
    return this.state && this.state.players.find((p) => p.id === id);
  }

  async init() {
    document.body.classList.add('in-game');
    this.root = h('div.room-root', h('div.page.center', h('div.spinner'), h('p.muted', 'Connexion à la salle…')));
    this.app.append(this.root);
    const sub = (ev, fn) => this.offs.push(on(ev, fn.bind(this)));
    sub('room:state', this.onRoom);
    sub('chat:history', (list) => {
      this.chat = list;
      this.renderChat();
    });
    sub('chat:msg', this.onChat);
    sub('game:update', this.onUpdate);
    sub('game:emote', this.onEmote);
    sub('game:rewards', (r) => {
      this.rewards = r;
      this.renderEnd();
    });
    sub('room:closed', (d) => {
      toast(d.reason, 'warn', 6000);
      navigate('/');
    });
    sub('room:kicked', () => {
      toast('Vous avez été exclu(e) de la salle.', 'error', 6000);
      navigate('/');
    });
    sub('connect', () => this.join());
    this.onKey = (e) => {
      if (e.target.matches('input, textarea, select')) return;
      if (e.key === 'f' || e.key === 'F') toggleFullscreen();
      if ((e.key === ' ' || e.key === 'Enter') && this.canAct() && this.state.phase === 'roll') {
        e.preventDefault();
        this.action('roll');
      }
    };
    document.addEventListener('keydown', this.onKey);
    this.onResize = () => this.placePawns(false);
    window.addEventListener('resize', this.onResize);
    this.tick = setInterval(() => this.updateTimer(), 250);
    if (store.socket && store.socket.connected) this.join();
  }

  async join() {
    const res = await emit('room:join', { code: this.code });
    if (res.error) {
      this.root.innerHTML = '';
      this.root.append(h('div.page.center', h('h1', '🚪'), h('h2', res.error), h('a.btn.primary', { href: '/', 'data-link': true }, 'Retour à l\'accueil')));
    }
  }

  destroy() {
    for (const off of this.offs) off();
    document.removeEventListener('keydown', this.onKey);
    window.removeEventListener('resize', this.onResize);
    clearInterval(this.tick);
    emit('room:leave');
    document.body.classList.remove('in-game');
  }

  // ================================================================ salle
  onRoom(room) {
    const prevState = this.room && this.room.state;
    this.room = room;
    const mode = room.state === 'lobby' ? 'lobby' : 'game';
    if (mode !== this.mode) {
      this.mode = mode;
      this.root.innerHTML = '';
      if (mode === 'lobby') {
        this.state = null;
        this.queue = [];
        this.rewards = null;
        this.buildLobby();
      } else this.buildGame();
    }
    if (mode === 'lobby') this.renderLobby();
    else {
      this.renderToolbar();
      if (room.state === 'ended' && prevState !== 'ended') this.endPending = true;
      if (!this.busy) this.renderEnd();
    }
  }

  // ---------------------------------------------------------------- lobby
  buildLobby() {
    this.lobbyEls = {
      seats: h('div.seats'),
      settings: h('div.settings-form'),
      look: h('div.look'),
      actions: h('div.lobby-actions'),
      title: h('div.lobby-title'),
    };
    this.chatBox = this.buildChat();
    const link = location.origin + '/r/' + this.code;
    this.root.append(
      h('div.page.lobby',
        h('div.lobby-head',
          this.lobbyEls.title,
          h('div.invite',
            h('div.invite-label', 'Code de la salle'),
            h('div.invite-code', { title: 'Copier le code', onclick: () => copy(this.code, 'Code copié !') }, this.code),
            h('button.btn.accent', { onclick: () => (navigator.share ? navigator.share({ title: 'MyPoly', text: 'Rejoins ma partie de MyPoly !', url: link }).catch(() => {}) : copy(link, 'Lien d\'invitation copié !')) }, '🔗 Inviter des amis')
          )
        ),
        h('div.lobby-grid',
          h('div.card.lobby-players', h('h2', '👥 Joueurs'), this.lobbyEls.seats, this.lobbyEls.look),
          h('div.card.lobby-settings', h('h2', '⚙️ Règles de la partie'), this.lobbyEls.settings),
          h('div.card.lobby-chat', h('h2', '💬 Discussion'), this.chatBox)
        ),
        this.lobbyEls.actions
      )
    );
    this.renderChat();
  }

  renderLobby() {
    const r = this.room;
    const els = this.lobbyEls;
    const mySeat = r.seats.find((s) => s.key === this.me);
    // Titre
    els.title.innerHTML = '';
    if (this.isHost) {
      const input = h('input.input.room-name', { value: r.name, maxlength: 40, onchange: (e) => this.saveSettings({}, e.target.value) });
      els.title.append(input);
    } else els.title.append(h('h1', r.name));
    els.title.append(h('div.muted', `${r.seats.length}/${r.settings.maxPlayers} joueurs${r.spectators ? ` · ${r.spectators} spectateur(s)` : ''}`));

    // Sièges
    els.seats.innerHTML = '';
    for (let i = 0; i < r.settings.maxPlayers; i++) {
      const s = r.seats[i];
      if (!s) {
        els.seats.append(h('div.seat.empty', h('div.avatar', '＋'), h('div.seat-name.muted', 'Place libre'), this.isHost ? h('button.btn.ghost.sm', { onclick: () => this.cmd('room:addBot') }, '🤖 Ajouter un bot') : null));
        continue;
      }
      els.seats.append(
        h('div.seat' + (s.key === this.me ? '.me' : '') + (s.vip ? '.vip' : ''),
          h('div.avatar', { style: { '--c': s.color } }, s.pawn),
          h('div.seat-name',
            h('span.' + (nameClass(s) || 'plain'), s.name),
            s.host ? h('span.tag.tag-host', '👑 Hôte') : null,
            ...roleTags(s),
            !s.connected ? h('span.tag.tag-off', 'hors ligne') : null
          ),
          this.isHost && s.key !== this.me ? h('button.btn.ghost.sm.kick', { title: 'Exclure', onclick: () => this.cmd('room:kick', { key: s.key }) }, '✕') : null
        )
      );
    }

    // Personnalisation du pion
    els.look.innerHTML = '';
    if (mySeat) {
      const vip = mySeat.vip || mySeat.role === 'staff' || mySeat.role === 'admin';
      const used = new Set(r.seats.filter((s) => s !== mySeat).map((s) => s.color));
      const pawns = [...this.meta.pawns, ...(vip ? this.meta.vipPawns : [])];
      const colors = [...this.meta.colors, ...(vip ? this.meta.vipColors : [])];
      els.look.append(
        h('h3', 'Mon pion'),
        h('div.pick-grid.sm', pawns.map((p) => h('button.pick' + (p === mySeat.pawn ? '.on' : '') + (this.meta.vipPawns.includes(p) ? '.vip' : ''), { onclick: () => this.cmd('room:look', { pawn: p }) }, p))),
        h('div.pick-grid.sm', colors.map((c) => h('button.pick.color' + (c === mySeat.color ? '.on' : '') + (used.has(c) ? '.taken' : ''), { style: { '--c': c }, disabled: used.has(c), onclick: () => this.cmd('room:look', { color: c }) })))
      );
    }

    // Réglages
    this.renderSettings();

    // Actions
    els.actions.innerHTML = '';
    els.actions.append(h('button.btn.ghost', { onclick: () => navigate('/') }, '← Quitter'));
    if (this.isHost) {
      const n = r.seats.length;
      els.actions.append(h('button.btn.primary.lg.start-btn', { disabled: n < 2, onclick: () => this.cmd('room:start') }, n < 2 ? 'Ajoutez au moins 1 joueur ou bot' : `🚀 Lancer la partie (${n} joueurs)`));
    } else {
      els.actions.append(h('div.waiting', h('span.dot-pulse'), mySeat ? ' En attente du lancement par l\'hôte…' : ' Salle pleine : vous êtes spectateur.'));
    }
  }

  renderSettings() {
    const s = this.room.settings;
    const box = this.lobbyEls.settings;
    const editable = this.isHost;
    box.innerHTML = '';
    if (editable) box.append(h('div.presets', Object.entries(PRESETS).map(([name, p]) => h('button.btn.ghost.sm', { onclick: () => this.saveSettings(p) }, name))));
    for (const g of SETTINGS_UI) {
      const grp = h('div.set-group', h('div.set-group-title', g.group));
      for (const it of g.items) {
        let ctrl;
        if (it.type === 'toggle') {
          ctrl = h('label.switch', h('input', { type: 'checkbox', checked: !!s[it.key], disabled: !editable, onchange: (e) => this.saveSettings({ [it.key]: e.target.checked }) }), h('span.slider'));
        } else {
          const opts = it.options.slice();
          if (!opts.some(([v]) => v === s[it.key])) opts.push([s[it.key], it.key === 'startMoney' || it.key === 'salary' ? fmt(s[it.key]) : String(s[it.key])]);
          ctrl = h('select.input.sm', { disabled: !editable, onchange: (e) => this.saveSettings({ [it.key]: Number(e.target.value) }) }, opts.map(([v, l]) => h('option', { value: v, selected: v === s[it.key] }, l)));
        }
        grp.append(h('div.set-row', h('div.set-label', it.label, it.hint ? h('small', it.hint) : null), ctrl));
      }
      box.append(grp);
    }
  }

  async saveSettings(patch, name) {
    const settings = { ...this.room.settings, ...patch };
    const res = await emit('room:settings', { settings, name });
    if (res.error) toast(res.error, 'error');
  }

  async cmd(event, data) {
    Sound.play('click');
    const res = await emit(event, data);
    if (res && res.error) {
      Sound.play('error');
      toast(res.error, 'error');
    }
    return res;
  }

  // ----------------------------------------------------------------- chat
  buildChat() {
    const list = h('div.chat-list');
    const input = h('input.input', { placeholder: 'Écrire un message…', maxlength: 200 });
    const send = () => {
      const text = input.value.trim();
      if (!text) return;
      store.socket.emit('chat:send', { text });
      input.value = '';
    };
    input.addEventListener('keydown', (e) => e.key === 'Enter' && send());
    const box = h('div.chat', list, h('div.chat-input', input, h('button.btn.primary.sm', { onclick: send }, '➤')));
    box._list = list;
    return box;
  }
  renderChat() {
    if (!this.chatBox) return;
    const list = this.chatBox._list;
    list.innerHTML = '';
    for (const m of this.chat) list.append(this.chatLine(m));
    list.scrollTop = list.scrollHeight;
  }
  chatLine(m) {
    if (m.system) return h('div.chat-line.system', m.text);
    return h('div.chat-line' + (m.key === this.me ? '.mine' : ''), h('span.chat-name.' + (nameClass(m) || 'plain'), m.name), ...roleTags(m, { level: false }), h('span.chat-text', m.text));
  }
  onChat(m) {
    this.chat.push(m);
    if (this.chat.length > 100) this.chat.shift();
    if (this.chatBox) {
      const list = this.chatBox._list;
      list.append(this.chatLine(m));
      list.scrollTop = list.scrollHeight;
    }
    if (!m.system && m.key !== this.me) {
      Sound.play('chat');
      if (this.mode === 'game' && this.tab !== 'chat') {
        this.unread++;
        this.renderTabs();
      }
    }
  }

  // ================================================================= jeu
  buildGame() {
    const cells = this.meta.cells;
    this.board = h('div.board');
    this.cellEls = cells.map((c, i) => {
      const [r, col] = gridPos(i);
      const el = h('div.cell.' + c.type + '.side-' + sideOf(i), { style: { gridRow: r, gridColumn: col }, 'data-i': i, onclick: () => this.onCellClick(i) });
      this.board.append(el);
      return el;
    });
    // Centre du plateau
    this.diceEls = [makeDie(), makeDie()];
    this.actionPanel = h('div.action-panel');
    this.cardSlot = h('div.card-slot');
    this.centerInfo = h('div.center-info');
    this.center = h('div.board-center',
      h('div.center-logo', 'My', h('span', 'Poly')),
      this.centerInfo,
      h('div.dice', this.diceEls),
      this.actionPanel,
      this.cardSlot
    );
    this.board.append(this.center);
    this.pawnLayer = h('div.pawn-layer');
    this.board.append(this.pawnLayer);
    this.pawnEls = {};

    this.toolbar = h('div.toolbar');
    this.playersEl = h('div.players');
    this.tabsEl = h('div.tabs.small');
    this.logEl = h('div.log');
    this.chatBox = this.buildChat();
    this.emoteBar = h('div.emotes', EMOTES.map((e) => h('button.emote', { onclick: () => store.socket.emit('game:emote', { emoji: e }) }, e)));
    this.sidePanel = h('div.side-panel', this.logEl, this.chatBox);
    this.endOverlay = h('div.end-overlay', { hidden: true });

    this.root.append(
      h('div.game',
        h('div.board-wrap', h('div.board-scale', this.board)),
        h('div.side', this.toolbar, this.playersEl, this.tabsEl, this.sidePanel, this.emoteBar)
      ),
      this.endOverlay
    );
    this.renderTabs();
    this.renderChat();
    this.renderToolbar();
  }

  renderTabs() {
    this.tabsEl.innerHTML = '';
    for (const [k, l] of [['log', '📜 Journal'], ['chat', '💬 Chat' + (this.unread ? ` (${this.unread})` : '')]]) {
      this.tabsEl.append(h('button.tab' + (this.tab === k ? '.active' : ''), { onclick: () => {
        this.tab = k;
        if (k === 'chat') this.unread = 0;
        this.renderTabs();
      } }, l));
    }
    this.logEl.hidden = this.tab !== 'log';
    this.chatBox.hidden = this.tab !== 'chat';
    if (this.tab === 'chat') this.chatBox._list.scrollTop = 1e9;
  }

  renderToolbar() {
    if (!this.toolbar) return;
    const me = this.player(this.me);
    this.toolbar.innerHTML = '';
    this.toolbar.append(
      h('div.tb-code', { title: 'Copier le lien', onclick: () => copy(location.origin + '/r/' + this.code, 'Lien copié !') }, '🔗 ', this.code),
      h('div.tb-info', this.state ? `Tour ${this.state.round}` : ''),
      h('button.icon-btn', { title: 'Règles', onclick: () => this.showRules() }, '📖'),
      h('button.icon-btn', { title: 'Son', onclick: (e) => (e.target.textContent = Sound.toggle() ? '🔊' : '🔇') }, Sound.isEnabled() ? '🔊' : '🔇'),
      h('button.icon-btn', { title: 'Plein écran (F)', onclick: toggleFullscreen }, '⛶'),
      me && !me.bankrupt && this.room.state === 'playing'
        ? h('button.icon-btn.danger', { title: 'Abandonner', onclick: () => this.forfeit() }, '🏳️')
        : h('button.icon-btn', { title: 'Quitter', onclick: () => navigate('/') }, '🚪')
    );
  }

  showRules() {
    const s = this.room.settings;
    const yes = (b) => (b ? '✅' : '❌');
    modal({
      title: '⚙️ Règles de cette partie',
      body: h('div.rules-summary',
        h('div', `💰 Départ : ${fmt(s.startMoney)} · Salaire : ${fmt(s.salary)}`),
        h('div', `⏱️ ${s.turnTime ? s.turnTime + ' s par décision' : 'Temps illimité'}${s.gameDuration ? ` · partie de ${s.gameDuration} min` : ''}${s.maxRounds ? ` · ${s.maxRounds} tours max` : ''}`),
        h('div', `${yes(s.takeover)} Rachat (×${s.takeoverMult}) · ${yes(s.buildOnPurchase)} Construction à l'achat`),
        h('div', `${yes(s.festival)} Festival · ${yes(s.countryDoubleRent)} Pays complet ×2 · ${yes(s.doubleReplay)} Rejouer sur double`),
        h('div', `🏆 ${yes(s.tripleMonopoly)} Triple monopole · ${yes(s.lineMonopoly)} Ligne · ${yes(s.resortMonopoly)} Balnéaire`),
        h('div', `🏝️ Amende ${fmt(s.jailFine)} · ✈️ Billet ${fmt(s.travelFee)} · 💸 Impôts ${s.taxPercent} %`),
        h('a', { href: '/rules', target: '_blank' }, 'Règles complètes →')
      ),
    });
  }

  async forfeit() {
    const ok = await modal({ title: '🏳️ Abandonner ?', body: h('p', 'Vous serez déclaré(e) en faillite et vos propriétés retourneront à la banque.'), buttons: [{ label: 'Annuler', value: false }, { label: 'Abandonner', value: true, class: 'danger' }] });
    if (ok) this.cmd('game:forfeit');
  }

  // ----------------------------------------------------- flux de mises à jour
  onUpdate(payload) {
    const st = payload.state;
    this.clockOffset = st.serverNow - Date.now();
    if (payload.sync || !this.state) {
      // Synchronisation complète : pas d'animation
      this.queue = [];
      this.applyState(st, true);
      return;
    }
    this.queue.push(payload);
    if (!this.busy) this.processQueue();
  }

  async processQueue() {
    this.busy = true;
    while (this.queue.length) {
      const { events, state } = this.queue.shift();
      const fast = document.hidden || this.queue.length > 2;
      this.renderActions(null); // masque les actions pendant l'animation
      if (!fast) {
        for (const ev of events) {
          try {
            await this.playEvent(ev, state);
          } catch (e) {
            console.error(e);
          }
        }
      } else {
        for (const ev of events) if (ev.t === 'log') this.addLog(ev);
      }
      this.applyState(state, fast);
    }
    this.busy = false;
    // Une fois les animations terminées, les décisions redeviennent cliquables
    this.renderCells();
    this.renderActions(this.state);
    this.renderEnd();
  }

  applyState(st, instant) {
    const first = !this.state;
    this.state = st;
    for (const p of st.players) {
      this.disp.pos[p.id] = p.pos;
      this.disp.cash[p.id] = p.cash;
    }
    if (first || instant) {
      this.logEl.innerHTML = '';
      for (const l of st.log) this.addLog(l, true);
    }
    this.renderCells();
    this.renderPlayers();
    this.placePawns(!instant);
    this.renderCenter();
    this.renderActions(st);
    this.renderToolbar();
    if (st.dice && first) this.showDice(st.dice, true);
  }

  async playEvent(ev, st) {
    const p = ev.pid ? st.players.find((x) => x.id === ev.pid) : null;
    switch (ev.t) {
      case 'log':
        this.addLog(ev);
        return;
      case 'turn':
        this.renderPlayers(ev.pid);
        if (ev.pid === this.me) {
          Sound.play('turn');
          this.flashBanner('🎲 À vous de jouer !');
          if (document.hidden) document.title = '🎲 À vous ! – MyPoly';
        }
        return;
      case 'dice':
        Sound.play('dice');
        await this.showDice(ev.d);
        return;
      case 'move':
        await this.animateMove(ev);
        return;
      case 'money':
        this.disp.cash[ev.pid] = (this.disp.cash[ev.pid] ?? 0) + ev.delta;
        this.floatMoney(ev.pid, ev.delta);
        if (ev.pid === this.me) Sound.play(ev.delta > 0 ? 'cash' : 'pay');
        this.renderPlayers();
        await sleep(120);
        return;
      case 'buy':
        Sound.play('buy');
        this.pulseCell(ev.cell, p);
        await sleep(400);
        return;
      case 'build':
        Sound.play('build');
        this.pulseCell(ev.cell, p);
        await sleep(400);
        return;
      case 'takeover':
        Sound.play('takeover');
        this.pulseCell(ev.cell, p);
        await sleep(600);
        return;
      case 'rent':
        this.pulseCell(ev.cell, this.player(ev.to), 'rent');
        await sleep(250);
        return;
      case 'sell':
        this.pulseCell(ev.cell, null);
        return;
      case 'card':
        Sound.play('card');
        await this.showCard(ev.card, p);
        return;
      case 'jail':
        Sound.play('jail');
        return;
      case 'festival':
        Sound.play('festival');
        this.pulseCell(ev.cell, p, 'festival');
        await sleep(700);
        return;
      case 'fly':
        Sound.play('fly');
        return;
      case 'quake':
        Sound.play('quake');
        this.board.classList.add('shake');
        setTimeout(() => this.board.classList.remove('shake'), 900);
        this.pulseCell(ev.cell, null, 'quake');
        await sleep(800);
        return;
      case 'shield':
        Sound.play('buy');
        return;
      case 'bankrupt':
        Sound.play('bankrupt');
        this.flashBanner(`💥 ${p ? p.name : '?'} fait faillite !`);
        await sleep(900);
        return;
      case 'win':
        Sound.play('win');
        return;
    }
  }

  // --------------------------------------------------------------- plateau
  renderCells() {
    const st = this.state;
    const cells = this.meta.cells;
    const countries = Object.fromEntries(this.meta.countries.map((c) => [c.id, c]));
    const myTurn = this.canAct();
    for (const c of cells) {
      const i = c.index;
      const el = this.cellEls[i];
      const pr = st.props[i];
      const owner = pr && pr.owner ? this.player(pr.owner) : null;
      el.innerHTML = '';
      el.style.removeProperty('--owner');
      el.classList.toggle('owned', !!owner);
      el.classList.toggle('dim', !!this.highlightOwner && (!owner || owner.id !== this.highlightOwner));
      if (owner) el.style.setProperty('--owner', owner.color);
      el.classList.toggle('festival-on', st.festival && st.festival.cell === i);
      // Cases sélectionnables selon la phase
      let selectable = false;
      if (myTurn) {
        if (st.phase === 'travel') selectable = i !== 24;
        if ((st.phase === 'festival' || st.phase === 'debt') && owner && owner.id === this.me) selectable = true;
      }
      el.classList.toggle('selectable', selectable);
      if (c.type === 'city') {
        const ct = countries[c.country];
        el.append(
          h('div.band', { style: { background: ct.color } }, h('span.flag', ct.flag), pr.level ? h('span.buildings', pr.level === 4 ? '🏨' : '🏠'.repeat(pr.level)) : null),
          h('div.cname', c.name),
          h('div.cprice', owner ? fmt(pr.rent) : fmt(c.price))
        );
      } else if (c.type === 'resort') {
        el.append(h('div.cicon', c.emoji), h('div.cname', c.name), h('div.cprice', owner ? fmt(pr.rent) : fmt(c.price)));
      } else if (c.type === 'chance') {
        el.append(h('div.cicon.big', '❓'), h('div.cname', 'Chance'));
      } else if (c.type === 'tax') {
        el.append(h('div.cicon.big', '💸'), h('div.cname', 'Impôts'), h('div.cprice', this.room.settings.taxPercent + ' %'));
      } else {
        const icons = { start: '🏁', jail: '🏝️', festival: '🎉', travel: '✈️' };
        const sub = { start: `+${fmt(this.room.settings.salary)}`, jail: 'Prison', festival: st.festival && st.festival.cell != null ? `×${st.festival.mult} à ${cells[st.festival.cell].name}` : 'Loyer ×2', travel: 'Voyage' };
        el.append(h('div.corner-icon', icons[c.type]), h('div.corner-name', c.name), h('div.corner-sub', sub[c.type]));
      }
      if (st.festival && st.festival.cell === i) el.append(h('div.festival-badge', `🎉×${st.festival.mult}`));
      if (owner) el.append(h('div.owner-dot', { style: { background: owner.color }, title: owner.name }, owner.pawn));
    }
  }

  cellCenter(i) {
    const el = this.cellEls[i];
    return { x: el.offsetLeft + el.offsetWidth / 2, y: el.offsetTop + el.offsetHeight / 2, w: el.offsetWidth, hgt: el.offsetHeight };
  }

  placePawns(animate) {
    if (!this.state) return;
    const groups = {};
    for (const p of this.state.players) {
      if (p.bankrupt) continue;
      const pos = this.disp.pos[p.id] ?? p.pos;
      (groups[pos] ||= []).push(p);
    }
    const seen = new Set();
    for (const [pos, list] of Object.entries(groups)) {
      list.forEach((p, k) => {
        seen.add(p.id);
        this.setPawn(p, Number(pos), k, list.length, animate);
      });
    }
    for (const [id, el] of Object.entries(this.pawnEls)) {
      if (!seen.has(id)) {
        el.classList.add('gone');
      }
    }
  }

  pawnEl(p) {
    let el = this.pawnEls[p.id];
    if (!el) {
      el = h('div.pawn' + (p.vip ? '.vip' : ''), { style: { '--c': p.color }, title: p.name }, h('span', p.pawn));
      this.pawnLayer.append(el);
      this.pawnEls[p.id] = el;
    }
    el.classList.toggle('current', this.state && this.state.current === p.id);
    return el;
  }

  setPawn(p, pos, k, n, animate) {
    const el = this.pawnEl(p);
    const c = this.cellCenter(pos);
    const r = n > 1 ? Math.min(c.w, c.hgt) * 0.22 : 0;
    const ang = (k / n) * Math.PI * 2 - Math.PI / 2;
    const x = c.x + Math.cos(ang) * r;
    const y = c.y + Math.sin(ang) * r;
    el.style.transition = animate ? '' : 'none';
    el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
    if (!animate) void el.offsetWidth;
    el.style.transition = '';
  }

  async animateMove(ev) {
    const p = this.player(ev.pid) || { id: ev.pid };
    const el = this.pawnEls[ev.pid];
    if (!el) return;
    if (ev.teleport) {
      el.classList.add('teleport');
      await sleep(250);
      this.disp.pos[ev.pid] = ev.to;
      this.placePawns(false);
      el.classList.remove('teleport');
      await sleep(300);
      return;
    }
    const dir = ev.steps > 0 ? 1 : -1;
    let pos = ev.from;
    el.classList.add('moving');
    for (let s = 0; s < Math.abs(ev.steps); s++) {
      pos = (pos + dir + 32) % 32;
      this.disp.pos[ev.pid] = pos;
      const c = this.cellCenter(pos);
      el.style.transform = `translate(${c.x}px, ${c.y}px) translate(-50%, -50%)`;
      Sound.play('step');
      await sleep(170);
    }
    el.classList.remove('moving');
    this.placePawns(true);
    this.pulseCell(pos, p.color ? p : null, 'land');
    await sleep(150);
  }

  pulseCell(i, p, kind = 'pulse') {
    const el = this.cellEls[i];
    if (!el) return;
    el.classList.remove('fx-' + kind);
    void el.offsetWidth;
    if (p) el.style.setProperty('--fx', p.color);
    el.classList.add('fx-' + kind);
    setTimeout(() => el.classList.remove('fx-' + kind), 1200);
  }

  async showDice(d, instant) {
    for (let k = 0; k < 2; k++) {
      const cube = this.diceEls[k].firstChild;
      const [bx, by] = DIE_ROT[d[k]];
      if (!instant) this.spins[k] += 2 + k;
      const sx = this.spins[k] * 360 + bx;
      const sy = this.spins[k] * 360 + by;
      cube.style.transition = instant ? 'none' : '';
      cube.style.transform = `rotateX(${sx}deg) rotateY(${sy}deg)`;
    }
    this.diceEls.forEach((el) => el.classList.toggle('double', d[0] === d[1]));
    if (!instant) {
      this.diceEls.forEach((el) => el.classList.add('rolling'));
      await sleep(1100);
      this.diceEls.forEach((el) => el.classList.remove('rolling'));
    }
  }

  async showCard(card, p) {
    this.cardSlot.innerHTML = '';
    const el = h('div.chance-card', h('div.chance-inner', h('div.chance-back', '❓'), h('div.chance-front', h('div.chance-icon', card.icon), h('div.chance-title', card.title), h('div.chance-text', card.text), p ? h('div.chance-who', p.name) : null)));
    this.cardSlot.append(el);
    requestAnimationFrame(() => el.classList.add('flip'));
    await sleep(2100);
    el.classList.add('out');
    setTimeout(() => el.remove(), 400);
  }

  floatMoney(pid, delta) {
    const card = this.playersEl.querySelector(`[data-pid="${CSS.escape(pid)}"]`);
    if (card) {
      const f = h('div.float-money.' + (delta >= 0 ? 'pos' : 'neg'), (delta >= 0 ? '+' : '') + fmt(delta));
      card.append(f);
      setTimeout(() => f.remove(), 1600);
    }
    const pawn = this.pawnEls[pid];
    if (pawn) {
      const f = h('div.float-money.board.' + (delta >= 0 ? 'pos' : 'neg'), (delta >= 0 ? '+' : '') + fmt(delta));
      f.style.transform = pawn.style.transform;
      this.pawnLayer.append(f);
      setTimeout(() => f.remove(), 1600);
    }
  }

  flashBanner(text) {
    const b = h('div.flash-banner', text);
    this.board.append(b);
    setTimeout(() => b.remove(), 1800);
  }

  onEmote({ key, emoji }) {
    const pawn = this.pawnEls[key];
    if (pawn) {
      const b = h('div.emote-bubble', emoji);
      b.style.transform = pawn.style.transform;
      this.pawnLayer.append(b);
      setTimeout(() => b.remove(), 2200);
    }
    const card = this.playersEl && this.playersEl.querySelector(`[data-pid="${CSS.escape(key)}"]`);
    if (card) {
      const b = h('div.emote-card', emoji);
      card.append(b);
      setTimeout(() => b.remove(), 2200);
    }
  }

  // --------------------------------------------------------------- joueurs
  renderPlayers(currentOverride) {
    const st = this.state;
    if (!st) return;
    const cur = currentOverride || st.current;
    this.playersEl.innerHTML = '';
    for (const p of st.players) {
      const cash = this.disp.cash[p.id] ?? p.cash;
      const icons = [];
      if (p.jailed) icons.push(h('span', { title: `Sur l'Île (${p.jailTurns}/3)` }, '🏝️'));
      if (p.travel) icons.push(h('span', { title: 'Vol au prochain tour' }, '✈️'));
      if (p.shield) icons.push(h('span', { title: 'Bouclier : prochain loyer annulé' }, '🛡️'));
      if (p.coupon) icons.push(h('span', { title: 'Coupon : prochain loyer -50%' }, '🏷️'));
      if (p.jailCards) icons.push(h('span', { title: 'Gilet de sauvetage' }, '🛟' + (p.jailCards > 1 ? '×' + p.jailCards : '')));
      if (!p.isBot && !p.connected) icons.push(h('span', { title: 'Déconnecté (joué automatiquement)' }, '📡'));
      else if (p.afk) icons.push(h('span', { title: 'Absent (joué automatiquement)' }, '💤'));
      const props = st.props.filter((x) => x && x.owner === p.id).length;
      this.playersEl.append(
        h('div.pcard' + (p.id === cur ? '.turn' : '') + (p.bankrupt ? '.out' : '') + (p.id === this.me ? '.me' : '') + (p.vip ? '.vip' : '') + (this.highlightOwner === p.id ? '.hl' : ''),
          { 'data-pid': p.id, style: { '--c': p.color }, onclick: () => {
            this.highlightOwner = this.highlightOwner === p.id ? null : p.id;
            this.renderCells();
            this.renderPlayers();
          } },
          h('div.avatar', { style: { '--c': p.color } }, p.bankrupt ? '💀' : p.pawn),
          h('div.pcard-main',
            h('div.pcard-name', h('span.' + (nameClass(p) || 'plain'), p.name), ...roleTags(p)),
            h('div.pcard-sub', p.bankrupt ? (p.rank ? `Faillite · #${p.rank}` : 'Faillite') : `${props} propriété${props > 1 ? 's' : ''} · fortune ${fmt(p.netWorth)}`, ...icons)
          ),
          h('div.pcard-cash', p.bankrupt ? '—' : fmt(cash)),
          p.id === cur && !st.over ? h('div.pcard-timer') : null
        )
      );
    }
  }

  // ---------------------------------------------------------------- centre
  renderCenter() {
    const st = this.state;
    const s = this.room.settings;
    this.centerInfo.innerHTML = '';
    const bits = [`Tour ${st.round}${s.maxRounds ? '/' + s.maxRounds : ''}`];
    this.centerInfo.append(h('span', bits.join(' · ')));
    if (st.endsAt) {
      this.gameClock = h('span.game-clock');
      this.centerInfo.append(this.gameClock);
    } else this.gameClock = null;
  }

  canAct() {
    return this.state && !this.state.over && !this.busy && this.state.current === this.me;
  }

  renderActions(st) {
    const panel = this.actionPanel;
    panel.innerHTML = '';
    this.timerBar = null;
    if (!st || st.over) return;
    const p = this.player(st.current);
    if (!p) return;
    const pend = st.pending || {};
    const cells = this.meta.cells;
    const mine = st.current === this.me;
    this.timerBar = h('div.timer-bar', h('div'));
    if (!mine) {
      const what = {
        roll: 'lance les dés…',
        jail: 'est coincé(e) sur l\'Île déserte…',
        travel: 'choisit sa destination…',
        buy: `réfléchit à l'achat de ${pend.cell != null ? cells[pend.cell].name : '…'}`,
        build: `envisage de construire à ${pend.cell != null ? cells[pend.cell].name : '…'}`,
        takeover: `envisage de racheter ${pend.cell != null ? cells[pend.cell].name : '…'}`,
        festival: 'choisit où organiser le Festival…',
        debt: `doit trouver ${fmt(pend.amount || 0)}…`,
      }[st.phase] || 'réfléchit…';
      panel.append(h('div.waiting-turn', h('span.avatar.sm', { style: { '--c': p.color } }, p.pawn), h('span', h('b', p.name), ' ', what)), this.timerBar);
      return;
    }
    const act = (type, data) => () => this.action(type, data);
    const me = p;
    switch (st.phase) {
      case 'roll':
        panel.append(h('button.btn.roll-btn', { onclick: act('roll') }, pend.replay ? '🎲 Rejouer (double !)' : '🎲 Lancer les dés'), h('div.hint', 'Espace pour lancer'));
        break;
      case 'jail':
        panel.append(
          h('div.panel-title', `🏝️ Vous êtes sur l'Île déserte (${me.jailTurns}/3)`),
          h('div.btn-col',
            h('button.btn.primary', { onclick: act('roll') }, '🎲 Tenter un double'),
            h('button.btn.secondary', { onclick: act('pay'), disabled: me.cash < pend.fine }, `💰 Payer ${fmt(pend.fine)} et partir`),
            me.jailCards ? h('button.btn.accent', { onclick: act('card') }, '🛟 Utiliser le gilet de sauvetage') : null
          )
        );
        break;
      case 'travel':
        panel.append(
          h('div.panel-title', '✈️ Où voulez-vous aller ?'),
          h('div.hint', `Cliquez sur une case du plateau (billet : ${fmt(pend.fee)}).`),
          h('button.btn.ghost', { onclick: act('skip') }, 'Rester au sol et lancer les dés')
        );
        break;
      case 'buy': {
        const c = cells[pend.cell];
        panel.append(
          this.propertyHeader(pend.cell),
          h('div.btn-col', (pend.options || []).map((o) =>
            h('button.btn.' + (o.level === 0 ? 'primary' : 'secondary'), { disabled: !o.affordable, onclick: act('buy', { level: o.level }) },
              h('span', c.type === 'resort' ? 'Acheter' : o.level === 0 ? 'Acheter le terrain' : `Terrain + ${LEVEL_LABEL[o.level].toLowerCase()}`), h('b', fmt(o.cost)))
          )),
          h('button.btn.ghost', { onclick: act('skip') }, 'Ne pas acheter')
        );
        break;
      }
      case 'build':
        panel.append(
          this.propertyHeader(pend.cell),
          h('div.btn-col', (pend.options || []).map((o) =>
            h('button.btn.secondary', { disabled: !o.affordable, onclick: act('build', { level: o.level }) }, h('span', o.level === 4 ? '🏨 Construire un hôtel' : `🏠 Monter à ${LEVEL_LABEL[o.level].toLowerCase()}`), h('b', fmt(o.cost)))
          )),
          h('button.btn.ghost', { onclick: act('skip') }, 'Ne rien construire')
        );
        break;
      case 'takeover': {
        const owner = this.player(pend.owner);
        panel.append(
          this.propertyHeader(pend.cell),
          h('div.panel-title', `🤝 Racheter à ${owner ? owner.name : '?'} ?`),
          h('div.btn-col', h('button.btn.primary', { onclick: act('takeover') }, h('span', 'Racheter'), h('b', fmt(pend.price)))),
          h('button.btn.ghost', { onclick: act('skip') }, 'Non merci')
        );
        break;
      }
      case 'festival':
        panel.append(h('div.panel-title', '🎉 Organisez le Festival !'), h('div.hint', 'Cliquez sur une de vos propriétés pour multiplier son loyer.'), h('button.btn.ghost', { onclick: act('skip') }, 'Passer'));
        break;
      case 'debt': {
        const owned = st.props.map((x, i) => (x && x.owner === this.me ? i : -1)).filter((i) => i >= 0);
        panel.append(
          h('div.panel-title.danger', `💸 Vous devez ${fmt(pend.amount)} (vous avez ${fmt(me.cash)})`),
          h('div.hint', 'Vendez des propriétés (50 % de leur valeur) :'),
          h('div.sell-list', owned.map((i) => h('button.btn.sm.secondary', { onclick: act('sell', { cell: i }) }, `${cells[i].name} · +${fmt(st.props[i].sell)}`))),
          h('button.btn.danger', { onclick: async () => {
            const ok = await modal({ title: 'Déclarer faillite ?', body: h('p', 'Vous serez éliminé(e) de la partie.'), buttons: [{ label: 'Annuler', value: false }, { label: 'Faillite', value: true, class: 'danger' }] });
            if (ok) this.action('bankrupt');
          } }, '💀 Déclarer faillite')
        );
        break;
      }
    }
    panel.append(this.timerBar);
    panel.classList.remove('pop');
    void panel.offsetWidth;
    panel.classList.add('pop');
  }

  propertyHeader(i) {
    const c = this.meta.cells[i];
    const ct = c.type === 'city' ? this.meta.countries.find((x) => x.id === c.country) : null;
    const pr = this.state.props[i];
    return h('div.prop-header', { style: { '--band': ct ? ct.color : '#26c6da' } },
      h('div.prop-header-band', ct ? `${ct.flag} ${ct.name}` : `${c.emoji} Station balnéaire`),
      h('div.prop-header-name', c.name),
      pr && pr.owner ? h('div.prop-header-sub', `${LEVEL_LABEL[pr.level] || ''} · loyer actuel ${fmt(pr.rent)}`) : h('div.prop-header-sub', c.type === 'city' ? `Loyers : ${c.rents.map(fmt).join(' / ')}` : 'Loyer selon le nombre de stations possédées')
    );
  }

  async action(type, data = {}) {
    if (!this.canAct()) return;
    Sound.play('click');
    // Désactive les boutons pour éviter les doubles clics
    for (const b of $$('button', this.actionPanel)) b.disabled = true;
    const res = await emit('game:action', { type, ...data });
    if (res.error) {
      Sound.play('error');
      toast(res.error, 'error');
      this.renderActions(this.state);
    }
  }

  onCellClick(i) {
    const st = this.state;
    if (!st) return;
    if (this.canAct()) {
      if (st.phase === 'travel' && i !== 24) return this.action('travel', { cell: i });
      const pr = st.props[i];
      if (st.phase === 'festival' && pr && pr.owner === this.me) return this.action('festival', { cell: i });
      if (st.phase === 'debt' && pr && pr.owner === this.me) return this.action('sell', { cell: i });
    }
    this.showCellInfo(i);
  }

  showCellInfo(i) {
    const c = this.meta.cells[i];
    const st = this.state;
    const pr = st.props[i];
    const owner = pr && pr.owner ? this.player(pr.owner) : null;
    let body;
    if (c.type === 'city') {
      const ct = this.meta.countries.find((x) => x.id === c.country);
      body = h('div.cell-info',
        h('div.prop-header', { style: { '--band': ct.color } }, h('div.prop-header-band', `${ct.flag} ${ct.name}`), h('div.prop-header-name', c.name)),
        h('table.rent-table', c.rents.map((r, l) => h('tr' + (pr && pr.owner && pr.level === l ? '.cur' : ''), h('td', LEVEL_LABEL[l]), h('td', fmt(r))))),
        h('div.small.muted', 'Loyers doublés si le pays entier est possédé.'),
        h('div.info-row', `Prix du terrain : ${fmt(c.price)} · Maison : ${fmt(c.houseCost)} · Hôtel : ${fmt(c.hotelCost)}`),
        owner ? h('div.info-row', `Propriétaire : `, h('b', { style: { color: owner.color } }, owner.name), ` · loyer actuel ${fmt(pr.rent)} · valeur ${fmt(pr.value)}`) : h('div.info-row', 'Libre'),
        owner && this.room.settings.takeover && pr.level < 4 ? h('div.info-row', `Prix de rachat : ${fmt(pr.takeover)}`) : null
      );
    } else if (c.type === 'resort') {
      body = h('div.cell-info',
        h('div.prop-header', { style: { '--band': '#26c6da' } }, h('div.prop-header-band', `${c.emoji} Station balnéaire`), h('div.prop-header-name', c.name)),
        h('table.rent-table', [1, 2, 3, 4].map((n) => h('tr', h('td', `${n} station${n > 1 ? 's' : ''}`), h('td', fmt(this.meta.resortRent[n]))))),
        h('div.info-row', `Prix : ${fmt(c.price)}`),
        owner ? h('div.info-row', 'Propriétaire : ', h('b', { style: { color: owner.color } }, owner.name), ` · loyer actuel ${fmt(pr.rent)}`) : h('div.info-row', 'Libre')
      );
    } else {
      const s = this.room.settings;
      const txt = {
        start: `Touchez ${fmt(s.salary)} à chaque passage${s.startBonus ? ', et le double en tombant pile dessus' : ''}.`,
        jail: `Vous y êtes bloqué(e) jusqu'à faire un double, payer ${fmt(s.jailFine)} ou attendre 3 tours.`,
        festival: 'Choisissez une de vos propriétés : son loyer est multiplié (×2, puis davantage si le Festival y revient).',
        travel: `Au prochain tour, envolez-vous vers n'importe quelle case pour ${fmt(s.travelFee)}.`,
        chance: 'Tirez une carte Chance : bonne ou mauvaise surprise !',
        tax: `Payez ${s.taxPercent} % de votre fortune totale.`,
      }[c.type];
      body = h('p', txt);
    }
    modal({ title: c.name, body, className: 'cell-modal' });
  }

  addLog(l, silent) {
    const p = l.pid ? this.player(l.pid) : null;
    const line = h('div.log-line', p ? h('span.log-dot', { style: { background: p.color } }) : null, l.msg);
    this.logEl.append(line);
    while (this.logEl.children.length > 120) this.logEl.firstChild.remove();
    if (!silent) this.logEl.scrollTop = this.logEl.scrollHeight;
    else requestAnimationFrame(() => (this.logEl.scrollTop = this.logEl.scrollHeight));
  }

  updateTimer() {
    if (!document.hidden && document.title.startsWith('🎲')) document.title = 'MyPoly';
    const st = this.state;
    if (!st || st.over) return;
    const now = Date.now() + this.clockOffset;
    if (this.gameClock && st.endsAt) {
      const left = Math.max(0, Math.round((st.endsAt - now) / 1000));
      this.gameClock.textContent = `⏳ ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
      this.gameClock.classList.toggle('urgent', left < 60);
    }
    if (!this.timerBar || !st.deadline || this.busy) {
      if (this.timerBar) this.timerBar.hidden = true;
      return;
    }
    const total = (this.room.settings.turnTime || 30) * 1000;
    const left = st.deadline - now;
    const pct = Math.max(0, Math.min(100, (left / total) * 100));
    this.timerBar.hidden = false;
    this.timerBar.firstChild.style.width = pct + '%';
    this.timerBar.classList.toggle('urgent', left < 5000);
    const secs = Math.ceil(left / 1000);
    if (st.current === this.me && left < 5000 && left > 0 && secs !== this.lastTick) {
      this.lastTick = secs;
      Sound.play('tick');
    }
    const ring = this.playersEl.querySelector('.pcard.turn .pcard-timer');
    if (ring) ring.style.width = pct + '%';
  }

  // ------------------------------------------------------------ fin de partie
  renderEnd() {
    if (!this.endOverlay || !this.room || this.room.state !== 'ended' || this.busy) return;
    const res = this.room.result;
    if (!res || !this.state) return;
    if (this.endPending) {
      this.endPending = false;
      confetti(4500);
    }
    const ov = this.endOverlay;
    ov.hidden = false;
    ov.innerHTML = '';
    const ranked = res.players.slice().sort((a, b) => a.rank - b.rank);
    const info = (pl) => this.state.players.find((x) => x.id === pl.id) || {};
    const winner = ranked[0];
    const podium = h('div.podium', [ranked[1], ranked[0], ranked[2]].map((pl, k) => {
      if (!pl) return h('div.podium-slot.empty');
      const i = info(pl);
      return h('div.podium-slot.p' + pl.rank,
        h('div.avatar.lg', { style: { '--c': i.color } }, i.pawn),
        h('div.podium-name', h('span.' + (nameClass(i) || 'plain'), pl.name), ...roleTags(i, { level: false })),
        h('div.podium-step', ['🥇', '🥈', '🥉'][pl.rank - 1]),
        h('div.podium-worth', fmt(pl.netWorth))
      );
    }));
    const rw = this.rewards;
    ov.append(
      h('div.end-card',
        h('div.end-title', winner.id === this.me ? '🎉 VICTOIRE ! 🎉' : `🏆 ${winner.name} gagne !`),
        h('div.end-sub', `${winLabel(res.winType)} · ${res.rounds} tours · ${duration(res.duration)}`),
        podium,
        h('div.end-list', ranked.slice(3).map((pl) => h('div.end-row', `#${pl.rank} ${pl.name}`, h('span', fmt(pl.netWorth))))),
        rw ? h('div.rewards',
          h('div.reward', `+${rw.xp} XP`),
          h('div.reward.' + (rw.ratingDelta >= 0 ? 'pos' : 'neg'), `${rw.ratingDelta >= 0 ? '+' : ''}${rw.ratingDelta} pts de classement`),
          rw.badges.length ? h('div.new-badges', h('div.small', 'Nouveaux badges débloqués !'), rw.badges.map((b) => h('div.badge.tier-' + b.tier, h('div.badge-icon', b.icon), h('div.badge-name', b.name)))) : null
        ) : !store.user ? h('div.hint', h('a', { href: '/register', 'data-link': true }, 'Créez un compte'), ' pour enregistrer vos victoires, gagner de l\'XP et des badges !') : null,
        h('div.btn-row.center',
          this.isHost ? h('button.btn.primary.lg', { onclick: () => this.cmd('room:rematch') }, '🔁 Rejouer') : h('div.muted', 'L\'hôte peut relancer une partie.'),
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

export { $ };
