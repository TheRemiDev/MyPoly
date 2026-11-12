'use strict';
/**
 * Poker — Texas Hold'em sans limite (moteur côté serveur, autoritaire).
 *
 * - Tout le hasard (mélange) passe par le CSPRNG du serveur (module random).
 * - Les cartes privées d'un joueur ne quittent jamais le serveur, sauf vers lui-même
 *   et à l'abattage (quand elles sont montrées à tous).
 * - Format « tournoi » : chacun commence avec le même tapis, les blindes montent,
 *   un joueur sans jetons est éliminé. Le dernier en lice (ou le plus gros tapis
 *   après le nombre de mains choisi) gagne.
 */
const R = require('../game/random');
const E = require('../../public/js/poker-eval.js');

const STREETS = ['preflop', 'flop', 'turn', 'river'];
const STREET_NAMES = { flop: 'Le flop', turn: 'Le turn', river: 'La river' };
/** Tirage flottant sûr pour les simulations des bots. */
const rnd = () => R.int(0, 999999) / 1000000;

class PokerGame {
  constructor({ players, settings, onUpdate, onEnd }) {
    this.kind = 'poker';
    this.settings = settings;
    this.onUpdate = onUpdate || (() => {});
    this.onEnd = onEnd || (() => {});
    this.players = players.map((p) => ({
      id: p.id,
      userId: p.userId || null,
      name: p.name,
      color: p.color,
      pawn: p.pawn,
      isBot: !!p.isBot,
      role: p.role,
      vip: !!p.vip,
      level: p.level || 0,
      connected: true,
      afk: false,
      timeouts: 0,
      stack: settings.startStack,
      hole: [],
      bet: 0, // mise sur le tour d'enchères en cours
      total: 0, // total misé sur la main
      folded: false,
      allIn: false,
      acted: false,
      capped: false, // relance incomplète adverse : ne peut que suivre ou se coucher
      inHand: false,
      out: false, // éliminé (ou a abandonné)
      forfeit: false,
      rank: 0,
      last: null, // dernière action affichée sur sa fiche
      // Style des bots : un peu plus ou moins agressif / large
      style: p.isBot ? { aggr: 0.75 + R.int(0, 60) / 100, loose: 0.8 + R.int(0, 50) / 100 } : null,
      stats: { hands: 0, won: 0, biggestPot: 0, bestCat: -1, allInWins: 0, showdowns: 0, showdownWins: 0, vpip: 0, raises: 0, folds: 0, royal: 0, quads: 0, bluffWins: 0, maxStack: settings.startStack },
    }));
    this.handNo = 0;
    this.dealer = -1;
    this.sbIdx = -1;
    this.bbIdx = -1;
    this.level = 0;
    this.sb = settings.bigBlind / 2;
    this.bb = settings.bigBlind;
    this.deck = [];
    this.board = [];
    this.street = 'preflop';
    this.phase = 'bet';
    this.turn = -1;
    this.currentBet = 0;
    this.minRaise = this.bb;
    this.shown = {};
    this.lastShowdown = null;
    this.actions = 0;
    this.pendingHand = false;
    this.events = [];
    this.anim = 0;
    this.log = [];
    this.over = false;
    this.winner = null;
    this.deadline = null;
    this.timer = null;
    this.botTimers = [];
    this.seq = 0;
    this.startedAt = Date.now();
  }

