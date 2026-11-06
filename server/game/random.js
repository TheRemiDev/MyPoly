'use strict';
/**
 * Tout l'aléatoire du jeu passe par ce module.
 * Il s'appuie sur crypto.randomInt (CSPRNG du système) : les dés, le mélange
 * des cartes et toute autre tirage sont 100% aléatoires, non prédictibles,
 * et calculés uniquement côté serveur (le client n'affiche que le résultat).
 */
const crypto = require('crypto');

/** Entier uniforme dans [min, max] (inclus). */
function int(min, max) {
  return crypto.randomInt(min, max + 1);
}

/** Un dé à 6 faces. */
function die() {
  return crypto.randomInt(1, 7);
}

/** Mélange de Fisher-Yates non biaisé. Retourne une nouvelle copie. */
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pick(arr) {
  return arr[crypto.randomInt(0, arr.length)];
}

module.exports = { int, die, shuffle, pick };
