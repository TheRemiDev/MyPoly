'use strict';
const { CELLS, OWNABLE, RESORTS, COUNTRY_CELLS, SIDES, RESORT_RENT, CORNERS, COUNTRIES } = require('./board');
const { CARDS } = require('./cards');
const { THEMES } = require('./themes');
const R = require('./random');
const Bot = require('./bot');

const N = CELLS.length;
const ANIM = { dice: 1300, step: 190, teleport: 700, card: 2200, small: 350 };

function fmt(k) {
  const neg = k < 0;
  k = Math.abs(k);
  const s = k >= 1000 ? (k / 1000).toFixed(2).replace(/\.?0+$/, '') + 'M' : k + 'K';
  return (neg ? '-' : '') + s;
}

/**
 * Moteur de jeu MyPoly. Le serveur fait autorité : tous les tirages
 * (dés, cartes) sont effectués ici avec un générateur cryptographique.
 */
class Game {
  constructor({ players, settings, onUpdate, onEnd }) {
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
      role: p.role || 'user',
      vip: !!p.vip,
      level: p.level || 0,
      cash: settings.startMoney,
      pos: 0,
      jailed: false,
      jailTurns: 0,
      jailCards: 0,
      bankrupt: false,
      travel: false,
      shield: false,
      coupon: false,
      voucher: false,
      curse: false,
      connected: true,
      afk: false,
      rank: 0,
      stats: { rentPaid: 0, rentEarned: 0, bought: 0, built: 0, takeovers: 0, cards: 0, doubles: 0, maxNetWorth: settings.startMoney, eliminated: 0, salary: 0 },
    }));
    // Ordre de jeu aléatoire
    this.players = R.shuffle(this.players);
    this.props = CELLS.map((c) => (c.type === 'city' || c.type === 'resort' ? { owner: null, level: 0 } : null));
    this.turn = 0;
    this.round = 1;
    this.phase = 'roll';
    this.pending = {};
    this.dice = [1, 1];
    this.rolledDouble = false;
    this.doubles = 0;
    this.festival = { cell: null, mult: 1 };
    this.deck = R.shuffle(CARDS.map((c) => c.id));
    this.log = [];
    this.events = [];
    this.anim = 0;
    this.deadline = null;
    this.timer = null;
    this.winner = null;
    this.winType = null;
    this.eliminations = 0;
    this.startedAt = Date.now();
    this.endsAt = settings.gameDuration ? this.startedAt + settings.gameDuration * 60000 : null;
    this.over = false;
    this.afterDebt = null;
    this.seq = 0;
  }

  // ---------------------------------------------------------------- helpers
  get cur() {
    return this.players[this.turn];
  }
  player(id) {
    return this.players.find((p) => p.id === id);
  }
  alive() {
    return this.players.filter((p) => !p.bankrupt);
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
    this.emit({ t: 'log', msg, pid });
  }
  money(p, delta, reason) {
    p.cash += delta;
    this.emit({ t: 'money', pid: p.id, delta, reason });
    const nw = this.netWorth(p);
    if (nw > p.stats.maxNetWorth) p.stats.maxNetWorth = nw;
  }
  invested(i) {
    const c = CELLS[i];
    const s = this.props[i];
    if (!s || !s.owner) return 0;
    if (c.type === 'resort') return c.price;
    return c.price + Math.min(s.level, 3) * c.houseCost + (s.level === 4 ? c.hotelCost : 0);
  }
  buildCost(i, from, to) {
    const c = CELLS[i];
    let cost = 0;
    for (let l = from + 1; l <= to; l++) cost += l <= 3 ? c.houseCost : c.hotelCost;
    return cost;
  }
  sellValue(i) {
    return Math.floor(this.invested(i) / 2);
  }
  owned(p) {
    return OWNABLE.filter((i) => this.props[i].owner === p.id);
  }
  liquidation(p) {
    return this.owned(p).reduce((s, i) => s + this.sellValue(i), 0);
  }
  netWorth(p) {
    if (p.bankrupt) return 0;
    return p.cash + this.owned(p).reduce((s, i) => s + this.invested(i), 0);
  }
  ownsCountry(pid, country) {
    return COUNTRY_CELLS[country].every((i) => this.props[i].owner === pid);
  }
  /** Thème de plateau actif (habillage), ou null. */
  get theme() {
    return this.settings.politicalBoard ? THEMES.politique : null;
  }
  cellName(i) {
    const t = this.theme && this.theme.cells[i];
    return (t && t.name) || CELLS[i].name;
  }
  countryInfo(id) {
    const ct = COUNTRIES.find((c) => c.id === id);
    const t = this.theme && this.theme.countries[id];
    return t ? { ...ct, ...t } : ct;
  }
  themedCard(card) {
    const t = this.theme && this.theme.cards[card.id];
    return t ? { ...card, ...t } : card;
  }

  /** Pays d'une ville et indication de monopole (null si ce n'est pas une ville). */
  countryOf(i) {
    return CELLS[i].type === 'city' ? CELLS[i].country : null;
  }
  announceMonopoly(p, country) {
    const ct = this.countryInfo(country);
    this.emit({ t: 'monopoly', pid: p.id, country, cells: COUNTRY_CELLS[country] }, 3000);
    this.say(`👑 MONOPOLE ! ${p.name} possède tout le pays ${ct.flag} ${ct.name}${this.settings.countryDoubleRent ? ' : loyers ×2' : ''} !`, p.id);
  }
  announceMonopolyLost(p, country) {
    const ct = this.countryInfo(country);
    this.emit({ t: 'monopolyLost', pid: p.id, country, cells: COUNTRY_CELLS[country] }, 600);
    this.say(`💔 ${p.name} perd son monopole ${ct.flag} ${ct.name}.`, p.id);
  }

  rent(i) {
    const c = CELLS[i];
    const s = this.props[i];
    if (!s || !s.owner) return 0;
    let r;
    if (c.type === 'city') {
      r = c.rents[s.level];
      if (this.settings.countryDoubleRent && this.ownsCountry(s.owner, c.country)) r *= 2;
    } else {
      const n = RESORTS.filter((j) => this.props[j].owner === s.owner).length;
      r = RESORT_RENT[n];
    }
    if (this.festival.cell === i) r *= this.festival.mult;
    return r;
  }
  takeoverPrice(i) {
    return this.invested(i) * this.settings.takeoverMult;
  }
  /** Niveaux constructibles sur une ville possédée au moment d'une visite. */
  /** Niveau maximum autorisé pendant le tour en cours (règle du 1er tour). */
  levelCap() {
    return this.settings.firstRoundLimit && this.round <= 1 ? 2 : 4;
  }
  buildRange(i) {
    const c = CELLS[i];
    const s = this.props[i];
    if (c.type !== 'city') return null;
    if (s.level >= 4) return null;
    const min = s.level + 1;
    const max = Math.min(s.level === 3 ? 4 : 3, this.levelCap());
    if (min > max) return null;
    return { min, max, capped: max < (s.level === 3 ? 4 : 3) };
  }

  // ------------------------------------------------------------ win checks
  monopolyWin(p) {
    const st = this.settings;
    if (st.tripleMonopoly) {
      const n = COUNTRIES.filter((c) => this.ownsCountry(p.id, c.id)).length;
      if (n >= 3) return 'triple';
    }
    if (st.lineMonopoly && SIDES.some((side) => side.every((i) => this.props[i].owner === p.id))) return 'line';
    if (st.resortMonopoly && RESORTS.every((i) => this.props[i].owner === p.id)) return 'resort';
    return null;
  }

  // ------------------------------------------------------------- lifecycle
  start() {
    this.say(`La partie commence ! ${this.cur.name} ouvre le bal.`);
    this.emit({ t: 'start' }, 600);
    this.beginTurn();
    this.flush();
  }

  beginTurn() {
    const p = this.cur;
    this.rolledDouble = false;
    this.doubles = 0;
    this.emit({ t: 'turn', pid: p.id });
    if (p.jailed && p.jailTurns >= 3) {
      p.jailed = false;
      p.jailTurns = 0;
      this.say(`🛟 ${p.name} est secouru(e) après 3 tours sur l'île et peut rejouer.`, p.id);
      this.setPhase('roll');
    } else if (p.jailed) this.setPhase('jail');
    else if (p.travel) this.setPhase('travel');
    else this.setPhase('roll');
  }

  setPhase(phase, pending = {}) {
    this.phase = phase;
    this.pending = pending;
  }

  nextTurn() {
    if (this.over) return;
    const alive = this.alive();
    if (alive.length <= 1) return this.finish(alive[0], 'last');
    if (this.endsAt && Date.now() >= this.endsAt) return this.finishRichest('time');
    let idx = this.turn;
    do {
      idx = (idx + 1) % this.players.length;
      if (idx === 0) this.round++;
    } while (this.players[idx].bankrupt);
    if (this.settings.maxRounds && this.round > this.settings.maxRounds) return this.finishRichest('rounds');
    this.turn = idx;
    this.beginTurn();
  }

  endAction() {
    if (this.over) return;
    const p = this.cur;
    if (!p.bankrupt) {
      const w = this.monopolyWin(p);
      if (w) return this.finish(p, w);
    }
    if (!p.bankrupt && this.extraRoll && !p.jailed) {
      this.extraRoll = false;
      this.say(`🎲 ${p.name} relance les dés !`, p.id);
      this.setPhase('roll', { replay: true });
      return;
    }
    this.extraRoll = false;
    if (!p.bankrupt && this.rolledDouble && this.settings.doubleReplay && !p.jailed) {
      this.rolledDouble = false;
      this.say(`${p.name} a fait un double et rejoue !`, p.id);
      this.setPhase('roll', { replay: true });
      return;
    }
    this.nextTurn();
  }

  finishRichest(type) {
    const ranked = this.alive().sort((a, b) => this.netWorth(b) - this.netWorth(a));
    this.say(type === 'time' ? 'Temps écoulé ! Le joueur le plus riche l\'emporte.' : 'Nombre de tours maximum atteint !');
    this.finish(ranked[0], type);
  }

  finish(winner, type) {
    if (this.over) return;
    this.over = true;
    this.phase = 'over';
    this.pending = {};
    this.winner = winner ? winner.id : null;
    this.winType = type;
    clearTimeout(this.timer);
    // Classement : vainqueur, puis survivants par fortune, puis éliminés (le dernier éliminé d'abord)
    const others = this.players.filter((p) => p !== winner);
    const alive = others.filter((p) => !p.bankrupt).sort((a, b) => this.netWorth(b) - this.netWorth(a));
    const dead = others.filter((p) => p.bankrupt).sort((a, b) => b.stats.eliminated - a.stats.eliminated);
    const order = [winner, ...alive, ...dead].filter(Boolean);
    order.forEach((p, k) => (p.rank = k + 1));
    const labels = { last: 'dernier survivant', triple: 'triple monopole', line: 'monopole de ligne', resort: 'monopole balnéaire', time: 'fortune (temps écoulé)', rounds: 'fortune (tours écoulés)', forfeit: 'abandon des adversaires' };
    if (winner) this.say(`🏆 ${winner.name} remporte la partie par ${labels[type] || type} !`, winner.id);
    this.emit({ t: 'win', pid: this.winner, type }, 500);
    this.endedAt = Date.now();
    this.onEnd(this.result());
  }

  result() {
    return {
      winner: this.winner,
      winType: this.winType,
      melenchon: !!this.settings.melenchon,
      melenchonLoot: this.melenchonLoot || 0,
      duration: Math.round(((this.endedAt || Date.now()) - this.startedAt) / 1000),
      rounds: this.round,
      players: this.players.map((p) => ({
        id: p.id,
        userId: p.userId,
        name: p.name,
        isBot: p.isBot,
        rank: p.rank,
        bankrupt: p.bankrupt,
        netWorth: this.netWorth(p),
        properties: this.owned(p).length,
        stats: p.stats,
      })),
    };
  }

  // ---------------------------------------------------------------- moves
  moveBy(p, steps) {
    const from = p.pos;
    let to = (((from + steps) % N) + N) % N;
    this.emit({ t: 'move', pid: p.id, from, to, steps }, Math.abs(steps) * ANIM.step + 250);
    p.pos = to;
    if (steps > 0 && from + steps >= N) this.passStart(p);
  }
  moveTo(p, to, forward = true) {
    const from = p.pos;
    if (forward) {
      const steps = (to - from + N) % N || N;
      this.moveBy(p, steps);
    } else {
      p.pos = to;
      this.emit({ t: 'move', pid: p.id, from, to, teleport: true }, ANIM.teleport);
    }
  }
  passStart(p) {
    if (!this.settings.salary) return;
    p.stats.salary += this.settings.salary;
    this.money(p, this.settings.salary, 'salary');
    this.say(`${p.name} passe par le Départ et touche ${fmt(this.settings.salary)}.`, p.id);
  }
  sendToJail(p) {
    const from = p.pos;
    p.pos = CORNERS.jail;
    p.jailed = true;
    p.jailTurns = 0;
    this.rolledDouble = false;
    this.emit({ t: 'move', pid: p.id, from, to: CORNERS.jail, teleport: true }, ANIM.teleport);
    this.emit({ t: 'jail', pid: p.id }, ANIM.small);
    this.say(this.theme ? `🚔 ${p.name} est placé(e) en garde à vue !` : `${p.name} est coincé(e) sur l'Île déserte !`, p.id);
  }

  // -------------------------------------------------------------- payments
  /**
   * Fait payer `amount` au joueur courant. Si les liquidités sont insuffisantes
   * mais que la vente de biens suffirait, le joueur passe en phase "dette".
   */
  charge(p, amount, to, reason, then) {
    amount = Math.round(amount);
    if (amount <= 0) return then();
    if (p.cash >= amount) {
      this.transfer(p, to, amount, reason);
      return then();
    }
    if (p.cash + this.liquidation(p) < amount) {
      this.say(`${p.name} ne peut pas payer ${fmt(amount)}…`, p.id);
      this.bankrupt(p, to);
      if (p === this.cur) this.endAction();
      return;
    }
    this.say(`${p.name} doit ${fmt(amount)} et doit vendre des propriétés.`, p.id);
    this.afterDebt = then;
    p.stats.wasInDebt = true;
    this.setPhase('debt', { amount, to: to ? to.id : null, reason });
  }
  /** Prélève un joueur non courant : vente automatique si nécessaire. */
  forceCollect(p, amount, to, reason) {
    if (p.bankrupt) return;
    if (p.cash < amount) this.autoSell(p, amount);
    if (p.cash >= amount) this.transfer(p, to, amount, reason);
    else this.bankrupt(p, to);
  }
  transfer(from, to, amount, reason) {
    this.money(from, -amount, reason);
    // Mode Mélenchon : cumul de tout ce que la case Impôts a prélevé
    if (reason === 'tax' && this.settings.melenchon) this.melenchonLoot = (this.melenchonLoot || 0) + amount;
    if (to && !to.bankrupt) this.money(to, amount, reason);
    if (reason === 'rent') {
      from.stats.rentPaid += amount;
      if (to) to.stats.rentEarned += amount;
    }
  }
  autoSell(p, target) {
    const list = this.owned(p).sort((a, b) => this.sellValue(a) - this.sellValue(b));
    for (const i of list) {
      if (p.cash >= target) break;
      this.sell(p, i);
    }
  }
  sell(p, i) {
    const v = this.sellValue(i);
    const level = this.props[i].level;
    const country = this.countryOf(i);
    const hadMono = country && this.ownsCountry(p.id, country);
    this.props[i] = { owner: null, level: 0 };
    if (this.festival.cell === i) this.festival = { cell: null, mult: 1 };
    // Évènement émis avant le gain pour que l'animation de démolition précède l'argent
    this.emit({ t: 'sell', pid: p.id, cell: i, level, value: v }, 1300);
    this.money(p, v, 'sell');
    if (hadMono) this.announceMonopolyLost(p, country);
    this.say(`${p.name} vend ${this.cellName(i)} pour ${fmt(v)}.`, p.id);
  }
  bankrupt(p, creditor) {
    if (p.bankrupt) return;
    if (creditor && p.cash > 0 && !creditor.bankrupt) this.money(creditor, p.cash, 'bankrupt');
    p.cash = 0;
    const lost = this.owned(p).map((i) => ({ cell: i, level: this.props[i].level }));
    for (const { cell: i } of lost) {
      this.props[i] = { owner: null, level: 0 };
      if (this.festival.cell === i) this.festival = { cell: null, mult: 1 };
    }
    p.bankrupt = true;
    p.jailed = false;
    p.stats.eliminated = ++this.eliminations;
    // Les propriétés perdues sont détaillées pour animer leur démolition une à une
    this.emit({ t: 'bankrupt', pid: p.id, to: creditor ? creditor.id : null, cells: lost }, 1800 + lost.length * 450);
    this.say(`💥 ${p.name} fait faillite !`, p.id);
    if (creditor) creditor.stats.knockouts = (creditor.stats.knockouts || 0) + 1;
    const alive = this.alive();
    if (alive.length <= 1) this.finish(alive[0], 'last');
  }

  // --------------------------------------------------------------- landing
  land(p) {
    if (this.over || p.bankrupt) return;
    const i = p.pos;
    const c = CELLS[i];
    this.emit({ t: 'land', pid: p.id, cell: i });
    switch (c.type) {
      case 'start':
        if (this.settings.startBonus && this.settings.salary) {
          this.money(p, this.settings.salary, 'salary');
          p.stats.salary += this.settings.salary;
          this.say(`Atterrissage parfait sur le Départ : bonus de ${fmt(this.settings.salary)} !`, p.id);
        }
        return this.endAction();
      case 'jail':
        this.sendToJail(p);
        return this.endAction();
      case 'travel':
        p.travel = true;
        this.say(`${p.name} arrive à l'Aéroport : prochain tour en avion !`, p.id);
        return this.endAction();
      case 'festival':
        if (this.settings.festival && this.owned(p).length) return this.setPhase('festival');
        return this.endAction();
      case 'tax': {
        const worth = this.netWorth(p);
        const amount = Math.round((worth * this.settings.taxPercent) / 100);
        const mel = !!this.settings.melenchon;
        this.emit({ t: 'tax', pid: p.id, cell: i, amount, percent: this.settings.taxPercent, worth, canPay: p.cash >= amount, melenchon: mel }, mel ? 3200 : 1600);
        if (mel) this.say(`🧓 Hop ! Mélenchon prend ${fmt(amount)} à ${p.name} (${this.settings.taxPercent} % de sa fortune).`, p.id);
        else this.say(`💸 ${p.name} paie ${fmt(amount)} d'impôts (${this.settings.taxPercent} % de sa fortune de ${fmt(worth)}).`, p.id);
        return this.charge(p, amount, null, 'tax', () => this.endAction());
      }
      case 'chance':
        return this.drawCard(p);
      case 'city':
      case 'resort':
        return this.landProperty(p, i);
    }
    this.endAction();
  }

  landProperty(p, i) {
    const c = CELLS[i];
    const s = this.props[i];
    if (!s.owner) {
      if (p.cash < (p.voucher ? Math.round(c.price / 2) : c.price)) {
        this.say(`${p.name} n'a pas les moyens d'acheter ${this.cellName(i)}.`, p.id);
        return this.endAction();
      }
      const full = c.type === 'city' && this.settings.buildOnPurchase ? 3 : 0;
      const max = Math.min(full, this.levelCap());
      return this.setPhase('buy', { cell: i, max, capped: max < full });
    }
    if (s.owner === p.id) {
      const range = this.buildRange(i);
      if (range && p.cash >= this.buildCost(i, s.level, range.min)) return this.setPhase('build', { cell: i, ...range });
      return this.endAction();
    }
    const owner = this.player(s.owner);
    let rent = this.rent(i);
    if (p.shield) {
      p.shield = false;
      this.say(`🛡️ Le bouclier de ${p.name} annule le loyer de ${fmt(rent)} !`, p.id);
      this.emit({ t: 'shield', pid: p.id }, ANIM.small);
      return this.afterRent(p, i);
    }
    if (p.coupon) {
      p.coupon = false;
      rent = Math.round(rent / 2);
      this.say(`🏷️ Coupon utilisé : loyer réduit de moitié.`, p.id);
    }
    if (p.curse) {
      p.curse = false;
      rent *= 2;
      this.say(`🐈‍⬛ Le chat noir porte malheur : loyer doublé !`, p.id);
    }
    this.say(`${p.name} paie ${fmt(rent)} de loyer à ${owner.name} (${this.cellName(i)}).`, p.id);
    this.emit({ t: 'rent', pid: p.id, to: owner.id, cell: i, amount: rent }, ANIM.small);
    this.charge(p, rent, owner, 'rent', () => this.afterRent(p, i));
  }

  afterRent(p, i) {
    const s = this.props[i];
    if (this.settings.takeover && CELLS[i].type === 'city' && s.owner && s.owner !== p.id && s.level < 4) {
      const price = this.takeoverPrice(i);
      if (p.cash >= price) return this.setPhase('takeover', { cell: i, price });
    }
    this.endAction();
  }

  // ----------------------------------------------------------------- cards
  drawCard(p) {
    if (!this.deck.length) this.deck = R.shuffle(CARDS.map((c) => c.id));
    const id = this.deck.pop();
    const card = this.themedCard(CARDS.find((c) => c.id === id));
    p.stats.cards++;
    // Durée d'affichage proportionnelle au texte (le client utilise la même formule)
    this.emit({ t: 'card', pid: p.id, card }, Math.min(9000, 3500 + (card.title.length + card.text.length) * 40) + 400);
    this.say(`${p.name} tire « ${card.title} » : ${card.text}`, p.id);
    const others = this.alive().filter((o) => o !== p);
    switch (id) {
      case 'go_start':
        this.moveTo(p, CORNERS.start);
        return this.land(p);
      case 'go_jail':
        this.sendToJail(p);
        return this.endAction();
      case 'jail_card':
        p.jailCards++;
        return this.endAction();
      case 'back3':
        this.moveBy(p, -3);
        return this.land(p);
      case 'go_travel':
        this.moveTo(p, CORNERS.travel);
        return this.land(p);
      case 'go_festival':
        this.moveTo(p, CORNERS.festival);
        return this.land(p);
      case 'gain150':
        this.money(p, 150, 'card');
        return this.endAction();
      case 'gain100':
        this.money(p, 100, 'card');
        return this.endAction();
      case 'lottery': {
        const amount = R.int(1, 30) * 10;
        this.money(p, amount, 'card');
        this.say(`🎰 ${p.name} gagne ${fmt(amount)} à la loterie !`, p.id);
        return this.endAction();
      }
      case 'pay100':
        return this.charge(p, 100, null, 'card', () => this.endAction());
      case 'birthday':
        for (const o of others) this.forceCollect(o, 50, p, 'card');
        if (this.over) return;
        return this.endAction();
      case 'charity':
        return this.charge(p, 30 * others.length, null, 'card', () => {
          for (const o of others) if (!o.bankrupt) this.money(o, 30, 'card');
          this.endAction();
        });
      case 'repairs': {
        let total = 0;
        for (const i of this.owned(p)) {
          const l = this.props[i].level;
          if (CELLS[i].type === 'city') total += l === 4 ? 3 * 20 + 80 : l * 20;
        }
        if (!total) return this.endAction();
        return this.charge(p, total, null, 'card', () => this.endAction());
      }
      case 'shield':
        p.shield = true;
        return this.endAction();
      case 'coupon':
        p.coupon = true;
        return this.endAction();
      case 'quake': {
        // Les hôtels sont intouchables : seules les villes avec 1 à 3 maisons sont visées
        const hit = (i) => this.props[i].level > 0 && this.props[i].level < 4;
        const targets = others.filter((o) => this.owned(o).some(hit));
        if (!targets.length) {
          this.say('Le séisme ne touche aucun bâtiment (les hôtels sont protégés).');
          return this.endAction();
        }
        const victim = R.pick(targets);
        const best = this.owned(victim)
          .filter(hit)
          .sort((a, b) => this.props[b].level - this.props[a].level || CELLS[b].price - CELLS[a].price)[0];
        this.props[best].level--;
        this.emit({ t: 'quake', pid: victim.id, by: p.id, cell: best, level: this.props[best].level }, 1600);
        this.say(`🌋 ${this.cellName(best)} (${victim.name}) perd un niveau !`, victim.id);
        return this.endAction();
      }
      case 'nearest_resort': {
        let i = p.pos;
        do i = (i + 1) % N;
        while (CELLS[i].type !== 'resort');
        this.moveTo(p, i);
        return this.land(p);
      }
      case 'go_top':
        this.moveTo(p, 31);
        return this.land(p);
      case 'free_house': {
        const cap = Math.min(3, this.levelCap());
        const mine = this.owned(p).filter((i) => CELLS[i].type === 'city' && this.props[i].level < cap);
        if (!mine.length) {
          this.say('Aucune ville où construire : le permis est perdu.', p.id);
          return this.endAction();
        }
        const i = R.pick(mine);
        this.props[i].level++;
        p.stats.built++;
        this.emit({ t: 'build', pid: p.id, cell: i, level: this.props[i].level }, 900);
        this.say(`🏗️ Une maison gratuite pour ${p.name} à ${this.cellName(i)} !`, p.id);
        return this.endAction();
      }
      case 'tornado': {
        const hit = (i) => this.props[i].level > 0 && this.props[i].level < 4;
        const targets = others.filter((o) => this.owned(o).some(hit));
        if (!targets.length) {
          this.say('La tornade passe sans rien abîmer (les hôtels résistent).');
          return this.endAction();
        }
        const victim = R.pick(targets);
        const cells = R.shuffle(this.owned(victim).filter(hit)).slice(0, 2);
        for (const i of cells) {
          this.props[i].level--;
          this.emit({ t: 'quake', pid: victim.id, by: p.id, cell: i, level: this.props[i].level, tornado: true }, 1400);
          this.say(`🌪️ ${this.cellName(i)} (${victim.name}) perd une maison !`, victim.id);
        }
        return this.endAction();
      }
      case 'coin_flip': {
        if (R.int(0, 1) === 0) {
          this.say(`🪙 Pile ! ${p.name} gagne 200K.`, p.id);
          this.money(p, 200, 'card');
          return this.endAction();
        }
        this.say(`🪙 Face… ${p.name} paie 100K.`, p.id);
        return this.charge(p, 100, null, 'card', () => this.endAction());
      }
      case 'robin': {
        const alive = this.alive();
        if (alive.length < 2) return this.endAction();
        const byWorth = alive.slice().sort((a, b) => this.netWorth(b) - this.netWorth(a));
        const rich = byWorth[0];
        const poor = byWorth[byWorth.length - 1];
        const amount = Math.min(150, Math.max(0, rich.cash));
        if (!amount || rich === poor) return this.endAction();
        this.transfer(rich, poor, amount, 'card');
        this.say(`🏹 ${rich.name} donne ${fmt(amount)} à ${poor.name} !`, p.id);
        if (this.over) return;
        return this.endAction();
      }
      case 'teleport': {
        const choices = [];
        for (let i = 0; i < N; i++) if (i % 8 !== 0 && i !== p.pos) choices.push(i);
        const to = R.pick(choices);
        this.moveTo(p, to, false);
        this.say(`🌀 ${p.name} est téléporté à ${this.cellName(to)} !`, p.id);
        return this.land(p);
      }
      case 'forward5':
        this.moveBy(p, 5);
        return this.land(p);
      case 'dividends': {
        const n = this.owned(p).length;
        if (!n) {
          this.say('Aucune propriété : pas de dividendes.', p.id);
          return this.endAction();
        }
        this.money(p, 25 * n, 'card');
        this.say(`🏦 ${p.name} touche ${fmt(25 * n)} de dividendes (${n} propriété${n > 1 ? 's' : ''}).`, p.id);
        return this.endAction();
      }
      case 'replay':
        this.extraRoll = true;
        return this.endAction();
      case 'voucher':
        p.voucher = true;
        return this.endAction();
      case 'black_cat':
        p.curse = true;
        return this.endAction();
      case 'patron':
        if (this.settings.festival && this.owned(p).length) return this.setPhase('festival');
        this.say('Aucune propriété : le mécène repart bredouille.', p.id);
        return this.endAction();
      case 'crash': {
        for (const o of this.alive()) {
          const loss = Math.round(o.cash * 0.1);
          if (loss > 0) this.money(o, -loss, 'card');
        }
        this.say('📉 Krach boursier : chacun perd 10 % de ses liquidités.');
        return this.endAction();
      }
    }
    this.endAction();
  }

  // ---------------------------------------------------------------- actions
  /** Point d'entrée des actions joueur. Retourne { ok } ou { error }. */
  act(pid, type, data = {}) {
    if (this.over) return { error: 'La partie est terminée.' };
    const p = this.cur;
    if (!p || p.id !== pid) return { error: 'Ce n\'est pas votre tour.' };
    const res = this.handle(p, type, data || {});
    if (res && res.error) return res;
    p.afk = false;
    this.flush();
    return { ok: true };
  }

  handle(p, type, d) {
    const ph = this.phase;
    const pend = this.pending;
    switch (ph) {
      case 'roll':
        if (type !== 'roll') return { error: 'Action invalide.' };
        return this.doRoll(p);
      case 'jail':
        if (type === 'roll') return this.doJailRoll(p);
        if (type === 'pay') {
          if (p.cash < this.settings.jailFine) return { error: 'Fonds insuffisants.' };
          this.money(p, -this.settings.jailFine, 'jail');
          this.say(`${p.name} paie ${fmt(this.settings.jailFine)} et quitte l'île.`, p.id);
          p.jailed = false;
          this.setPhase('roll');
          return;
        }
        if (type === 'card') {
          if (p.jailCards < 1) return { error: 'Aucune carte.' };
          p.jailCards--;
          p.jailed = false;
          this.say(`${p.name} utilise son gilet de sauvetage et quitte l'île.`, p.id);
          this.setPhase('roll');
          return;
        }
        return { error: 'Action invalide.' };
      case 'travel':
        if (type === 'skip') {
          p.travel = false;
          this.say(`${p.name} renonce au vol.`, p.id);
          this.setPhase('roll');
          return;
        }
        if (type === 'travel') {
          const to = Number(d.cell);
          if (!Number.isInteger(to) || to < 0 || to >= N) return { error: 'Destination invalide.' };
          // Les coins (Départ, Île déserte, Festival, Aéroport) ne sont pas desservis en avion
          if (to % 8 === 0) return { error: 'L\'avion ne dessert pas les cases des coins.' };
          if (p.cash < this.settings.travelFee) return { error: 'Fonds insuffisants.' };
          p.travel = false;
          if (this.settings.travelFee) this.money(p, -this.settings.travelFee, 'travel');
          this.say(`✈️ ${p.name} s'envole pour ${this.cellName(to)}.`, p.id);
          this.emit({ t: 'fly', pid: p.id, to }, 6500); // embarquement, vol et parachute côté client
          this.moveTo(p, to);
          return this.land(p);
        }
        return { error: 'Action invalide.' };
      case 'buy': {
        if (type === 'skip') return this.endAction();
        if (type !== 'buy') return { error: 'Action invalide.' };
        const i = pend.cell;
        const c = CELLS[i];
        const level = Math.max(0, Math.min(pend.max, Number(d.level) || 0));
        let cost = c.price + (level ? this.buildCost(i, 0, level) : 0);
        if (p.voucher) cost = Math.round(cost / 2);
        if (p.cash < cost) return { error: 'Fonds insuffisants.' };
        if (p.voucher) {
          p.voucher = false;
          this.say(`💌 Bon d'achat utilisé : moitié prix !`, p.id);
        }
        this.money(p, -cost, 'buy');
        this.props[i] = { owner: p.id, level };
        p.stats.bought++;
        if (level) p.stats.built += level;
        this.emit({ t: 'buy', pid: p.id, cell: i, level }, 500);
        this.say(`${p.name} achète ${this.cellName(i)}${level ? ` avec ${level} maison${level > 1 ? 's' : ''}` : ''} (${fmt(cost)}).`, p.id);
        if (c.type === 'city' && this.ownsCountry(p.id, c.country)) this.announceMonopoly(p, c.country);
        return this.endAction();
      }
      case 'build': {
        if (type === 'skip') return this.endAction();
        if (type !== 'build') return { error: 'Action invalide.' };
        const i = pend.cell;
        const s = this.props[i];
        const level = Number(d.level);
        if (!Number.isInteger(level) || level < pend.min || level > pend.max) return { error: 'Niveau invalide.' };
        const cost = this.buildCost(i, s.level, level);
        if (p.cash < cost) return { error: 'Fonds insuffisants.' };
        this.money(p, -cost, 'build');
        p.stats.built += level - s.level;
        s.level = level;
        this.emit({ t: 'build', pid: p.id, cell: i, level }, 500);
        this.say(`${p.name} construit ${level === 4 ? 'un hôtel' : `jusqu'à ${level} maison${level > 1 ? 's' : ''}`} à ${this.cellName(i)} (${fmt(cost)}).`, p.id);
        return this.endAction();
      }
      case 'takeover': {
        if (type === 'skip') return this.endAction();
        if (type !== 'takeover') return { error: 'Action invalide.' };
        const i = pend.cell;
        const s = this.props[i];
        const price = this.takeoverPrice(i);
        if (p.cash < price) return { error: 'Fonds insuffisants.' };
        const owner = this.player(s.owner);
        const country = this.countryOf(i);
        const ownerHadMono = country && this.ownsCountry(owner.id, country);
        this.transfer(p, owner, price, 'takeover');
        s.owner = p.id;
        p.stats.takeovers++;
        this.emit({ t: 'takeover', pid: p.id, from: owner.id, cell: i }, 700);
        if (ownerHadMono) this.announceMonopolyLost(owner, country);
        if (country && this.ownsCountry(p.id, country)) this.announceMonopoly(p, country);
        this.say(`🤝 ${p.name} rachète ${this.cellName(i)} à ${owner.name} pour ${fmt(price)} !`, p.id);
        const w = this.monopolyWin(p);
        if (w) return this.finish(p, w);
        const range = this.buildRange(i);
        if (range && p.cash >= this.buildCost(i, s.level, range.min)) {
          this.setPhase('build', { cell: i, ...range });
          return;
        }
        return this.endAction();
      }
      case 'festival': {
        if (type === 'skip') return this.endAction();
        if (type !== 'festival') return { error: 'Action invalide.' };
        const i = Number(d.cell);
        if (!this.props[i] || this.props[i].owner !== p.id) return { error: 'Propriété invalide.' };
        if (this.festival.cell === i) this.festival.mult = Math.min(5, this.festival.mult + 1);
        else this.festival = { cell: i, mult: 2 };
        this.emit({ t: 'festival', pid: p.id, cell: i, mult: this.festival.mult }, 800);
        this.say(`🎉 ${p.name} organise le Festival à ${this.cellName(i)} : loyer x${this.festival.mult} !`, p.id);
        return this.endAction();
      }
      case 'debt': {
        if (type === 'bankrupt') {
          const to = pend.to ? this.player(pend.to) : null;
          this.bankrupt(p, to);
          this.afterDebt = null;
          return this.endAction();
        }
        if (type === 'sellMany') {
          const list = Array.isArray(d.cells) ? [...new Set(d.cells.map(Number))] : [];
          if (!list.length) return { error: 'Sélectionnez au moins une propriété.' };
          if (list.some((i) => !this.props[i] || this.props[i].owner !== p.id)) return { error: 'Propriété invalide.' };
          for (const i of list) this.sell(p, i);
          return this.checkDebt(p);
        }
        if (type !== 'sell') return { error: 'Action invalide.' };
        const i = Number(d.cell);
        if (!this.props[i] || this.props[i].owner !== p.id) return { error: 'Propriété invalide.' };
        this.sell(p, i);
        return this.checkDebt(p);
      }
    }
    return { error: 'Action invalide.' };
  }

  checkDebt(p) {
    const pend = this.pending;
    if (p.cash >= pend.amount) {
      const to = pend.to ? this.player(pend.to) : null;
      this.transfer(p, to, pend.amount, pend.reason);
      const then = this.afterDebt;
      this.afterDebt = null;
      this.setPhase('resolving');
      return then ? then() : this.endAction();
    }
    if (!this.owned(p).length) {
      this.bankrupt(p, pend.to ? this.player(pend.to) : null);
      return this.endAction();
    }
  }

  doRoll(p) {
    const d1 = R.die();
    const d2 = R.die();
    this.dice = [d1, d2];
    const dbl = d1 === d2;
    this.emit({ t: 'dice', pid: p.id, d: [d1, d2] }, ANIM.dice);
    if (dbl) {
      this.doubles++;
      p.stats.doubles++;
      if (this.doubles >= 3) {
        this.say(`${p.name} fait 3 doubles d'affilée : direction l'Île déserte !`, p.id);
        this.sendToJail(p);
        return this.endAction();
      }
    }
    this.rolledDouble = dbl;
    this.say(`${p.name} lance les dés : ${d1} + ${d2} = ${d1 + d2}${dbl ? ' (double !)' : ''}`, p.id);
    this.setPhase('resolving');
    this.moveBy(p, d1 + d2);
    this.land(p);
  }

  doJailRoll(p) {
    const d1 = R.die();
    const d2 = R.die();
    this.dice = [d1, d2];
    this.emit({ t: 'dice', pid: p.id, d: [d1, d2] }, ANIM.dice);
    this.rolledDouble = false;
    if (d1 === d2) {
      p.jailed = false;
      this.say(`${p.name} fait un double (${d1}+${d2}) et s'échappe de l'île !`, p.id);
    } else {
      // Raté : le joueur reste bloqué ce tour-ci. Après 3 tours ratés, il est libéré
      // au début de son tour suivant (voir beginTurn) : 3 tours complets sur l'île.
      p.jailTurns++;
      this.say(`${p.name} tente un double : ${d1}+${d2}… raté (${p.jailTurns}/3).${p.jailTurns >= 3 ? ' Libération au prochain tour.' : ''}`, p.id);
      return this.nextTurn();
    }
    this.setPhase('resolving');
    this.moveBy(p, d1 + d2);
    this.land(p);
  }

  /** Abandon / départ d'un joueur. */
  forfeit(pid) {
    const p = this.player(pid);
    if (!p || p.bankrupt || this.over) return;
    this.say(`🏳️ ${p.name} abandonne la partie.`, p.id);
    const wasCurrent = p === this.cur;
    this.bankrupt(p, null);
    if (!this.over && wasCurrent) {
      this.afterDebt = null;
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

  // ------------------------------------------------------- timers & output
  /** Action par défaut (temps écoulé, joueur absent ou bot). */
  autoAct(useBot) {
    if (this.over) return;
    const p = this.cur;
    let guard = 0;
    do {
      const action = useBot ? Bot.decide(this, p) : this.defaultAction(p);
      let res = this.handle(p, action.type, action);
      if (res && res.error) {
        // Filet de sécurité : action la plus simple possible
        const fb = this.defaultAction(p);
        res = this.handle(p, fb.type, fb);
        if (res && res.error) {
          if (this.phase === 'debt') this.handle(p, 'bankrupt', {});
          else this.endAction();
        }
      }
      // En cas de dette, on enchaîne les ventes sans attendre
    } while (!this.over && this.phase === 'debt' && this.cur === p && ++guard < 40);
    this.flush();
  }

  defaultAction(p) {
    switch (this.phase) {
      case 'roll':
        return { type: 'roll' };
      case 'jail':
        return p.jailCards ? { type: 'card' } : { type: 'roll' };
      case 'debt': {
        const list = this.owned(p).sort((a, b) => this.sellValue(a) - this.sellValue(b));
        return list.length ? { type: 'sell', cell: list[0] } : { type: 'bankrupt' };
      }
      case 'festival':
        return Bot.decide(this, p);
      default:
        return { type: 'skip' };
    }
  }

  schedule() {
    clearTimeout(this.timer);
    if (this.over) return;
    const p = this.cur;
    const base = Math.max(0, this.anim - (Date.now() - (this.flushedAt || Date.now())));
    const tt = this.settings.turnTime * 1000;
    if (p.isBot) {
      this.deadline = null;
      this.timer = setTimeout(() => this.autoAct(true), base + 700 + R.int(0, 700));
      return;
    }
    if (!p.connected || p.afk) {
      // Joueur absent : il est joué automatiquement après un court délai
      this.deadline = Date.now() + base + 6000;
      this.timer = setTimeout(() => this.autoAct(true), base + 6000);
      return;
    }
    if (tt) {
      this.deadline = Date.now() + base + tt;
      this.timer = setTimeout(() => {
        p.timeouts = (p.timeouts || 0) + 1;
        if (p.timeouts >= 3) p.afk = true;
        this.autoAct(false);
      }, base + tt);
    } else {
      this.deadline = null;
    }
  }

  /** Prévient tout le monde quand un joueur est à un pas d'une victoire par monopole. */
  checkThreats() {
    if (this.over) return;
    this.threats ||= {};
    const st = this.settings;
    for (const p of this.players) {
      const prev = this.threats[p.id] || {};
      const now = {};
      if (!p.bankrupt) {
        if (st.tripleMonopoly) {
          const owned = COUNTRIES.filter((c) => this.ownsCountry(p.id, c.id)).map((c) => c.id);
          if (owned.length === 2) now.triple = owned.join(',');
        }
        if (st.resortMonopoly) {
          const mine = RESORTS.filter((i) => this.props[i].owner === p.id);
          if (mine.length === RESORTS.length - 1) now.resort = 1;
        }
      }
      if (now.triple && !prev.triple) {
        const owned = now.triple.split(',');
        const cells = owned.flatMap((c) => COUNTRY_CELLS[c]);
        // Cases encore à prendre dans les pays déjà entamés
        const missing = COUNTRIES.filter((c) => !owned.includes(c.id))
          .map((c) => COUNTRY_CELLS[c.id])
          .filter((list) => list.some((i) => this.props[i].owner === p.id))
          .flatMap((list) => list.filter((i) => this.props[i].owner !== p.id));
        const flags = owned.map((c) => this.countryInfo(c));
        this.emit({ t: 'threat', pid: p.id, kind: 'triple', countries: owned, cells, missing }, 4600);
        this.say(`🚨 ALERTE : ${p.name} possède déjà 2 pays (${flags.map((c) => c.flag + ' ' + c.name).join(', ')}) — un de plus et c'est la victoire !`, p.id);
      }
      if (now.resort && !prev.resort) {
        const cells = RESORTS.filter((i) => this.props[i].owner === p.id);
        const missing = RESORTS.filter((i) => this.props[i].owner !== p.id);
        this.emit({ t: 'threat', pid: p.id, kind: 'resort', cells, missing }, 4600);
        this.say(`🚨 ALERTE : ${p.name} possède ${cells.length} stations balnéaires sur ${RESORTS.length} — il ne lui manque que ${missing.map((i) => this.cellName(i)).join(', ')} !`, p.id);
      }
      this.threats[p.id] = now;
    }
  }

  flush() {
    this.checkThreats();
    this.flushedAt = Date.now();
    const events = this.events;
    this.events = [];
    this.schedule();
    this.anim = 0;
    this.seq++;
    this.onUpdate({ events, state: this.publicState() });
  }

  /** Données de la décision en cours, enrichies des coûts (pour l'interface et les bots). */
  pendingView() {
    const p = this.cur;
    const pending = { ...this.pending };
    // Infos de coût pré-calculées pour l'interface
    if (this.phase === 'buy' || this.phase === 'build') {
      const i = pending.cell;
      const s = this.props[i];
      const from = this.phase === 'buy' ? -1 : s.level;
      const lo = this.phase === 'buy' ? 0 : pending.min;
      pending.options = [];
      for (let l = lo; l <= pending.max; l++) {
        let cost = (from === -1 ? CELLS[i].price : 0) + this.buildCost(i, Math.max(0, from), l);
        if (from === -1 && p.voucher) cost = Math.round(cost / 2);
        pending.options.push({ level: l, cost, affordable: p.cash >= cost });
      }
      if (this.phase === 'buy' && p.voucher) pending.voucher = true;
    }
    if (this.phase === 'takeover') pending.owner = this.props[pending.cell].owner;
    if (this.phase === 'jail') pending.fine = this.settings.jailFine;
    if (this.phase === 'debt') {
      pending.cash = p.cash;
      pending.missing = Math.max(0, pending.amount - p.cash);
      pending.toName = pending.to ? (this.player(pending.to) || {}).name : null;
    }
    if (this.phase === 'travel') pending.fee = this.settings.travelFee;
    return pending;
  }

  publicState() {
    const p = this.cur;
    const pending = this.pendingView();
    return {
      seq: this.seq,
      players: this.players.map((q) => ({
        id: q.id,
        name: q.name,
        color: q.color,
        pawn: q.pawn,
        isBot: q.isBot,
        role: q.role,
        vip: q.vip,
        level: q.level,
        cash: q.cash,
        pos: q.pos,
        jailed: q.jailed,
        jailTurns: q.jailTurns,
        jailCards: q.jailCards,
        bankrupt: q.bankrupt,
        travel: q.travel,
        shield: q.shield,
        coupon: q.coupon,
        voucher: q.voucher,
        curse: q.curse,
        connected: q.connected,
        afk: q.afk,
        rank: q.rank,
        netWorth: this.netWorth(q),
      })),
      props: this.props.map((s, i) => (s ? { owner: s.owner, level: s.level, rent: s.owner ? this.rent(i) : 0, value: this.invested(i), sell: this.sellValue(i), takeover: s.owner ? this.takeoverPrice(i) : 0 } : null)),
      current: p ? p.id : null,
      turn: this.turn,
      round: this.round,
      phase: this.phase,
      pending,
      deadline: this.deadline,
      festival: this.festival,
      dice: this.dice,
      winner: this.winner,
      winType: this.winType,
      startedAt: this.startedAt,
      endsAt: this.endsAt,
      log: this.log.slice(-40),
      over: this.over,
      serverNow: Date.now(),
      melenchonLoot: this.melenchonLoot || 0,
    };
  }

  destroy() {
    clearTimeout(this.timer);
    this.over = true;
  }
}

module.exports = { Game, fmt };
