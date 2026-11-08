'use strict';

/** Règles configurables d'une salle de « Fin de mois ». */
const DEFAULTS = {
  maxPlayers: 4, // 2 - 6
  turnTime: 25, // secondes par décision (0 = illimité)
  months: 3, // durée de la partie, en mois
  startCash: 3000, // argent de départ (€)
  salary: 3500, // salaire versé le 31
  loanRate: 10, // intérêts mensuels des emprunts (%)
  jackpotSix: true, // un 6 au dé remporte la cagnotte
  sundayBet: true, // match du dimanche (pari)
  tombola: true, // tombola : tout le monde participe
  unsoldValue: false, // en fin de partie, les affaires invendues valent leur prix d'achat
  isPublic: false,
  allowSpectators: true,
};

const LIMITS = {
  maxPlayers: [2, 6],
  turnTime: [0, 300],
  months: [1, 12],
  startCash: [0, 20000],
  salary: [1000, 20000],
  loanRate: [0, 30],
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
