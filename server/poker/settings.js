'use strict';

/** Règles configurables d'une salle de Poker (Texas Hold'em sans limite). */
const DEFAULTS = {
  maxPlayers: 6, // 2 - 6
  startStack: 1000, // jetons de départ de chaque joueur
  bigBlind: 20, // grosse blinde au départ (la petite blinde vaut la moitié)
  blindUp: 8, // les blindes doublent toutes les N mains (0 = jamais)
  turnTime: 25, // secondes par décision (0 = illimité)
  maxHands: 0, // 0 = jusqu'au dernier joueur en lice, sinon nombre de mains (le plus gros tapis gagne)
  isPublic: false,
  allowSpectators: true,
};

const LIMITS = {
  maxPlayers: [2, 6],
  startStack: [100, 100000],
  bigBlind: [2, 10000],
  blindUp: [0, 50],
  turnTime: [0, 300],
  maxHands: [0, 500],
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
  // Blinde paire (petite blinde entière) et pas plus d'un dixième du tapis de départ
  out.bigBlind = Math.max(2, Math.min(Math.floor(out.startStack / 10), out.bigBlind));
  if (out.bigBlind % 2) out.bigBlind += 1;
  return out;
}

module.exports = { DEFAULTS, LIMITS, sanitize };
