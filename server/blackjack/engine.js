'use strict';
/**
 * Blackjack — les joueurs contre la banque (moteur côté serveur, autoritaire).
 *
 * - Sabot de plusieurs jeux mélangé par le CSPRNG du serveur, remélangé quand il
 *   ne reste qu'un quart des cartes.
 * - La carte cachée de la banque ne quitte jamais le serveur avant d'être retournée.
 * - Chaque manche : mises, distribution, tour des joueurs (tirer, rester, doubler,
 *   séparer), jeu de la banque (tire jusqu'à 16, reste à 17), paiements.
 * - Après le nombre de manches choisi, le joueur le plus riche gagne. Un joueur qui
 *   n'a plus de quoi miser le minimum est éliminé.
 */
const R = require('../game/random');

const rankOf = (c) => (c >> 2) + 2; // 2..14 (As = 14)
/** Valeur d'une carte au blackjack (As = 1 ici, compté 11 si possible dans le total). */
const cardValue = (c) => {
  const r = rankOf(c);
  return r === 14 ? 1 : r >= 10 ? 10 : r;
};
/** Total d'une main : { total, soft } (soft = un As compte 11). */
function handValue(cards) {
  let sum = 0;
  let ace = false;
  for (const c of cards) {
    if (c == null) continue;
    sum += cardValue(c);
    if (rankOf(c) === 14) ace = true;
  }
  if (ace && sum + 10 <= 21) return { total: sum + 10, soft: true };
  return { total: sum, soft: false };
}
const isBlackjack = (hand) => !hand.fromSplit && hand.cards.length === 2 && handValue(hand.cards).total === 21;
const NAMES = { 2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9', 10: '10', 11: 'Valet', 12: 'Dame', 13: 'Roi', 14: 'As' };
const SUITS = ['pique', 'cœur', 'carreau', 'trèfle'];
const cardName = (c) => `${NAMES[rankOf(c)]} de ${SUITS[c & 3]}`;

class BlackjackGame {
  constructor({ players, settings, onUpdate, onEnd }) {
    this.kind = 'blackjack';
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
      chips: settings.startChips,
      hands: [],
      lastBet: 0,
      sitting: false, // ne joue pas cette manche (pas de mise à temps)
      out: false,
      forfeit: false,
      rank: 0,
      stats: { hands: 0, won: 0, lost: 0, pushes: 0, blackjacks: 0, doubles: 0, doublesWon: 0, splits: 0, busts: 0, biggestWin: 0, maxChips: settings.startChips, five: 0 },
    }));
    this.round = 0;
    this.shoe = [];
    this.dealer = { cards: [], hidden: true };
    this.phase = 'bet';
    this.turn = -1;
    this.handIdx = 0;
    this.betDeadline = null;
    this.pendingRound = false;
    this.actions = 0;
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
    this.newShoe();
  }

  // ------------------------------------------------------------- utilitaires
  player(id) {
    return this.players.find((p) => p.id === id);
  }
  get cur() {
    return this.phase === 'play' && this.turn >= 0 ? this.players[this.turn] : null;
  }
  get curHand() {
    const p = this.cur;
    return p ? p.hands[this.handIdx] : null;
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
  newShoe() {
    const cards = [];
    for (let d = 0; d < this.settings.decks; d++) for (let c = 0; c < 52; c++) cards.push(c);
    this.shoe = R.shuffle(cards);
    this.shoeSize = cards.length;
  }
  draw() {
    if (!this.shoe.length) this.newShoe();
    return this.shoe.pop();
  }
  maxBetFor(p) {
    return Math.min(p.chips, this.settings.maxBet || p.chips);
  }
  get seated() {
    return this.players.filter((p) => !p.out && p.hands.length);
  }

  // ------------------------------------------------------------ déroulement
  start() {
    this.say(`Le blackjack commence : ${this.settings.rounds} manches, ${this.settings.startChips} jetons chacun. La banque tire jusqu'à 16 et reste à 17.`);
    this.startRound();
    this.flush();
  }

  startRound() {
    const alive = this.players.filter((p) => !p.out);
    if (!alive.length || this.round >= this.settings.rounds) return this.finish();
    this.round++;
    this.phase = 'bet';
    this.turn = -1;
    this.handIdx = 0;
    this.pendingRound = false;
    this.dealer = { cards: [], hidden: true };
    // Remélange quand il reste moins d'un quart du sabot
    if (this.shoe.length < this.shoeSize * 0.25) {
      this.newShoe();
      this.emit({ t: 'shuffle' }, 1600);
      this.say('La banque remélange le sabot.');
    }
    for (const p of this.players) {
      p.hands = [];
      p.sitting = false;
      p.betDone = false;
    }
    this.emit({ t: 'round', round: this.round, rounds: this.settings.rounds }, 1100);
    this.say(`Manche ${this.round} sur ${this.settings.rounds} : faites vos jeux !`);
    this.betDeadline = null;
    // Les bots misent tout de suite
    for (const p of alive) if (p.isBot) this.placeBet(p, this.botBet(p));
    if (this.allBetsIn()) this.deal();
  }

  allBetsIn() {
    return this.players.filter((p) => !p.out).every((p) => p.betDone);
  }

  placeBet(p, amount) {
    p.chips -= amount;
    p.hands = [{ cards: [], bet: amount, done: false, doubled: false, fromSplit: false, outcome: null, payout: 0 }];
    p.lastBet = amount;
    p.betDone = true;
    this.emit({ t: 'bet', pid: p.id, amount, chips: p.chips }, 380);
  }

  /** Distribution : une carte à chacun, une à la banque, une deuxième à chacun, la carte cachée. */
  deal() {
    const ins = this.seated;
    for (const p of this.players) if (!p.out && !p.hands.length) p.sitting = true;
    if (!ins.length) {
      this.say('Personne n\'a misé : manche passée.');
      return this.endRound();
    }
    this.phase = 'play';
    this.betDeadline = null;
    const seq = [];
    for (let pass = 0; pass < 2; pass++) {
      for (const p of ins) {
        const c = this.draw();
        p.hands[0].cards.push(c);
        seq.push({ to: p.id, hand: 0, card: c });
      }
      const c = this.draw();
      this.dealer.cards.push(c);
      seq.push({ to: 'dealer', card: pass === 0 ? c : null });
    }
    for (const p of ins) p.stats.hands++;
    this.emit({ t: 'deal', seq }, 500 + seq.length * 260);
    const up = this.dealer.cards[0];
    // La banque vérifie son blackjack quand elle montre un As ou un 10
    if (cardValue(up) === 1 || cardValue(up) === 10) {
      const bj = handValue(this.dealer.cards).total === 21;
      this.emit({ t: 'peek', blackjack: bj }, 1100);
      if (bj) {
        this.say('La banque a un blackjack !');
        return this.dealerPlay(true);
      }
    }
    for (const p of ins) {
      const h = p.hands[0];
      if (isBlackjack(h)) {
        h.done = true;
        this.emit({ t: 'blackjack', pid: p.id, hand: 0 }, 900);
        this.say(`${p.name} a un blackjack !`, p.id);
      }
    }
    this.turn = -1;
    this.nextHand();
  }

  /** Main suivante à jouer (du joueur en cours, puis des suivants), sinon la banque joue. */
  nextHand() {
    if (this.turn >= 0) {
      const p = this.players[this.turn];
      for (let k = this.handIdx + 1; k < p.hands.length; k++) {
        if (!p.hands[k].done) {
          this.handIdx = k;
          return;
        }
      }
    }
    for (let i = this.turn + 1; i < this.players.length; i++) {
      const p = this.players[i];
      if (p.out || !p.hands.length) continue;
      const k = p.hands.findIndex((x) => !x.done);
      if (k >= 0) {
        this.turn = i;
        this.handIdx = k;
        return;
      }
    }
    this.turn = -1;
    this.dealerPlay(false);
  }

  // --------------------------------------------------------------- actions
  act(pid, type, data = {}) {
    if (this.over) return { error: 'La partie est terminée.' };
    const p = this.player(pid);
    if (!p || p.out) return { error: 'Vous ne jouez pas à cette table.' };
    p.timeouts = 0;
    p.afk = false;
    let res;
    if (type === 'bet') res = this.doBet(p, data);
    else {
      if (p !== this.cur) return { error: 'Ce n\'est pas votre tour.' };
      res = this.handle(p, type);
    }
    if (!res || !res.error) this.flush();
    return res || { ok: true };
  }

  doBet(p, data) {
    if (this.phase !== 'bet') return { error: 'Les mises sont fermées.' };
    if (p.betDone) return { error: 'Vous avez déjà misé.' };
    const amount = Math.floor(Number(data.amount));
    if (!Number.isFinite(amount) || amount < this.settings.minBet) return { error: `Mise minimum : ${this.settings.minBet}.` };
    if (amount > this.maxBetFor(p)) return { error: `Mise maximum : ${this.maxBetFor(p)}.` };
    this.placeBet(p, amount);
    this.say(`${p.name} mise ${amount}.`, p.id);
    if (this.allBetsIn()) this.deal();
    return { ok: true };
  }

  /** Coups possibles pour la main en cours. */
  legal(p) {
    const h = this.curHand;
    if (!h || p !== this.cur) return null;
    const two = h.cards.length === 2;
    const sameValue = two && cardValue(h.cards[0]) === cardValue(h.cards[1]);
    return {
      hand: this.handIdx,
      canHit: true,
      canStand: true,
      canDouble: two && p.chips >= h.bet,
      canSplit: sameValue && p.hands.length < 2 && p.chips >= h.bet,
    };
  }

  handle(p, type) {
    const h = this.curHand;
    const L = this.legal(p);
    if (!h || !L) return { error: 'Ce n\'est pas votre tour.' };
    switch (type) {
      case 'hit': {
        const c = this.draw();
        h.cards.push(c);
        const v = handValue(h.cards);
        this.emit({ t: 'card', pid: p.id, hand: this.handIdx, card: c, total: v.total }, 650);
        if (v.total > 21) {
          h.done = true;
          h.outcome = 'bust';
          p.stats.busts++;
          this.emit({ t: 'bust', pid: p.id, hand: this.handIdx }, 900);
          this.say(`${p.name} tire ${cardName(c)} et dépasse 21 (${v.total}).`, p.id);
        } else if (v.total === 21) {
          h.done = true;
          if (h.cards.length === 5) p.stats.five++;
          this.say(`${p.name} tire ${cardName(c)} : 21 !`, p.id);
        } else this.say(`${p.name} tire ${cardName(c)}.`, p.id);
        break;
      }
      case 'stand':
        h.done = true;
        this.emit({ t: 'stand', pid: p.id, hand: this.handIdx }, 450);
        this.say(`${p.name} reste à ${handValue(h.cards).total}.`, p.id);
        break;
      case 'double': {
        if (!L.canDouble) return { error: 'Vous ne pouvez pas doubler maintenant.' };
        p.chips -= h.bet;
        h.bet *= 2;
        h.doubled = true;
        p.stats.doubles++;
        const c = this.draw();
        h.cards.push(c);
        h.done = true;
        const v = handValue(h.cards);
        this.emit({ t: 'double', pid: p.id, hand: this.handIdx, card: c, bet: h.bet, chips: p.chips, total: v.total }, 1100);
        if (v.total > 21) {
          h.outcome = 'bust';
          p.stats.busts++;
          this.emit({ t: 'bust', pid: p.id, hand: this.handIdx }, 900);
        }
        this.say(`${p.name} double sa mise et tire ${cardName(c)} (${v.total}).`, p.id);
        break;
      }
      case 'split': {
        if (!L.canSplit) return { error: 'Vous ne pouvez pas séparer cette main.' };
        p.chips -= h.bet;
        p.stats.splits++;
        const second = h.cards.pop();
        const nh = { cards: [second], bet: h.bet, done: false, doubled: false, fromSplit: true, outcome: null, payout: 0 };
        h.fromSplit = true;
        p.hands.push(nh);
        const c1 = this.draw();
        const c2 = this.draw();
        h.cards.push(c1);
        nh.cards.push(c2);
        // Des As séparés ne reçoivent qu'une carte chacun
        const aces = rankOf(second) === 14;
        if (aces) {
          h.done = true;
          nh.done = true;
        }
        if (handValue(h.cards).total === 21) h.done = true;
        if (handValue(nh.cards).total === 21) nh.done = true;
        this.emit({ t: 'split', pid: p.id, cards: [h.cards.slice(), nh.cards.slice()], bet: h.bet, chips: p.chips }, 1500);
        this.say(`${p.name} sépare sa paire en deux mains.`, p.id);
        break;
      }
      default:
        return { error: 'Action inconnue.' };
    }
    this.actions++;
    if (h.done || type === 'split') {
      if (type === 'split' && !h.done) return { ok: true };
      this.nextHand();
    }
    return { ok: true };
  }

  /** La banque retourne sa carte cachée et tire jusqu'à 17. */
  dealerPlay(dealerBJ) {
    this.phase = 'dealer';
    this.turn = -1;
    this.dealer.hidden = false;
    this.emit({ t: 'reveal', card: this.dealer.cards[1], total: handValue(this.dealer.cards).total }, 1100);
    const live = this.seated.some((p) => p.hands.some((h) => h.outcome !== 'bust' && !isBlackjack(h)));
    if (!dealerBJ && live) {
      for (;;) {
        const v = handValue(this.dealer.cards);
        if (v.total > 17 || (v.total === 17 && !(v.soft && this.settings.hitSoft17))) break;
        const c = this.draw();
        this.dealer.cards.push(c);
        this.emit({ t: 'dealerCard', card: c, total: handValue(this.dealer.cards).total }, 900);
      }
    }
    const dv = handValue(this.dealer.cards).total;
    this.say(dealerBJ ? 'Blackjack de la banque.' : dv > 21 ? `La banque dépasse 21 (${dv}) !` : `La banque reste à ${dv}.`);
    this.settle(dealerBJ);
  }

  settle(dealerBJ) {
    const dv = handValue(this.dealer.cards).total;
    const results = [];
    for (const p of this.seated) {
      p.hands.forEach((h, k) => {
        const v = handValue(h.cards).total;
        let outcome;
        let payout = 0;
        if (h.outcome === 'bust') outcome = 'bust';
        else if (isBlackjack(h)) {
          if (dealerBJ) {
            outcome = 'push';
            payout = h.bet;
          } else {
            outcome = 'blackjack';
            payout = h.bet + Math.floor((h.bet * this.settings.bjPays) / 100);
          }
        } else if (dealerBJ) outcome = 'lose';
        else if (dv > 21 || v > dv) {
          outcome = 'win';
          payout = h.bet * 2;
        } else if (v === dv) {
          outcome = 'push';
          payout = h.bet;
        } else outcome = 'lose';
        h.outcome = outcome;
        h.payout = payout;
        p.chips += payout;
        const net = payout - h.bet;
        if (outcome === 'win' || outcome === 'blackjack') {
          p.stats.won++;
          if (h.doubled) p.stats.doublesWon++;
        } else if (outcome === 'push') p.stats.pushes++;
        else p.stats.lost++;
        if (outcome === 'blackjack') p.stats.blackjacks++;
        p.stats.biggestWin = Math.max(p.stats.biggestWin, net);
        results.push({ pid: p.id, hand: k, outcome, payout, bet: h.bet, net, total: v });
      });
      p.stats.maxChips = Math.max(p.stats.maxChips, p.chips);
    }
    this.emit({ t: 'settle', results, dealer: dv, dealerBJ }, 2200 + results.length * 450);
    for (const r of results) {
      const p = this.player(r.pid);
      if (r.outcome === 'win' || r.outcome === 'blackjack') this.say(`${p.name} gagne ${r.net}${r.outcome === 'blackjack' ? ' (blackjack)' : ''}.`, p.id);
      else if (r.outcome === 'push') this.say(`${p.name} : égalité, mise rendue.`, p.id);
    }
    this.endRound();
  }

  endRound() {
    this.phase = 'between';
    this.turn = -1;
    // Éliminés : plus de quoi miser le minimum
    const broke = this.players.filter((p) => !p.out && p.chips < this.settings.minBet);
    const alive = this.players.filter((p) => !p.out).length;
    broke.forEach((p, k) => {
      p.out = true;
      p.rank = alive - k;
      this.emit({ t: 'broke', pid: p.id, rank: p.rank }, 1400);
      this.say(`${p.name} n'a plus de jetons : éliminé(e).`, p.id);
    });
    const left = this.players.filter((p) => !p.out);
    if (!left.length || this.round >= this.settings.rounds) return this.finish();
    this.pendingRound = true;
  }

  finish() {
    if (this.over) return { ok: true };
    this.over = true;
    this.phase = 'over';
    this.turn = -1;
    clearTimeout(this.timer);
    // Mises encore sur la table (fin forcée) : rendues
    for (const p of this.players) {
      if (this.phase !== 'between') for (const h of p.hands) if (!h.outcome && !p.forfeit) p.chips += h.bet;
      p.hands = [];
    }
    const alive = this.players.filter((p) => !p.out).sort((a, b) => b.chips - a.chips);
    alive.forEach((p, k) => (p.rank = k + 1));
    let r = alive.length;
    const busted = this.players.filter((p) => p.out && !p.forfeit).sort((a, b) => a.rank - b.rank);
    for (const p of busted) p.rank = ++r;
    for (const p of this.players.filter((q) => q.forfeit)) p.rank = ++r;
    const winner = alive[0] || busted[0] || null;
    this.winner = winner ? winner.id : null;
    if (winner) this.say(`${winner.name} remporte la partie avec ${winner.chips} jetons !`, winner.id);
    this.emit({ t: 'over', pid: this.winner }, 600);
    this.endedAt = Date.now();
    this.onEnd(this.result());
    return { ok: true };
  }

  result() {
    return {
      kind: 'blackjack',
      winner: this.winner,
      winType: 'blackjack',
      duration: Math.round(((this.endedAt || Date.now()) - this.startedAt) / 1000),
      rounds: this.round,
      turns: this.actions + this.round,
      players: this.players.map((p) => ({
        id: p.id,
        userId: p.userId,
        name: p.name,
        isBot: p.isBot,
        rank: p.rank,
        bankrupt: p.out,
        netWorth: p.chips,
        chips: p.chips,
        stats: p.stats,
      })),
    };
  }

  forfeit(pid) {
    const p = this.player(pid);
    if (!p || p.out || this.over) return;
    const wasCur = p === this.cur;
    p.out = true;
    p.forfeit = true;
    p.chips = 0;
    for (const h of p.hands) {
      h.done = true;
      h.outcome = 'bust';
    }
    p.betDone = true;
    this.say(`${p.name} quitte la table.`, p.id);
    this.emit({ t: 'out', pid: p.id }, 500);
    if (!this.players.some((q) => !q.out)) this.finish();
    else if (this.phase === 'bet' && this.allBetsIn()) this.deal();
    else if (wasCur) this.nextHand();
    this.flush();
  }

  setConnected(pid, connected) {
    const p = this.player(pid);
    if (!p) return;
    p.connected = connected;
    if (!this.over) this.schedule();
  }

  // ------------------------------------------------------------------- bots
  botBet(p) {
    const min = this.settings.minBet;
    const want = min * R.pick([1, 1, 2, 2, 3, 4, 5]);
    return Math.max(min, Math.min(this.maxBetFor(p), want));
  }
  /** Stratégie de base (simplifiée). */
  botDecide(p) {
    const L = this.legal(p);
    const h = this.curHand;
    const up = cardValue(this.dealer.cards[0]);
    const d = up === 1 ? 11 : up;
    const v = handValue(h.cards);
    if (L.canSplit) {
      const pv = cardValue(h.cards[0]);
      if (pv === 1 || pv === 8) return 'split';
      if (pv === 9 && ![7, 10, 11].includes(d)) return 'split';
      if ((pv === 7 || pv === 2 || pv === 3) && d <= 7) return 'split';
      if (pv === 6 && d <= 6) return 'split';
    }
    if (v.soft && v.total <= 21) {
      if (v.total >= 19) return 'stand';
      if (v.total === 18) return d >= 9 ? 'hit' : L.canDouble && d >= 3 && d <= 6 ? 'double' : 'stand';
      return L.canDouble && d >= 5 && d <= 6 ? 'double' : 'hit';
    }
    const t = v.total;
    if (t >= 17) return 'stand';
    if (t >= 13) return d <= 6 ? 'stand' : 'hit';
    if (t === 12) return d >= 4 && d <= 6 ? 'stand' : 'hit';
    if (t === 11) return L.canDouble && d <= 10 ? 'double' : 'hit';
    if (t === 10) return L.canDouble && d <= 9 ? 'double' : 'hit';
    if (t === 9) return L.canDouble && d >= 3 && d <= 6 ? 'double' : 'hit';
    return 'hit';
  }

  // --------------------------------------------------------- minuteur, sortie
  autoAct(useBot) {
    if (this.over) return;
    if (this.pendingRound) {
      this.startRound();
      this.flush();
      return;
    }
    if (this.phase === 'bet') {
      // Fin du temps des mises : ceux qui n'ont pas misé passent la manche
      for (const p of this.players) {
        if (p.out || p.betDone) continue;
        p.betDone = true;
        p.sitting = true;
        p.timeouts++;
        if (p.timeouts >= 3) p.afk = true;
        this.say(`${p.name} ne mise pas cette manche.`, p.id);
      }
      this.deal();
      this.flush();
      return;
    }
    const p = this.cur;
    if (!p) return;
    const type = useBot ? this.botDecide(p) : 'stand';
    if (!useBot) this.say(`Temps écoulé : ${p.name} reste.`, p.id);
    const res = this.handle(p, type);
    if (res && res.error) this.handle(p, 'stand');
    this.flush();
  }

  schedule() {
    clearTimeout(this.timer);
    if (this.over) return;
    const base = Math.max(0, this.anim - (Date.now() - (this.flushedAt || Date.now())));
    if (this.pendingRound) {
      this.deadline = null;
      this.timer = setTimeout(() => this.autoAct(true), base + 2600);
      return;
    }
    if (this.phase === 'bet') {
      const waiting = this.players.filter((p) => !p.out && !p.betDone);
      const allAway = waiting.every((p) => !p.connected || p.afk);
      const tt = (this.settings.turnTime || 0) * 1000;
      if (!tt && !allAway) {
        this.deadline = null;
        return;
      }
      if (!this.betDeadline) this.betDeadline = Date.now() + base + (allAway ? 5000 : Math.max(tt, 15000));
      this.deadline = this.betDeadline;
      this.timer = setTimeout(() => this.autoAct(false), Math.max(0, this.betDeadline - Date.now()));
      return;
    }
    const p = this.cur;
    if (!p) {
      this.deadline = null;
      return;
    }
    if (p.isBot) {
      this.deadline = null;
      this.timer = setTimeout(() => this.autoAct(true), base + R.int(800, 1500));
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

  /** La carte cachée n'apparaît dans aucun évènement avant d'être retournée : identiques pour tous. */
  eventsFor(events) {
    return events;
  }

  publicState(viewer = null) {
    const me = viewer ? this.player(viewer) : null;
    const cur = this.cur;
    return {
      kind: 'blackjack',
      round: this.round,
      rounds: this.settings.rounds,
      phase: this.phase,
      current: cur ? { pid: cur.id, hand: this.handIdx } : null,
      dealer: { cards: this.dealer.hidden && this.dealer.cards.length > 1 ? [this.dealer.cards[0], null] : this.dealer.cards.slice(), hidden: this.dealer.hidden },
      legal: me && cur === me ? this.legal(me) : null,
      canBet: !!(me && !me.out && this.phase === 'bet' && !me.betDone),
      betLimits: me ? { min: this.settings.minBet, max: this.maxBetFor(me), last: me.lastBet } : null,
      shoeLeft: this.shoe.length,
      shoeSize: this.shoeSize,
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
        chips: p.chips,
        hands: p.hands.map((h) => ({ cards: h.cards.slice(), bet: h.bet, done: h.done, doubled: h.doubled, outcome: h.outcome, payout: h.payout, fromSplit: h.fromSplit })),
        betDone: !!p.betDone,
        sitting: p.sitting,
        out: p.out,
        bankrupt: p.out,
        rank: p.rank,
        netWorth: p.chips,
      })),
      log: this.log.slice(-40),
      deadline: this.deadline,
      serverNow: Date.now(),
      over: this.over,
      winner: this.winner,
      settings: { minBet: this.settings.minBet, maxBet: this.settings.maxBet, rounds: this.settings.rounds, bjPays: this.settings.bjPays, hitSoft17: this.settings.hitSoft17, decks: this.settings.decks, turnTime: this.settings.turnTime },
    };
  }

  destroy() {
    clearTimeout(this.timer);
    this.over = true;
  }
}

module.exports = { BlackjackGame, handValue, cardValue };
