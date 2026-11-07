// Vue d'une salle : salon d'attente + plateau de jeu animé
import { $, $$, h, fmt, toast, modal, roleTags, nameClass, sleep, confetti, duration, storage } from './util.js';
import { store, on, emit } from './store.js';
import * as Sound from './sound.js';
import { navigate, toggleFullscreen, winLabel } from './app.js';
import { Board3D, webglAvailable } from './board3d.js';

const EMOTES = ['👍', '😂', '😱', '😡', '🔥', '💸', '🎉', '😎', '🙏', '💀'];
const LEVEL_LABEL = ['Terrain', '1 maison', '2 maisons', '3 maisons', 'Hôtel'];

const SETTINGS_UI = [
  { group: 'Partie', items: [
    { key: 'maxPlayers', label: 'Joueurs max', type: 'select', options: [2, 3, 4].map((n) => [n, n + ' joueurs']) },
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
    { key: 'firstRoundLimit', label: '1er tour : 2 maisons max', type: 'toggle', hint: 'Au premier tour, impossible de dépasser 2 maisons par ville' },
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


// Maisons et hôtels dessinés en SVG, à la couleur du propriétaire
function houseSvg(color) {
  return `<svg viewBox="0 0 20 20"><path d="M2 10.5 10 3l8 7.5V18H2z" fill="${color}" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/><path d="M1 11 10 2.5 19 11" fill="none" stroke="rgba(0,0,0,.35)" stroke-width="1.6"/><rect x="8" y="12" width="4" height="6" rx=".6" fill="#fff" opacity=".9"/></svg>`;
}
function hotelSvg(color) {
  return `<svg viewBox="0 0 22 26"><rect x="3" y="7" width="16" height="18" rx="2" fill="${color}" stroke="#fff" stroke-width="1.6"/><g stroke="#fff" stroke-width="1.8" stroke-linecap="round"><path d="M7 11h2M13 11h2M7 15h2M13 15h2M7 19h2M13 19h2"/></g><path d="M11 .8l1.4 2.8 3 .45-2.2 2.1.5 3-2.7-1.4-2.7 1.4.5-3-2.2-2.1 3-.45z" fill="#ffd166" stroke="#a87b00" stroke-width=".6"/></svg>`;
}
function buildings(level, color, pop) {
  const html = level >= 4 ? hotelSvg(color) : houseSvg(color).repeat(level);
  return h('span.bld' + (level >= 4 ? '.hotel' : '') + (pop ? '.pop' : ''), { html });
}

const GLOBE_SVG = `<svg viewBox="0 0 200 200" aria-hidden="true">
  <defs><radialGradient id="gg" cx="38%" cy="32%" r="70%"><stop offset="0" stop-color="#7fe3f5" stop-opacity=".35"/><stop offset=".7" stop-color="#1b7da0" stop-opacity=".18"/><stop offset="1" stop-color="#062c3d" stop-opacity=".1"/></radialGradient></defs>
  <circle cx="100" cy="100" r="94" fill="url(#gg)" stroke="rgba(255,255,255,.22)" stroke-width="1.2"/>
  <g fill="rgba(255,255,255,.09)" stroke="rgba(255,255,255,.14)" stroke-width=".8">
    <path d="M40 62c10-12 28-16 40-10 6 3 4 10 12 12s14-4 18 4-6 14-14 16-10 10-20 8-8-10-18-10-20 2-22-6 0-8 4-14z"/>
    <path d="M118 46c12-6 30-2 40 8 8 8 4 16-4 18s-8 8-16 6-12-8-20-6-12-4-10-12 4-10 10-14z"/>
    <path d="M70 108c8-4 18 0 22 8s0 18-6 26-6 22-14 22-8-12-10-20-8-12-6-20 6-12 14-16z"/>
    <path d="M122 98c10-6 26-4 34 6s6 22-2 30-20 10-28 4-10-14-10-22 0-14 6-18z"/>
    <path d="M150 150c6-2 14 0 16 6s-4 10-10 10-12-4-10-10z"/>
  </g>
  <g fill="none" stroke="rgba(255,255,255,.1)" stroke-width=".8">
    <ellipse cx="100" cy="100" rx="94" ry="30"/><ellipse cx="100" cy="100" rx="94" ry="64"/>
    <ellipse cx="100" cy="100" rx="30" ry="94"/><ellipse cx="100" cy="100" rx="64" ry="94"/>
    <path d="M6 100h188M100 6v188"/>
  </g>
</svg>`;

const COMPASS_SVG = `<svg viewBox="0 0 100 100" aria-hidden="true">
  <circle cx="50" cy="50" r="46" fill="none" stroke="rgba(255,215,120,.35)" stroke-width="1.5"/>
  <circle cx="50" cy="50" r="38" fill="none" stroke="rgba(255,215,120,.2)" stroke-width="1" stroke-dasharray="2 3"/>
  <path d="M50 6 56 50 50 94 44 50z" fill="rgba(255,215,120,.45)"/>
  <path d="M6 50 50 44 94 50 50 56z" fill="rgba(255,255,255,.25)"/>
  <path d="M50 6 56 50H44z" fill="rgba(255,90,95,.7)"/>
  <text x="50" y="5" font-size="7" text-anchor="middle" fill="rgba(255,215,120,.8)" font-weight="700">N</text>
</svg>`;

/** Couleur claire (blanc, jaune…) : la fiche du joueur utilise alors un fond plus sombre. */
function isLight(hex) {
  const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex || '');
  if (!m) return false;
  const [r, g, b] = [m[1], m[2], m[3]].map((x) => parseInt(x, 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.62;
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
    this.onResize = () => {
      this.placePawns(false);
      if (this.tip) this.hideTip();
    };
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
    if (this.resizeObs) this.resizeObs.disconnect();
    if (this.b3) this.b3.destroy();
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
        h('div.pick-grid.sm', colors.map((c) => h('button.pick.color' + (c === mySeat.color ? '.on' : '') + (used.has(c) ? '.taken' : '') + (this.meta.vipColors.includes(c) ? '.vip' : ''), { style: { '--c': c }, title: used.has(c) ? 'Couleur déjà prise par un autre joueur' : 'Choisir cette couleur', disabled: used.has(c), onclick: () => this.cmd('room:look', { color: c }) })))
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
      if (this.mode === 'game' && this.pop !== 'chat') {
        this.unread++;
        this.renderToolbar();
        const card = this.playersEl && this.playersEl.querySelector(`[data-pid="${CSS.escape(m.key)}"]`);
        if (card) {
          card.querySelector('.chat-bubble')?.remove();
          const b = h('div.chat-bubble', m.text.length > 90 ? m.text.slice(0, 88) + '…' : m.text);
          card.append(b);
          setTimeout(() => b.remove(), 5000);
        }
      }
    }
  }

  // ================================================================= jeu
  buildGame() {
    const cells = this.meta.cells;
    this.board = h('div.board');
    this.cellEls = cells.map((c, i) => {
      const [r, col] = gridPos(i);
      const el = h('div.cell.' + c.type + '.side-' + sideOf(i), {
        style: { gridRow: r, gridColumn: col },
        'data-i': i,
        onclick: () => this.onCellClick(i),
        onmouseenter: () => this.showTip(i),
        onmouseleave: () => this.hideTip(),
      });
      this.board.append(el);
      return el;
    });
    // Centre du plateau : océan, globe, dés (dans le plan du plateau)
    this.diceEls = [makeDie(), makeDie()];
    this.center = h('div.board-center',
      h('div.ocean'),
      h('div.globe', { html: GLOBE_SVG }),
      h('div.compass', { html: COMPASS_SVG }),
      h('div.cloud.c1'), h('div.cloud.c2'), h('div.cloud.c3'),
      h('div.plane', h('span', '✈️')),
      h('div.center-logo', 'My', h('span', 'Poly')),
      h('div.dice', this.diceEls)
    );
    this.board.append(this.center);
    this.pawnLayer = h('div.pawn-layer');
    this.board.append(this.pawnLayer);
    this.pawnEls = {};
    this.prevLevels = {};

    // Interface superposée (non inclinée en vue 3D, pour rester lisible)
    this.actionPanel = h('div.action-panel');
    this.cardSlot = h('div.card-slot');
    this.centerInfo = h('div.center-info');
    this.feed = h('div.event-feed');
    this.hud = h('div.board-hud', this.centerInfo, this.feed, this.actionPanel, this.cardSlot);
    this.tip = h('div.tile-tip', { hidden: true });
    this.boardScale = h('div.board-scale', this.board, this.hud);
    this.host3d = h('div.board3d-host');
    this.fxLayer = h('div.fx-layer');
    this.boardWrap = h('div.board-wrap', this.boardScale);

    // Joueurs dans les 4 coins de l'écran, barre d'outils flottante en haut
    this.toolbar = h('div.toolbar');
    this.playersEl = h('div.corners');
    this.logEl = h('div.log');
    this.chatBox = this.buildChat();
    this.emoteGrid = h('div.emote-grid', EMOTES.map((e) => h('button.emote', { onclick: () => {
      store.socket.emit('game:emote', { emoji: e });
      this.togglePop(null);
    } }, e)));
    this.popTitle = h('b');
    this.popover = h('div.popover', { hidden: true },
      h('div.pop-head', this.popTitle, h('button.icon-btn.pop-close', { title: 'Fermer', onclick: () => this.togglePop(null) }, '✕')),
      h('div.pop-body', this.logEl, this.chatBox, this.emoteGrid)
    );
    this.pop = null;
    this.endOverlay = h('div.end-overlay', { hidden: true });

    // La scène 3D et les effets couvrent tout l'écran ; l'interface est incrustée par-dessus
    this.gameEl = h('div.game', this.host3d, this.boardWrap, this.fxLayer, this.playersEl, h('div.topbar', this.toolbar, this.popover), this.tip);
    this.root.append(this.gameEl, this.endOverlay);
    if (this.view3d) this.enable3d();
    // Replace les pions dès que la taille du plateau change (vue 2D/3D, redimensionnement)
    this.resizeObs = new ResizeObserver(() => this.placePawns(false));
    this.resizeObs.observe(this.board);
    this.renderTabs();
    this.renderChat();
    this.renderToolbar();
  }

  get view3d() {
    if (!webglAvailable()) return false;
    return storage('board3d') !== '0';
  }
  enable3d() {
    try {
      this.b3 = new Board3D(this.host3d, this.meta, {
        onClick: (i) => this.onCellClick(i),
        onHover: (i) => (i >= 0 ? this.showTip(i) : this.hideTip()),
        onStep: () => Sound.play('step'),
        onDemolish: () => Sound.play('crumble'),
        onFirework: () => Sound.play('firework'),
      });
      this.gameEl.classList.add('webgl');
    } catch (e) {
      console.error('WebGL indisponible', e);
      this.b3 = null;
      this.gameEl.classList.remove('webgl');
    }
  }
  disable3d() {
    if (this.b3) this.b3.destroy();
    this.b3 = null;
    this.gameEl.classList.remove('webgl');
  }
  toggleView() {
    const to3d = !this.b3;
    storage('board3d', to3d ? '1' : '0');
    if (to3d) this.enable3d();
    else this.disable3d();
    if (this.state) {
      this.renderCells();
      this.placePawns(false);
      this.showDice(this.state.dice, true);
    }
    this.renderToolbar();
  }

  /** Annonce en haut du plateau : qui fait quoi, en clair. */
  announce({ icon, title, text, color = '#3fa7ff', kind = 'info', ms = 2800 }) {
    if (!this.feed || document.hidden) return;
    const card = h('div.feed-card.' + kind, { style: { '--c': color } }, h('div.feed-icon', icon), h('div.feed-body', h('div.feed-title', title), text ? h('div.feed-text', text) : null));
    this.feed.prepend(card);
    while (this.feed.children.length > 3) this.feed.lastChild.remove();
    setTimeout(() => {
      card.classList.add('out');
      setTimeout(() => card.remove(), 450);
    }, ms);
  }

  /** Étiquette qui jaillit au-dessus d'une case. */
  cellLabel(i, text, bg = '#e74c3c', fg = '#fff') {
    if (this.b3) return this.b3.label(i, text, bg, fg);
    if (!this.cellEls || !this.cellEls[i]) return;
    const c = this.cellCenter(i);
    const el = h('div.board-pop', { style: { background: bg, color: fg } }, text);
    el.style.left = c.x + 'px';
    el.style.top = c.y + 'px';
    this.pawnLayer.append(el);
    setTimeout(() => el.remove(), 1900);
  }

  /** Célébration d'un monopole sur le plateau 2D : cases dorées, feux d'artifice, titre. */
  async celebrate2d(cells, color, subtitle) {
    if (!this.cellEls || !this.cellEls.length || document.hidden) return sleep(400);
    cells.forEach((i, k) => setTimeout(() => this.pulseCell(i, { color: '#ffd166' }, 'mono'), k * 140));
    const pts = cells.map((i) => this.cellCenter(i));
    for (let wave = 0; wave < 3; wave++) {
      pts.forEach((pt, k) => setTimeout(() => {
        this.fireworks2d(pt.x + (Math.random() - 0.5) * 60, pt.y - 40 - Math.random() * 60, color);
        Sound.play('firework');
      }, 300 + wave * 600 + k * 140));
    }
    const banner = h('div.mono-title', h('div.mono-big', 'MONOPOLE !'), h('div.mono-sub', { style: { background: color } }, subtitle));
    this.hud.append(banner);
    setTimeout(() => banner.remove(), 3300);
    await sleep(3000);
  }
  fireworks2d(x, y, color) {
    const colors = [color, '#ffd166', '#ffffff', '#ff5a5f', '#3fa7ff', '#2ecc71'];
    for (let k = 0; k < 30; k++) {
      const a = (k / 30) * Math.PI * 2 + Math.random() * 0.2;
      const d = 40 + Math.random() * 45;
      const p = h('div.fw-particle', { style: { left: x + 'px', top: y + 'px', background: colors[k % colors.length], color: colors[k % colors.length], '--dx': Math.cos(a) * d + 'px', '--dy': Math.sin(a) * d + 'px' } });
      this.pawnLayer.append(p);
      setTimeout(() => p.remove(), 1300);
    }
  }

  /** Met en surbrillance, pour tous, la case où le joueur va atterrir. */
  markDest(i, color) {
    this.clearDest();
    this.destCell = i;
    Sound.play('tick');
    if (this.b3) return this.b3.markTarget(i, color);
    const el = this.cellEls && this.cellEls[i];
    if (!el) return;
    el.style.setProperty('--dest', color);
    el.classList.add('dest');
    const c = this.cellCenter(i);
    this.destMarker = h('div.dest-marker', { style: { left: c.x + 'px', top: c.y - c.hgt / 2 + 'px', '--dest': color } }, h('span', '▼'));
    this.pawnLayer.append(this.destMarker);
  }
  clearDest() {
    if (this.destCell == null) return;
    if (this.b3) this.b3.clearTarget();
    const el = this.cellEls && this.cellEls[this.destCell];
    if (el) el.classList.remove('dest');
    if (this.destMarker) this.destMarker.remove();
    this.destMarker = null;
    this.destCell = null;
  }

  /** Recadre brièvement la caméra 3D sur une case. */
  focusCell(i) {
    if (this.b3 && !document.hidden) this.b3.focus(i);
  }

  /** Pièces qui volent entre deux points : { pawn }, { cell } ou { bank }. */
  coins(from, to, n = 6) {
    if (this.b3) return this.b3.coins(from, to, n);
    const pt = (s) => (s.bank ? this.boardCenter() : s.cell != null ? this.cellCenter(s.cell) : this.pawnPos(s.pawn));
    return this.flyCoins(pt(from), pt(to), n);
  }

  /** Position écran (dans la zone du plateau) au-dessus d'un pion, pour les effets flottants. */
  fxPoint(pid) {
    if (this.b3) return this.b3.pawnScreen(pid);
    return null;
  }

  /** Ouvre / ferme la petite fenêtre flottante (chat, journal ou émotes). */
  togglePop(name) {
    this.pop = name && this.pop !== name ? name : null;
    this.renderTabs();
    this.renderToolbar();
  }
  renderTabs() {
    if (!this.popover) return;
    const p = this.pop;
    this.popover.hidden = !p;
    this.popTitle.textContent = { chat: '💬 Discussion', log: '📜 Journal de la partie', emote: '😀 Réagir' }[p] || '';
    this.logEl.hidden = p !== 'log';
    this.chatBox.hidden = p !== 'chat';
    this.emoteGrid.hidden = p !== 'emote';
    if (p === 'chat') {
      this.unread = 0;
      this.chatBox._list.scrollTop = 1e9;
      setTimeout(() => this.chatBox.querySelector('input') && this.chatBox.querySelector('input').focus(), 30);
    }
    if (p === 'log') this.logEl.scrollTop = 1e9;
  }

  renderToolbar() {
    if (!this.toolbar) return;
    const me = this.player(this.me);
    this.toolbar.innerHTML = '';
    this.toolbar.append(
      h('div.tb-code', { title: 'Copier le lien d\'invitation', onclick: () => copy(location.origin + '/r/' + this.code, 'Lien copié !') }, '🔗 ', this.code),
      h('div.tb-info', this.state ? `Tour ${this.state.round}` : ''),
      h('button.icon-btn' + (this.pop === 'chat' ? '.on' : ''), { title: 'Discussion', onclick: () => this.togglePop('chat') }, '💬', this.unread ? h('span.tb-badge', String(this.unread)) : null),
      h('button.icon-btn' + (this.pop === 'log' ? '.on' : ''), { title: 'Journal de la partie', onclick: () => this.togglePop('log') }, '📜'),
      h('button.icon-btn' + (this.pop === 'emote' ? '.on' : ''), { title: 'Réagir', onclick: () => this.togglePop('emote') }, '😀'),
      h('button.icon-btn.view-btn', { title: this.b3 ? 'Passer au plateau 2D' : 'Passer au plateau 3D', onclick: () => this.toggleView() }, this.b3 ? '2D' : '3D'),
      h('button.icon-btn', { hidden: !this.b3, title: 'Recentrer la caméra (double-clic sur le plateau)', onclick: () => this.b3 && this.b3.resetView() }, '🎥'),
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
        h('div', `${yes(s.takeover)} Rachat (×${s.takeoverMult}) · ${yes(s.buildOnPurchase)} Construction à l'achat · ${yes(s.firstRoundLimit)} 1er tour : 2 maisons max`),
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
        events.forEach((ev, k) => {
          if (ev.t !== 'dice') return;
          const mv = events.slice(k + 1).find((x) => x.t === 'move' && x.pid === ev.pid);
          // Seulement si le déplacement suit directement le lancer (pas une téléportation)
          if (mv && !mv.teleport && mv.steps > 0) ev.dest = mv.to;
        });
        for (const ev of events) {
          try {
            await this.playEvent(ev, state);
          } catch (e) {
            console.error(e);
          }
        }
        this.clearDest();
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
    this.syncInstant = first || instant;
    if (first || instant) {
      this.logEl.innerHTML = '';
      for (const l of st.log) this.addLog(l, true);
    }
    this.renderCells();
    this.syncInstant = false;
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
        if (ev.dest != null) this.markDest(ev.dest, p ? p.color : '#ffffff');
        return;
      case 'move':
        await this.animateMove(ev);
        if (this.destCell === ev.to) this.clearDest();
        return;
      case 'money':
        this.disp.cash[ev.pid] = (this.disp.cash[ev.pid] ?? 0) + ev.delta;
        this.floatMoney(ev.pid, ev.delta);
        if (ev.pid === this.me) Sound.play(ev.delta > 0 ? 'cash' : 'pay');
        if (ev.reason === 'salary' || ev.reason === 'card' || ev.reason === 'sell') {
          if (ev.delta > 0) this.coins({ bank: true }, { pawn: ev.pid }, 5);
          else this.coins({ pawn: ev.pid }, { bank: true }, 4);
        }
        this.renderPlayers();
        await sleep(120);
        return;
      case 'buy': {
        const c = this.meta.cells[ev.cell];
        Sound.play('buy');
        this.announce({
          icon: ev.level ? '🏗️' : c.type === 'resort' ? '🏖️' : '🏠',
          title: `${p.name} achète ${c.name}`,
          text: ev.level ? `Terrain + ${LEVEL_LABEL[ev.level].toLowerCase()}` : c.type === 'resort' ? 'Station balnéaire' : 'Terrain nu',
          color: p.color,
          kind: 'buy',
        });
        await this.coins({ pawn: ev.pid }, { cell: ev.cell }, 5);
        this.patchProps(ev);
        this.pulseCell(ev.cell, p);
        this.cellLabel(ev.cell, ev.level ? `+${ev.level} 🏠` : 'ACHETÉ !', p.color);
        await sleep(450 + ev.level * 170);
        return;
      }
      case 'build': {
        const c = this.meta.cells[ev.cell];
        const hotel = ev.level === 4;
        Sound.play('build');
        this.announce({
          icon: hotel ? '🏨' : '🏗️',
          title: hotel ? `${p.name} construit un HÔTEL !` : `${p.name} construit à ${c.name}`,
          text: hotel ? `${c.name} devient imprenable` : `${LEVEL_LABEL[ev.level]} · loyer en hausse`,
          color: p.color,
          kind: 'gold',
        });
        await this.coins({ pawn: ev.pid }, { cell: ev.cell }, 5);
        this.patchProps(ev);
        this.pulseCell(ev.cell, p);
        this.cellLabel(ev.cell, hotel ? 'HÔTEL !' : LEVEL_LABEL[ev.level].toUpperCase(), '#f7b733', '#3a2a00');
        await sleep(hotel ? 1100 : 600);
        return;
      }
      case 'takeover': {
        const c = this.meta.cells[ev.cell];
        const from = this.player(ev.from);
        Sound.play('takeover');
        this.announce({ icon: '🤝', title: `${p.name} rachète ${c.name}`, text: `à ${from ? from.name : '?'}`, color: p.color, kind: 'takeover' });
        this.focusCell(ev.cell);
        await this.coins({ pawn: ev.pid }, { pawn: ev.from }, 8);
        this.patchProps(ev);
        this.pulseCell(ev.cell, p, 'takeover');
        this.cellLabel(ev.cell, 'RACHETÉ !', '#a66bff');
        await sleep(800);
        return;
      }
      case 'rent': {
        const to = this.player(ev.to);
        this.pulseCell(ev.cell, to, 'rent');
        Sound.play('pay');
        this.announce({ icon: '💸', title: `${p.name} paie ${fmt(ev.amount)}`, text: `de loyer à ${to ? to.name : '?'} (${this.meta.cells[ev.cell].name})`, color: p.color, kind: 'pay', ms: 2200 });
        await this.coins({ pawn: ev.pid }, { pawn: ev.to }, Math.min(10, 3 + Math.round(ev.amount / 150)));
        return;
      }
      case 'sell': {
        const c = this.meta.cells[ev.cell];
        this.announce({
          icon: '🏚️',
          title: `${p.name} vend ${c.name}`,
          text: `${ev.level === 4 ? 'Hôtel démoli' : ev.level ? `${LEVEL_LABEL[ev.level]} démolie${ev.level > 1 ? 's' : ''}` : 'Rendu à la banque'} · +${fmt(ev.value || 0)}`,
          color: p.color,
          kind: 'danger',
        });
        this.focusCell(ev.cell);
        await sleep(this.b3 ? 450 : 150);
        Sound.play('demolish');
        this.patchProps(ev);
        this.pulseCell(ev.cell, null, 'destroy');
        this.cellLabel(ev.cell, 'VENDU', '#e74c3c');
        await sleep(ev.level ? 1000 : 700);
        return;
      }
      case 'card':
        Sound.play('card');
        await this.showCard(ev.card, p);
        return;
      case 'jail':
        Sound.play('jail');
        this.announce({ icon: '🏝️', title: `${p.name} échoue sur l'Île déserte`, text: 'Double, amende ou 3 tours d\'attente', color: p.color, kind: 'info' });
        return;
      case 'festival': {
        const c = this.meta.cells[ev.cell];
        Sound.play('festival');
        this.announce({ icon: '🎉', title: `Festival à ${c.name} !`, text: `Organisé par ${p.name} · loyer ×${ev.mult}`, color: p.color, kind: 'fest' });
        this.focusCell(ev.cell);
        this.patchProps(ev);
        this.pulseCell(ev.cell, p, 'festival');
        this.cellLabel(ev.cell, `LOYER ×${ev.mult}`, '#ff2fb3');
        await sleep(900);
        return;
      }
      case 'fly':
        Sound.play('fly');
        if (this.b3) this.b3.launchPlane();
        return;
      case 'quake': {
        const c = this.meta.cells[ev.cell];
        Sound.play('quake');
        this.announce({ icon: '🌋', title: 'SÉISME !', text: `${c.name} (${p.name}) perd un niveau`, color: p.color, kind: 'danger' });
        this.focusCell(ev.cell);
        if (this.b3) this.b3.shake(0.9);
        else {
          this.board.classList.add('shake');
          setTimeout(() => this.board.classList.remove('shake'), 900);
        }
        await sleep(450);
        Sound.play('demolish');
        this.patchProps(ev);
        this.pulseCell(ev.cell, null, 'destroy');
        this.cellLabel(ev.cell, '−1 NIVEAU', '#ff7f2a');
        await sleep(950);
        return;
      }
      case 'shield':
        Sound.play('buy');
        this.announce({ icon: '🛡️', title: `Bouclier de ${p.name} !`, text: 'Le loyer est annulé', color: p.color, kind: 'buy' });
        return;
      case 'bankrupt': {
        const cells = ev.cells || [];
        Sound.play('bankrupt');
        this.flashBanner(`💥 ${p ? p.name : '?'} fait faillite !`);
        this.announce({
          icon: '💥',
          title: `${p.name} fait faillite !`,
          text: cells.length ? `${cells.length} propriété${cells.length > 1 ? 's' : ''} saisie${cells.length > 1 ? 's' : ''} et rendue${cells.length > 1 ? 's' : ''} à la banque` : 'Éliminé(e) de la partie',
          color: p.color,
          kind: 'danger',
          ms: 3800,
        });
        await sleep(900);
        for (const { cell, level } of cells) {
          if (cells.length <= 3) this.focusCell(cell);
          Sound.play('demolish');
          this.patchProps({ t: 'lose', cell });
          this.pulseCell(cell, null, 'destroy');
          this.cellLabel(cell, 'SAISI', '#e74c3c');
          await sleep(level ? 450 : 320);
        }
        await sleep(500);
        return;
      }
      case 'tax': {
        Sound.play('pay');
        this.announce({
          icon: '🏛️',
          title: `${p.name} paie ${fmt(ev.amount)} d'impôts`,
          text: `${ev.percent} % de sa fortune de ${fmt(ev.worth)}${ev.canPay ? '' : ' · doit vendre pour payer'}`,
          color: p.color,
          kind: 'pay',
          ms: 3600,
        });
        this.focusCell(ev.cell);
        this.pulseCell(ev.cell, null, 'rent');
        this.cellLabel(ev.cell, `−${fmt(ev.amount)}`, '#c0392b');
        await this.coins({ pawn: ev.pid }, { bank: true }, Math.min(10, 3 + Math.round(ev.amount / 120)));
        await sleep(500);
        return;
      }
      case 'monopoly': {
        const ct = this.meta.countries.find((c) => c.id === ev.country);
        const double = this.room.settings.countryDoubleRent;
        const subtitle = `${ct.flag} ${ct.name.toUpperCase()}${double ? ' · LOYERS ×2' : ' COMPLET'}`;
        Sound.play('monopoly');
        this.announce({ icon: '👑', title: `MONOPOLE pour ${p.name} !`, text: `${ct.flag} ${ct.name} complet${double ? ' · tous les loyers doublés' : ''}`, color: p.color, kind: 'gold', ms: 3800 });
        if (this.b3 && !document.hidden) {
          await this.b3.celebrate(ev.cells, p.color, subtitle);
        } else {
          await this.celebrate2d(ev.cells, p.color, subtitle);
        }
        return;
      }
      case 'monopolyLost': {
        const ct = this.meta.countries.find((c) => c.id === ev.country);
        this.announce({ icon: '💔', title: `${p.name} perd son monopole`, text: `${ct.flag} ${ct.name} n'est plus complet`, color: p.color, kind: 'danger' });
        for (const i of ev.cells) this.pulseCell(i, null, 'destroy');
        await sleep(500);
        return;
      }
      case 'win':
        Sound.play('win');
        return;
    }
  }

  // --------------------------------------------------------------- plateau
  renderCells() {
    if (this.b3) return this.render3d();
    const st = this.state;
    const cells = this.meta.cells;
    const countries = Object.fromEntries(this.meta.countries.map((c) => [c.id, c]));
    const myTurn = this.canAct();
    const s = this.room.settings;
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
      const fest = st.festival && st.festival.cell === i;
      el.classList.toggle('festival-on', fest);
      let selectable = false;
      if (myTurn) {
        if (st.phase === 'travel') selectable = i !== 24;
        if ((st.phase === 'festival' || st.phase === 'debt') && owner && owner.id === this.me) selectable = true;
      }
      el.classList.toggle('selectable', selectable);
      el.classList.toggle('picked', !!(this.debt && st.phase === 'debt' && this.debt.sel.has(i)));
      const priceTxt = owner && pr.rent ? fmt(pr.rent) : c.price ? fmt(c.price) : '';
      if (c.type === 'city') {
        const ct = countries[c.country];
        const mono = owner && this.ownsCountry(owner.id, c.country);
        const prev = this.prevLevels[i] ?? pr.level;
        el.style.setProperty('--band', ct.color);
        el.append(
          h('div.tile-band' + (mono ? '.mono' : ''),
            h('span.flag', ct.flag),
            pr.level ? buildings(pr.level, owner ? owner.color : '#888', pr.level > prev) : null,
            mono ? h('span.mono-chip', { title: 'Pays complet : loyer ×2' }, '×2') : null
          ),
          h('div.tile-body', h('div.tile-icon', c.icon || '🏙️'), h('div.tile-name', c.name), h('div.tile-price', priceTxt))
        );
        this.prevLevels[i] = pr.level;
      } else if (c.type === 'resort') {
        el.append(h('div.sea'), h('div.tile-body', h('div.tile-icon', c.emoji), h('div.tile-name', c.name), h('div.tile-price', priceTxt)));
      } else if (c.type === 'chance') {
        el.append(h('div.tile-body', h('div.chance-mini', h('span', '?')), h('div.tile-name', 'Chance')));
      } else if (c.type === 'tax') {
        el.append(h('div.tile-body', h('div.tile-icon', '💸'), h('div.tile-name', 'Impôts'), h('div.tile-price', s.taxPercent + ' %')));
      } else {
        const icons = { start: '🏁', jail: '🏝️', festival: '🎪', travel: '✈️' };
        const sub = {
          start: `+${fmt(s.salary)}`,
          jail: `Amende ${fmt(s.jailFine)}`,
          festival: st.festival && st.festival.cell != null ? `×${st.festival.mult} · ${cells[st.festival.cell].name}` : 'Loyer ×2',
          travel: `Billet ${fmt(s.travelFee)}`,
        };
        el.append(
          h('div.corner-art', h('div.corner-glow'), h('div.corner-icon', icons[c.type])),
          h('div.corner-ribbon', c.type === 'start' ? '◀ DÉPART' : c.name.toUpperCase()),
          h('div.corner-sub', sub[c.type])
        );
      }
      if (fest) el.append(h('div.festival-badge', `🎉 ×${st.festival.mult}`));
      if (owner) el.append(h('div.owner-flag', { style: { '--c': owner.color }, title: owner.name }, owner.pawn));
    }
  }

  render3d() {
    const st = this.state;
    const myTurn = this.canAct();
    const selectable = new Set();
    const dimmed = new Set();
    st.props.forEach((pr, i) => {
      const owner = pr && pr.owner;
      if (myTurn) {
        if (st.phase === 'travel' && i !== 24) selectable.add(i);
        if ((st.phase === 'festival' || st.phase === 'debt') && owner === this.me) selectable.add(i);
      }
      if (this.highlightOwner && owner !== this.highlightOwner) dimmed.add(i);
    });
    this.b3.update({
      props: st.props,
      players: Object.fromEntries(st.players.map((p) => [p.id, p])),
      festival: st.festival,
      selectable,
      dimmed,
      picked: new Set(this.debt && st.phase === 'debt' ? this.debt.sel : []),
      settings: this.room.settings,
      mono: (pid, country) => this.ownsCountry(pid, country),
    }, !this.syncInstant);
  }

  ownsCountry(pid, country) {
    return this.meta.cells.filter((c) => c.type === 'city' && c.country === country).every((c) => this.state.props[c.index].owner === pid);
  }

  /** Applique tout de suite un évènement au plateau (avant l'état final) pour un rendu vivant. */
  patchProps(ev) {
    const st = this.state;
    const pr = st.props[ev.cell];
    if (!pr) return;
    if (ev.t === 'buy') Object.assign(pr, { owner: ev.pid, level: ev.level, rent: 0 });
    if (ev.t === 'build') pr.level = ev.level;
    if (ev.t === 'takeover') pr.owner = ev.pid;
    if (ev.t === 'sell' || ev.t === 'lose') Object.assign(pr, { owner: null, level: 0, rent: 0 });
    if (ev.t === 'lose' && st.festival && st.festival.cell === ev.cell) st.festival = { cell: null, mult: 1 };
    if (ev.t === 'quake') pr.level = ev.level != null ? ev.level : Math.max(0, pr.level - 1);
    if (ev.t === 'festival') st.festival = { cell: ev.cell, mult: ev.mult };
    this.renderCells();
  }

  // Infobulle au survol d'une case
  showTip(i) {
    if (!this.state || matchMedia('(hover: none)').matches) return;
    const c = this.meta.cells[i];
    const pr = this.state.props[i];
    const owner = pr && pr.owner ? this.player(pr.owner) : null;
    const lines = [h('div.tip-title', c.icon || c.emoji || '', ' ', c.name)];
    if (c.type === 'city' || c.type === 'resort') {
      if (owner) {
        lines.push(h('div', 'Propriétaire : ', h('b', { style: { color: owner.color } }, owner.name)));
        lines.push(h('div', `${c.type === 'city' ? LEVEL_LABEL[pr.level] + ' · ' : ''}Loyer : `, h('b', fmt(pr.rent))));
        if (c.type === 'city' && this.room.settings.takeover && pr.level < 4) lines.push(h('div.muted', `Rachat : ${fmt(pr.takeover)}`));
      } else lines.push(h('div', 'À vendre : ', h('b', fmt(c.price))));
    } else lines.push(h('div.muted', 'Cliquez pour plus d\'infos'));
    this.tip.innerHTML = '';
    this.tip.append(...lines);
    const w = this.gameEl.getBoundingClientRect();
    let r;
    if (this.b3) {
      const c = this.b3.cellRect(i);
      r = { left: c.left + w.left, top: c.top + w.top, width: c.width, bottom: c.top + c.height + w.top };
    } else r = this.cellEls[i].getBoundingClientRect();
    this.tip.hidden = false;
    const tw = this.tip.offsetWidth;
    const th = this.tip.offsetHeight;
    let x = r.left - w.left + r.width / 2 - tw / 2;
    let y = r.top - w.top - th - 8;
    if (y < 4) y = r.bottom - w.top + 8;
    x = Math.max(4, Math.min(w.width - tw - 4, x));
    this.tip.style.transform = `translate(${x}px, ${y}px)`;
  }
  hideTip() {
    this.tip.hidden = true;
  }

  cellCenter(i) {
    const el = this.cellEls[i];
    return { x: el.offsetLeft + el.offsetWidth / 2, y: el.offsetTop + el.offsetHeight / 2, w: el.offsetWidth, hgt: el.offsetHeight };
  }
  boardCenter() {
    return { x: this.board.clientWidth / 2, y: this.board.clientHeight / 2 };
  }

  placePawns(animate) {
    if (!this.state) return;
    if (this.b3) {
      return this.b3.placePawns(
        this.state.players.map((p) => ({ ...p, pos: this.disp.pos[p.id] ?? p.pos, current: this.state.current === p.id && !this.state.over })),
        animate
      );
    }
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
    for (const [id, el] of Object.entries(this.pawnEls)) el.classList.toggle('gone', !seen.has(id));
  }

  pawnEl(p) {
    let el = this.pawnEls[p.id];
    if (!el) {
      el = h('div.pawn' + (p.vip ? '.vip' : ''), { style: { '--c': p.color }, title: p.name },
        h('div.pawn-ring'),
        h('div.pawn-pin',
          p.vip ? h('div.pawn-crown', '👑') : null,
          h('div.pawn-head', h('span', p.pawn)),
          h('div.pawn-tip')
        )
      );
      this.pawnLayer.append(el);
      this.pawnEls[p.id] = el;
    }
    el.classList.toggle('current', !!this.state && this.state.current === p.id);
    return el;
  }

  pawnPoint(pos, k = 0, n = 1) {
    const c = this.cellCenter(pos);
    const r = n > 1 ? Math.min(c.w, c.hgt) * 0.24 : 0;
    const ang = (k / n) * Math.PI * 2 + Math.PI / 4;
    return { x: c.x + Math.cos(ang) * r, y: c.y + Math.sin(ang) * r * 0.8 };
  }

  setPawn(p, pos, k, n, animate) {
    const el = this.pawnEl(p);
    const { x, y } = this.pawnPoint(pos, k, n);
    el.style.transition = animate ? '' : 'none';
    el.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    el.style.zIndex = Math.round(y);
    if (!animate) void el.offsetWidth;
    el.style.transition = '';
  }

  pawnPos(pid) {
    const el = this.pawnEls[pid];
    if (!el) return null;
    const m = el.style.transform.match(/translate3d\(([-\d.]+)px, ([-\d.]+)px/);
    return m ? { x: Number(m[1]), y: Number(m[2]) } : null;
  }

  async animateMove(ev) {
    const p = this.player(ev.pid) || { id: ev.pid };
    if (this.b3) {
      await this.b3.animateMove(ev);
      this.disp.pos[ev.pid] = ev.to;
      this.placePawns(true);
      this.pulseCell(ev.to, p.color ? p : null, 'land');
      return;
    }
    const el = this.pawnEls[ev.pid];
    if (!el) return;
    if (ev.teleport) {
      el.classList.add('teleport');
      await sleep(280);
      this.disp.pos[ev.pid] = ev.to;
      this.placePawns(false);
      el.classList.remove('teleport');
      el.classList.add('appear');
      setTimeout(() => el.classList.remove('appear'), 500);
      await sleep(300);
      return;
    }
    const dir = ev.steps > 0 ? 1 : -1;
    let pos = ev.from;
    el.classList.add('moving');
    el.style.zIndex = 9999;
    for (let s = 0; s < Math.abs(ev.steps); s++) {
      pos = (pos + dir + 32) % 32;
      this.disp.pos[ev.pid] = pos;
      const c = this.cellCenter(pos);
      el.style.transform = `translate3d(${c.x}px, ${c.y}px, 0)`;
      this.cellEls[pos].classList.add('step');
      setTimeout(((e) => () => e.classList.remove('step'))(this.cellEls[pos]), 260);
      Sound.play('step');
      await sleep(170);
    }
    el.classList.remove('moving');
    this.placePawns(true);
    this.pulseCell(pos, p.color ? p : null, 'land');
    await sleep(150);
  }

  pulseCell(i, p, kind = 'pulse') {
    if (this.b3) return this.b3.fx(i, kind, p ? p.color : null);
    const el = this.cellEls[i];
    if (!el) return;
    el.classList.remove('fx-' + kind);
    void el.offsetWidth;
    if (p) el.style.setProperty('--fx', p.color);
    el.classList.add('fx-' + kind);
    setTimeout(() => el.classList.remove('fx-' + kind), 1200);
  }

  /** Pluie de pièces d'un point à un autre (paiements, salaires, achats). */
  async flyCoins(from, to, count = 6) {
    if (!from || !to) return;
    for (let k = 0; k < count; k++) {
      const coin = h('div.coin-fly', h('div.coin', '$'));
      const jx = (Math.random() - 0.5) * 20;
      const jy = (Math.random() - 0.5) * 20;
      coin.style.transform = `translate3d(${from.x + jx}px, ${from.y + jy}px, 0)`;
      this.pawnLayer.append(coin);
      setTimeout(() => {
        coin.classList.add('go');
        coin.style.transform = `translate3d(${to.x + jx / 2}px, ${to.y + jy / 2}px, 0)`;
      }, 30 + k * 70);
      setTimeout(() => coin.remove(), 900 + k * 70);
    }
    await sleep(500 + count * 70);
  }

  async showDice(d, instant) {
    if (this.b3) {
      if (instant) this.b3.setDice(d);
      else await this.b3.rollDice(d);
      return;
    }
    for (let k = 0; k < 2; k++) {
      const cube = this.diceEls[k].firstChild;
      const [bx, by] = DIE_ROT[d[k]];
      if (!instant) this.spins[k] += 2 + k;
      cube.style.transition = instant ? 'none' : '';
      cube.style.transform = `rotateX(${this.spins[k] * 360 + bx}deg) rotateY(${this.spins[k] * 360 + by}deg)`;
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
    const el = h('div.chance-card', h('div.chance-inner', h('div.chance-back', h('span', '?')), h('div.chance-front', h('div.chance-icon', card.icon), h('div.chance-title', card.title), h('div.chance-text', card.text), p ? h('div.chance-who', p.name) : null)));
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
    const sp = this.fxPoint(pid);
    if (sp) {
      const f = h('div.fx-float.float-money.' + (delta >= 0 ? 'pos' : 'neg'), (delta >= 0 ? '+' : '') + fmt(delta));
      f.style.left = sp.x + 'px';
      f.style.top = sp.y + 'px';
      this.fxLayer.append(f);
      setTimeout(() => f.remove(), 1600);
      return;
    }
    const pos = this.pawnPos(pid);
    if (pos) {
      const f = h('div.board-float', h('span.float-money.board.' + (delta >= 0 ? 'pos' : 'neg'), (delta >= 0 ? '+' : '') + fmt(delta)));
      f.style.transform = `translate3d(${pos.x}px, ${pos.y}px, 0)`;
      this.pawnLayer.append(f);
      setTimeout(() => f.remove(), 1600);
    }
  }

  flashBanner(text) {
    const b = h('div.flash-banner', text);
    this.hud.append(b);
    setTimeout(() => b.remove(), 1800);
  }

  onEmote({ key, emoji }) {
    const sp = this.fxPoint(key);
    if (sp) {
      const b = h('div.fx-float.fx-emote', emoji);
      b.style.left = sp.x + 'px';
      b.style.top = sp.y + 'px';
      this.fxLayer.append(b);
      setTimeout(() => b.remove(), 2200);
    }
    const pos = sp ? null : this.pawnPos(key);
    if (pos) {
      const b = h('div.board-float', h('span.emote-bubble', emoji));
      b.style.transform = `translate3d(${pos.x}px, ${pos.y}px, 0)`;
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
  /** Fiches des joueurs dans les 4 coins de l'écran. */
  renderPlayers(currentOverride) {
    const st = this.state;
    if (!st) return;
    const cur = currentOverride || st.current;
    this.playersEl.innerHTML = '';
    this.cashShown ||= {};
    // Vous en bas à gauche, puis les autres dans l'ordre du jeu (sens horaire)
    const list = st.players.slice();
    const meIdx = list.findIndex((p) => p.id === this.me);
    const ordered = meIdx >= 0 ? list.slice(meIdx).concat(list.slice(0, meIdx)) : list;
    const slots = meIdx >= 0 ? ['bl', 'tl', 'tr', 'br'] : ['tl', 'tr', 'br', 'bl'];
    // Classement en direct par fortune (joueurs encore en jeu)
    const ranking = st.players.filter((p) => !p.bankrupt).sort((a, b) => b.netWorth - a.netWorth).map((p) => p.id);
    const medals = ['🥇', '🥈', '🥉'];
    for (const [k, p] of ordered.entries()) {
      const cash = this.disp.cash[p.id] ?? p.cash;
      const chips = [];
      if (p.jailed) chips.push(h('span.pc-chip.warn', { title: 'Sur l\'Île déserte' }, `🏝️ ${p.jailTurns}/3`));
      if (p.travel) chips.push(h('span.pc-chip', { title: 'Vol au prochain tour' }, '✈️'));
      if (p.shield) chips.push(h('span.pc-chip.good', { title: 'Bouclier : prochain loyer annulé' }, '🛡️'));
      if (p.coupon) chips.push(h('span.pc-chip.good', { title: 'Coupon : prochain loyer -50 %' }, '🏷️'));
      if (p.jailCards) chips.push(h('span.pc-chip.good', { title: 'Gilet de sauvetage' }, '🛟' + (p.jailCards > 1 ? '×' + p.jailCards : '')));
      if (!p.isBot && !p.connected) chips.push(h('span.pc-chip.off', { title: 'Déconnecté (joué automatiquement)' }, '📡'));
      else if (p.afk) chips.push(h('span.pc-chip.off', { title: 'Absent (joué automatiquement)' }, '💤'));
      const props = st.props.filter((x) => x && x.owner === p.id).length;
      const rank = ranking.indexOf(p.id);
      const isTurn = p.id === cur && !st.over;
      const cashEl = h('span.pc-cash-value');
      const card = h('div.pcard.corner.c-' + (slots[k] || 'tl') + (isLight(p.color) ? '.light' : '') + (isTurn ? '.turn' : '') + (p.bankrupt ? '.out' : '') + (p.id === this.me ? '.me' : '') + (p.vip ? '.vip' : '') + (this.highlightOwner === p.id ? '.hl' : ''),
        { 'data-pid': p.id, style: { '--c': p.color }, title: 'Cliquez pour voir ses propriétés sur le plateau', onclick: () => {
          this.highlightOwner = this.highlightOwner === p.id ? null : p.id;
          this.renderCells();
          this.renderPlayers();
        } },
        h('div.pc-face'),
        h('div.pc-avatar',
          h('span.pc-pawn', p.bankrupt ? '💀' : p.pawn),
          p.vip && !p.bankrupt ? h('span.pc-crown', '👑') : null,
          !p.bankrupt && rank >= 0 && rank < 3 && st.players.length > 1 ? h('span.pc-medal', { title: `${rank + 1}${rank ? 'e' : 'er'} par fortune` }, medals[rank]) : null
        ),
        h('div.pc-body',
          h('div.pc-name', h('span.pc-name-text.' + (nameClass(p) || 'plain'), p.name), ...roleTags(p, { level: false, compact: true })),
          h('div.pc-cash', h('span.pc-coin', '$'), p.bankrupt ? h('span.pc-cash-value', '0') : cashEl),
          h('div.pc-chips',
            p.bankrupt ? h('span.pc-chip.off', p.rank ? `Classement #${p.rank}` : 'Éliminé') : [
              h('span.pc-chip', { title: 'Propriétés' }, `🏠 ${props}`),
              h('span.pc-chip', { title: 'Fortune totale' }, `💎 ${fmt(p.netWorth)}`),
            ],
            ...chips
          )
        ),
        p.bankrupt ? h('div.pc-stamp', 'FAILLITE') : null,
        isTurn ? h('div.pcard-turn', p.id === this.me ? '🎲 À VOUS !' : 'JOUE…') : null,
        isTurn ? h('div.pcard-timer', { style: { transform: `scaleX(${this.timerFraction()})` } }) : null
      );
      this.playersEl.append(card);
      if (!p.bankrupt) this.animateCash(cashEl, p.id, cash);
    }
  }

  /** Part du temps de décision restant (0 à 1) pour le joueur actif. */
  timerFraction() {
    const st = this.state;
    if (!st || !st.deadline) return 1;
    const total = (this.room.settings.turnTime || 30) * 1000;
    const left = st.deadline - (Date.now() + this.clockOffset);
    return Math.max(0, Math.min(1, left / total));
  }

  /** Compteur d'argent qui défile (vert si gain, rouge si dépense). */
  animateCash(el, pid, target) {
    const from = this.cashShown[pid] ?? target;
    if (from === target) {
      el.textContent = fmt(target);
      this.cashShown[pid] = target;
      return;
    }
    const box = el.parentElement;
    if (box) box.classList.add(target > from ? 'up' : 'down');
    const t0 = performance.now();
    const dur = 750;
    const step = (now) => {
      if (!el.isConnected) return;
      const t = Math.min(1, (now - t0) / dur);
      const e = 1 - Math.pow(1 - t, 3);
      const v = Math.round(from + (target - from) * e);
      this.cashShown[pid] = v;
      el.textContent = fmt(v);
      if (t < 1) requestAnimationFrame(step);
      else if (box) setTimeout(() => box.classList.remove('up', 'down'), 350);
    };
    el.textContent = fmt(from);
    requestAnimationFrame(step);
  }

  // ---------------------------------------------------------------- centre
  renderCenter() {
    const st = this.state;
    const s = this.room.settings;
    this.centerInfo.innerHTML = '';
    if (s.maxRounds) this.centerInfo.append(h('span', `Tour ${st.round}/${s.maxRounds}`));
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
    panel.classList.remove('wide');
    if (!st || st.phase !== 'debt' || st.current !== this.me) this.debt = null;
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
          h('button.btn.skip', { onclick: act('skip') }, '🎲 Rester au sol et lancer les dés')
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
          pend.capped ? h('div.cap-hint', '🔒 Premier tour : 2 maisons maximum') : null,
          h('button.btn.skip', { onclick: act('skip') }, '✖ Ne pas acheter')
        );
        break;
      }
      case 'build':
        panel.append(
          this.propertyHeader(pend.cell),
          h('div.btn-col', (pend.options || []).map((o) =>
            h('button.btn.secondary', { disabled: !o.affordable, onclick: act('build', { level: o.level }) }, h('span', o.level === 4 ? '🏨 Construire un hôtel' : `🏠 Monter à ${LEVEL_LABEL[o.level].toLowerCase()}`), h('b', fmt(o.cost)))
          )),
          pend.capped ? h('div.cap-hint', '🔒 Premier tour : 2 maisons maximum') : null,
          h('button.btn.skip', { onclick: act('skip') }, '✖ Ne rien construire')
        );
        break;
      case 'takeover': {
        const owner = this.player(pend.owner);
        panel.append(
          this.propertyHeader(pend.cell),
          h('div.panel-title', `🤝 Racheter à ${owner ? owner.name : '?'} ?`),
          h('div.btn-col', h('button.btn.primary', { onclick: act('takeover') }, h('span', 'Racheter'), h('b', fmt(pend.price)))),
          h('button.btn.skip', { onclick: act('skip') }, '✖ Ne pas racheter')
        );
        break;
      }
      case 'festival':
        panel.append(h('div.panel-title', '🎉 Organisez le Festival !'), h('div.hint', 'Cliquez sur une de vos propriétés pour multiplier son loyer.'), h('button.btn.skip', { onclick: act('skip') }, '✖ Passer'));
        break;
      case 'debt':
        panel.classList.add('wide');
        panel.append(this.debtPanel(st, pend, me));
        break;
    }
    panel.append(this.timerBar);
    panel.classList.remove('pop');
    void panel.offsetWidth;
    panel.classList.add('pop');
  }

  /** Propriétés vendables du joueur, avec leurs informations utiles. */
  debtItems(st) {
    const cells = this.meta.cells;
    const myMono = new Set();
    for (const ct of this.meta.countries) if (this.ownsCountry(this.me, ct.id)) cells.filter((c) => c.country === ct.id).forEach((c) => myMono.add(c.index));
    return st.props
      .map((pr, i) => (pr && pr.owner === this.me ? { i, sell: pr.sell, value: pr.value, rent: pr.rent, level: pr.level, mono: myMono.has(i) } : null))
      .filter(Boolean);
  }

  /**
   * Sélection conseillée : couvre la somme manquante en perdant le moins possible,
   * en préservant les monopoles (recherche exhaustive jusqu'à 16 propriétés).
   */
  suggestSale(items, missing) {
    if (missing <= 0) return [];
    const cost = (it) => it.sell + (it.mono ? it.sell * 0.6 + 40 : 0) + it.rent * 0.15;
    if (items.length <= 16) {
      let best = null;
      let bestScore = Infinity;
      for (let mask = 1; mask < 1 << items.length; mask++) {
        let sum = 0;
        let score = 0;
        for (let k = 0; k < items.length; k++) if (mask & (1 << k)) {
          sum += items[k].sell;
          score += cost(items[k]);
        }
        if (sum >= missing && score < bestScore) {
          bestScore = score;
          best = mask;
        }
      }
      if (best != null) return items.filter((_, k) => best & (1 << k)).map((it) => it.i);
    }
    // Repli glouton : d'abord ce qui coûte le moins, puis on retire le superflu
    const sorted = [...items].sort((a, b) => cost(a) - cost(b));
    const pick = [];
    let sum = 0;
    for (const it of sorted) {
      if (sum >= missing) break;
      pick.push(it);
      sum += it.sell;
    }
    for (const it of [...pick].sort((a, b) => b.sell - a.sell)) {
      if (sum - it.sell >= missing) {
        pick.splice(pick.indexOf(it), 1);
        sum -= it.sell;
      }
    }
    return pick.map((it) => it.i);
  }

  toggleDebtPick(i) {
    if (!this.debt) return;
    Sound.play('click');
    if (this.debt.sel.has(i)) this.debt.sel.delete(i);
    else this.debt.sel.add(i);
    this.debt.custom = true;
    this.renderActions(this.state);
    this.renderCells();
  }

  /** Menu de dette : tout est calculé, la vente se fait en une seule action. */
  debtPanel(st, pend, me) {
    const cells = this.meta.cells;
    const countries = Object.fromEntries(this.meta.countries.map((c) => [c.id, c]));
    const items = this.debtItems(st).sort((a, b) => a.sell - b.sell);
    const missing = Math.max(0, pend.amount - me.cash);
    const key = `${pend.amount}|${pend.reason}|${pend.to}`;
    if (!this.debt || this.debt.key !== key) {
      this.debt = { key, sel: new Set(this.suggestSale(items, missing)), custom: false };
      setTimeout(() => this.renderCells(), 0);
    }
    for (const i of [...this.debt.sel]) if (!items.some((it) => it.i === i)) this.debt.sel.delete(i);
    const sel = this.debt.sel;
    const picked = items.filter((it) => sel.has(it.i));
    const gain = picked.reduce((s, it) => s + it.sell, 0);
    const covered = me.cash + gain;
    const enough = covered >= pend.amount;
    const pct = Math.min(100, (covered / pend.amount) * 100);
    const reason = {
      rent: `Loyer dû à ${pend.toName || '?'}`,
      tax: 'Impôts',
      card: 'Carte Chance',
      takeover: 'Rachat',
      jail: 'Amende',
    }[pend.reason] || 'Paiement';
    const confirm = async () => {
      if (!enough || !picked.length) return;
      if (picked.some((it) => it.mono)) {
        const ok = await modal({ title: 'Casser un monopole ?', body: h('p', 'Votre sélection contient une ville d\'un pays complet : vous perdrez le loyer doublé de ce pays.'), buttons: [{ label: 'Modifier', value: false }, { label: 'Vendre quand même', value: true, class: 'primary' }] });
        if (!ok) return;
      }
      this.action('sellMany', { cells: picked.map((it) => it.i) });
    };
    const card = (it) => {
      const c = cells[it.i];
      const ct = c.type === 'city' ? countries[c.country] : null;
      const on = sel.has(it.i);
      const bld = c.type === 'resort' ? '🏖️ Station' : it.level === 4 ? '🏨 Hôtel' : it.level ? '🏠'.repeat(it.level) : 'Terrain';
      return h('button.debt-card' + (on ? '.on' : '') + (it.mono ? '.mono' : ''), { style: { '--band': ct ? ct.color : '#26c6da' }, onclick: () => this.toggleDebtPick(it.i), title: on ? 'Retirer de la vente' : 'Ajouter à la vente' },
        h('span.debt-check', on ? '✓' : ''),
        h('span.debt-info',
          h('span.debt-name', `${ct ? ct.flag : c.emoji} ${c.name}`),
          h('span.debt-meta', bld, it.mono ? h('span.debt-mono', '👑 monopole') : null)
        ),
        h('span.debt-gain', '+' + fmt(it.sell))
      );
    };
    return h('div.debt-panel',
      h('div.debt-head', h('span.debt-icon', '💸'), h('div', h('div.debt-title', 'Fonds insuffisants'), h('div.debt-reason', `${reason} : ${fmt(pend.amount)}`))),
      h('div.debt-sum',
        h('div', h('small', 'À payer'), h('b', fmt(pend.amount))),
        h('div', h('small', 'Vos liquidités'), h('b', fmt(me.cash))),
        h('div.miss', h('small', 'Il manque'), h('b', fmt(missing)))
      ),
      h('div.debt-bar' + (enough ? '.ok' : ''), h('div', { style: { width: pct + '%' } }), h('span', enough
        ? `✔ Sélection : +${fmt(gain)} · il vous restera ${fmt(covered - pend.amount)}`
        : `Sélection : +${fmt(gain)} · encore ${fmt(pend.amount - covered)} à trouver`)),
      h('div.debt-tools',
        h('span.muted', this.debt.custom ? 'Cliquez sur une propriété (ou sur le plateau) pour la cocher' : '✨ Sélection conseillée : vous perdez le moins possible'),
        this.debt.custom ? h('button.btn.sm.ghost', { onclick: () => {
          this.debt.sel = new Set(this.suggestSale(items, missing));
          this.debt.custom = false;
          this.renderActions(this.state);
          this.renderCells();
        } }, '✨ Conseil') : null
      ),
      h('div.debt-list', items.map(card)),
      h('div.debt-actions',
        h('button.btn.primary.debt-go', { disabled: !enough || !picked.length, onclick: confirm }, enough ? `Vendre ${picked.length} propriété${picked.length > 1 ? 's' : ''} et payer` : 'Sélection insuffisante'),
        h('button.btn.sm.danger', { onclick: async () => {
          const ok = await modal({ title: 'Déclarer faillite ?', body: h('p', 'Vous serez éliminé(e) de la partie et vos propriétés retourneront à la banque.'), buttons: [{ label: 'Annuler', value: false }, { label: 'Faillite', value: true, class: 'danger' }] });
          if (ok) this.action('bankrupt');
        } }, '💀 Faillite')
      )
    );
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
      if (st.phase === 'debt' && pr && pr.owner === this.me && this.debt) return this.toggleDebtPick(i);
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
    // La barre garde ses marges dans la fiche : elle se vide par rétrécissement, sans jamais déborder
    if (ring) ring.style.transform = `scaleX(${pct / 100})`;
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
