'use strict';
/** IA des bots (et des joueurs absents). Elle ne triche pas : elle ne voit que l'état public. */
const { CELLS, OWNABLE, COUNTRY_CELLS, RESORTS, CORNERS } = require('./board');

function reserve(game) {
  return Math.max(150, Math.round(game.settings.startMoney * 0.12));
}

/** Intérêt d'une case pour le joueur (complétion de pays, stations…). */
function interest(game, p, i) {
  const c = CELLS[i];
  let score = c.price / 100;
  if (c.type === 'city') {
    const group = COUNTRY_CELLS[c.country];
    const mine = group.filter((j) => game.props[j].owner === p.id).length;
    const others = group.filter((j) => game.props[j].owner && game.props[j].owner !== p.id).length;
    if (mine === group.length - 1) score += 6;
    else score += mine * 2;
    if (others) score -= 1;
  } else if (c.type === 'resort') {
    score += RESORTS.filter((j) => game.props[j].owner === p.id).length * 2.5;
  }
  return score;
}

function decide(game, p) {
  const pend = game.pendingView();
  const keep = reserve(game);
  switch (game.phase) {
    case 'roll':
      return { type: 'roll' };
    case 'jail':
      if (p.jailCards) return { type: 'card' };
      if (p.cash > game.settings.jailFine + keep * 2 && game.round > 2) return { type: 'pay' };
      return { type: 'roll' };
    case 'travel': {
      if (p.cash < game.settings.travelFee + keep) return { type: 'skip' };
      // Cherche une case libre intéressante ou une ville à développer
      let best = null;
      let bestScore = 0;
      for (const i of OWNABLE) {
        const s = game.props[i];
        let sc = 0;
        if (!s.owner && p.cash - CELLS[i].price > keep) sc = interest(game, p, i) + 2;
        else if (s.owner === p.id && CELLS[i].type === 'city' && s.level < 4) sc = 3 + s.level;
        if (sc > bestScore) {
          bestScore = sc;
          best = i;
        }
      }
      if (best == null) return { type: 'skip' };
      return { type: 'travel', cell: best };
    }
    case 'buy': {
      const opts = pend.options || [];
      const affordable = opts.filter((o) => p.cash - o.cost >= keep);
      if (!affordable.length) {
        // Achat même sous la réserve si la case complète un pays
        const i = pend.cell;
        if (opts[0] && opts[0].affordable && interest(game, p, i) >= 6) return { type: 'buy', level: 0 };
        return { type: 'skip' };
      }
      // Construit davantage quand il est riche
      const pick = p.cash > keep * 4 ? affordable[affordable.length - 1] : affordable[Math.min(1, affordable.length - 1)];
      return { type: 'buy', level: pick.level };
    }
    case 'build': {
      const opts = (pend.options || []).filter((o) => p.cash - o.cost >= keep);
      if (!opts.length) return { type: 'skip' };
      return { type: 'build', level: opts[opts.length - 1].level };
    }
    case 'takeover': {
      const i = pend.cell;
      const price = pend.price;
      const sc = interest(game, p, i);
      if (p.cash - price >= keep && (sc >= 6 || p.cash - price > keep * 3)) return { type: 'takeover' };
      return { type: 'skip' };
    }
    case 'festival': {
      const mine = game.owned(p);
      if (!mine.length) return { type: 'skip' };
      const best = mine.sort((a, b) => game.rent(b) - game.rent(a))[0];
      return { type: 'festival', cell: best };
    }
    case 'debt': {
      const list = game.owned(p).sort((a, b) => game.sellValue(a) - game.sellValue(b));
      if (!list.length) return { type: 'bankrupt' };
      // Vend d'abord ce qui suffit à couvrir la dette, sinon le moins cher
      const need = pend.amount - p.cash;
      const enough = list.find((i) => game.sellValue(i) >= need);
      return { type: 'sell', cell: enough != null ? enough : list[0] };
    }
  }
  return { type: 'skip' };
}

module.exports = { decide, CORNERS };
