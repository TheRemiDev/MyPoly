'use strict';
/**
 * « Fin de mois » — moteur côté serveur (autoritaire).
 * Chaque joueur traverse un mois calendrier (du 1er au 31) : courrier, factures,
 * affaires à acheter puis revendre, et la paye le 31. Le plus riche à la fin gagne.
 * Le dé et le mélange des paquets passent par le CSPRNG du serveur.
 */
const R = require('../game/random');
const { DAYS, PAYDAY, MAIL, DEALS } = require('./data');

const LOAN_UNIT = 1000;
const SAVE_UNIT = 500;
const fmt = (n) => Math.round(n).toLocaleString('fr-FR').replace(/ | /g, ' ') + ' €';

class MonthGame {
  constructor({ players, settings, onUpdate, onEnd }) {
    this.kind = 'mois';
    this.settings = settings;
    this.onUpdate = onUpdate || (() => {});
    this.onEnd = onEnd || (() => {});
    this.players = players.map((p) => ({
      id: p.id,
      userId: p.userId || null,
      name: p.name,
      pawn: p.pawn,
      color: p.color,
      isBot: !!p.isBot,
      role: p.role,
      vip: !!p.vip,
      level: p.level || 0,
      connected: true,
      afk: false,
      timeouts: 0,
      cash: settings.startCash,
      loans: 0,
      savings: 0,
      bills: [],
      deals: [],
      day: 0,
      month: 1,
      done: false,
      out: false,
      rank: 0,
      stats: { rolls: 0, letters: 0, bought: 0, sold: 0, profit: 0, jackpots: 0, jackpotBest: 0, borrowed: 0, billsPaid: 0, betsWon: 0, tombolas: 0, savedBest: 0, savingsEarned: 0 },
    }));
    this.seq = 0;
    this.mailDeck = this.newDeck(MAIL);
    this.mailDiscard = [];
    this.dealDeck = this.newDeck(DEALS);
    this.dealDiscard = [];
    this.cagnotte = 0;
    this.turn = R.int(0, this.players.length - 1);
    this.phase = 'roll';
    this.pending = null;
    this.dice = null;
    this.turns = 0;
    this.round = 1;
    this.events = [];
    this.anim = 0;
    this.log = [];
    this.over = false;
    this.winner = null;
    this.deadline = null;
    this.timer = null;
    this.startedAt = Date.now();
  }

  /** Partie restaurée après un redémarrage : complète les champs ajoutés depuis. */
  afterRestore() {
    if (this.settings.savingsRate === undefined) this.settings.savingsRate = 5;
    for (const p of this.players) {
      if (p.savings === undefined) p.savings = 0;
      p.stats.savedBest ||= 0;
      p.stats.savingsEarned ||= 0;
    }
  }

  // ------------------------------------------------------------ utilitaires
  newDeck(list) {
    return R.shuffle(list).map((c) => ({ ...c, uid: 'c' + ++this.seq }));
  }
  draw(kind) {
    const deck = kind === 'mail' ? 'mailDeck' : 'dealDeck';
    const disc = kind === 'mail' ? 'mailDiscard' : 'dealDiscard';
    if (!this[deck].length) {
      this[deck] = this[disc].length ? R.shuffle(this[disc]) : this.newDeck(kind === 'mail' ? MAIL : DEALS);
      this[disc] = [];
      this.emit({ t: 'shuffle', deck: kind }, 400);
    }
    return this[deck].shift();
  }
  player(id) {
    return this.players.find((p) => p.id === id);
  }
  get cur() {
    return this.players[this.turn];
  }
  /** Joueurs encore en lice (même ceux qui ont fini leurs mois). */
  get active() {
    return this.players.filter((p) => !p.out);
  }
  worth(p) {
    const extra = this.settings.unsoldValue ? p.deals.reduce((s, d) => s + d.cost, 0) : 0;
    return p.cash + p.savings - p.loans + extra;
  }
  emit(ev, ms = 0) {
    ev.at = this.anim;
    this.events.push(ev);
    this.anim += ms;
  }
  say(msg, pid = null) {
    const entry = { msg, pid, t: Date.now() };
    this.log.push(entry);
    if (this.log.length > 80) this.log.shift();
    this.emit({ t: 'log', ...entry });
  }

