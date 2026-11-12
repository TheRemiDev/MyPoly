/**
 * MyPoly Poker — évaluation des mains de Texas Hold'em (partagé serveur / navigateur).
 *
 * Cartes : entiers 0..51. Hauteur = (c >> 2) + 2 (2..14, As = 14), couleur = c & 3
 * (0 pique, 1 cœur, 2 carreau, 3 trèfle).
 *
 * Ce fichier n'utilise ni import ni export : côté serveur il est chargé par require(),
 * côté navigateur il s'installe dans globalThis.PokerEval.
 */
(function (root) {
  'use strict';

  const RANK_NAMES = { 2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9', 10: '10', 11: 'Valet', 12: 'Dame', 13: 'Roi', 14: 'As' };
  const RANK_SHORT = { 2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9', 10: '10', 11: 'V', 12: 'D', 13: 'R', 14: 'A' };
  const SUIT_NAMES = ['pique', 'cœur', 'carreau', 'trèfle'];
  const CATEGORIES = ['Hauteur', 'Paire', 'Double paire', 'Brelan', 'Quinte', 'Couleur', 'Full', 'Carré', 'Quinte flush'];

  const rankOf = (c) => (c >> 2) + 2;
  const suitOf = (c) => c & 3;

  /** « de Rois », « d'As », « de 8 » */
  function ofRank(r, plural = true) {
    const n = RANK_NAMES[r];
    if (r === 14) return "d'As";
    return 'de ' + (plural && r >= 11 ? n + 's' : n);
  }
  /** « au Roi », « à l'As », « au 9 » */
  function toRank(r) {
    if (r === 14) return "à l'As";
    if (r === 12) return 'à la Dame';
    return 'au ' + RANK_NAMES[r];
  }
  function cardName(c) {
    const r = rankOf(c);
    return `${RANK_NAMES[r]} de ${SUIT_NAMES[suitOf(c)]}`;
  }

  const P = [759375, 50625, 3375, 225, 15, 1]; // puissances de 15
  function score(cat, ranks) {
    let s = cat * P[0];
    for (let i = 0; i < 5; i++) s += (ranks[i] || 0) * P[i + 1];
    return s;
  }
  function straightTop(mask) {
    if (mask & (1 << 14)) mask |= 1 << 1; // l'As compte aussi pour 1 (quinte 5-4-3-2-A)
    for (let t = 14; t >= 5; t--) {
      const need = 0b11111 << (t - 4);
      if ((mask & need) === need) return t;
    }
    return 0;
  }

  /**
   * Évalue de 5 à 7 cartes : { score, cat, ranks }.
   * Plus le score est grand, plus la main est forte (comparaison directe).
   */
  function evaluate(cards) {
    const rc = new Array(15).fill(0);
    const sc = [0, 0, 0, 0];
    const bySuit = [[], [], [], []];
    let mask = 0;
    for (const c of cards) {
      const r = rankOf(c);
      const s = suitOf(c);
      rc[r]++;
      sc[s]++;
      bySuit[s].push(r);
      mask |= 1 << r;
    }
    let fs = -1;
    for (let s = 0; s < 4; s++) if (sc[s] >= 5) fs = s;
    if (fs >= 0) {
      let fm = 0;
      for (const r of bySuit[fs]) fm |= 1 << r;
      const sf = straightTop(fm);
      if (sf) return { score: score(8, [sf]), cat: 8, ranks: [sf] };
    }
    const quads = [];
    const trips = [];
    const pairs = [];
    const singles = [];
    for (let r = 14; r >= 2; r--) {
      if (rc[r] === 4) quads.push(r);
      else if (rc[r] === 3) trips.push(r);
      else if (rc[r] === 2) pairs.push(r);
      else if (rc[r] === 1) singles.push(r);
    }
    if (quads.length) {
      const k = Math.max(trips[0] || 0, pairs[0] || 0, singles[0] || 0);
      return { score: score(7, [quads[0], k]), cat: 7, ranks: [quads[0], k] };
    }
    if (trips.length && (trips.length > 1 || pairs.length)) {
      const t = trips[0];
      const p = Math.max(trips[1] || 0, pairs[0] || 0);
      return { score: score(6, [t, p]), cat: 6, ranks: [t, p] };
    }
    if (fs >= 0) {
      const top = bySuit[fs].sort((a, b) => b - a).slice(0, 5);
      return { score: score(5, top), cat: 5, ranks: top, suit: fs };
    }
    const st = straightTop(mask);
    if (st) return { score: score(4, [st]), cat: 4, ranks: [st] };
    if (trips.length) {
      const ks = singles.slice(0, 2);
      return { score: score(3, [trips[0], ...ks]), cat: 3, ranks: [trips[0], ...ks] };
    }
    if (pairs.length >= 2) {
      const k = Math.max(pairs[2] || 0, singles[0] || 0);
      return { score: score(2, [pairs[0], pairs[1], k]), cat: 2, ranks: [pairs[0], pairs[1], k] };
    }
    if (pairs.length) {
      const ks = singles.slice(0, 3);
      return { score: score(1, [pairs[0], ...ks]), cat: 1, ranks: [pairs[0], ...ks] };
    }
    const top = singles.slice(0, 5);
    return { score: score(0, top), cat: 0, ranks: top };
  }

  /** Nom français d'une main évaluée : « Paire de Rois », « Full aux Dames par les 3 »… */
  function describe(ev) {
    const r = ev.ranks;
    switch (ev.cat) {
      case 8:
        return r[0] === 14 ? 'Quinte flush royale' : `Quinte flush ${toRank(r[0])}`;
      case 7:
        return `Carré ${ofRank(r[0])}`;
      case 6:
        return `Full aux ${r[0] === 14 ? 'As' : RANK_NAMES[r[0]] + (r[0] >= 11 ? 's' : '')} par les ${r[1] === 14 ? 'As' : RANK_NAMES[r[1]] + (r[1] >= 11 ? 's' : '')}`;
      case 5:
        return `Couleur ${toRank(r[0])}${ev.suit != null ? ` (${SUIT_NAMES[ev.suit]})` : ''}`;
      case 4:
        return `Quinte ${toRank(r[0])}`;
      case 3:
        return `Brelan ${ofRank(r[0])}`;
      case 2:
        return `Double paire ${r[0] === 14 ? 'As' : RANK_NAMES[r[0]] + (r[0] >= 11 ? 's' : '')} et ${r[1] === 14 ? 'As' : RANK_NAMES[r[1]] + (r[1] >= 11 ? 's' : '')}`;
      case 1:
        return `Paire ${ofRank(r[0])}`;
      default:
        return `Hauteur ${r[0] === 14 ? 'As' : RANK_NAMES[r[0]]}`;
    }
  }

  /** Les 5 cartes qui composent la meilleure main (pour les mettre en valeur). */
  function bestFive(cards) {
    if (cards.length <= 5) return cards.slice();
    let best = null;
    let bestScore = -1;
    const n = cards.length;
    for (let a = 0; a < n; a++)
      for (let b = a + 1; b < n; b++)
        for (let c = b + 1; c < n; c++)
          for (let d = c + 1; d < n; d++)
            for (let e = d + 1; e < n; e++) {
              const five = [cards[a], cards[b], cards[c], cards[d], cards[e]];
              const s = evaluate(five).score;
              if (s > bestScore) {
                bestScore = s;
                best = five;
              }
            }
    // Seules les cartes « utiles » : pour une paire, les deux cartes de la paire, etc.
    return best;
  }
  /** Cartes qui font vraiment la main (sans les cartes d'accompagnement), pour le mode Débutant. */
  function coreCards(cards) {
    const five = bestFive(cards);
    const ev = evaluate(five);
    if (ev.cat === 0) return five.filter((c) => rankOf(c) === ev.ranks[0]);
    if (ev.cat === 1) return five.filter((c) => rankOf(c) === ev.ranks[0]);
    if (ev.cat === 2) return five.filter((c) => rankOf(c) === ev.ranks[0] || rankOf(c) === ev.ranks[1]);
    if (ev.cat === 3) return five.filter((c) => rankOf(c) === ev.ranks[0]);
    if (ev.cat === 7) return five.filter((c) => rankOf(c) === ev.ranks[0]);
    return five;
  }

  function fullDeck() {
    return Array.from({ length: 52 }, (_, i) => i);
  }

  /**
   * Chances de gagner (simulation de Monte-Carlo) : mes 2 cartes, le tableau connu,
   * contre `opponents` mains inconnues. Retourne { win, tie, lose } entre 0 et 1.
   * `rand` : fonction () => [0, 1[ (Math.random par défaut).
   */
  function equity(hole, board, opponents, iters = 800, rand = Math.random) {
    opponents = Math.max(1, Math.min(8, opponents | 0));
    const known = new Set([...hole, ...board]);
    const deck = fullDeck().filter((c) => !known.has(c));
    const need = 5 - board.length;
    let win = 0;
    let tie = 0;
    const draw = new Array(deck.length);
    for (let it = 0; it < iters; it++) {
      // Tirage partiel de Fisher-Yates : juste les cartes nécessaires
      for (let i = 0; i < deck.length; i++) draw[i] = deck[i];
      const take = need + opponents * 2;
      for (let i = 0; i < take; i++) {
        const j = i + Math.floor(rand() * (draw.length - i));
        const t = draw[i];
        draw[i] = draw[j];
        draw[j] = t;
      }
      const full = board.concat(draw.slice(0, need));
      const mine = evaluate(hole.concat(full)).score;
      let best = 0;
      let lost = false;
      let ties = 0;
      for (let o = 0; o < opponents; o++) {
        const s = evaluate([draw[need + o * 2], draw[need + o * 2 + 1]].concat(full)).score;
        if (s > mine) {
          lost = true;
          break;
        }
        if (s === mine) ties++;
        if (s > best) best = s;
      }
      if (lost) continue;
      if (ties) tie += 1 / (ties + 1);
      else win++;
    }
    return { win: win / iters, tie: tie / iters, lose: 1 - (win + tie) / iters };
  }

  /** Force d'une main de départ (2 cartes) : 0 à 100, et catégorie pour débutants. */
  function startingHand(hole) {
    const [a, b] = hole.map(rankOf).sort((x, y) => y - x);
    const suited = suitOf(hole[0]) === suitOf(hole[1]);
    const pair = a === b;
    // Formule inspirée de Chen, ramenée sur 100
    const base = { 14: 10, 13: 8, 12: 7, 11: 6 }[a] || a / 2;
    let pts = pair ? Math.max(5, base * 2) : base;
    if (suited) pts += 2;
    const gap = a - b - 1;
    if (!pair) {
      pts -= gap <= 0 ? 0 : gap === 1 ? 1 : gap === 2 ? 2 : gap === 3 ? 4 : 5;
      if (gap <= 1 && a < 12) pts += 1;
    }
    const pct = Math.max(0, Math.min(100, Math.round((pts / 20) * 100)));
    const label = pct >= 60 ? 'Main premium' : pct >= 45 ? 'Très bonne main' : pct >= 33 ? 'Main jouable' : pct >= 22 ? 'Main moyenne' : 'Main faible';
    const short = (r) => RANK_SHORT[r];
    return { pct, label, code: pair ? `paire ${ofRank(a)}` : `${short(a)}-${short(b)} ${suited ? 'assorties' : 'dépareillées'}`, suited, pair };
  }

  const api = { evaluate, describe, bestFive, coreCards, equity, startingHand, rankOf, suitOf, cardName, RANK_NAMES, RANK_SHORT, SUIT_NAMES, CATEGORIES, fullDeck };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PokerEval = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
