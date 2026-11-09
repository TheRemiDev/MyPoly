'use strict';
/**
 * « Carton ! » — jeu de cartes de défausse (moteur côté serveur, autoritaire).
 * Tout le hasard (mélange, distribution) passe par le CSPRNG du serveur.
 * Chaque joueur ne reçoit que SA main : les mains adverses ne quittent jamais le serveur.
 */
const R = require('../game/random');

const COLORS = ['r', 'b', 'g', 'y'];
const COLOR_NAMES = { r: 'rouge', b: 'bleu', g: 'vert', y: 'jaune' };
const ACTIONS = ['skip', 'rev', '+2'];
/** Temps laissé aux adversaires pour prendre un joueur qui a oublié de crier (après les animations). */
const CATCH_WINDOW = 5000;

/** Paquet de 108 cartes. */
function buildDeck() {
  const cards = [];
  let id = 0;
  for (const c of COLORS) {
    cards.push({ id: id++, c, v: '0' });
    for (let k = 0; k < 2; k++) {
      for (let n = 1; n <= 9; n++) cards.push({ id: id++, c, v: String(n) });
      for (const a of ACTIONS) cards.push({ id: id++, c, v: a });
    }
  }
  for (let k = 0; k < 4; k++) {
    cards.push({ id: id++, c: 'w', v: 'wild' });
    cards.push({ id: id++, c: 'w', v: '+4' });
  }
  return cards;
}

function points(card) {
  if (card.c === 'w') return 50;
  if (ACTIONS.includes(card.v)) return 20;
  return Number(card.v);
}

function label(card) {
  const names = { skip: 'Stop', rev: 'Demi-tour', '+2': '+2', wild: 'Joker', '+4': 'Super Joker +4' };
  const v = names[card.v] || card.v;
  return card.c === 'w' ? v : `${v} ${COLOR_NAMES[card.c]}`;
}