  // ------------------------------------------------------------ argent
  /** Emprunt automatique par tranches de 1 000 €. */
  borrow(p, amount, why = '') {
    if (amount <= 0) return;
    p.loans += amount;
    p.cash += amount;
    p.stats.borrowed += amount;
    this.emit({ t: 'loan', pid: p.id, amount, loans: p.loans, cash: p.cash }, 1600);
    this.say(`🏦 ${p.name} emprunte ${fmt(amount)} à la banque${why ? ' ' + why : ''}.`, p.id);
  }
  /** Paiement : à la banque, à la cagnotte ('pot') ou à un joueur. Emprunte si besoin. */
  pay(p, amount, reason, to = null) {
    amount = Math.round(amount);
    if (amount <= 0) return;
    // Pas assez d'argent : on puise d'abord dans l'épargne, puis on emprunte
    if (p.cash < amount && p.savings > 0) {
      const take = Math.min(p.savings, amount - p.cash);
      p.savings -= take;
      p.cash += take;
      this.emit({ t: 'withdraw', pid: p.id, amount: take, savings: p.savings, cash: p.cash, auto: true }, 1500);
      this.say(`🐷 ${p.name} puise ${fmt(take)} dans son épargne pour payer.`, p.id);
    }
    if (p.cash < amount) this.borrow(p, Math.ceil((amount - p.cash) / LOAN_UNIT) * LOAN_UNIT, 'pour payer');
    p.cash -= amount;
    const peer = to && to !== 'pot' ? to : null;
    if (peer) peer.cash += amount;
    if (to === 'pot') this.cagnotte += amount;
    this.emit({ t: 'money', pid: p.id, delta: -amount, reason, cash: p.cash, to: peer ? peer.id : to === 'pot' ? 'pot' : 'bank', pot: this.cagnotte, peerCash: peer ? peer.cash : undefined }, 900);
  }
  gain(p, amount, reason, from = 'bank') {
    amount = Math.round(amount);
    if (amount <= 0) return;
    p.cash += amount;
    this.emit({ t: 'money', pid: p.id, delta: amount, reason, cash: p.cash, from, pot: this.cagnotte }, 900);
  }

  // ------------------------------------------------------------ déroulement
  start() {
    const m = this.settings.months;
    this.say(`📅 La partie commence ! ${m} mois pour finir le plus riche. Salaire : ${fmt(this.settings.salary)} le 31.`);
    this.say(`${this.cur.name} lance le premier.`, this.cur.id);
    this.emit({ t: 'turn', pid: this.cur.id }, 300);
    this.flush();
  }

  act(pid, type, data = {}) {
    if (this.over) return { error: 'La partie est terminée.' };
    const p = this.player(pid);
    if (!p || p.out) return { error: 'Vous ne jouez pas dans cette partie.' };
    if (p !== this.cur) return { error: 'Ce n\'est pas votre tour.' };
    p.timeouts = 0;
    p.afk = false;
    let res;
    if (type === 'roll') res = this.doRoll(p);
    else if (type === 'choose') res = this.decide(p, String(data.choice || ''));
    else res = { error: 'Action inconnue.' };
    if (!res || !res.error) this.flush();
    return res || { ok: true };
  }

  doRoll(p) {
    if (this.phase !== 'roll') return { error: 'Une décision est en attente.' };
    const d = R.die();
    this.dice = d;
    p.stats.rolls++;
    this.emit({ t: 'dice', pid: p.id, value: d }, 1400);
    if (d === 6 && this.settings.jackpotSix && this.cagnotte > 0) {
      const pot = this.cagnotte;
      this.cagnotte = 0;
      p.stats.jackpots++;
      p.stats.jackpotBest = Math.max(p.stats.jackpotBest, pot);
      this.say(`💰 ${p.name} fait 6 et rafle la cagnotte : ${fmt(pot)} !`, p.id);
      this.emit({ t: 'jackpot', pid: p.id, amount: pot }, 2800);
      this.gain(p, pot, 'Cagnotte', 'pot');
    }
    const to = Math.min(PAYDAY, p.day + d);
    this.moveTo(p, to);
    this.say(`🎲 ${p.name} fait ${d} → ${this.dayName(to)}.`, p.id);
    return this.land(p);
  }

