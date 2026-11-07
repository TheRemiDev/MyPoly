'use strict';

/** Règles configurables d'une salle. */
const DEFAULTS = {
  maxPlayers: 4, // 2 - 4 (un joueur par coin de l'écran)
  startMoney: 2000, // en K
  salary: 300, // gain au passage du Départ
  turnTime: 30, // secondes par décision (0 = illimité)
  gameDuration: 0, // minutes (0 = illimité) -> le plus riche gagne à la fin
  maxRounds: 0, // tours maximum (0 = illimité)
  doubleReplay: true, // un double permet de rejouer
  takeover: true, // rachat des propriétés adverses
  takeoverMult: 2, // prix du rachat = valeur investie x mult
  buildOnPurchase: true, // construire des maisons dès l'achat du terrain
  firstRoundLimit: true, // 1er tour : 2 maisons maximum par ville
  countryDoubleRent: true, // loyer x2 si un pays complet est possédé
  tripleMonopoly: true, // victoire en possédant 3 pays complets
  lineMonopoly: true, // victoire en possédant tout un côté du plateau
  resortMonopoly: true, // victoire en possédant les 4 stations balnéaires
  festival: true, // case Festival active (loyer x2)
  jailFine: 100, // amende pour sortir de prison
  travelFee: 50, // coût du vol depuis l'Aéroport
  startBonus: true, // atterrir sur le Départ = salaire doublé
  taxPercent: 10, // % de la fortune pour la case Impôts
  melenchon: false,
  politicalBoard: false, // (administrateurs) plateau satirique politique // (administrateurs) la case Impôts devient « Mélenchon »
  isPublic: false, // salle visible dans la liste publique
  allowSpectators: true,
};

const LIMITS = {
  maxPlayers: [2, 4],
  startMoney: [500, 10000],
  salary: [0, 2000],
  turnTime: [0, 300],
  gameDuration: [0, 240],
  maxRounds: [0, 200],
  takeoverMult: [1, 5],
  jailFine: [0, 1000],
  travelFee: [0, 1000],
  taxPercent: [0, 50],
};

function sanitize(input, base = DEFAULTS) {
  const out = { ...base };
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