class CardGame {
  constructor({ players, settings, onUpdate, onEnd }) {
    this.kind = 'cartes';
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
      hand: [],
      score: 0,
      carton: false, // a crié « Carton ! » pour sa dernière carte
      exposed: false, // a une seule carte sans avoir crié : peut être pris
      out: false, // a abandonné
      rank: 0,
      stats: { played: 0, plus4: 0, cartons: 0, caught: 0, catches: 0, drawn: 0, maxHit: 0, roundsWon: 0 },
    }));
    this.round = 0; // numéro de manche
    this.turns = 0;
    this.starter = R.int(0, this.players.length - 1);
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
    return this.players[this.turn];
  }
  get active() {
    return this.players.filter((p) => !p.out);
  }
  get top() {
    return this.discard[this.discard.length - 1];
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
  /** Index du joueur suivant (dans le sens du jeu), en sautant ceux qui ont abandonné. */
  nextIndex(from = this.turn, steps = 1) {
    let i = from;
    const n = this.players.length;
    for (let s = 0; s < steps; s++) {
      do i = (i + this.direction + n) % n;
      while (this.players[i].out);
    }
    return i;
  }
  /** Carte spéciale : tout sauf les chiffres. */
  isSpecial(card) {
    return !/^\d$/.test(card.v);
  }
  /** Règle « pas de fin sur une carte spéciale » : la dernière carte en main doit être un chiffre. */
  blockedFinish(card, p) {
    return !!(this.settings.noSpecialFinish && p && p.hand.length === 1 && p.hand[0].id === card.id && this.isSpecial(card));
  }
  playable(card, p = null) {
    if (this.blockedFinish(card, p)) return false;
    if (this.pendingDraw > 0) {
      // Cumul : +2 sur +2, +4 sur +2 ou +4
      if (card.v === '+4') return true;
      return card.v === '+2' && this.pendingType === '+2';
    }
    if (card.c === 'w') return true;
    return card.c === this.color || card.v === this.top.v;
  }

  // ------------------------------------------------------------ déroulement
  start() {
    this.say(`🃏 La partie de Carton ! commence. ${this.settings.targetScore ? `Premier à ${this.settings.targetScore} points !` : 'Une seule manche : le premier qui vide sa main gagne !'}`);
    this.startRound();
    this.flush();
  }

  startRound() {
    this.round++;
    this.deck = R.shuffle(buildDeck());
    this.discard = [];
    this.direction = 1;
    this.pendingDraw = 0;
    this.pendingType = null;
    this.drawnCard = null;
    this.phase = 'play';
    for (const p of this.players) {
      p.hand = [];
      p.carton = false;
      p.exposed = false;
      p.exposedUntil = null;
    }
    for (let k = 0; k < this.settings.startCards; k++) for (const p of this.active) p.hand.push(this.deck.pop());
    // La première carte retournée est toujours une carte numéro
    let first;
    for (;;) {
      first = this.deck.pop();
      if (/^\d$/.test(first.v)) break;
      this.deck.unshift(first);
      this.deck = R.shuffle(this.deck);
    }
    this.discard.push(first);
    this.color = first.c;
    this.starter = this.players[this.starter].out ? this.nextIndexFrom(this.starter) : this.starter;
    this.turn = this.starter;
    this.emit({ t: 'deal', round: this.round, n: this.settings.startCards, first, starter: this.cur.id }, 1400 + this.active.length * this.settings.startCards * 35);
    if (this.round > 1) this.say(`🔄 Manche ${this.round} ! ${this.cur.name} commence.`);
    else this.say(`${this.cur.name} ouvre le jeu.`, this.cur.id);
  }
  nextIndexFrom(i) {
    const n = this.players.length;
    let j = i;
    do j = (j + 1) % n;
    while (this.players[j].out);
    return j;
  }

  /** Pioche n cartes (remélange la défausse si besoin). */
  drawCards(p, n) {
    const got = [];
    for (let k = 0; k < n; k++) {
      if (!this.deck.length) {
        if (this.discard.length <= 1) break;
        const keep = this.discard.pop();
        this.deck = R.shuffle(this.discard);
        this.discard = [keep];
        this.emit({ t: 'reshuffle', n: this.deck.length }, 700);
      }
      got.push(this.deck.pop());
    }
    p.hand.push(...got);
    p.stats.drawn += got.length;
    if (p.hand.length > 1) {
      p.carton = false;
      p.exposed = false;
      p.exposedUntil = null;
    }
    return got;
  }

  endTurn(skip = 0) {
    this.drawnCard = null;
    this.phase = 'play';
    this.turns++;
    this.turn = this.nextIndex(this.turn, 1 + skip);
  }

  // --------------------------------------------------------------- actions
  act(pid, type, data = {}) {
    if (this.over) return { error: 'La partie est terminée.' };
    const p = this.player(pid);
    if (!p || p.out) return { error: 'Vous ne jouez pas dans cette partie.' };
    // Actions possibles hors de son tour
    if (type === 'carton') return this.doCarton(p);
    if (type === 'catch') return this.doCatch(p, data.target);
    if (p !== this.cur) return { error: 'Ce n\'est pas votre tour.' };
    if (this.phase === 'roundEnd') return { error: 'Manche terminée.' };
    p.timeouts = 0;
    p.afk = false;
    const res = this.handle(p, type, data);
    if (!res || !res.error) this.flush();
    return res || { ok: true };
  }

  handle(p, type, data) {
    switch (type) {
      case 'play':
        return this.doPlay(p, data);
      case 'draw':
        return this.doDraw(p, data);
      case 'pass':
        if (this.phase !== 'drawn') return { error: 'Vous devez jouer ou piocher.' };
        this.say(`${p.name} garde sa carte.`, p.id);
        this.endTurn();
        return { ok: true };
      default:
        return { error: 'Action inconnue.' };
    }
  }

  /** Fin de la fenêtre pendant laquelle un oubli de « Carton ! » peut être sanctionné. */
  expireExposure() {
    const now = Date.now();
    let changed = false;
    for (const q of this.players) {
      if (q.exposed && q.exposedUntil && now >= q.exposedUntil) {
        q.exposed = false;
        q.exposedUntil = null;
        changed = true;
      }
    }
    if (changed && !this.over) this.flush();
  }

  doPlay(p, { card: cardId, color, target, carton }) {
    const idx = p.hand.findIndex((c) => c.id === Number(cardId));
    if (idx === -1) return { error: 'Carte introuvable.' };
    const card = p.hand[idx];
    if (this.phase === 'drawn' && card.id !== this.drawnCard) return { error: 'Vous ne pouvez jouer que la carte piochée.' };
    if (this.blockedFinish(card, p)) return { error: 'Interdit de finir sur une carte spéciale : piochez !' };
    if (!this.playable(card)) return { error: 'Cette carte ne peut pas être posée.' };
    if (card.c === 'w' && !COLORS.includes(color)) return { error: 'Choisissez une couleur.' };
    let swapWith = null;
    if (this.settings.sevenZero && card.v === '7' && p.hand.length > 1) {
      swapWith = this.player(target);
      if (!swapWith || swapWith === p || swapWith.out) return { error: 'Choisissez avec qui échanger votre main.' };
    }
    p.hand.splice(idx, 1);
    this.discard.push(card);
    this.color = card.c === 'w' ? color : card.c;
    p.stats.played++;
    if (card.v === '+4') p.stats.plus4++;
    // « Carton ! » crié avec l'avant-dernière carte
    if (p.hand.length === 1) {
      if (carton || p.carton) {
        p.carton = true;
        p.stats.cartons++;
        this.emit({ t: 'carton', pid: p.id }, 900);
        this.say(`📣 ${p.name} crie « CARTON ! »`, p.id);
      } else {
        p.exposed = true;
        p.exposedUntil = null; // fixé à l'envoi, une fois les animations connues
      }
    }
    this.emit({ t: 'play', pid: p.id, card, color: this.color, left: p.hand.length }, 650);
    this.say(`${p.name} pose ${label(card)}${card.c === 'w' ? ` et choisit le ${COLOR_NAMES[this.color]}` : ''}.`, p.id);
    if (card.c === 'w') this.emit({ t: 'color', pid: p.id, color: this.color }, 700);

    // Effets
    const n = this.active.length;
    let skip = 0;
    if (card.v === 'skip') {
      const victim = this.players[this.nextIndex()];
      this.emit({ t: 'skip', pid: victim.id }, 800);
      this.say(`🚫 ${victim.name} passe son tour.`, victim.id);
      skip = 1;
    } else if (card.v === 'rev') {
      if (n === 2) {
        const victim = this.players[this.nextIndex()];
        this.emit({ t: 'skip', pid: victim.id, rev: true }, 800);
        skip = 1;
      } else {
        this.direction *= -1;
        this.emit({ t: 'reverse', dir: this.direction }, 800);
        this.say('🔄 Demi-tour ! Le sens du jeu change.');
      }
    } else if (card.v === '+2' || card.v === '+4') {
      const amount = card.v === '+2' ? 2 : 4;
      this.pendingDraw += amount;
      this.pendingType = card.v;
      this.pendingBy = p;
      if (this.pendingDraw > amount) this.emit({ t: 'stack', pid: p.id, total: this.pendingDraw }, 700);
    } else if (swapWith) {
      const mine = p.hand;
      p.hand = swapWith.hand;
      swapWith.hand = mine;
      for (const q of [p, swapWith]) {
        q.carton = false;
        q.exposed = false;
      }
      this.emit({ t: 'swap', a: p.id, b: swapWith.id }, 1200);
      this.say(`🔀 ${p.name} échange sa main avec ${swapWith.name} !`, p.id);
    } else if (this.settings.sevenZero && card.v === '0' && p.hand.length > 0) {
      const order = [];
      let i = this.turn;
      do {
        order.push(this.players[i]);
        i = this.nextIndex(i);
      } while (i !== this.turn);
      const hands = order.map((q) => q.hand);
      order.forEach((q, k) => {
        q.hand = hands[(k - 1 + order.length) % order.length];
        q.carton = false;
        q.exposed = false;
      });
      this.emit({ t: 'rotate', dir: this.direction }, 1200);
      this.say('🌀 Toutes les mains tournent !');
    }

    if (!p.hand.length) return this.roundWon(p);

    // Sans cumul, la pioche forcée s'applique tout de suite au joueur suivant
    if (this.pendingDraw && !this.settings.stacking) {
      const victim = this.players[this.nextIndex()];
      this.forceDraw(victim, p);
      skip = 1;
    }
    this.endTurn(skip);
    return { ok: true };
  }

  /** Le joueur prend toutes les cartes en attente (+2 / +4) et passe son tour. */
  forceDraw(victim, by) {
    const n = this.pendingDraw;
    const got = this.drawCards(victim, n);
    if (by) by.stats.maxHit = Math.max(by.stats.maxHit, n);
    this.emit({ t: 'draw', pid: victim.id, n: got.length, cards: got, forced: true, total: n }, 500 + got.length * 140);
    this.say(`😵 ${victim.name} pioche ${got.length} carte${got.length > 1 ? 's' : ''} et passe son tour !`, victim.id);
    this.pendingDraw = 0;
    this.pendingType = null;
  }

  doDraw(p, data = {}) {
    if (this.phase === 'drawn') return { error: 'Vous avez déjà pioché : jouez la carte ou passez.' };
    // On ne pioche que si l'on ne peut rien poser (sauf pioche automatique d'un temps écoulé).
    // Face à un +2/+4, piocher la pénalité reste permis même si l'on pourrait contrer.
    if (!this.pendingDraw && !data.forced && p.hand.some((c) => this.playable(c, p))) {
      return { error: 'Vous avez une carte jouable : posez-la au lieu de piocher !' };
    }
    if (this.pendingDraw) {
      this.forceDraw(p, this.pendingBy);
      this.endTurn();
      return { ok: true };
    }
    const got = [];
    for (;;) {
      const one = this.drawCards(p, 1);
      if (!one.length) break;
      got.push(one[0]);
      if (!this.settings.drawToPlay || this.playable(one[0], p) || got.length >= 30) break;
    }
    this.emit({ t: 'draw', pid: p.id, n: got.length, cards: got }, 450 + got.length * 140);
    const last = got[got.length - 1];
    if (last && this.playable(last, p)) {
      this.phase = 'drawn';
      this.drawnCard = last.id;
      if (got.length > 1) this.say(`${p.name} pioche ${got.length} cartes.`, p.id);
      return { ok: true };
    }
    this.say(got.length ? `${p.name} pioche ${got.length > 1 ? got.length + ' cartes' : 'une carte'} et passe.` : `${p.name} ne peut pas piocher et passe.`, p.id);
    this.endTurn();
    return { ok: true };
  }

  doCarton(p) {
    if (this.over || p.out) return { error: 'Impossible maintenant.' };
    if (p.carton) return { ok: true };
    const n = p.hand.length;
    // Avant de poser l'avant-dernière carte (pendant son tour) ou juste après
    if (!(n === 1 || (n === 2 && p === this.cur))) return { error: 'On ne crie « Carton ! » qu\'avec sa dernière carte en main.' };
    p.carton = true;
    if (n === 1) {
      p.exposed = false;
      p.exposedUntil = null;
      p.stats.cartons++;
      this.emit({ t: 'carton', pid: p.id }, 900);
      this.say(`📣 ${p.name} crie « CARTON ! »`, p.id);
      this.flush();
    }
    return { ok: true };
  }

  doCatch(p, targetId) {
    const t = this.player(targetId);
    if (!t || t === p) return { error: 'Joueur introuvable.' };
    if (!t.exposed || t.hand.length !== 1) return { error: t.carton ? `${t.name} a bien crié « Carton ! ».` : `Trop tard : ${t.name} ne peut plus être pris.` };
    t.exposed = false;
    t.exposedUntil = null;
    const pen = this.settings.cartonPenalty;
    const got = this.drawCards(t, pen);
    t.stats.caught++;
    p.stats.catches++;
    this.emit({ t: 'caught', pid: t.id, by: p.id, n: got.length }, 1200);
    this.emit({ t: 'draw', pid: t.id, n: got.length, cards: got, penalty: true }, 400 + got.length * 140);
    this.say(`🚨 ${p.name} prend ${t.name} : pas de « Carton ! » crié ! +${got.length} cartes.`, p.id);
    this.flush();
    return { ok: true };
  }

  // -------------------------------------------------------- fin de manche
  roundWon(p) {
    // Les cartes en attente sont tout de même distribuées (elles comptent au score)
    if (this.pendingDraw) this.forceDraw(this.players[this.nextIndex()], p);
    clearTimeout(this.timer);
    this.cancelBotTimers();
    p.stats.roundsWon++;
    const gained = this.active.filter((q) => q !== p).reduce((s, q) => s + q.hand.reduce((a, c) => a + points(c), 0), 0);
    const target = this.settings.targetScore;
    p.score += gained;
    this.phase = 'roundEnd';
    this.emit({ t: 'roundWin', pid: p.id, points: gained, hands: this.players.map((q) => ({ id: q.id, cards: q.hand, score: q.score })) }, target ? 5200 : 2600);
    this.say(target ? `🏁 ${p.name} vide sa main et marque ${gained} points (total ${p.score}/${target}).` : `🏁 ${p.name} vide sa main !`, p.id);
    if (!target || p.score >= target) return this.finish(p);
    this.starter = this.nextIndexFrom(this.starter);
    this.pendingRound = true;
    return { ok: true };
  }

  finish(winner, type = 'cartes') {
    if (this.over) return { ok: true };
    this.over = true;
    this.phase = 'over';
    this.winner = winner ? winner.id : null;
    this.winType = type;
    clearTimeout(this.timer);
    this.cancelBotTimers();
    const handPts = (q) => q.hand.reduce((a, c) => a + points(c), 0);
    const target = this.settings.targetScore;
    const others = this.players.filter((q) => q !== winner);
    others.sort((a, b) => (a.out !== b.out ? (a.out ? 1 : -1) : target ? b.score - a.score || handPts(a) - handPts(b) : a.hand.length - b.hand.length || handPts(a) - handPts(b)));
    [winner, ...others].filter(Boolean).forEach((q, k) => (q.rank = k + 1));
    if (winner) this.say(`🏆 ${winner.name} remporte la partie !`, winner.id);
    this.emit({ t: 'win', pid: this.winner }, 500);
    this.endedAt = Date.now();
    this.onEnd(this.result());
    return { ok: true };
  }

  result() {
    return {
      kind: 'cartes',
      winner: this.winner,
      winType: 'cartes',
      duration: Math.round(((this.endedAt || Date.now()) - this.startedAt) / 1000),
      rounds: this.round,
      turns: this.turns,
      players: this.players.map((p) => ({
        id: p.id,
        userId: p.userId,
        name: p.name,
        isBot: p.isBot,
        rank: p.rank,
        bankrupt: p.out,
        netWorth: p.score,
        score: p.score,
        cards: p.hand.length,
        stats: p.stats,
      })),
    };
  }

  forfeit(pid) {
    const p = this.player(pid);
    if (!p || p.out || this.over) return;
    const wasCur = p === this.cur;
    p.out = true;
    this.deck.unshift(...p.hand);
    p.hand = [];
    p.exposed = false;
    this.say(`🏳️ ${p.name} abandonne la partie.`, p.id);
    this.emit({ t: 'out', pid: p.id }, 400);
    const left = this.active;
    if (left.length === 1) this.finish(left[0], 'forfeit');
    else if (wasCur && this.phase !== 'roundEnd') {
      this.pendingDraw = 0;
      this.pendingType = null;
      this.endTurn();
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
  botDecide(p) {
    if (this.phase === 'drawn') {
      const card = p.hand.find((c) => c.id === this.drawnCard);
      if (card && this.playable(card, p) && R.int(1, 10) <= 9) return this.botPlay(p, card);
      return { type: 'pass' };
    }
    const options = p.hand.filter((c) => this.playable(c, p));
    if (!options.length) return { type: 'draw' };
    const next = this.players[this.nextIndex()];
    const threat = next.hand.length <= 2;
    const score = (c) => {
      let s = 0;
      if (c.c === 'w') s -= 6; // les jokers sont gardés pour la fin
      if (c.v === '+4') s -= 4;
      if (ACTIONS.includes(c.v)) s += threat ? 8 : 2;
      if ((c.v === '+4' || c.v === '+2') && threat) s += 6;
      if (/^\d$/.test(c.v)) s += Number(c.v) / 3; // se débarrasser des grosses cartes
      if (c.c === this.color) s += 1;
      if (this.settings.noSpecialFinish && p.hand.length === 2 && this.isSpecial(c)) s += 15; // ne pas garder une spéciale pour la fin
      if (this.settings.sevenZero && c.v === '7') {
        const best = this.active.filter((q) => q !== p).sort((a, b) => a.hand.length - b.hand.length)[0];
        s += best && best.hand.length < p.hand.length - 1 ? 7 : -8;
      }
      if (this.settings.sevenZero && c.v === '0') s += p.hand.length > 4 ? 2 : -3;
      return s + Math.random();
    };
    options.sort((a, b) => score(b) - score(a));
    return this.botPlay(p, options[0]);
  }
  botPlay(p, card) {
    const counts = { r: 0, b: 0, g: 0, y: 0 };
    for (const c of p.hand) if (c.c !== 'w' && c.id !== card.id) counts[c.c]++;
    const color = card.c === 'w' ? Object.entries(counts).sort((a, b) => b[1] - a[1] || Math.random() - 0.5)[0][0] : undefined;
    const target = this.active.filter((q) => q !== p).sort((a, b) => a.hand.length - b.hand.length)[0];
    return { type: 'play', card: card.id, color, target: target && target.id, carton: p.hand.length === 2 && R.int(1, 100) <= 85 };
  }
  cancelBotTimers() {
    for (const t of this.botTimers) clearTimeout(t);
    this.botTimers = [];
  }
  /** Les bots surveillent les joueurs qui oublient de crier « Carton ! ». */
  watchExposed() {
    for (const t of this.players) {
      if (!t.exposed || t.watched) continue;
      t.watched = true;
      const hunters = this.active.filter((q) => q.isBot && q !== t);
      if (!hunters.length || R.int(1, 100) > 60) continue;
      const hunter = R.pick(hunters);
      const delay = this.anim + R.int(1500, 3500);
      this.botTimers.push(setTimeout(() => {
        if (!this.over && t.exposed) this.doCatch(hunter, t.id);
      }, delay));
    }
    for (const t of this.players) if (!t.exposed) t.watched = false;
  }

  // --------------------------------------------------------- minuteur, sortie
  autoAct(useBot) {
    if (this.over) return;
    if (this.pendingRound) {
      this.pendingRound = false;
      this.startRound();
      this.flush();
      return;
    }
    const p = this.cur;
    let action = useBot ? this.botDecide(p) : this.phase === 'drawn' ? { type: 'pass' } : { type: 'draw', forced: true };
    let res = this.handle(p, action.type, action);
    if (res && res.error) {
      action = this.phase === 'drawn' ? { type: 'pass' } : { type: 'draw', forced: true };
      res = this.handle(p, action.type, action);
      if (res && res.error) this.endTurn();
    }
    this.flush();
  }

  schedule() {
    clearTimeout(this.timer);
    if (this.over) return;
    const base = Math.max(0, this.anim - (Date.now() - (this.flushedAt || Date.now())));
    if (this.pendingRound) {
      this.deadline = null;
      this.timer = setTimeout(() => this.autoAct(true), base + 600);
      return;
    }
    const p = this.cur;
    const tt = this.settings.turnTime * 1000;
    if (p.isBot) {
      this.deadline = null;
      this.timer = setTimeout(() => this.autoAct(true), base + 650 + R.int(0, 700));
      return;
    }
    if (!p.connected || p.afk) {
      this.deadline = Date.now() + base + 5000;
      this.timer = setTimeout(() => this.autoAct(true), base + 5000);
      return;
    }
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
    if (!this.over) {
      for (const q of this.players) {
        if (!q.exposed || q.exposedUntil) continue;
        q.exposedUntil = Date.now() + this.anim + CATCH_WINDOW;
        this.botTimers.push(setTimeout(() => this.expireExposure(), q.exposedUntil - Date.now() + 30));
      }
      this.watchExposed();
    }
    const events = this.events;
    this.events = [];
    this.schedule();
    this.anim = 0;
    this.seq++;
    this.onUpdate({ events, seq: this.seq });
  }

  /** Évènements vus par un joueur : les cartes piochées par les autres restent cachées. */
  eventsFor(events, viewer) {
    return events.map((ev) => {
      if (ev.t === 'draw' && ev.pid !== viewer) return { ...ev, cards: undefined };
      if (ev.t === 'roundWin' || ev.t === 'win') return ev; // mains révélées en fin de manche
      return ev;
    });
  }

  /** État visible par un joueur (ou un spectateur si viewer est null). */
  publicState(viewer = null) {
    const me = viewer ? this.player(viewer) : null;
    const reveal = this.over || this.phase === 'roundEnd';
    return {
      kind: 'cartes',
      round: this.round,
      turns: this.turns,
      phase: this.phase,
      current: this.cur ? this.cur.id : null,
      direction: this.direction,
      color: this.color,
      top: this.top,
      discardCount: this.discard.length,
      deckCount: this.deck.length,
      pendingDraw: this.pendingDraw,
      pendingType: this.pendingType,
      drawnCard: me && me === this.cur ? this.drawnCard : null,
      hand: me && !me.out ? me.hand : null,
      playable: me && me === this.cur && !this.over && this.phase !== 'roundEnd'
        ? me.hand.filter((c) => (this.phase === 'drawn' ? c.id === this.drawnCard : true) && this.playable(c, me)).map((c) => c.id)
        : [],
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
        count: p.hand.length,
        score: p.score,
        carton: p.carton,
        exposed: p.exposed,
        exposedUntil: p.exposed ? p.exposedUntil : null,
        out: p.out,
        bankrupt: p.out,
        rank: p.rank,
        netWorth: p.score,
        hand: reveal ? p.hand : undefined,
      })),
      log: this.log.slice(-40),
      deadline: this.deadline,
      serverNow: Date.now(),
      over: this.over,
      winner: this.winner,
      settings: { targetScore: this.settings.targetScore, stacking: this.settings.stacking, sevenZero: this.settings.sevenZero, noSpecialFinish: this.settings.noSpecialFinish },
    };
  }

  destroy() {
    clearTimeout(this.timer);
    this.cancelBotTimers();
    this.over = true;
  }
}

module.exports = { CardGame, buildDeck, points, label };