  dayName(day) {
    if (day === 0) return 'départ';
    if (day === PAYDAY) return 'jour de paye';
    return `le ${day === 1 ? '1er' : day}`;
  }

  moveTo(p, to) {
    const path = [];
    for (let k = p.day + 1; k <= to; k++) path.push(k);
    if (!path.length) return;
    this.emit({ t: 'move', pid: p.id, from: p.day, to, path }, 350 + path.length * 280);
    p.day = to;
  }

  /** Résout la case où le joueur vient d'arriver. */
  land(p) {
    const sp = DAYS[p.day];
    this.emit({ t: 'space', pid: p.id, day: p.day, k: sp.k }, 500);
    switch (sp.k) {
      case 'mail':
        return this.readMail(p, sp.n);
      case 'deal': {
        const card = this.draw('deal');
        this.pending = { type: 'deal', card };
        this.phase = 'decide';
        this.emit({ t: 'dealDraw', pid: p.id, card }, 1700);
        return { ok: true };
      }
      case 'buyer':
        if (!p.deals.length) {
          this.say(`🛍️ Un acheteur passe chez ${p.name}… mais il n'a rien à vendre.`, p.id);
          this.emit({ t: 'info', pid: p.id, icon: '🛍️', title: 'Un acheteur passe', text: 'Rien à lui vendre…' }, 2400);
          return this.endTurn(p);
        }
        this.pending = { type: 'buyer' };
        this.phase = 'decide';
        return { ok: true };
      case 'bet':
        if (!this.settings.sundayBet) {
          this.emit({ t: 'info', pid: p.id, icon: '😴', title: 'Dimanche', text: 'Grasse matinée !' }, 1800);
          return this.endTurn(p);
        }
        this.pending = { type: 'bet' };
        this.phase = 'decide';
        return { ok: true };
      case 'birthday': {
        this.say(`🎂 C'est l'anniversaire de ${p.name} : chacun lui offre 100 € !`, p.id);
        this.emit({ t: 'info', pid: p.id, icon: '🎂', title: `Joyeux anniversaire ${p.name} !`, text: `Chaque joueur offre 100 € à ${p.name}`, kind: 'gold' }, 2600);
        for (const q of this.active) if (q !== p) this.pay(q, 100, 'Cadeau d\'anniversaire', p);
        return this.endTurn(p);
      }
      case 'round': {
        this.say(`🍻 ${p.name} offre sa tournée : 100 € à chaque joueur.`, p.id);
        this.emit({ t: 'info', pid: p.id, icon: '🍻', title: 'Tournée générale !', text: `${p.name} offre 100 € à chaque joueur`, kind: 'danger' }, 2600);
        for (const q of this.active) if (q !== p) this.pay(p, 100, 'Tournée générale', q);
        return this.endTurn(p);
      }
      case 'bonus':
        this.say(`⏱️ ${p.name} fait des heures sup : +500 €.`, p.id);
        this.emit({ t: 'info', pid: p.id, icon: '⏱️', title: 'Heures supplémentaires', text: '+500 €', kind: 'gold' }, 2400);
        this.gain(p, 500, 'Heures sup');
        return this.endTurn(p);
      case 'contest': {
        const v = R.die();
        const win = v >= 5;
        this.emit({ t: 'roll', pid: p.id, value: v, icon: '📻', title: 'Jeu radio', text: win ? 'Gagné : 1 000 € !' : 'Perdu… il fallait 5 ou 6', win }, 3700);
        this.say(`📻 Jeu radio : ${p.name} fait ${v}${win ? ' et gagne 1 000 € !' : '… perdu.'}`, p.id);
        if (win) this.gain(p, 1000, 'Jeu radio');
        return this.endTurn(p);
      }
      case 'tough': {
        const v = R.die();
        this.emit({ t: 'roll', pid: p.id, value: v, icon: '💥', title: 'Coup dur !', text: `Dégât des eaux : ${fmt(v * 100)} pour la cagnotte`, win: false }, 3700);
        this.say(`💥 Coup dur pour ${p.name} : ${fmt(v * 100)} dans la cagnotte.`, p.id);
        this.pay(p, v * 100, 'Coup dur', 'pot');
        return this.endTurn(p);
      }
      case 'garage': {
        const v = R.die();
        const card = this.draw('deal');
        this.emit({ t: 'roll', pid: p.id, value: v, icon: '🏷️', title: 'Vide-grenier', text: `${card.icon} ${card.name} pour ${fmt(v * 100)} (revente ${fmt(card.value)})`, win: true }, 3900);
        this.say(`🏷️ Vide-grenier : ${p.name} déniche ${card.name} pour ${fmt(v * 100)}.`, p.id);
        this.pay(p, v * 100, 'Vide-grenier');
        p.deals.push(card);
        p.stats.bought++;
        this.emit({ t: 'bought', pid: p.id, card, price: v * 100 }, 1200);
        return this.endTurn(p);
      }
      case 'tombola':
        return this.tombola(p);
      case 'payday':
        return this.payday(p);
      default:
        return this.endTurn(p);
    }
  }