  // ------------------------------------------------------------- utilitaires
  player(id) {
    return this.players.find((p) => p.id === id);
  }
  get cur() {
    return this.turn >= 0 ? this.players[this.turn] : null;
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
  /** Prochain index (sens des aiguilles d'une montre) vérifiant pred. */
  nextIdx(from, pred) {
    const n = this.players.length;
    for (let s = 1; s <= n; s++) {
      const j = (from + s + n) % n;
      if (pred(this.players[j])) return j;
    }
    return -1;
  }
  alive(p) {
    return !p.out && p.stack > 0;
  }
  canAct(p) {
    return p.inHand && !p.folded && !p.allIn;
  }
  get contenders() {
    return this.players.filter((p) => p.inHand && !p.folded);
  }
  potTotal() {
    return this.players.reduce((s, p) => s + p.total, 0);
  }
  /** Montant joli : multiple de la petite blinde. */
  roundChips(x) {
    const u = Math.max(1, this.sb);
    return Math.max(u, Math.round(x / u) * u);
  }

  // ------------------------------------------------------------ déroulement
  start() {
    this.say(`La partie de poker commence : ${this.players.length} joueurs, ${this.settings.startStack} jetons chacun, blindes ${this.bb / 2}/${this.bb}.`);
    this.startHand();
    this.flush();
  }

  startHand() {
    const alive = this.players.filter((p) => this.alive(p));
    if (alive.length < 2) return this.finish();
    if (this.settings.maxHands && this.handNo >= this.settings.maxHands) return this.finish('hands');
    this.handNo++;
    // Montée des blindes
    const lvl = this.settings.blindUp ? Math.floor((this.handNo - 1) / this.settings.blindUp) : 0;
    if (lvl !== this.level) {
      this.level = lvl;
      this.bb = this.settings.bigBlind * 2 ** lvl;
      this.sb = this.bb / 2;
      this.emit({ t: 'blinds', sb: this.sb, bb: this.bb, level: lvl }, 1800);
      this.say(`Les blindes montent : ${this.sb}/${this.bb}.`);
    } else {
      this.bb = this.settings.bigBlind * 2 ** lvl;
      this.sb = this.bb / 2;
    }
    // Bouton du donneur et blindes
    this.dealer = this.dealer < 0 ? this.players.indexOf(R.pick(alive)) : this.nextIdx(this.dealer, (p) => this.alive(p));
    if (alive.length === 2) {
      this.sbIdx = this.dealer;
      this.bbIdx = this.nextIdx(this.dealer, (p) => this.alive(p));
    } else {
      this.sbIdx = this.nextIdx(this.dealer, (p) => this.alive(p));
      this.bbIdx = this.nextIdx(this.sbIdx, (p) => this.alive(p));
    }
    for (const p of this.players) {
      p.hole = [];
      p.bet = 0;
      p.total = 0;
      p.folded = false;
      p.allIn = false;
      p.acted = false;
      p.capped = false;
      p.last = null;
      p.inHand = this.alive(p);
      p.startStack = p.stack;
      if (p.inHand) p.stats.hands++;
    }
    this.deck = R.shuffle(E.fullDeck());
    this.board = [];
    this.shown = {};
    this.lastShowdown = null;
    this.street = 'preflop';
    this.phase = 'bet';
    this.pendingHand = false;
    // Distribution : une carte à chacun, deux fois, en commençant à gauche du donneur
    const order = [];
    let i = this.dealer;
    for (let k = 0; k < alive.length; k++) {
      i = this.nextIdx(i, (p) => p.inHand);
      order.push(i);
    }
    for (let r = 0; r < 2; r++) for (const j of order) this.players[j].hole.push(this.deck.pop());
    const sbP = this.players[this.sbIdx];
    const bbP = this.players[this.bbIdx];
    this.emit({ t: 'hand', hand: this.handNo, dealer: this.players[this.dealer].id, sbPid: sbP.id, bbPid: bbP.id, sb: this.sb, bb: this.bb, order: order.map((j) => this.players[j].id) }, 900);
    this.say(`Main n°${this.handNo} : ${this.players[this.dealer].name} distribue.`);
    this.pay(sbP, this.sb);
    sbP.last = { a: 'sb', amount: sbP.bet };
    this.pay(bbP, this.bb);
    bbP.last = { a: 'bb', amount: bbP.bet };
    this.emit({ t: 'blind', pid: sbP.id, amount: sbP.bet, kind: 'sb', stack: sbP.stack }, 450);
    this.emit({ t: 'blind', pid: bbP.id, amount: bbP.bet, kind: 'bb', stack: bbP.stack }, 450);
    this.emit({ t: 'deal', order: order.map((j) => this.players[j].id) }, 500 + order.length * 2 * 170);
    this.currentBet = this.bb;
    this.minRaise = this.bb;
    // Premier à parler : à gauche de la grosse blinde (en tête-à-tête : le donneur)
    this.turn = alive.length === 2 ? this.dealer : (this.bbIdx + 1) % this.players.length;
    this.advance(true);
  }

  /** Met des jetons au pot (plafonné au tapis : tapis = all-in). */
  pay(p, amount) {
    const put = Math.max(0, Math.min(amount, p.stack));
    p.stack -= put;
    p.bet += put;
    p.total += put;
    if (p.stack === 0) p.allIn = true;
    return put;
  }

  // --------------------------------------------------------------- actions
  act(pid, type, data = {}) {
    if (this.over) return { error: 'La partie est terminée.' };
    const p = this.player(pid);
    if (!p || p.out) return { error: 'Vous ne jouez pas dans cette partie.' };
    if (this.phase !== 'bet' || p !== this.cur) return { error: 'Ce n\'est pas votre tour.' };
    p.timeouts = 0;
    p.afk = false;
    const res = this.handle(p, type, data);
    if (!res || !res.error) this.flush();
    return res || { ok: true };
  }

  /** Coups possibles pour le joueur dont c'est le tour. */
  legal(p) {
    const toCall = Math.max(0, this.currentBet - p.bet);
    const maxTo = p.bet + p.stack;
    const minTo = this.currentBet === 0 ? Math.min(maxTo, this.bb) : Math.min(maxTo, this.currentBet + this.minRaise);
    return { toCall: Math.min(toCall, p.stack), canCheck: toCall === 0, minTo, maxTo, canRaise: !p.capped && maxTo > this.currentBet, currentBet: this.currentBet };
  }

  handle(p, type, data) {
    const L = this.legal(p);
    const before = this.currentBet;
    let a = type;
    let put = 0;
    switch (type) {
      case 'fold':
        p.folded = true;
        p.last = { a: 'fold' };
        p.stats.folds++;
        this.say(`${p.name} se couche.`, p.id);
        break;
      case 'check':
        if (!L.canCheck) return { error: `Il faut suivre (${L.toCall}) ou se coucher.` };
        p.last = { a: 'check' };
        this.say(`${p.name} parle (check).`, p.id);
        break;
      case 'call':
        if (L.canCheck) return this.handle(p, 'check', data);
        put = this.pay(p, L.toCall);
        a = p.allIn ? 'allin' : 'call';
        p.last = { a, amount: p.bet };
        if (this.street === 'preflop') p.vpipHand = true;
        this.say(p.allIn ? `${p.name} suit et fait tapis (${p.bet}).` : `${p.name} suit ${put}.`, p.id);
        break;
      case 'allin':
        if (L.maxTo <= this.currentBet || !L.canRaise) return this.handle(p, 'call', data);
        return this.handle(p, 'raise', { to: L.maxTo });
      case 'raise': {
        if (!L.canRaise) return L.toCall > 0 ? { error: 'Relance impossible : vous pouvez seulement suivre ou vous coucher.' } : { error: 'Relance impossible.' };
        let to = Math.floor(Number(data.to));
        if (!Number.isFinite(to)) return { error: 'Montant invalide.' };
        if (to >= L.maxTo) to = L.maxTo;
        if (to <= this.currentBet) return this.handle(p, 'call', data);
        if (to < L.minTo) return { error: `${this.currentBet ? 'Relance' : 'Mise'} minimum : ${L.minTo}.` };
        const raiseSize = to - this.currentBet;
        put = this.pay(p, to - p.bet);
        const full = raiseSize >= this.minRaise;
        for (const q of this.players) {
          if (q === p || !this.canAct(q)) continue;
          if (full) {
            q.acted = false;
            q.capped = false;
          } else if (q.acted) {
            q.acted = false;
            q.capped = true;
          }
        }
        if (full) this.minRaise = raiseSize;
        this.currentBet = Math.max(this.currentBet, p.bet);
        a = p.allIn ? 'allin' : before === 0 ? 'bet' : 'raise';
        p.last = { a, amount: p.bet };
        p.stats.raises++;
        if (this.street === 'preflop') p.vpipHand = true;
        this.say(p.allIn ? `${p.name} fait tapis : ${p.bet} !` : before === 0 ? `${p.name} mise ${p.bet}.` : `${p.name} relance à ${p.bet}.`, p.id);
        break;
      }
      default:
        return { error: 'Action inconnue.' };
    }
    p.acted = true;
    this.actions++;
    this.emit({ t: 'act', pid: p.id, a, to: p.bet, put, stack: p.stack, pot: this.potTotal() }, a === 'fold' ? 650 : a === 'check' ? 550 : 900);
    this.advance();
    return { ok: true };
  }

  /** Joueur suivant, fin du tour d'enchères, ou fin de la main. */
  advance(fromStart = false) {
    const live = this.contenders;
    if (live.length === 1) return this.uncontested(live[0]);
    const actors = live.filter((p) => !p.allIn);
    let needs = actors.filter((p) => !p.acted || p.bet < this.currentBet);
    if (actors.length === 1 && actors[0].bet >= this.currentBet) needs = [];
    if (!actors.length) needs = [];
    if (needs.length) {
      const set = new Set(needs);
      const from = fromStart ? (this.turn - 1 + this.players.length) % this.players.length : this.turn;
      this.turn = this.nextIdx(from, (p) => set.has(p));
      return;
    }
    this.endStreet();
  }

  endStreet() {
    if (this.players.some((p) => p.bet > 0)) this.emit({ t: 'collect', pot: this.potTotal() }, 650);
    for (const p of this.players) {
      p.bet = 0;
      p.acted = false;
      p.capped = false;
      if (p.last && p.last.a !== 'fold' && p.last.a !== 'allin') p.last = null;
    }
    this.currentBet = 0;
    this.minRaise = this.bb;
    if (this.street === 'river') return this.showdown();
    const actors = this.contenders.filter((p) => !p.allIn);
    if (actors.length <= 1) {
      // Plus personne ne peut miser : on retourne les cartes et on déroule le tableau
      this.revealAll();
      while (this.street !== 'river') this.dealStreet(1700);
      return this.showdown();
    }
    this.dealStreet(this.street === 'preflop' ? 1500 : 1100);
    this.turn = this.nextIdx(this.dealer, (p) => this.canAct(p));
  }

  dealStreet(ms) {
    const next = STREETS[STREETS.indexOf(this.street) + 1];
    this.deck.pop(); // carte brûlée
    const n = next === 'flop' ? 3 : 1;
    const cards = [];
    for (let k = 0; k < n; k++) cards.push(this.deck.pop());
    this.board.push(...cards);
    this.street = next;
    this.emit({ t: 'street', street: next, cards, board: this.board.slice() }, ms);
    this.say(`${STREET_NAMES[next]} : ${cards.map(E.cardName).join(', ')}.`);
  }

  revealAll() {
    const hands = [];
    for (const p of this.contenders) {
      if (this.shown[p.id]) continue;
      this.shown[p.id] = p.hole.slice();
      hands.push({ pid: p.id, cards: p.hole.slice() });
    }
    if (hands.length) this.emit({ t: 'reveal', hands }, 1500);
  }

  /** Pots (principal et secondaires) d'après ce que chacun a misé sur la main. */
  buildPots() {
    const live = this.contenders;
    const levels = [...new Set(live.map((p) => p.total))].filter((x) => x > 0).sort((a, b) => a - b);
    const pots = [];
    let prev = 0;
    for (const L of levels) {
      let amount = 0;
      for (const p of this.players) amount += Math.min(p.total, L) - Math.min(p.total, prev);
      const eligible = live.filter((p) => p.total >= L).map((p) => p.id);
      if (amount > 0) {
        const last = pots[pots.length - 1];
        if (last && last.eligible.length === eligible.length) last.amount += amount;
        else pots.push({ amount, eligible });
      }
      prev = L;
    }
    // Jetons des joueurs couchés au-delà du plus haut niveau : au dernier pot
    const extra = this.players.reduce((s, p) => s + Math.max(0, p.total - prev), 0);
    if (extra && pots.length) pots[pots.length - 1].amount += extra;
    return pots;
  }

  showdown() {
    this.street = 'showdown';
    const live = this.contenders;
    const evals = {};
    const hands = live.map((p) => {
      const all = p.hole.concat(this.board);
      const ev = E.evaluate(all);
      evals[p.id] = ev;
      this.shown[p.id] = p.hole.slice();
      p.stats.showdowns++;
      return { pid: p.id, cards: p.hole.slice(), name: E.describe(ev), cat: ev.cat, best: E.bestFive(all) };
    });
    const pots = this.buildPots();
    const payouts = {};
    // Ordre des jetons indivisibles : à partir de la gauche du donneur
    const seatOrder = [];
    let i = this.dealer;
    for (let k = 0; k < this.players.length; k++) {
      i = (i + 1) % this.players.length;
      seatOrder.push(this.players[i].id);
    }
    const potInfo = pots.map((pot, k) => {
      const best = Math.max(...pot.eligible.map((id) => evals[id].score));
      const winners = pot.eligible.filter((id) => evals[id].score === best).sort((a, b) => seatOrder.indexOf(a) - seatOrder.indexOf(b));
      const share = Math.floor(pot.amount / winners.length);
      let rest = pot.amount - share * winners.length;
      const shares = {};
      for (const id of winners) {
        const amt = share + (rest > 0 ? 1 : 0);
        if (rest > 0) rest--;
        shares[id] = amt;
        payouts[id] = (payouts[id] || 0) + amt;
      }
      return { amount: pot.amount, winners, shares, main: k === 0, contested: pot.eligible.length > 1 };
    });
    for (const [id, amt] of Object.entries(payouts)) {
      const p = this.player(id);
      p.stack += amt;
      this.recordWin(p, amt, evals[id]);
      p.stats.showdownWins++;
    }
    const winnersAll = Object.keys(payouts);
    this.lastShowdown = { hand: this.handNo, hands, pots: potInfo, board: this.board.slice() };
    this.emit({ t: 'showdown', hands, pots: potInfo, board: this.board.slice() }, 4200 + Math.max(0, potInfo.length - 1) * 900);
    for (const pot of potInfo) {
      const names = pot.winners.map((id) => this.player(id).name).join(' et ');
      const label = potInfo.length > 1 ? (pot.main ? 'le pot principal' : 'un pot secondaire') : 'le pot';
      const how = pot.contested ? ` avec ${hands.find((x) => x.pid === pot.winners[0]).name.toLowerCase()}` : '';
      if (!pot.contested) this.say(`${names} récupère ${pot.amount} (mise non suivie).`, pot.winners[0]);
      else this.say(`${names} ${pot.winners.length > 1 ? 'se partagent' : 'remporte'} ${label} (${pot.amount})${how}.`, pot.winners[0]);
    }
    if (!winnersAll.length) this.say('Personne ne remporte le pot ?!');
    this.endHand();
  }

  uncontested(p) {
    const amount = this.potTotal();
    if (this.players.some((q) => q.bet > 0)) this.emit({ t: 'collect', pot: amount }, 500);
    for (const q of this.players) q.bet = 0;
    p.stack += amount;
    this.recordWin(p, amount, null);
    // Gagner sans abattage avec une main faible : un bluff réussi !
    const ev = E.evaluate(p.hole.concat(this.board));
    if (this.board.length >= 3 && ev.cat === 0 && amount >= this.bb * 6) p.stats.bluffWins++;
    this.lastShowdown = { hand: this.handNo, hands: [], pots: [{ amount, winners: [p.id], shares: { [p.id]: amount }, main: true, contested: false }], board: this.board.slice() };
    this.emit({ t: 'win', pid: p.id, amount }, 1700);
    this.say(`${p.name} remporte ${amount} : tout le monde s'est couché.`, p.id);
    this.endHand();
  }

  recordWin(p, amount, ev) {
    p.stats.won++;
    p.stats.biggestPot = Math.max(p.stats.biggestPot, amount);
    if (p.allIn) p.stats.allInWins++;
    if (ev) {
      p.stats.bestCat = Math.max(p.stats.bestCat, ev.cat);
      if (ev.cat === 8 && ev.ranks[0] === 14) p.stats.royal++;
      if (ev.cat === 7) p.stats.quads++;
    }
  }

  endHand() {
    this.phase = 'between';
    this.turn = -1;
    this.currentBet = 0;
    for (const p of this.players) {
      p.total = 0; // le pot a été distribué
      p.bet = 0;
      if (p.vpipHand) p.stats.vpip++;
      p.vpipHand = false;
      p.stats.maxStack = Math.max(p.stats.maxStack, p.stack);
    }
    // Éliminations (en cas d'élimination simultanée, le plus gros tapis de départ est mieux classé)
    const busted = this.players.filter((p) => p.inHand && !p.out && p.stack === 0).sort((a, b) => b.startStack - a.startStack);
    const remaining = this.players.filter((p) => !p.out && p.stack > 0).length;
    busted.forEach((p, k) => {
      p.out = true;
      p.rank = remaining + 1 + k;
      this.emit({ t: 'bust', pid: p.id, rank: p.rank }, 1600);
      this.say(`${p.name} est éliminé(e) (${p.rank}e).`, p.id);
    });
    const alive = this.players.filter((p) => !p.out);
    if (alive.length <= 1) return this.finish();
    if (this.settings.maxHands && this.handNo >= this.settings.maxHands) return this.finish('hands');
    this.pendingHand = true;
  }

  finish(reason = 'last') {
    if (this.over) return { ok: true };
    this.over = true;
    this.phase = 'over';
    this.turn = -1;
    clearTimeout(this.timer);
    // Jetons encore au milieu (fin forcée en cours de main) : rendus à leurs propriétaires
    for (const p of this.players) {
      if (p.total && !p.forfeit) p.stack += p.total;
      p.total = 0;
      p.bet = 0;
    }
    const alive = this.players.filter((p) => !p.out).sort((a, b) => b.stack - a.stack);
    alive.forEach((p, k) => (p.rank = k + 1));
    const busted = this.players.filter((p) => p.out && !p.forfeit).sort((a, b) => a.rank - b.rank);
    let r = alive.length;
    for (const p of busted) p.rank = ++r;
    for (const p of this.players.filter((q) => q.forfeit)) p.rank = ++r;
    const winner = alive[0] || null;
    this.winner = winner ? winner.id : null;
    this.winType = reason === 'hands' ? 'hands' : reason;
    if (winner) this.say(reason === 'hands' ? `Fin des ${this.settings.maxHands} mains : ${winner.name} gagne avec le plus gros tapis (${winner.stack}) !` : `${winner.name} remporte la partie de poker !`, winner.id);
    this.emit({ t: 'over', pid: this.winner }, 600);
    this.endedAt = Date.now();
    this.onEnd(this.result());
    return { ok: true };
  }

  result() {
    return {
      kind: 'poker',
      winner: this.winner,
      winType: 'poker',
      duration: Math.round(((this.endedAt || Date.now()) - this.startedAt) / 1000),
      rounds: this.handNo,
      turns: this.actions,
      hands: this.handNo,
      players: this.players.map((p) => ({
        id: p.id,
        userId: p.userId,
        name: p.name,
        isBot: p.isBot,
        rank: p.rank,
        bankrupt: p.out,
        netWorth: p.stack,
        stack: p.stack,
        stats: p.stats,
      })),
    };
  }

  forfeit(pid) {
    const p = this.player(pid);
    if (!p || p.out || this.over) return;
    const wasCur = p === this.cur && this.phase === 'bet';
    p.out = true;
    p.forfeit = true;
    if (p.inHand && !p.folded) p.folded = true;
    p.last = { a: 'fold' };
    p.stack = 0;
    this.say(`${p.name} quitte la table.`, p.id);
    this.emit({ t: 'out', pid: p.id }, 500);
    const alive = this.players.filter((q) => !q.out);
    if (this.phase === 'bet' && this.contenders.length <= 1) this.advance();
    else if (wasCur) this.advance();
    if (!this.over && alive.length <= 1) this.finish();
    this.flush();
  }

  setConnected(pid, connected) {
    const p = this.player(pid);
    if (!p) return;
    p.connected = connected;
    if (!this.over) this.schedule();
  }

  // ------------------------------------------------------------------- bots
  botDecide(p) {
    const L = this.legal(p);
    const st = p.style || { aggr: 1, loose: 1 };
    const opp = Math.max(1, this.contenders.length - 1);
    const eq = E.equity(p.hole, this.board, opp, 260, rnd);
    const strength = eq.win + eq.tie;
    // Force relative : 1 = une main « moyenne » face à ce nombre d'adversaires
    const rel = strength * (opp + 1);
    const pot = this.potTotal();
    const r = rnd();
    const raiseTo = (frac) => {
      let to = this.roundChips(this.currentBet + Math.max(this.minRaise, (pot + L.toCall) * frac));
      to = Math.max(L.minTo, Math.min(L.maxTo, to));
      return { type: 'raise', to };
    };
    if (L.canCheck) {
      if (L.canRaise && rel > 1.7 && r < 0.75 * st.aggr) return raiseTo(0.55 + rnd() * 0.35);
      if (L.canRaise && rel > 1.2 && r < 0.4 * st.aggr) return raiseTo(0.45);
      if (L.canRaise && r < 0.06 * st.aggr) return raiseTo(0.5); // bluff
      return { type: 'check' };
    }
    const odds = L.toCall / (pot + L.toCall);
    if (L.canRaise && rel > 2 && r < 0.55 * st.aggr) {
      if (strength > 0.8 && rnd() < 0.3) return { type: 'allin' };
      return raiseTo(0.7);
    }
    if (strength >= odds * (0.95 / st.loose) + 0.03) return { type: 'call' };
    if (L.toCall <= this.bb && rel > 0.75) return { type: 'call' };
    if (r < 0.04 * st.loose && L.toCall < p.stack * 0.2) return { type: 'call' };
    return { type: 'fold' };
  }

  // --------------------------------------------------------- minuteur, sortie
  autoAct(useBot) {
    if (this.over) return;
    if (this.pendingHand) {
      this.pendingHand = false;
      this.startHand();
      this.flush();
      return;
    }
    const p = this.cur;
    if (!p || this.phase !== 'bet') return;
    const L = this.legal(p);
    let action = useBot ? this.botDecide(p) : L.canCheck ? { type: 'check' } : { type: 'fold' };
    if (!useBot) this.say(`Temps écoulé : ${p.name} ${L.canCheck ? 'parle' : 'se couche'} automatiquement.`, p.id);
    let res = this.handle(p, action.type, action);
    if (res && res.error) res = this.handle(p, L.canCheck ? 'check' : 'fold', {});
    this.flush();
  }

  schedule() {
    clearTimeout(this.timer);
    if (this.over) return;
    const base = Math.max(0, this.anim - (Date.now() - (this.flushedAt || Date.now())));
    if (this.pendingHand) {
      this.deadline = null;
      this.timer = setTimeout(() => this.autoAct(true), base + 1600);
      return;
    }
    const p = this.cur;
    if (!p || this.phase !== 'bet') {
      this.deadline = null;
      return;
    }
    if (p.isBot) {
      this.deadline = null;
      this.timer = setTimeout(() => this.autoAct(true), base + R.int(900, 2100));
      return;
    }
    if (!p.connected || p.afk) {
      this.deadline = Date.now() + base + 5000;
      this.timer = setTimeout(() => this.autoAct(false), base + 5000);
      return;
    }
    const tt = this.settings.turnTime * 1000;
    if (tt) {
      this.deadline = Date.now() + base + tt;
      this.timer = setTimeout(() => {
        p.timeouts++;
        if (p.timeouts >= 3) p.afk = true;
        this.autoAct(false);
      }, base + tt);
    } else this.deadline = null;
  }

  flush() {
    this.flushedAt = Date.now();
    const events = this.events;
    this.events = [];
    this.schedule();
    this.anim = 0;
    this.seq++;
    this.onUpdate({ events, seq: this.seq });
  }

  /** Aucun évènement ne contient de carte privée : ils sont identiques pour tous. */
  eventsFor(events) {
    return events;
  }

  /** État visible par un joueur (ou un spectateur si viewer est null). */
  publicState(viewer = null) {
    const me = viewer ? this.player(viewer) : null;
    const cur = this.cur;
    const pot = this.potTotal();
    const nextIn = this.settings.blindUp ? this.settings.blindUp - ((this.handNo - 1) % this.settings.blindUp) : 0;
    return {
      kind: 'poker',
      hand: this.handNo,
      phase: this.phase,
      street: this.street,
      board: this.board.slice(),
      pot,
      potBefore: pot - this.players.reduce((s, p) => s + p.bet, 0),
      current: cur && this.phase === 'bet' ? cur.id : null,
      dealer: this.dealer >= 0 ? this.players[this.dealer].id : null,
      sbPid: this.sbIdx >= 0 ? this.players[this.sbIdx].id : null,
      bbPid: this.bbIdx >= 0 ? this.players[this.bbIdx].id : null,
      blinds: { sb: this.sb, bb: this.bb, level: this.level, nextIn },
      currentBet: this.currentBet,
      minRaise: this.minRaise,
      legal: me && cur === me && this.phase === 'bet' && !this.over ? this.legal(me) : null,
      hole: me && me.inHand ? me.hole.slice() : null,
      lastShowdown: this.lastShowdown,
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
        stack: p.stack,
        bet: p.bet,
        total: p.total,
        folded: p.folded,
        allIn: p.allIn,
        inHand: p.inHand,
        out: p.out,
        bankrupt: p.out,
        rank: p.rank,
        netWorth: p.stack,
        last: p.last,
        cards: this.shown[p.id] || null,
        hasCards: p.inHand && !p.folded && p.hole.length === 2,
      })),
      log: this.log.slice(-40),
      deadline: this.deadline,
      serverNow: Date.now(),
      over: this.over,
      winner: this.winner,
      settings: { startStack: this.settings.startStack, bigBlind: this.settings.bigBlind, blindUp: this.settings.blindUp, maxHands: this.settings.maxHands, turnTime: this.settings.turnTime },
    };
  }

  destroy() {
    clearTimeout(this.timer);
    this.over = true;
  }
}

module.exports = { PokerGame };
