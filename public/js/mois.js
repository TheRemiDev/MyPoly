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
    h('div.mo-deal-icon', c.icon),
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
    h('div.mo-letter-head', h('span', '✉️ COURRIER'), sub ? h('small', sub) : null, h('i.mo-stamp')),
    h('div.mo-letter-icon', c.icon),
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
    this.actionEl = h('div.mo-dock', this.billsEl, h('div.hz-action.mo-action', this.die, this.hintEl, this.rollBtn), this.dealsEl);
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
        this.b3 = new Month3D(this.host, { onHover: (day) => this.hoverCell(day) });
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
      title: '📅 Règles de Fin de mois',
      body: h('div.rules-summary',
        h('p', `Chaque tour, lance le dé et avance dans le mois. Le 31, c'est la paye ! La partie dure ${s.months} mois : `, h('b', 'le joueur le plus riche à la fin (argent + épargne − emprunts) gagne.')),
        h('ul',
          h('li', '✉️ Courrier : factures à régler le jour de paye, amendes, bonnes surprises…'),
          h('li', '🏷️ Affaire : achète un objet, puis revends-le plus cher sur une case 🛍️ Acheteur.'),
          h('li', `💶 Jour de paye : +${euro(s.salary)} de salaire, puis tu règles tes factures${s.loanRate ? ` et ${s.loanRate} % d'intérêts sur tes emprunts` : ''}.`),
          h('li', '🏦 Pas assez d\'argent ? La banque te prête automatiquement par tranches de 1 000 €. Rembourse-les le jour de paye.'),
          h('li', `🐷 Le jour de paye, mets de l'argent sur ton livret d'épargne : il rapporte ${s.savingsRate ?? 5} % à chaque paye et te dépanne automatiquement avant tout emprunt.`),
          s.jackpotSix ? h('li', '💰 Amendes et coups durs remplissent la cagnotte : fais un 6 au dé pour la rafler !') : null,
          s.sundayBet ? h('li', '⚽ Le dimanche, parie 500 € : 4, 5 ou 6 pour gagner 500 €.') : null,
          s.tombola ? h('li', '🎟️ Tombola : chacun paie 100 €, le dé désigne le gagnant (sinon tout va dans la cagnotte).') : null,
          h('li', '🎂 Anniversaire, 🍻 tournée générale, 📦 vide-grenier, 📻 jeu radio, 💥 coup dur… le mois réserve des surprises !'),
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
    if (this.b3) return this.b3.buildBoard(this.state.board);
    // Plateau 2D de secours : la feuille du calendrier
    const b = this.boardEl;
    b.innerHTML = '';
    this.potEl = h('div.mo-cell.pot', h('span.mo-pot-ico', '🫙'), h('b.mo-pot-val'), h('small', 'CAGNOTTE'));
    this.cellEls = this.state.board.map((sp, d) => {
      const s = SPACES[sp.k] || SPACES.start;
      return h('div.mo-cell.k-' + sp.k + (d % 7 === 6 ? '.sun' : ''), { style: { '--k': s.color } },
        d && d < PAYDAY ? h('b.mo-cell-n', String(d)) : null,
        h('span.mo-cell-ico', s.icon),
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
    this.billsEl.hidden = this.dealsEl.hidden = !me;
    if (!me) return;
    const total = me.bills.reduce((s, b) => s + b.amount, 0);
    this.billsEl.innerHTML = '';
    this.billsEl.append(
      h('div.mo-pile-cards', me.bills.slice(-4).map((b, k) => h('span.mo-mini.letter', { style: { '--k': k } }, b.icon)), me.bills.length ? null : h('span.mo-none', '🧾')),
      h('div.mo-pile-txt', h('small', 'Mes factures'), h('b', me.bills.length ? euro(total) : 'Aucune'))
    );
    this.dealsEl.innerHTML = '';
    this.dealsEl.append(
      h('div.mo-pile-cards', me.deals.slice(-4).map((d, k) => h('span.mo-mini.deal', { style: { '--k': k } }, d.icon)), me.deals.length ? null : h('span.mo-none', '🏷️')),
      h('div.mo-pile-txt', h('small', 'Mes affaires'), h('b', me.deals.length ? `${me.deals.length} · ${euro(me.deals.reduce((s, d) => s + d.value, 0))}` : 'Aucune'))
    );
  }
  showWallet(which) {
    const me = this.player(this.me);
    if (!me) return;
    if (which === 'bills') {
      const total = me.bills.reduce((s, b) => s + b.amount, 0);
      modal({
        title: '🧾 Mes factures',
        body: me.bills.length
          ? h('div.mo-wallet', h('p.muted', 'Elles seront réglées automatiquement le jour de paye.'), h('div.mo-wallet-list', me.bills.map((b) => h('div.mo-wallet-row', h('span', b.icon), h('span', b.name), h('b', euro(b.amount))))), h('div.mo-wallet-total', 'Total', h('b', euro(total))))
          : h('p', 'Aucune facture en attente. Profitez-en !'),
      });
    } else {
      modal({
        title: '🏷️ Mes affaires',
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
        h('div.mo-decide-title', '🏷️ Une affaire à saisir !'),
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
        h('div.mo-decide-title', '🛍️ Un acheteur est intéressé !'),
        who,
        h('div.mo-decide-sub', mine ? 'Choisissez l\'affaire à lui revendre :' : `${p.name} choisit quoi revendre`),
        h('div.mo-deal-row', p.deals.map((d) => dealCard(d, { cls: '.sm' + (mine ? '.mo-pickable' : ''), onclick: mine ? () => choose(d.uid) : null, foot: mine ? h('div.mo-deal-sell', `Vendre ${euro(d.value)}`) : null }))),
        mine ? h('div.mo-decide-btns', h('button.btn.ghost', { onclick: () => choose('keep') }, 'Ne rien vendre')) : null
      );
    } else if (pd.type === 'bet') {
      el.append(
        h('div.mo-decide-title', '⚽ Match du dimanche'),
        who,
        h('div.mo-bet',
          h('div.mo-bet-ball', '⚽'),
          h('p', 'Pariez ', h('b', '500 €'), ' sur le match : faites ', h('b', '4, 5 ou 6'), ' au dé pour gagner ', h('b', '500 €'), '. Sinon, la mise part dans la cagnotte.')
        ),
        mine ? h('div.mo-decide-btns',
          h('button.btn.primary.lg', { onclick: () => choose('bet') }, '⚽ Parier 500 €'),
          h('button.btn.ghost.lg', { onclick: () => choose('pass') }, 'Pas de pari')
        ) : null
      );
    } else if (pd.type === 'payday') {
      const rate = st.settings.savingsRate || 0;
      const max = Math.min(p.loans, Math.floor(p.cash / 1000) * 1000);
      const all500 = Math.floor(p.cash / 500) * 500;
      const account = (cls, icon, label, value, sub) => h('div.mo-acc.' + cls, h('span.mo-acc-ico', icon), h('small', label), h('b', euro(value)), h('em', sub));
      const btn = (label, choice, cls = '.ghost') => h('button.btn.sm' + cls, { onclick: () => choose(choice) }, label);
      el.append(
        h('div.mo-decide-title', '💶 Jour de paye : votre banque'),
        who,
        h('div.mo-accounts',
          account('cash', '👛', 'Porte-monnaie', p.cash, 'disponible'),
          account('save', '🐷', 'Livret d\'épargne', p.savings || 0, rate ? `+${rate} % chaque paye` : 'sans intérêts'),
          account('loan', '🏦', 'Emprunts', p.loans, p.loans ? `${st.settings.loanRate} % d'intérêts / mois` : 'aucun crédit')
        ),
        mine ? h('div.mo-bank-ops',
          h('div.mo-bank-row', h('span.mo-bank-lbl', '🐷 Épargner'),
            p.cash >= 500 ? btn('+500 €', 'save:500') : null,
            p.cash >= 1000 ? btn('+1 000 €', 'save:1000') : null,
            all500 >= 1500 ? btn(`Tout (${euro(all500)})`, 'save:' + all500) : null,
            p.savings > 0 ? btn(`Retirer ${euro(p.savings)}`, 'withdraw:' + p.savings) : null,
            p.cash < 500 && !p.savings ? h('small.muted', 'Pas assez d\'argent ce mois-ci') : null
          ),
          p.loans > 0 ? h('div.mo-bank-row', h('span.mo-bank-lbl', '🏦 Rembourser'),
            max >= 1000 ? btn('1 000 €', 'one') : null,
            max > 1000 ? btn(`Tout possible (${euro(max)})`, 'all') : null,
            max < 1000 ? h('small.muted', 'Il faut au moins 1 000 € en poche') : null
          ) : null
        ) : null,
        mine ? h('div.mo-decide-note.soft', '💡 L\'épargne rapporte des intérêts et sert automatiquement si vous manquez d\'argent, avant tout emprunt.') : null,
        mine ? h('div.mo-decide-btns', h('button.btn.primary.lg', { onclick: () => choose('done') }, '✓ Terminer le mois')) : null
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
      h('div.mo-tip-head', { style: { '--k': s.color } }, h('span', s.icon), h('b', day === 0 ? 'Départ' : `${dayLabel(day)} · ${DAY_ART[day] && sp.k !== 'payday' ? DAY_ART[day].title.replace(/-?\n/g, (x) => (x.startsWith('-') ? '' : ' ')) : s.name}`)),
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
          this.bubble({ x: pt.x, y: pt.y - 30 }, `🐷 ${euro(ev.amount)} retirés`, '.save', 2400);
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
          h('div.mo-event-icon', ev.icon), h('div.mo-event-title', ev.title), dieWrap, txt, p ? h('div.mo-show-for', p.name) : null);
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
        for (let k = players.length; k < 6; k++) tickets.push(h('div.mo-ticket.void', h('b', String(k + 1)), h('span', '🫙'), h('small', 'Cagnotte')));
        const dieWrap = h('div.mo-event-die', miniDie(1));
        const node = h('div.mo-event.tombola', h('div.mo-event-icon', '🎟️'), h('div.mo-event-title', `Tombola · ${euro(ev.pot)} à gagner`), h('div.mo-tickets', tickets), dieWrap);
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
          h('div.mo-payslip-row.plus', h('span', '💼 Salaire'), h('b', '+' + euro(ev.salary))),
          ev.bills.length ? ev.bills.map((b) => h('div.mo-payslip-row.minus.small', h('span', `${b.icon} ${b.name}`), h('b', '−' + euro(b.amount)))) : h('div.mo-payslip-row.small', h('span', '🧾 Aucune facture'), h('b', '0 €')),
          ev.interest ? h('div.mo-payslip-row.minus', h('span', `🏦 Intérêts (${euro(ev.loans)} empruntés)`), h('b', '−' + euro(ev.interest))) : null,
          ev.earned ? h('div.mo-payslip-row.plus.save', h('span', `🐷 Intérêts du livret (${ev.rate} %)`), h('b', '+' + euro(ev.earned))) : null,
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