  readMail(p, n) {
    this.say(`✉️ ${p.name} reçoit ${n} lettre${n > 1 ? 's' : ''}.`, p.id);
    let go = null;
    for (let k = 0; k < n; k++) {
      const c = this.draw('mail');
      p.stats.letters++;
      this.emit({ t: 'mail', pid: p.id, card: c, k: k + 1, n }, 3600);
      switch (c.t) {
        case 'bill':
          p.bills.push(c);
          this.say(`🧾 ${p.name} : ${c.name} (${fmt(c.amount)}), à régler le jour de paye.`, p.id);
          continue; // la facture reste dans la main jusqu'à la paye
        case 'fine':
          this.say(`🚓 ${p.name} : ${c.name}, ${fmt(c.amount)} pour la cagnotte.`, p.id);
          this.pay(p, c.amount, c.name, 'pot');
          break;
        case 'gain':
          this.say(`💶 ${p.name} : ${c.name}, +${fmt(c.amount)}.`, p.id);
          this.gain(p, c.amount, c.name);
          break;
        case 'give': {
          const q = this.neighbor(p, 1);
          if (q) {
            this.say(`🐕 ${p.name} doit ${fmt(c.amount)} à ${q.name}.`, p.id);
            this.pay(p, c.amount, c.name, q);
          }
          break;
        }
        case 'take': {
          const q = this.neighbor(p, -1);
          if (q) {
            this.say(`🤝 ${q.name} donne ${fmt(c.amount)} à ${p.name}.`, p.id);
            this.pay(q, c.amount, c.name, p);
          }
          break;
        }
        case 'goto':
          go = c.to;
          break;
      }
      this.mailDiscard.push(c);
    }
    if (go) {
      let to = -1;
      for (let d = p.day + 1; d < PAYDAY; d++) if (DAYS[d].k === go) {
        to = d;
        break;
      }
      if (to > 0) {
        this.moveTo(p, to);
        this.say(`➡️ ${p.name} avance ${this.dayName(to)}.`, p.id);
        return this.land(p);
      }
      this.say(`➡️ Plus de case de ce type ce mois-ci pour ${p.name}.`, p.id);
    }
    return this.endTurn(p);
  }

  /** Voisin de table (sens +1 : suivant, -1 : précédent), parmi les joueurs en lice. */
  neighbor(p, dir) {
    const n = this.players.length;
    let i = this.players.indexOf(p);
    for (let k = 0; k < n; k++) {
      i = (i + dir + n) % n;
      const q = this.players[i];
      if (q !== p && !q.out) return q;
    }
    return null;
  }

