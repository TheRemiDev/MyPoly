// ============================================================================
//  MyPoly — Fin de mois : écran de jeu (vue client)
//  Le serveur est seul maître du jeu (dé, paquets, argent) : ce module affiche et anime.
// ============================================================================
import { h, toast, modal, roleTags, roleRibbons, nameClass, sleep, confetti, duration } from './util.js';
import { store, emit } from './store.js';
import * as Sound from './sound.js';
import { navigate } from './app.js';
import { webglAvailable } from './board3d.js';
import { Month3D, SPACES, WEEKDAYS, DAY_ART } from './mois3d.js';
import { art, loadArt } from './mois-art.js';

export const MONTH_SETTINGS_UI = [
  { group: 'Partie', items: [
    { key: 'maxPlayers', label: 'Joueurs max', type: 'select', options: [2, 3, 4, 5, 6].map((n) => [n, n + ' joueurs']) },
    { key: 'months', label: 'Durée', type: 'select', options: [[1, '1 mois (express)'], [2, '2 mois'], [3, '3 mois'], [4, '4 mois'], [6, '6 mois'], [12, '1 an']] },
    { key: 'turnTime', label: 'Temps par décision', type: 'select', options: [[15, '15 s'], [25, '25 s'], [40, '40 s'], [60, '60 s'], [0, 'Illimité']] },
  ] },
  { group: 'Argent', items: [
    { key: 'startCash', label: 'Argent de départ', type: 'select', options: [[0, '0 €'], [1000, '1 000 €'], [2000, '2 000 €'], [3000, '3 000 €'], [5000, '5 000 €']] },
    { key: 'salary', label: 'Salaire mensuel', type: 'select', options: [[2000, '2 000 €'], [2500, '2 500 €'], [3500, '3 500 €'], [5000, '5 000 €']] },
    { key: 'loanRate', label: 'Intérêts des emprunts', type: 'select', options: [[0, '0 %'], [5, '5 % / mois'], [10, '10 % / mois'], [15, '15 % / mois'], [20, '20 % / mois']] },
    { key: 'saveUntil', label: 'Dépôts sur l\'épargne', type: 'select', options: [[10, 'Jusqu\'au 10 du mois'], [15, 'Jusqu\'au 15 du mois'], [20, 'Jusqu\'au 20 du mois'], [25, 'Jusqu\'au 25 du mois'], [30, 'Tout le mois'], [0, 'Seulement le jour de paye']] },
    { key: 'withdrawFee', label: 'Frais de retrait', type: 'select', hint: 'Hors jour de paye (toujours gratuit le 31)', options: [[0, 'Aucun'], [5, '5 %'], [10, '10 %'], [15, '15 %'], [20, '20 %']] },
    { key: 'savingsRate', label: 'Intérêts de l\'épargne', type: 'select', options: [[0, '0 % (pas d\'intérêts)'], [2, '2 % / mois'], [5, '5 % / mois'], [8, '8 % / mois'], [10, '10 % / mois']] },
  ] },
  { group: 'Règles', items: [
    { key: 'jackpotSix', label: 'Un 6 rafle la cagnotte', type: 'toggle', hint: 'Amendes, coups durs et paris perdus remplissent la cagnotte' },
    { key: 'sundayBet', label: 'Match du dimanche', type: 'toggle', hint: 'Parier 500 € le dimanche : 4, 5 ou 6 pour doubler la mise' },
    { key: 'tombola', label: 'Tombola', type: 'toggle', hint: 'Tout le monde achète un ticket, le dé désigne le gagnant' },
    { key: 'unsoldValue', label: 'Affaires invendues comptées', type: 'toggle', hint: 'En fin de partie, une affaire non revendue vaut son prix d\'achat (sinon : rien)' },
  ] },
  { group: 'Salle', items: [
    { key: 'isPublic', label: 'Salle publique', type: 'toggle', hint: 'Visible dans la liste des salles de l\'accueil' },
    { key: 'allowSpectators', label: 'Spectateurs autorisés', type: 'toggle' },
  ] },
];

export const MONTH_PRESETS = {
  '⚡ Express': { months: 1, turnTime: 15, startCash: 3000, salary: 3500, loanRate: 10 , savingsRate: 5 },
  '📅 Standard': { months: 3, turnTime: 25, startCash: 3000, salary: 3500, loanRate: 10 , savingsRate: 5 },
  '🗓️ Longue': { months: 6, turnTime: 25, startCash: 3000, salary: 3500, loanRate: 10 , savingsRate: 5 },
  '💸 Crise': { months: 3, turnTime: 25, startCash: 1000, salary: 2500, loanRate: 20 , savingsRate: 2 },
};

const EMOTES = ['👍', '😂', '😱', '😡', '🔥', '💸', '🎉', '😎', '🙏', '💀'];
const PIPS = { 1: [5], 2: [1, 9], 3: [1, 5, 9], 4: [1, 3, 7, 9], 5: [1, 3, 5, 7, 9], 6: [1, 3, 4, 6, 7, 9] };
const PAYDAY = 31;
export const euro = (n) => Math.round(n).toLocaleString('fr-FR').replace(/ | /g, ' ') + ' €';
const dayLabel = (d) => (d === 0 ? 'Départ' : d === PAYDAY ? 'Jeudi 31 · jour de paye' : `${WEEKDAY_NAMES[d % 7]} ${d === 1 ? '1er' : d}`);
const WEEKDAY_NAMES = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];

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
/** Petit dé HTML (fiches de résultat). */
function miniDie(v) {
  return h('span.mo-mdie', Array.from({ length: 9 }, (_, k) => h('i' + ((PIPS[v] || []).includes(k + 1) ? '.on' : ''))));
}

/** Carte « affaire » (paquet orange). */
function dealCard(c, { cls = '', foot = null, onclick = null } = {}) {
  return h('div.mo-deal' + cls, { onclick },
    h('div.mo-deal-tag', 'AFFAIRE'),
    h('div.mo-deal-icon', art(c.icon)),
    h('div.mo-deal-name', c.name),
    h('div.mo-deal-prices',
      h('div', h('small', 'Achat'), h('b', euro(c.cost))),
      h('div.sell', h('small', 'Revente'), h('b', euro(c.value)))
    ),
    h('div.mo-deal-profit', `+${euro(c.value - c.cost)} de bénéfice`),
    foot
  );
}
/** Lettre du courrier. */
const MAIL_EFFECT = {
  bill: (c) => [`À régler le jour de paye`, `−${euro(c.amount)}`, 'bill'],
  fine: (c) => ['À payer tout de suite → cagnotte', `−${euro(c.amount)}`, 'loss'],
  gain: (c) => ['Bonne nouvelle !', `+${euro(c.amount)}`, 'gain'],
  give: (c) => ['À verser au joueur suivant', `−${euro(c.amount)}`, 'loss'],
  take: (c) => ['Versé par le joueur précédent', `+${euro(c.amount)}`, 'gain'],
  ad: (c) => [c.text || 'Publicité', 'Rien à payer', 'neutral'],
  goto: (c) => [c.text, 'En route !', 'neutral'],
};
function letterCard(c, sub = '') {
  const [txt, amount, cls] = (MAIL_EFFECT[c.t] || MAIL_EFFECT.ad)(c);
  return h('div.mo-letter.' + cls,
    h('div.mo-letter-head', h('span', art('envelope', 'inl'), 'COURRIER'), sub ? h('small', sub) : null, h('i.mo-stamp')),
    h('div.mo-letter-icon', art(c.icon)),
    h('div.mo-letter-name', c.name),
    h('div.mo-letter-txt', txt),
    h('div.mo-letter-amount', amount)
  );
}

