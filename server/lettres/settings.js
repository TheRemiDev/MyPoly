'use strict';

/** Règles configurables d'une partie de « Lettres d'Or » (mots croisés). */
const DEFAULTS = {
  maxPlayers: 4, // 2 - 4
  turnTime: 120, // secondes par coup (0 = illimité)
  targetScore: 0, // 0 = partie complète (jusqu'au sac vide), sinon premier à N points
  bingo: 50, // bonus « Lettres d'Or » : les 7 lettres posées d'un coup
  isPublic: false,
  allowSpectators: true,
};

const LIMITS = {
  maxPlayers: [2, 4],
  turnTime: [0, 600],
  targetScore: [0, 1000],
  bingo: [0, 100],
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