  tombola(p) {
    if (!this.settings.tombola) {
      this.emit({ t: 'info', pid: p.id, icon: '☀️', title: 'Journée tranquille', text: 'Rien à signaler' }, 1800);
      return this.endTurn(p);
    }
    const list = this.active;
    let pot = 0;
    this.say(`🎟️ Tombola ! Chaque joueur achète un ticket de 100 €.`, p.id);
    for (const q of list) {
      this.pay(q, 100, 'Ticket de tombola');
      pot += 100;
    }
    const v = R.die();
    const winner = v <= list.length ? list[v - 1] : null;
    this.emit({ t: 'tombola', pid: p.id, value: v, winner: winner ? winner.id : null, pot, tickets: list.map((q) => q.id) }, 4600);
    if (winner) {
      winner.stats.tombolas++;
      this.say(`🎟️ Le ${v} sort : ${winner.name} remporte la tombola (${fmt(pot)}) !`, winner.id);
      this.gain(winner, pot, 'Tombola');
    } else {
      this.cagnotte += pot;
      this.say(`🎟️ Le ${v} sort : personne ! ${fmt(pot)} vont dans la cagnotte.`, p.id);
      this.emit({ t: 'pot', amount: pot, pot: this.cagnotte }, 900);
    }
    return this.endTurn(p);
  }

  payday(p) {
    const s = this.settings;
    const interest = Math.round((p.loans * s.loanRate) / 100);
    const billsTotal = p.bills.reduce((t, b) => t + b.amount, 0);
    // Intérêts de l'épargne : ils s'ajoutent au livret
    const earned = Math.round((p.savings * s.savingsRate) / 100);
    this.emit({ t: 'payday', pid: p.id, month: p.month, salary: s.salary, bills: p.bills.map((b) => ({ icon: b.icon, name: b.name, amount: b.amount })), billsTotal, interest, loans: p.loans, earned, savings: p.savings + earned, rate: s.savingsRate }, 4800);
    if (earned) {
      p.savings += earned;
      p.stats.savingsEarned += earned;
      this.emit({ t: 'savings', pid: p.id, amount: earned, savings: p.savings, cash: p.cash }, 1200);
      this.say(`🐷 L'épargne de ${p.name} rapporte ${fmt(earned)} (${s.savingsRate} %).`, p.id);
    }
    this.say(`💶 Jour de paye pour ${p.name} : +${fmt(s.salary)}, factures ${fmt(billsTotal)}${interest ? `, intérêts ${fmt(interest)}` : ''}.`, p.id);
    this.gain(p, s.salary, 'Salaire');
    if (interest) this.pay(p, interest, 'Intérêts de l\'emprunt');
    if (billsTotal) this.pay(p, billsTotal, `Factures (${p.bills.length})`);
    p.stats.billsPaid += billsTotal;
    this.mailDiscard.push(...p.bills);
    p.bills = [];
    if ((p.loans > 0 && p.cash >= LOAN_UNIT) || p.cash >= SAVE_UNIT || p.savings > 0) {
      this.pending = { type: 'payday' };
      this.phase = 'decide';
      return { ok: true };
    }
    return this.endMonth(p);
  }

  endMonth(p) {
    if (p.month >= this.settings.months) {
      p.done = true;
      this.say(`🏁 ${p.name} termine son dernier mois avec ${fmt(this.worth(p))} de patrimoine.`, p.id);
      this.emit({ t: 'done', pid: p.id, worth: this.worth(p) }, 2200);
    } else {
      p.month++;
      p.day = 0;
      this.emit({ t: 'newMonth', pid: p.id, month: p.month }, 1700);
      this.say(`📅 ${p.name} entame le mois ${p.month}/${this.settings.months}.`, p.id);
    }
    return this.endTurn(p);
  }

