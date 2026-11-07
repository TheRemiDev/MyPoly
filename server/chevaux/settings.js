'use strict';

/** Règles configurables d'une salle de Petits chevaux. */
const DEFAULTS = {
  maxPlayers: 4, // 2 - 4
  turnTime: 20, // secondes par décision (0 = illimité)
  horsesToWin: 2, // chevaux à ramener au centre pour gagner
  sixToExit: true, // un 6 pour sortir de l'écurie (sinon 1 ou 6)
  sixReplay: true, // un 6 fait rejouer
  strictLadder: false, // échelle classique : 1 pour la 1re marche, 2 pour la 2e… puis 6 pour le centre
  noPassing: false, // interdit de doubler un cheval
  captureReplay: false, // rejouer après avoir renvoyé un cheval à l'écurie
  threeTries: true, // 3 essais pour faire un 6 quand aucun cheval n'est en jeu
  isPublic: false,
  allowSpectators: true,
};

const LIMITS = {
  maxPlayers: [2, 4],
  turnTime: [0, 300],
  horsesToWin: [1, 4],
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