export class MonthTable {
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

  // ============================================================== structure
  build() {
    const v = this.v;
    this.host = h('div.board3d-host');
    this.boardEl = h('div.mo-board');
    this.boardWrap = h('div.mo-board-wrap', this.boardEl);
    this.die = makeDie();
    this.rollBtn = h('button.btn.roll-btn.hz-rollbtn', { onclick: () => this.roll() }, '🎲 Lancer le dé');
    this.hintEl = h('div.hz-hint');
    this.billsEl = h('button.mo-pile.bills', { onclick: () => this.showWallet('bills') });
    this.dealsEl = h('button.mo-pile.deals', { onclick: () => this.showWallet('deals') });
    this.saveEl = h('button.mo-pile.savings', { onclick: () => this.openSavings() });
    this.actionEl = h('div.mo-dock', this.saveEl, this.billsEl, h('div.hz-action.mo-action', this.die, this.hintEl, this.rollBtn), this.dealsEl);
    this.decideEl = h('div.mo-decide', { hidden: true });
    this.showEl = h('div.mo-show');
    this.fx = h('div.fx-layer.hz-fx.mo-fx', this.showEl);
    this.tipEl = h('div.mo-tip', { hidden: true });

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
    v.gameEl = h('div.game.horses-game.month-game', this.host, this.boardWrap, this.fx, ...Object.values(v.notifStacks), v.playersEl, this.decideEl, this.actionEl, this.tipEl, h('div.topbar', v.toolbar, v.popover));
    v.root.append(v.gameEl, v.endOverlay);
    if (webglAvailable()) {
      try {
        this.b3 = new Month3D(this.host, { onHover: (day) => this.hoverCell(day), onFollow: (on) => v.setZoomFab(on) });
        // Loupe : zoom qui suit le pion du joueur dont c'est le tour
        v.addZoomFab(() => this.b3.toggleZoomOn(this.state ? this.state.current : this.me));
        this.host.addEventListener('pointermove', (e) => {
          this.tipEl.style.left = e.clientX + 'px';
          this.tipEl.style.top = e.clientY + 'px';
        });
        v.gameEl.classList.add('webgl');
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
        e.preventDefault();
        if (!e.repeat) this.roll();
      }
    };
    document.addEventListener('keydown', this.onKey);
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
      info: me ? `Mois ${me.month}/${st.settings.months}` : st ? `${st.settings.months} mois` : '',
      camera: this.b3 ? () => this.b3.resetView() : null,
      rules: () => this.showRules(),
      forfeit: me && !me.out && this.room.state === 'playing' ? () => this.forfeit() : null,
    });
  }

  showRules() {
    const s = (this.state && this.state.settings) || this.room.settings;
    modal({
      title: h('span.mo-mtitle', art('calendar', 'inl'), 'Règles de Fin de mois'),
      body: h('div.rules-summary',
        h('p', `Chaque tour, lance le dé et avance dans le mois. Le 31, c'est la paye ! La partie dure ${s.months} mois : `, h('b', 'le joueur le plus riche à la fin (argent + épargne − emprunts) gagne.')),
        h('ul',
          h('li', art('✉️', 'inl'), 'Courrier : factures à régler le jour de paye, amendes, bonnes surprises…'),
          h('li', art('🏷️', 'inl'), 'Affaire : achète un objet, puis revends-le plus cher sur une case 🛍️ Acheteur.'),
          h('li', art('💶', 'inl'), `Jour de paye : +${euro(s.salary)} de salaire, puis tu règles tes factures${s.loanRate ? ` et ${s.loanRate} % d'intérêts sur tes emprunts` : ''}.`),
          h('li', art('🏦', 'inl'), 'Pas assez d\'argent ? La banque te prête automatiquement par tranches de 1 000 €. Rembourse-les le jour de paye.'),
          h('li', art('🐷', 'inl'), `Livret d'épargne (bouton « Mon épargne », avant de lancer le dé) : dépose jusqu'au ${s.saveUntil ?? 20} du mois ou le jour de paye. Il rapporte ${s.savingsRate ?? 5} % à chaque paye. Retrait possible à tout moment, avec ${s.withdrawFee ?? 10} % de frais (gratuit le jour de paye). Il te dépanne automatiquement avant tout emprunt.`),
          s.jackpotSix ? h('li', art('💰', 'inl'), 'Amendes et coups durs remplissent la cagnotte : fais un 6 au dé pour la rafler !') : null,
          s.sundayBet ? h('li', art('⚽', 'inl'), 'Le dimanche, parie 500 € : 4, 5 ou 6 pour gagner 500 €.') : null,
          s.tombola ? h('li', art('🎟️', 'inl'), 'Tombola : chacun paie 100 €, le dé désigne le gagnant (sinon tout va dans la cagnotte).') : null,
          h('li', art('🎂', 'inl'), 'Anniversaire, tournée générale, vide-grenier, jeu radio, coup dur… le mois réserve des surprises !'),
          h('li', s.unsoldValue ? 'En fin de partie, une affaire non revendue compte pour son prix d\'achat.' : 'Attention : en fin de partie, les affaires invendues ne valent rien !')
        ),
        h('div.muted', 'Raccourci : Espace pour lancer le dé. Faites glisser pour tourner la caméra, double-clic pour la recentrer.')
      ),
    });
  }

  async forfeit() {
    const ok = await modal({ title: '🏳️ Abandonner ?', body: h('p', 'Vous quitterez la partie.'), buttons: [{ label: 'Annuler', value: false }, { label: 'Abandonner', value: true, class: 'danger' }] });
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
    this.disp = { days: Object.fromEntries(st.players.map((p) => [p.id, p.day])), dice: st.dice };
    if (first || instant) {
      this.v.logEl.innerHTML = '';
      for (const l of st.log) this.addLog(l, true);
    }
    if (first) {
      this.buildBoard();
      if (this.b3 && st.dice) this.b3.setDie(st.dice);
    }
    if (this.b3) this.b3.setPot(st.cagnotte);
    this.renderAll(!first && !instant);
  }

  renderAll(animate = false) {
    this.renderPlayers();
    this.renderPawns(animate);
    this.renderControls();
    this.renderToolbar();
    this.renderPot();
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
  buildBoard() {
    if (this.b3) {
      // Les illustrations des cases sont chargées avant de dessiner le plateau
      loadArt().then(() => {
        if (this.dead) return;
        this.b3.buildBoard(this.state.board);
        this.b3.setPot(this.disp.pot ?? this.state.cagnotte);
        this.renderPawns(false);
      });
      return;
    }
    // Plateau 2D de secours : la feuille du calendrier
    const b = this.boardEl;
    b.innerHTML = '';
    this.potEl = h('div.mo-cell.pot', h('span.mo-pot-ico', art('jar')), h('b.mo-pot-val'), h('small', 'CAGNOTTE'));
    this.cellEls = this.state.board.map((sp, d) => {
      const s = SPACES[sp.k] || SPACES.start;
      return h('div.mo-cell.k-' + sp.k + (d % 7 === 6 ? '.sun' : ''), { style: { '--k': s.color } },
        d && d < PAYDAY ? h('b.mo-cell-n', String(d)) : null,
        h('span.mo-cell-ico', art((DAY_ART[d] && DAY_ART[d].icon) || s.icon)),
        h('small.mo-cell-l', sp.k === 'mail' ? `${s.label} ×${sp.n}` : s.label),
        h('div.mo-cell-pawns')
      );
    });
    b.append(
      h('div.mo-board-head', h('b', 'FIN DE MOIS'), h('small', 'Salaire le 31 · le plus riche gagne')),
      ...WEEKDAYS.map((d, k) => h('div.mo-wd' + (k === 6 ? '.sun' : ''), d)),
      ...this.cellEls,
      this.potEl
    );
  }
  renderPot() {
    const st = this.state;
    if (!st) return;
    if (this.b3) this.b3.setPot(this.disp.pot ?? st.cagnotte);
    if (this.potEl) this.potEl.querySelector('.mo-pot-val').textContent = euro(this.disp.pot ?? st.cagnotte);
  }

  renderPawns(animate = false, flight = null) {
    const st = this.state;
    if (!st || !this.disp) return;
    const list = st.players.filter((p) => !p.out).map((p) => ({ key: p.id, color: p.color, pawn: p.pawn, vip: p.vip, day: this.disp.days[p.id] ?? p.day, can: st.current === p.id && !st.over, mine: p.id === this.me }));
    if (this.b3) {
      if (flight) {
        const it = list.find((x) => x.key === flight);
        if (it) it.flight = true;
      }
      this.b3.placePawns(list, animate);
      this.b3.setFollow(st.current);
      this.updateCalendar();
      const cur = this.player(st.current);
      this.b3.setCurrent(cur && !st.over ? this.disp.days[cur.id] ?? cur.day : null, cur && cur.color);
      return;
    }
    for (const el of this.cellEls) {
      el.querySelector('.mo-cell-pawns').innerHTML = '';
      el.classList.remove('cur');
    }
    for (const it of list) {
      const cell = this.cellEls[it.day];
      if (!cell) continue;
      cell.querySelector('.mo-cell-pawns').append(h('span.mo-pawn' + (it.can ? '.can' : ''), { style: { '--c': it.color } }, it.pawn));
      if (it.can) cell.classList.add('cur');
    }
  }

  /** Fiches des joueurs (moi en bas à gauche, les autres autour). */
  renderPlayers() {
    const st = this.state;
    if (!st) return;
    const v = this.v;
    v.playersEl.innerHTML = '';
    const n = st.players.length;
    const mine = st.players.findIndex((p) => p.id === this.me);
    const start = mine >= 0 ? mine : 0;
    const order = Array.from({ length: n }, (_, k) => st.players[(start + k) % n]);
    const slots = mine >= 0 ? ['bl', 'tl', 'tr', 'br', 'ml', 'mr'] : ['tl', 'tr', 'br', 'bl', 'ml', 'mr'];
    const months = st.settings.months;
    order.forEach((p, k) => {
      const turn = st.current === p.id && !st.over;
      const isMe = p.id === this.me;
      const billsTotal = p.bills.reduce((s, b) => s + b.amount, 0);
      const card = h('div.pcard.corner.mo-pcard.c-' + slots[k] + (turn ? '.turn' : '') + (p.out ? '.out' : '') + (isMe ? '.me' : '') + (p.vip ? '.vip' : '') + (p.done ? '.done' : ''),
        { 'data-pid': p.id, style: { '--c': p.color } },
        h('div.pc-face'),
        roleRibbons(p),
        h('div.pc-avatar', h('span.pc-pawn', p.out ? '💀' : p.pawn)),
        h('div.pc-body',
          h('div.pc-name', h('span.pc-name-text.' + (nameClass(p) || 'plain'), p.name), ...roleTags(p, { level: false, compact: true })),
          h('div.pc-cash.mo-cash', euro(p.cash)),
          h('div.pc-chips',
            p.out ? h('span.pc-chip.off', 'Abandon') : p.done ? h('span.pc-chip.mo-done', '🏁 Terminé') : h('span.pc-chip', { title: 'Avancement' }, `📅 ${p.month}/${months} · ${p.day === 0 ? 'départ' : p.day === PAYDAY ? 'paye' : 'le ' + p.day}`),
            p.savings ? h('span.pc-chip.mo-savechip', { title: 'Livret d\'épargne' }, `🐷 ${euro(p.savings)}`) : null,
            p.loans ? h('span.pc-chip.mo-loan', { title: 'Emprunts à rembourser' }, `🏦 −${euro(p.loans)}`) : null,
            p.bills.length ? h('span.pc-chip.mo-bill', { title: p.bills.map((b) => `${b.name} : ${euro(b.amount)}`).join('\n') }, `🧾 ${euro(billsTotal)}`) : null,
            p.deals.length ? h('span.pc-chip.mo-dealchip', { title: p.deals.map((d) => `${d.name} (revente ${euro(d.value)})`).join('\n') }, `🏷️ ${p.deals.length}`) : null,
            !p.isBot && !p.connected ? h('span.pc-chip.off', { title: 'Déconnecté' }, '📡') : p.afk ? h('span.pc-chip.off', { title: 'Absent' }, '💤') : null
          )
        ),
        turn ? h('div.pcard-turn', isMe ? '🎲 À VOUS !' : 'JOUE…') : null,
        turn ? h('div.pcard-timer') : null
      );
      v.playersEl.append(card);
    });
    this.renderWallet();
  }

  /** Mes factures et mes affaires, sous le plateau. */
  renderWallet() {
    const me = this.player(this.me);
    this.billsEl.hidden = this.dealsEl.hidden = this.saveEl.hidden = !me;
    if (!me) return;
    const st = this.state;
    const canBank = this.myTurn() && st.phase === 'roll';
    this.saveEl.classList.toggle('ready', canBank);
    this.saveEl.innerHTML = '';
    this.saveEl.append(
      h('div.mo-pile-cards', h('span.mo-piggy', art('pig'))),
      h('div.mo-pile-txt', h('small', 'Mon épargne'), h('b', euro(me.savings || 0)))
    );
    const total = me.bills.reduce((s, b) => s + b.amount, 0);
    this.billsEl.innerHTML = '';
    this.billsEl.append(
      h('div.mo-pile-cards', me.bills.slice(-4).map((b, k) => h('span.mo-mini.letter', { style: { '--k': k } }, art(b.icon))), me.bills.length ? null : h('span.mo-none', art('bill'))),
      h('div.mo-pile-txt', h('small', 'Mes factures'), h('b', me.bills.length ? euro(total) : 'Aucune'))
    );
    this.dealsEl.innerHTML = '';
    this.dealsEl.append(
      h('div.mo-pile-cards', me.deals.slice(-4).map((d, k) => h('span.mo-mini.deal', { style: { '--k': k } }, art(d.icon))), me.deals.length ? null : h('span.mo-none', art('tag'))),
      h('div.mo-pile-txt', h('small', 'Mes affaires'), h('b', me.deals.length ? `${me.deals.length} · ${euro(me.deals.reduce((s, d) => s + d.value, 0))}` : 'Aucune'))
    );
  }
  /**
   * Guichet bancaire : onglets (déposer, retirer, rembourser), montant libre
   * (saisie, − / +, curseur, raccourcis), aperçu du résultat et bouton d'action.
   * opts = { modes: ['save','withdraw','repay'], payday, canAct, notice, onDone }
   */
  bankWidget(opts) {
    const st = this.state;
    const me = this.player(this.me);
    const s = st.settings;
    const payday = !!opts.payday;
    const feeRate = payday || me.day === PAYDAY ? 0 : s.withdrawFee || 0;
    const depositOpen = payday || me.day === PAYDAY || me.day <= s.saveUntil;
    const MODES = {
      save: { label: 'Déposer', icon: 'pig', color: '#ff6fb5', step: 100, max: me.cash,
        closed: !depositOpen ? `Les dépôts sont fermés après le ${s.saveUntil} du mois. Ils rouvrent le jour de paye.` : me.cash < 100 ? 'Pas assez d\'argent en poche pour déposer.' : null },
      withdraw: { label: 'Retirer', icon: 'wallet', color: '#22c3a6', step: 100, max: me.savings || 0,
        closed: !(me.savings > 0) ? 'Votre livret est vide pour l\'instant.' : null },
      repay: { label: 'Rembourser', icon: 'loan', color: '#3f8cff', step: 1000, max: Math.min(me.loans, Math.floor(me.cash / 1000) * 1000),
        closed: !me.loans ? 'Aucun emprunt à rembourser. Bravo !' : me.cash < 1000 ? 'Il faut au moins 1 000 € en poche pour rembourser.' : null },
    };
    const modes = opts.modes.filter((m) => MODES[m]);
    let mode = modes.find((m) => !MODES[m].closed) || modes[0];
    let amount = 0;
    const root = h('div.bw');
    const tabs = h('div.bw-tabs');
    const body = h('div.bw-body');
    root.append(tabs, body);
    const fmtIn = (n) => (n ? Math.round(n).toLocaleString('fr-FR').replace(/ | /g, ' ') : '');
    const clamp = (v, m) => {
      const M = MODES[m];
      if (!(v > 0)) return 0;
      if (v >= M.max) return M.max;
      return Math.max(M.step, Math.round(v / M.step) * M.step);
    };
    const render = () => {
      const M = MODES[mode];
      root.style.setProperty('--a', M.color);
      tabs.replaceChildren(...modes.map((m) => h('button.bw-tab' + (m === mode ? '.on' : '') + (MODES[m].closed ? '.dim' : ''), { type: 'button', onclick: () => {
        mode = m;
        amount = 0;
        render();
      } }, art(MODES[m].icon), h('span', MODES[m].label))));
      body.replaceChildren();
      if (M.closed) {
        body.append(h('div.bw-closed', art(M.icon), h('p', M.closed)));
        return;
      }
      const max = M.max;
      if (!amount) amount = clamp(Math.min(max, mode === 'repay' ? max : Math.max(M.step, Math.round(max / 2 / M.step) * M.step)), mode);
      const input = h('input.bw-input', { type: 'text', inputmode: 'numeric', value: fmtIn(amount), 'aria-label': 'Montant' });
      const range = h('input.bw-range', { type: 'range', min: 0, max, step: M.step, value: amount, 'aria-label': 'Montant' });
      const summary = h('div.bw-sum');
      const ctaLabel = h('span');
      const cta = h('button.bw-cta', { type: 'button' }, art(M.icon), ctaLabel);
      const chips = h('div.bw-chips');
      const update = (from) => {
        if (from !== 'input') input.value = fmtIn(amount);
        if (from !== 'range') range.value = amount;
        range.style.setProperty('--p', (max ? (amount / max) * 100 : 0) + '%');
        const fee = mode === 'withdraw' ? Math.round((amount * feeRate) / 100) : 0;
        const cash = me.cash + (mode === 'withdraw' ? amount - fee : -amount);
        const sav = (me.savings || 0) + (mode === 'save' ? amount : mode === 'withdraw' ? -amount : 0);
        const loans = me.loans - (mode === 'repay' ? amount : 0);
        const row = (label, before, after, cls = '') => h('div.bw-row' + cls, h('span', label), h('span.bw-from', euro(before)), h('span.bw-arrow', '→'), h('b', euro(after)));
        summary.replaceChildren(
          row('En poche', me.cash, cash),
          mode !== 'repay' ? row('Livret', me.savings || 0, sav, '.sav') : row('Emprunts', me.loans, loans, '.loan'),
          mode === 'withdraw' ? h('div.bw-fee' + (fee ? '' : '.free'), fee ? `Frais de retrait (${feeRate} %) : −${euro(fee)}` : 'Retrait gratuit aujourd\'hui') : null,
          mode === 'save' && s.savingsRate ? h('div.bw-fee.free', `+${euro(Math.round((sav * s.savingsRate) / 100))} d'intérêts à la prochaine paye`) : null
        );
        const verb = { save: 'Déposer', withdraw: 'Retirer', repay: 'Rembourser' }[mode];
        ctaLabel.textContent = amount ? `${verb} ${euro(amount)}` : 'Choisissez un montant';
        cta.disabled = !amount || !opts.canAct;
        [...chips.children].forEach((c) => c.classList.toggle('on', Number(c.dataset.v) === amount));
      };
      const step = (d) => {
        amount = clamp(Math.min(max, Math.max(0, (amount === max && d < 0 ? Math.floor(max / M.step) * M.step + M.step : amount) + d * M.step)), mode);
        update();
      };
      input.addEventListener('input', () => {
        const v = Number(input.value.replace(/[^0-9]/g, ''));
        amount = Math.min(max, v);
        input.value = fmtIn(v);
        update('input');
      });
      input.addEventListener('blur', () => {
        amount = clamp(amount, mode);
        update();
      });
      input.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Enter') cta.click();
        if (e.key === 'ArrowUp') (e.preventDefault(), step(1));
        if (e.key === 'ArrowDown') (e.preventDefault(), step(-1));
      });
      range.addEventListener('input', () => {
        amount = clamp(Number(range.value), mode);
        update('range');
      });
      const quick = mode === 'repay' ? [[1000, '1 000 €'], [Math.floor(max / 2000) * 1000, '½'], [max, 'Tout']] : [[Math.round(max / 4 / 100) * 100, '25 %'], [Math.round(max / 2 / 100) * 100, '50 %'], [Math.round((max * 3) / 4 / 100) * 100, '75 %'], [max, 'Tout']];
      const seen = new Set();
      for (const [v, label] of quick) {
        if (!(v > 0) || v > max || seen.has(v)) continue;
        seen.add(v);
        chips.append(h('button.bw-chip', { type: 'button', 'data-v': v, onclick: () => {
          amount = clamp(v, mode);
          update();
        } }, label));
      }
      cta.onclick = async () => {
        amount = clamp(amount, mode);
        if (!amount || !opts.canAct) return;
        cta.disabled = true;
        const ok = await opts.onAct(mode, amount);
        if (!ok) cta.disabled = false;
      };
      body.append(
        h('div.bw-amount',
          h('button.bw-step', { type: 'button', 'aria-label': 'Moins', onclick: () => step(-1) }, '−'),
          h('label.bw-field', input, h('span.bw-cur', '€')),
          h('button.bw-step', { type: 'button', 'aria-label': 'Plus', onclick: () => step(1) }, '+')
        ),
        h('div.bw-max', `Maximum : ${euro(max)}${mode === 'repay' ? ' · par tranches de 1 000 €' : ''}`),
        range,
        chips,
        summary,
        opts.notice ? h('div.bw-notice', opts.notice) : null,
        cta
      );
      update();
    };
    render();
    return root;
  }

  /** Livret d'épargne (hors jour de paye) : dépôt jusqu'au jour limite, retrait avec frais. */
  openSavings() {
    const st = this.state;
    const me = this.player(this.me);
    if (!st || !me) return;
    const s = st.settings;
    const canAct = this.myTurn() && st.phase === 'roll';
    let close = null;
    const widget = this.bankWidget({
      modes: ['save', 'withdraw'],
      canAct,
      notice: canAct ? null : this.myTurn() ? 'Terminez votre action en cours pour utiliser votre livret.' : 'Le livret s\'utilise pendant votre tour, avant de lancer le dé.',
      onAct: async (mode, amount) => {
        const res = await this.act(mode, { amount });
        if (res && !res.error) {
          if (close) close();
          return true;
        }
        return false;
      },
    });
    const body = h('div.mo-sav',
      h('div.mo-sav-head',
        h('div.mo-sav-pig', art('pig')),
        h('div', h('small', 'Livret d\'épargne'), h('b', euro(me.savings || 0)), h('em', s.savingsRate ? `+${s.savingsRate} % à chaque jour de paye` : 'sans intérêts')),
        h('div.mo-sav-cash', h('small', 'En poche'), h('b', euro(me.cash)))
      ),
      h('div.mo-sav-rules',
        h('span', art('calendar', 'inl'), `Dépôts jusqu'au ${s.saveUntil} du mois`),
        h('span', art('wallet', 'inl'), s.withdrawFee ? `Retrait : ${s.withdrawFee} % de frais` : 'Retrait sans frais'),
        h('span', art('banknote', 'inl'), 'Gratuit le jour de paye')
      ),
      widget
    );
    const pr = modal({ title: h('span.mo-mtitle', art('pig', 'inl'), 'Mon livret d\'épargne'), body, buttons: [], className: 'mo-sav-modal' });
    close = () => {
      const ov = document.querySelector('#modals .modal-overlay:last-child');
      if (ov && ov._close) ov._close(null);
    };
    // Bouton de fermeture discret en haut à droite
    const ov = document.querySelector('#modals .modal-overlay:last-child');
    if (ov) ov.querySelector('.modal').append(h('button.icon-btn.mo-modal-x', { title: 'Fermer', onclick: () => close() }, '✕'));
    return pr;
  }

  showWallet(which) {
    const me = this.player(this.me);
    if (!me) return;
    if (which === 'bills') {
      const total = me.bills.reduce((s, b) => s + b.amount, 0);
      modal({
        title: h('span.mo-mtitle', art('bill', 'inl'), 'Mes factures'),
        body: me.bills.length
          ? h('div.mo-wallet', h('p.muted', 'Elles seront réglées automatiquement le jour de paye.'), h('div.mo-wallet-list', me.bills.map((b) => h('div.mo-wallet-row', art(b.icon, 'inl'), h('span', b.name), h('b', euro(b.amount))))), h('div.mo-wallet-total', 'Total', h('b', euro(total))))
          : h('p', 'Aucune facture en attente. Profitez-en !'),
      });
    } else {
      modal({
        title: h('span.mo-mtitle', art('tag', 'inl'), 'Mes affaires'),
        body: me.deals.length
          ? h('div.mo-wallet', h('p.muted', 'Revendez-les sur une case 🛍️ Acheteur avant la fin de la partie.'), h('div.mo-deal-grid', me.deals.map((d) => dealCard(d, { cls: '.sm' }))))
          : h('p', 'Aucune affaire. Achetez-en sur les cases 🏷️ Affaire pour les revendre plus cher.'),
      });
    }
  }

  myTurn() {
    const st = this.state;
    return st && !st.over && st.current === this.me && !this.busy;
  }

  renderControls() {
    const st = this.state;
    if (!st) return;
    const cur = this.player(st.current);
    const mine = this.myTurn();
    this.renderWallet();
    this.actionEl.style.setProperty('--c', cur ? cur.color : '#fff');
    if (!this.rolling) showFace(this.die, (this.disp && this.disp.dice) || st.dice || 6);
    this.die.hidden = !!this.b3;
    this.rollBtn.hidden = !(mine && st.phase === 'roll');
    let hint = '';
    if (st.over) hint = '🏁 Partie terminée';
    else if (mine && st.phase === 'roll') hint = 'Espace pour lancer';
    else if (mine && st.phase === 'decide') hint = '';
    else if (cur) hint = `${cur.name} ${st.phase === 'decide' ? 'réfléchit…' : 'lance le dé…'}`;
    this.hintEl.textContent = hint;
    this.actionEl.classList.toggle('mine', mine);
    this.renderDecision();
  }

  /** Panneau de décision (le joueur actif choisit ; les autres voient la carte en jeu). */
  renderDecision() {
    const st = this.state;
    const el = this.decideEl;
    const pd = st && st.phase === 'decide' && !st.over && !this.busy ? st.pending : null;
    const key = pd ? JSON.stringify(pd) + st.current + (this.player(st.current) || {}).cash : '';
    if (key === this.decideKey) return;
    this.decideKey = key;
    el.innerHTML = '';
    el.hidden = !pd;
    if (!pd) return;
    const p = this.player(st.current);
    const mine = st.current === this.me;
    el.classList.toggle('spectate', !mine);
    el.style.setProperty('--c', p.color);
    const choose = (choice) => this.choose(choice);
    const who = mine ? null : h('div.mo-decide-who', h('span.pc-pawn', p.pawn), `${p.name} réfléchit…`);
    if (pd.type === 'deal') {
      const c = pd.card;
      const short = Math.max(0, c.cost - p.cash);
      const loan = Math.ceil(short / 1000) * 1000;
      el.append(
        h('div.mo-decide-title', art('tag', 'ttl'), 'Une affaire à saisir !'),
        who,
        dealCard(c, { cls: '.big' }),
        mine ? h('div.mo-decide-note', loan ? `⚠️ Il vous manque ${euro(short)} : la banque vous prêtera ${euro(loan)}.` : `Il vous restera ${euro(p.cash - c.cost)}.`) : null,
        mine ? h('div.mo-decide-btns',
          h('button.btn.primary.lg', { onclick: () => choose('buy') }, `Acheter · ${euro(c.cost)}`),
          h('button.btn.ghost.lg', { onclick: () => choose('pass') }, 'Passer')
        ) : null
      );
    } else if (pd.type === 'buyer') {
      el.append(
        h('div.mo-decide-title', art('bagFast', 'ttl'), 'Un acheteur est intéressé !'),
        who,
        h('div.mo-decide-sub', mine ? 'Choisissez l\'affaire à lui revendre :' : `${p.name} choisit quoi revendre`),
        h('div.mo-deal-row', p.deals.map((d) => dealCard(d, { cls: '.sm' + (mine ? '.mo-pickable' : ''), onclick: mine ? () => choose(d.uid) : null, foot: mine ? h('div.mo-deal-sell', `Vendre ${euro(d.value)}`) : null }))),
        mine ? h('div.mo-decide-btns', h('button.btn.ghost', { onclick: () => choose('keep') }, 'Ne rien vendre')) : null
      );
    } else if (pd.type === 'bet') {
      el.append(
        h('div.mo-decide-title', art('ball', 'ttl'), 'Match du dimanche'),
        who,
        h('div.mo-bet',
          h('div.mo-bet-ball', art('ball')),
          h('p', 'Pariez ', h('b', '500 €'), ' sur le match : faites ', h('b', '4, 5 ou 6'), ' au dé pour gagner ', h('b', '500 €'), '. Sinon, la mise part dans la cagnotte.')
        ),
        mine ? h('div.mo-decide-btns',
          h('button.btn.primary.lg', { onclick: () => choose('bet') }, '⚽ Parier 500 €'),
          h('button.btn.ghost.lg', { onclick: () => choose('pass') }, 'Pas de pari')
        ) : null
      );
    } else if (pd.type === 'payday') {
      const rate = st.settings.savingsRate || 0;
      const account = (cls, icon, label, value, sub) => h('div.mo-acc.' + cls, h('span.mo-acc-ico', art(icon)), h('small', label), h('b', euro(value)), h('em', sub));
      el.append(
        h('div.mo-decide-title', art('bank', 'ttl'), 'Jour de paye : votre banque'),
        who,
        h('div.mo-accounts',
          account('cash', 'wallet', 'Porte-monnaie', p.cash, 'disponible'),
          account('save', 'pig', 'Livret d\'épargne', p.savings || 0, rate ? `+${rate} % chaque paye` : 'sans intérêts'),
          account('loan', 'loan', 'Emprunts', p.loans, p.loans ? `${st.settings.loanRate} % d'intérêts / mois` : 'aucun crédit')
        ),
        mine ? this.bankWidget({
          modes: p.loans ? ['save', 'withdraw', 'repay'] : ['save', 'withdraw'],
          payday: true,
          canAct: true,
          onAct: async (mode, amount) => {
            await choose(`${mode}:${amount}`);
            return true;
          },
        }) : null,
        mine ? h('button.mo-finish', { type: 'button', onclick: () => choose('done') }, art('calendar'), h('span', h('b', 'Terminer le mois'), h('small', 'Passer au mois suivant'))) : null
      );
    }
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
    const total = (this.room.settings.turnTime || 25) * 1000;
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
    if (res && res.error) {
      this.pending = false;
      this.renderControls();
    }
  }
  async choose(choice) {
    if (this.pending || !this.myTurn() || this.state.phase !== 'decide') return;
    this.pending = true;
    Sound.play('click');
    this.decideEl.classList.add('leaving');
    const res = await this.act('choose', { choice });
    this.decideEl.classList.remove('leaving');
    if (res && res.error) this.pending = false;
  }

  // ============================================================ animations
  pawnPt(pid) {
    if (this.b3) return this.b3.pawnScreen(pid);
    const d = this.disp.days[pid] ?? (this.player(pid) || {}).day;
    const cell = this.cellEls && this.cellEls[d];
    return cell ? this.rectOf(cell) : { x: innerWidth / 2, y: innerHeight / 2 };
  }
  cardPt(pid) {
    const card = this.v.playersEl.querySelector(`[data-pid="${CSS.escape(pid)}"] .pc-cash`);
    return card ? this.rectOf(card) : null;
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
    if (typeof o.icon === 'string') o = { ...o, icon: art(o.icon, 'notif') };
    this.v.announce(o);
  }
  rectOf(el) {
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }
  /** Met à jour l'argent affiché d'un joueur pendant les animations. */
  setCash(pid, cash) {
    const p = this.player(pid);
    if (!p || cash === undefined) return;
    p.cash = cash;
    const el = this.v.playersEl.querySelector(`[data-pid="${CSS.escape(pid)}"] .mo-cash`);
    if (el) {
      el.textContent = euro(cash);
      el.classList.remove('bump');
      void el.offsetWidth;
      el.classList.add('bump');
    }
  }

  /**
   * Grande carte au centre du plateau (lettre, affaire, fiche de paie…).
   * Elle surgit du paquet, reste affichée, puis s'envole vers le joueur ou disparaît.
   */
  async showcase(node, { ms = 1500, from = null, to = null } = {}) {
    const wrap = h('div.mo-show-card', node);
    this.showEl.append(wrap);
    const box = this.showEl.getBoundingClientRect();
    const cx = box.left + box.width / 2;
    const cy = box.top + box.height / 2;
    const off = (pt) => (pt ? `translate(${pt.x - cx}px, ${pt.y - cy}px)` : 'translate(0, 40px)');
    const inAnim = wrap.animate([{ transform: `${off(from)} scale(.25) rotate(-12deg)`, opacity: 0 }, { transform: 'translate(0,0) scale(1.04) rotate(1deg)', opacity: 1, offset: 0.75 }, { transform: 'none', opacity: 1 }], { duration: 520, easing: 'cubic-bezier(.2,.9,.3,1.1)' });
    await inAnim.finished.catch(() => {});
    await sleep(ms);
    const out = wrap.animate([{ transform: 'none', opacity: 1 }, { transform: `${to ? off(to) : 'translate(0,-30px)'} scale(${to ? 0.15 : 0.9})`, opacity: 0 }], { duration: 450, easing: 'cubic-bezier(.5,0,.75,0)' });
    await out.finished.catch(() => {});
    wrap.remove();
  }
  deckPt(kind) {
    return this.b3 ? this.b3.deckScreen(kind) : null;
  }
  /** L'éphéméride du centre affiche le jour du joueur dont c'est le tour. */
  updateCalendar() {
    const st = this.state;
    if (!this.b3 || !st) return;
    const p = this.player(st.current);
    if (!p) return;
    this.b3.setCalendar({ day: this.disp.days[p.id] ?? p.day, month: p.month, months: st.settings.months, color: p.color, name: p.name });
  }
  /** Bulle d'aide au survol d'une case du plateau 3D. */
  hoverCell(day) {
    if (day === null || day === undefined || !this.state) {
      this.tipEl.hidden = true;
      return;
    }
    const sp = this.state.board[day];
    const s = SPACES[sp.k] || SPACES.start;
    const here = this.state.players.filter((p) => !p.out && (this.disp.days[p.id] ?? p.day) === day);
    this.tipEl.replaceChildren(
      h('div.mo-tip-head', { style: { '--k': s.color } }, art((DAY_ART[day] && DAY_ART[day].icon) || s.icon), h('b', day === 0 ? 'Départ' : `${dayLabel(day)} · ${DAY_ART[day] && sp.k !== 'payday' ? DAY_ART[day].title.replace(/-?\n/g, (x) => (x.startsWith('-') ? '' : ' ')) : s.name}`)),
      h('div.mo-tip-txt', sp.k === 'mail' ? `${sp.n} lettre${sp.n > 1 ? 's' : ''} à ouvrir : factures, amendes, chèques, publicités…` : s.desc),
      here.length ? h('div.mo-tip-who', here.map((p) => h('span', { style: { '--c': p.color } }, p.pawn, ' ', p.name))) : null
    );
    this.tipEl.hidden = false;
  }

  async play(ev, st) {
    const p = this.player(ev.pid) || st.players.find((x) => x.id === ev.pid);
    const d = this.disp;
    switch (ev.t) {
      case 'turn':
        this.state = { ...this.state, current: ev.pid, phase: 'roll', dice: null, pending: null };
        d.dice = null;
        this.renderPlayers();
        this.renderPawns(false);
        this.renderControls();
        if (ev.pid === this.me) Sound.play('turn');
        return;
      case 'dice': {
        Sound.play('dice');
        d.dice = ev.value;
        if (this.b3) await this.b3.rollDie(ev.value, p ? p.color : '#fff');
        else {
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
        this.bubble({ x: pt.x, y: pt.y - 50 }, `🎲 ${ev.value}`, ev.value === 6 ? '.warn' : '', 1800);
        await sleep(450);
        return;
      }
      case 'jackpot': {
        Sound.play('festival');
        const pot = this.b3 ? this.b3.jarScreen() : this.potEl ? this.rectOf(this.potEl) : null;
        this.bubble(pot, `💰 ${euro(ev.amount)}`, '.warn', 1800);
        if (p) this.announce({ icon: '💰', title: `${p.name} rafle la cagnotte !`, text: `Un 6 qui rapporte ${euro(ev.amount)}`, color: p.color, pid: p.id, kind: 'gold', ms: 4900 });
        if (this.b3) {
          await this.b3.coins('pot', ev.pid, 14);
          this.b3.shake(0.3);
        }
        d.pot = 0;
        this.renderPot();
        return;
      }
      case 'move': {
        for (const day of ev.path) {
          d.days[ev.pid] = day;
          this.renderPawns(true);
          Sound.play('step');
          await sleep(270);
        }
        return;
      }
      case 'space':
        if (this.b3) {
          this.b3.bumpTile(ev.day);
          this.b3.daySparkle(ev.day, (SPACES[ev.k] || {}).color || '#fff', 12);
        }
        await sleep(400);
        return;
      case 'mail': {
        Sound.play('card');
        if (this.b3) this.b3.drawFrom('mail');
        const c = ev.card;
        const toPlayer = c.t === 'bill' ? this.cardPt(ev.pid) : null;
        await this.showcase(h('div', letterCard(c, ev.n > 1 ? `${ev.k}/${ev.n}` : ''), p ? h('div.mo-show-for', { style: { '--c': p.color } }, `pour ${p.name}`) : null), { ms: 2500, from: this.deckPt('mail'), to: toPlayer });
        if (c.t === 'bill' && p) {
          const sp = this.player(ev.pid);
          if (sp && !sp.bills.some((b) => b.uid === c.uid)) sp.bills.push({ uid: c.uid, icon: c.icon, name: c.name, amount: c.amount });
          this.renderPlayers();
        }
        return;
      }
      case 'dealDraw':
        Sound.play('card');
        if (this.b3) this.b3.drawFrom('deal');
        await this.showcase(dealCard(ev.card, { cls: '.big' }), { ms: 1000, from: this.deckPt('deal') });
        return;
      case 'money': {
        const pt = this.pawnPt(ev.pid);
        const gain = ev.delta > 0;
        this.bubble({ x: pt.x, y: pt.y - 30 }, `${gain ? '+' : '−'}${euro(Math.abs(ev.delta))}`, gain ? '.gain' : '.loss', 2400);
        Sound.play(gain ? 'cash' : 'pay');
        if (this.b3) {
          const n = Math.min(10, 3 + Math.floor(Math.abs(ev.delta) / 400));
          const job = gain ? this.b3.coins(ev.from === 'pot' ? 'pot' : ev.from || 'bank', ev.pid, n) : this.b3.coins(ev.pid, ev.to || 'bank', n);
          await Promise.race([job, sleep(800)]);
        } else await sleep(600);
        this.setCash(ev.pid, ev.cash);
        if (ev.to && ev.to !== 'pot' && ev.to !== 'bank') this.setCash(ev.to, ev.peerCash);
        if (ev.pot !== undefined) {
          d.pot = ev.pot;
          this.renderPot();
        }
        return;
      }
      case 'loan':
        Sound.play('alarm');
        if (p) this.announce({ icon: '🏦', title: `${p.name} emprunte ${euro(ev.amount)}`, text: `Total des emprunts : ${euro(ev.loans)}`, color: p.color, pid: p.id, kind: 'danger', ms: 3600 });
        if (this.b3) this.b3.coins('bank', ev.pid, 6);
        this.setCash(ev.pid, ev.cash);
        if (p) {
          const sp = this.player(ev.pid);
          if (sp) sp.loans = ev.loans;
        }
        await sleep(1100);
        return;
      case 'repay': {
        const sp = this.player(ev.pid);
        if (sp) sp.loans = ev.loans;
        this.setCash(ev.pid, ev.cash);
        if (this.b3) this.b3.coins(ev.pid, 'bank', 8);
        const pt = this.pawnPt(ev.pid);
        this.bubble({ x: pt.x, y: pt.y - 30 }, `🏦 −${euro(ev.amount)}`, '.loss', 1500);
        Sound.play('pay');
        await sleep(900);
        return;
      }
      case 'deposit':
      case 'withdraw':
      case 'savings': {
        const sp = this.player(ev.pid);
        if (sp) sp.savings = ev.savings;
        this.setCash(ev.pid, ev.cash);
        const pt = this.pawnPt(ev.pid);
        if (ev.t === 'deposit') {
          if (this.b3) this.b3.coins(ev.pid, 'piggy', Math.min(10, 3 + Math.floor(ev.amount / 400)));
          this.bubble({ x: pt.x, y: pt.y - 30 }, `🐷 +${euro(ev.amount)} épargnés`, '.save', 2400);
          Sound.play('buy');
        } else if (ev.t === 'withdraw') {
          if (this.b3) this.b3.coins('piggy', ev.pid, Math.min(10, 3 + Math.floor(ev.amount / 400)));
          this.bubble({ x: pt.x, y: pt.y - 30 }, `🐷 ${euro(ev.amount)} retirés${ev.fee ? ` (−${euro(ev.fee)} de frais)` : ''}`, '.save', 2600);
          const p2 = this.player(ev.pid);
          if (ev.auto && p2) this.announce({ icon: '🐷', title: `${p2.name} casse sa tirelire`, text: `${euro(ev.amount)} puisés dans l'épargne pour payer`, color: p2.color, pid: p2.id, ms: 3300 });
          Sound.play('cash');
        } else {
          if (this.b3) this.b3.piggyShine();
          const pp = this.b3 ? this.b3.piggyScreen() : pt;
          this.bubble({ x: pp.x, y: pp.y - 20 }, `🐷 +${euro(ev.amount)} d'intérêts`, '.save', 2400);
          Sound.play('cash');
        }
        this.renderPlayers();
        await sleep(1000);
        return;
      }
      case 'pot':
        d.pot = ev.pot;
        if (this.b3) await this.b3.coins('bank', 'pot', 6);
        this.renderPot();
        return;
      case 'bought': {
        Sound.play('buy');
        const sp = this.player(ev.pid);
        if (sp && !sp.deals.some((x) => x.uid === ev.card.uid)) sp.deals.push(ev.card);
        if (p) this.announce({ icon: ev.card.icon, title: `${p.name} achète ${ev.card.name}`, text: `${euro(ev.price)} · revente ${euro(ev.card.value)}`, color: p.color, pid: p.id, ms: 3300 });
        this.renderPlayers();
        await sleep(900);
        return;
      }
      case 'passed':
        await sleep(150);
        return;
      case 'sold': {
        Sound.play('festival');
        const sp = this.player(ev.pid);
        if (sp) sp.deals = sp.deals.filter((x) => x.uid !== ev.card.uid);
        await this.showcase(dealCard(ev.card, { cls: '.big.sold', foot: h('div.mo-sold-stamp', 'VENDU !') }), { ms: 1900, to: this.cardPt(ev.pid) });
        if (p) this.announce({ icon: '🤑', title: `${p.name} revend ${ev.card.name}`, text: `+${euro(ev.profit)} de bénéfice !`, color: p.color, pid: p.id, kind: 'gold', ms: 4200 });
        return;
      }
      case 'roll': {
        Sound.play('dice');
        const dieWrap = h('div.mo-event-die', miniDie(1));
        const txt = h('div.mo-event-txt', { style: { opacity: 0 } }, ev.text);
        const node = h('div.mo-event' + (ev.win ? '.win' : '.lose'), { style: { '--c': p ? p.color : '#fff' } },
          h('div.mo-event-icon', art(ev.icon)), h('div.mo-event-title', ev.title), dieWrap, txt, p ? h('div.mo-show-for', p.name) : null);
        const shown = this.showcase(node, { ms: 2600 });
        await sleep(350);
        for (let k = 0; k < 10; k++) {
          dieWrap.replaceChildren(miniDie(1 + Math.floor(Math.random() * 6)));
          await sleep(90 + k * 12);
        }
        dieWrap.replaceChildren(miniDie(ev.value));
        dieWrap.classList.add('landed');
        txt.style.opacity = 1;
        Sound.play(ev.win ? 'cash' : 'error');
        await shown;
        return;
      }
      case 'tombola': {
        Sound.play('dice');
        const players = ev.tickets.map((id) => this.player(id) || {});
        const tickets = players.map((q, k) => h('div.mo-ticket', { style: { '--c': q.color || '#888' } }, h('b', String(k + 1)), h('span', q.pawn || ''), h('small', q.name || '?')));
        for (let k = players.length; k < 6; k++) tickets.push(h('div.mo-ticket.void', h('b', String(k + 1)), h('span', art('jar')), h('small', 'Cagnotte')));
        const dieWrap = h('div.mo-event-die', miniDie(1));
        const node = h('div.mo-event.tombola', h('div.mo-event-icon', art('ticket')), h('div.mo-event-title', `Tombola · ${euro(ev.pot)} à gagner`), h('div.mo-tickets', tickets), dieWrap);
        const shown = this.showcase(node, { ms: 3200 });
        await sleep(400);
        for (let k = 0; k < 12; k++) {
          dieWrap.replaceChildren(miniDie(1 + Math.floor(Math.random() * 6)));
          tickets.forEach((t, i) => t.classList.toggle('lit', i === k % 6));
          await sleep(100 + k * 15);
        }
        dieWrap.replaceChildren(miniDie(ev.value));
        tickets.forEach((t, i) => t.classList.toggle('lit', i === ev.value - 1));
        tickets[ev.value - 1].classList.add('win');
        Sound.play(ev.winner ? 'festival' : 'error');
        await shown;
        return;
      }
      case 'payday': {
        Sound.play('cash');
        const net = ev.salary - ev.billsTotal - ev.interest;
        const node = h('div.mo-payslip', { style: { '--c': p ? p.color : '#16a34a' } },
          h('div.mo-payslip-head', h('b', 'FICHE DE PAIE'), h('small', `${p ? p.name : ''} · mois ${ev.month}`)),
          h('div.mo-payslip-row.plus', h('span', art('banknote', 'inl'), 'Salaire'), h('b', '+' + euro(ev.salary))),
          ev.bills.length ? ev.bills.map((b) => h('div.mo-payslip-row.minus.small', h('span', art(b.icon, 'inl'), b.name), h('b', '−' + euro(b.amount)))) : h('div.mo-payslip-row.small', h('span', art('bill', 'inl'), 'Aucune facture'), h('b', '0 €')),
          ev.interest ? h('div.mo-payslip-row.minus', h('span', art('bank', 'inl'), `Intérêts (${euro(ev.loans)} empruntés)`), h('b', '−' + euro(ev.interest))) : null,
          ev.earned ? h('div.mo-payslip-row.plus.save', h('span', art('pig', 'inl'), `Intérêts du livret (${ev.rate} %)`), h('b', '+' + euro(ev.earned))) : null,
          h('div.mo-payslip-total', h('span', 'Reste'), h('b' + (net < 0 ? '.neg' : ''), (net >= 0 ? '+' : '−') + euro(Math.abs(net)))),
          h('div.mo-paid-stamp', 'PAYÉ')
        );
        if (this.b3) this.b3.daySparkle(PAYDAY, '#ffd166', 30);
        await this.showcase(node, { ms: 3700, to: this.cardPt(ev.pid) });
        const sp = this.player(ev.pid);
        if (sp) sp.bills = [];
        return;
      }
      case 'newMonth': {
        d.days[ev.pid] = 0;
        this.renderPawns(true, ev.pid);
        if (p) this.announce({ icon: '📅', title: `${p.name} attaque le mois ${ev.month}`, text: 'Retour au début du calendrier', color: p.color, pid: p.id, ms: 4900 });
        Sound.play('turn');
        await sleep(1300);
        return;
      }
      case 'done':
        if (p) this.announce({ icon: '🏁', title: `${p.name} a terminé !`, text: `Patrimoine : ${euro(ev.worth)}`, color: p.color, pid: p.id, kind: 'gold', ms: 4200 });
        Sound.play('festival');
        await sleep(1400);
        return;
      case 'info':
        if (p) this.announce({ icon: ev.icon, title: ev.title, text: ev.text, color: p.color, pid: p.id, kind: ev.kind || 'info', ms: 3300 });
        if (ev.icon === '🎂' && this.b3) this.b3.daySparkle(d.days[ev.pid] ?? 0, '#ff7ac6', 26);
        await sleep(1100);
        return;
      case 'shuffle':
        if (this.b3) this.b3.shake(0.15);
        return;
      case 'win':
        Sound.play('win');
        return;
      case 'out':
        if (p) this.announce({ icon: '🏳️', title: `${p.name} abandonne`, color: '#888', pid: p.id });
        return;
    }
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
    const detail = (pl) => `💰 ${euro(pl.netWorth)}`;
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
        h('div.end-title', winner.id === this.me ? '🎉 VICTOIRE ! 🎉' : `🏆 ${winner.name} finit le plus riche !`),
        h('div.end-sub', `📅 Fin de mois · ${res.months || ''} mois · ${duration(res.duration)}`),
        podium,
        h('div.end-list', ranked.slice(3).map((pl) => h('div.end-row', `#${pl.rank} ${pl.name}`, h('span', detail(pl))))),
        h('div.mo-end-table', ranked.map((pl) => h('div.mo-end-row', h('span', `#${pl.rank} ${pl.name}`), h('small', `argent ${euro(pl.cash)} · épargne ${euro(pl.savings || 0)} · emprunts ${euro(pl.loans)} · ${pl.stats.sold} vente${pl.stats.sold > 1 ? 's' : ''}`), h('b', euro(pl.netWorth))))),
        rw ? h('div.rewards',
          h('div.reward', `+${rw.xp} XP`),
          rw.badges.length ? h('div.new-badges', h('div.small', 'Nouveaux badges débloqués !'), rw.badges.map((b) => h('div.badge.tier-' + b.tier, h('div.badge-icon', b.icon), h('div.badge-name', b.name)))) : null
        ) : !store.user ? h('div.hint', h('a', { href: '/register', 'data-link': true }, 'Créez un compte'), ' pour enregistrer vos victoires, gagner de l\'XP et des badges !') : null,
        h('div.btn-row.center',
          v.isHost ? h('button.btn.primary.lg', { onclick: () => v.cmd('room:rematch') }, '🔁 Rejouer') : h('div.muted', 'L\'hôte peut relancer une partie.'),
          v.isHost ? h('button.btn.ghost', { onclick: () => v.openGameChooser() }, '🎮 Changer de jeu') : null,
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

export { dayLabel };