  decide(p, choice) {
    const pd = this.pending;
    if (this.phase !== 'decide' || !pd) return { error: 'Aucune décision en attente.' };
    if (pd.type === 'deal') {
      const c = pd.card;
      if (choice === 'buy') {
        this.say(`🏷️ ${p.name} achète ${c.name} pour ${fmt(c.cost)}.`, p.id);
        this.pay(p, c.cost, 'Achat : ' + c.name);
        p.deals.push(c);
        p.stats.bought++;
        this.emit({ t: 'bought', pid: p.id, card: c, price: c.cost }, 1300);
      } else if (choice === 'pass') {
        this.say(`🙅 ${p.name} laisse passer ${c.name}.`, p.id);
        this.dealDiscard.push(c);
        this.emit({ t: 'passed', pid: p.id, card: c }, 600);
      } else return { error: 'Choix invalide.' };
      return this.endTurn(p);
    }
    if (pd.type === 'buyer') {
      if (choice === 'keep') {
        this.say(`🛍️ ${p.name} garde ses affaires.`, p.id);
        return this.endTurn(p);
      }
      const i = p.deals.findIndex((d) => d.uid === choice);
      if (i < 0) return { error: 'Affaire introuvable.' };
      const [c] = p.deals.splice(i, 1);
      p.stats.sold++;
      p.stats.profit += c.value - c.cost;
      this.say(`🤑 ${p.name} revend ${c.name} ${fmt(c.value)} (+${fmt(c.value - c.cost)} de bénéfice) !`, p.id);
      this.emit({ t: 'sold', pid: p.id, card: c, profit: c.value - c.cost }, 3000);
      this.gain(p, c.value, 'Vente : ' + c.name);
      this.dealDiscard.push(c);
      return this.endTurn(p);
    }
    if (pd.type === 'bet') {
      if (choice === 'pass') {
        this.say(`⚽ ${p.name} ne parie pas sur le match du dimanche.`, p.id);
        return this.endTurn(p);
      }
      if (choice !== 'bet') return { error: 'Choix invalide.' };
      const v = R.die();
      const win = v >= 4;
      this.emit({ t: 'roll', pid: p.id, value: v, icon: '⚽', title: 'Match du dimanche', text: win ? 'Pari gagné : +500 € !' : 'Pari perdu : 500 € pour la cagnotte', win }, 3700);
      this.say(`⚽ ${p.name} parie 500 € et fait ${v} : ${win ? 'gagné !' : 'perdu…'}`, p.id);
      if (win) {
        p.stats.betsWon++;
        this.gain(p, 500, 'Pari gagné');
      } else this.pay(p, 500, 'Pari perdu', 'pot');
      return this.endTurn(p);
    }
    if (pd.type === 'payday') {
      if (choice === 'done') return this.endMonth(p);
      // Épargne : dépôt ou retrait (par tranches de 100 €)
      const [op, raw] = choice.split(':');
      if (op === 'save' || op === 'withdraw') {
        const amount = Math.floor(Number(raw) / 100) * 100;
        if (!(amount > 0)) return { error: 'Montant invalide.' };
        if (op === 'save') {
          if (amount > p.cash) return { error: 'Pas assez d\'argent.' };
          p.cash -= amount;
          p.savings += amount;
          p.stats.savedBest = Math.max(p.stats.savedBest, p.savings);
          this.say(`🐷 ${p.name} met ${fmt(amount)} de côté (épargne : ${fmt(p.savings)}).`, p.id);
          this.emit({ t: 'deposit', pid: p.id, amount, savings: p.savings, cash: p.cash }, 1300);
        } else {
          if (amount > p.savings) return { error: 'Épargne insuffisante.' };
          p.savings -= amount;
          p.cash += amount;
          this.say(`🐷 ${p.name} retire ${fmt(amount)} de son épargne.`, p.id);
          this.emit({ t: 'withdraw', pid: p.id, amount, savings: p.savings, cash: p.cash }, 1300);
        }
        return { ok: true };
      }
      const max = Math.min(p.loans, Math.floor(p.cash / LOAN_UNIT) * LOAN_UNIT);
      const amount = choice === 'all' ? max : choice === 'one' ? Math.min(LOAN_UNIT, max) : 0;
      if (amount <= 0) return { error: 'Remboursement impossible.' };
      p.cash -= amount;
      p.loans -= amount;
      this.say(`🏦 ${p.name} rembourse ${fmt(amount)} à la banque.`, p.id);
      this.emit({ t: 'repay', pid: p.id, amount, loans: p.loans, cash: p.cash }, 1300);
      return { ok: true }; // le joueur peut encore épargner ou rembourser

    }
    return { error: 'Choix invalide.' };
  }

