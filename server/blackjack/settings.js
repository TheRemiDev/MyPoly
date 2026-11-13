'use strict';

/** Règles configurables d'une table de Blackjack. */
const DEFAULTS = {
  maxPlayers: 5, // 1 - 5 (on peut jouer seul contre la banque)
  startChips: 1000, // jetons de départ
  minBet: 10, // mise minimum
  maxBet: 500, // mise maximum (0 = jusqu'à tout son tapis)
  rounds: 12, // nombre de manches ; le plus riche à la fin gagne
  decks: 6, // jeux de 52 cartes dans le sabot
  hitSoft17: false, // la banque tire sur un 17 « souple » (As + 6)
  bjPays: 150, // un blackjack paie 3 pour 2 (150 %) ou 6 pour 5 (120 %)
  turnTime: 20, // secondes par décision (0 = illimité)
  isPublic: false,
  allowSpectators: true,
};

const LIMITS = {
  maxPlayers: [1, 5],
  startChips: [100, 100000],
  minBet: [1, 10000],
  maxBet: [0, 100000],
  rounds: [1, 100],
  decks: [1, 8],
  bjPays: [120, 150],
  turnTime: [0, 300],
};

function sanitize(input, base = DEFAULTS) {
  const out = { ...DEFAULTS, ...base };
  for (const k of Object.keys(out)) if (!(k in DEFAULTS)) delete out[k];
  if (input && typeof input === 'object') {
    for (const key of Object.keys(DEFAULTS)) {
      if (!(key in input)) continue;
      const def = DEFAULTS[key];
      let v = input[key];
      if (typeof def === 'boolean') out[key] = Boolean(v);
      else if (typeof def === 'number') {
        v = Number(v);
        if (!Number.isFinite(v)) continue;
        const [min, max] = LIMITS[key] || [0, 1e9];
        out[key] = Math.round(Math.min(max, Math.max(min, v)));
      }
    }
  }
  out.bjPays = out.bjPays >= 135 ? 150 : 120;
  out.minBet = Math.max(1, Math.min(out.minBet, Math.floor(out.startChips / 10)));
  if (out.maxBet && out.maxBet < out.minBet) out.maxBet = out.minBet;
  return out;
}

module.exports = { DEFAULTS, LIMITS, sanitize };
