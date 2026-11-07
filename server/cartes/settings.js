'use strict';

/** Règles configurables d'une salle de « Carton ! ». */
const DEFAULTS = {
  maxPlayers: 4, // 2 - 6
  startCards: 7, // cartes distribuées
  turnTime: 20, // secondes par décision (0 = illimité)
  targetScore: 0, // 0 = une seule manche, sinon partie en points
  stacking: true, // cumul des +2 / +4
  drawToPlay: false, // piocher jusqu'à pouvoir jouer
  sevenZero: false, // 7 = échange de main, 0 = toutes les mains tournent
  noSpecialFinish: true, // interdit de finir sur une carte spéciale (Stop, Demi-tour, +2, Jokers)
  cartonPenalty: 2, // cartes de pénalité si on oublie de crier « Carton ! »
  isPublic: false,
  allowSpectators: true,
};

const LIMITS = {
  maxPlayers: [2, 6],
  startCards: [3, 12],
  turnTime: [0, 300],
  targetScore: [0, 1000],
  cartonPenalty: [1, 6],
};

function sanitize(input, base = DEFAULTS) {
  const out = { ...DEFAULTS, ...base };
  for (const k of Object.keys(out)) if (!(k in DEFAULTS)) delete out[k];
  if (!input || typeof input !== 'object') return out;
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
  return out;
}

module.exports = { DEFAULTS, LIMITS, sanitize };