  endTurn() {
    this.pending = null;
    this.phase = 'roll';
    if (this.active.every((q) => q.done)) return this.finish();
    this.nextTurn();
    return { ok: true };
  }

  nextTurn() {
    this.dice = null;
    this.phase = 'roll';
    this.pending = null;
    this.turns++;
    const n = this.players.length;
    let i = this.turn;
    for (let k = 0; k < n; k++) {
      i = (i + 1) % n;
      if (i === 0) this.round++;
      if (!this.players[i].out && !this.players[i].done) break;
    }
    this.turn = i;
    this.emit({ t: 'turn', pid: this.cur.id }, 250);
  }

  finish(forced = null) {
    if (this.over) return { ok: true };
    this.over = true;
    this.phase = 'over';
    this.pending = null;
    clearTimeout(this.timer);
    const ranked = this.players.slice().sort((a, b) => (a.out !== b.out ? (a.out ? 1 : -1) : this.worth(b) - this.worth(a)));
    if (forced) ranked.splice(ranked.indexOf(forced), 1), ranked.unshift(forced);
    ranked.forEach((q, k) => (q.rank = k + 1));
    const w = ranked[0];
    this.winner = w ? w.id : null;
    if (w) this.say(`🏆 ${w.name} gagne avec ${fmt(this.worth(w))} de patrimoine !`, w.id);
    this.emit({ t: 'win', pid: this.winner }, 500);
    this.endedAt = Date.now();
    this.onEnd(this.result());
    return { ok: true };
  }

  result() {
    return {
      kind: 'mois',
      winner: this.winner,
      winType: 'mois',
      duration: Math.round(((this.endedAt || Date.now()) - this.startedAt) / 1000),
      rounds: this.round,
      turns: this.turns,
      months: this.settings.months,
      players: this.players.map((p) => ({
        id: p.id,
        userId: p.userId,
        name: p.name,
        isBot: p.isBot,
        rank: p.rank,
        bankrupt: p.out,
        netWorth: this.worth(p),
        cash: p.cash,
        loans: p.loans,
        savings: p.savings,
        stats: p.stats,
      })),
    };
  }

  forfeit(pid) {
    const p = this.player(pid);
    if (!p || p.out || this.over) return;
    const wasCur = p === this.cur;
    p.out = true;
    this.say(`🏳️ ${p.name} abandonne la partie.`, p.id);
    this.emit({ t: 'out', pid: p.id }, 400);
    const left = this.active;
    if (left.length === 1) this.finish(left[0]);
    else if (left.every((q) => q.done)) this.finish();
    else if (wasCur) {
      this.pending = null;
      this.nextTurn();
    }
    this.flush();
  }

  setConnected(pid, connected) {
    const p = this.player(pid);
    if (!p) return;
    p.connected = connected;
    if (!this.over) this.schedule();
  }

  // ------------------------------------------------------------------- bots
  /** Reste-t-il une case « acheteur » avant la fin de la partie ? */
  buyerAhead(p) {
    if (p.month < this.settings.months) return true;
    for (let d = p.day + 1; d < PAYDAY; d++) if (DAYS[d].k === 'buyer') return true;
    return false;
  }
  botChoice(p, cautious = false) {
    const pd = this.pending;
    if (!pd) return null;
    if (pd.type === 'deal') {
      const c = pd.card;
      if (cautious || !this.buyerAhead(p)) return 'pass';
      if (p.cash - c.cost >= 300) return 'buy';
      return p.loans + c.cost <= 6000 && p.month < this.settings.months ? 'buy' : 'pass';
    }
    if (pd.type === 'buyer') {
      const best = p.deals.slice().sort((a, b) => b.value - a.value)[0];
      return best ? best.uid : 'keep';
    }
    if (pd.type === 'bet') return !cautious && p.cash >= 1500 ? 'bet' : 'pass';
    if (pd.type === 'payday') {
      if (cautious) return 'done';
      const last = p.month >= this.settings.months;
      const canRepay = p.loans > 0 && p.cash >= LOAN_UNIT;
      if (canRepay) {
        const max = Math.min(p.loans, Math.floor(p.cash / LOAN_UNIT) * LOAN_UNIT);
        if (last || p.cash - max >= 800) return 'all';
        if (p.cash >= 2000) return 'one';
      }
      // Bot prudent : garde 1 000 € en poche et épargne le reste (sauf au dernier mois)
      const extra = Math.floor((p.cash - 1000) / SAVE_UNIT) * SAVE_UNIT;
      if (!last && p.loans === 0 && extra >= SAVE_UNIT && this.settings.savingsRate > 0) return 'save:' + extra;
      return 'done';
    }
    return null;
  }

  // --------------------------------------------------------- minuteur, sortie
  autoAct() {
    if (this.over) return;
    const p = this.cur;
    let res;
    if (this.phase === 'roll') res = this.doRoll(p);
    else res = this.decide(p, this.botChoice(p, !p.isBot));
    if (res && res.error) this.endTurn(p);
    this.flush();
  }

  schedule() {
    clearTimeout(this.timer);
    if (this.over) return;
    const base = Math.max(0, this.anim - (Date.now() - (this.flushedAt || Date.now())));
    const p = this.cur;
    const tt = this.settings.turnTime * 1000;
    if (p.isBot) {
      this.deadline = null;
      this.timer = setTimeout(() => this.autoAct(), base + 1400 + R.int(0, 900));
      return;
    }
    if (!p.connected || p.afk) {
      this.deadline = Date.now() + base + 4000;
      this.timer = setTimeout(() => this.autoAct(), base + 4000);
      return;
    }
    if (tt) {
      this.deadline = Date.now() + base + tt;
      this.timer = setTimeout(() => {
        p.timeouts++;
        if (p.timeouts >= 3) p.afk = true;
        this.autoAct();
      }, base + tt);
    } else this.deadline = null;
  }

  flush() {
    this.flushedAt = Date.now();
    const events = this.events;
    this.events = [];
    this.schedule();
    this.anim = 0;
    this.onUpdate({ events, state: this.publicState() });
  }

  publicState() {
    const s = this.settings;
    return {
      kind: 'mois',
      round: this.round,
      turns: this.turns,
      phase: this.phase,
      current: this.cur ? this.cur.id : null,
      dice: this.dice,
      pending: this.pending ? { ...this.pending } : null,
      cagnotte: this.cagnotte,
      board: DAYS,
      players: this.players.map((p) => ({
        id: p.id,
        name: p.name,
        color: p.color,
        pawn: p.pawn,
        isBot: p.isBot,
        role: p.role,
        vip: p.vip,
        level: p.level,
        connected: p.connected,
        afk: p.afk,
        cash: p.cash,
        loans: p.loans,
        savings: p.savings,
        bills: p.bills.map((b) => ({ uid: b.uid, icon: b.icon, name: b.name, amount: b.amount })),
        deals: p.deals.map((d) => ({ uid: d.uid, icon: d.icon, name: d.name, cost: d.cost, value: d.value })),
        day: p.day,
        month: p.month,
        done: p.done,
        out: p.out,
        bankrupt: p.out,
        rank: p.rank,
        netWorth: this.worth(p),
      })),
      log: this.log.slice(-40),
      deadline: this.deadline,
      serverNow: Date.now(),
      over: this.over,
      winner: this.winner,
      settings: { months: s.months, salary: s.salary, savingsRate: s.savingsRate, startCash: s.startCash, loanRate: s.loanRate, jackpotSix: s.jackpotSix, sundayBet: s.sundayBet, tombola: s.tombola, unsoldValue: s.unsoldValue },
    };
  }

  destroy() {
    clearTimeout(this.timer);
    this.over = true;
  }
}

module.exports = { MonthGame, PAYDAY, DAYS };
