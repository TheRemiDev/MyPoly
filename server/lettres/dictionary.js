'use strict';
/**
 * Dictionnaire français de « Lettres d'Or » : la liste libre « an-array-of-french-words »
 * (MIT), ramenée aux lettres A à Z (accents retirés, « œ » → OE), mots de 2 à 15 lettres.
 * Chargé une seule fois, à la première partie.
 */
let words = null;
let set = null;

const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/œ/g, 'oe').replace(/æ/g, 'ae').toUpperCase();

function load() {
  if (set) return;
  const raw = require('an-array-of-french-words/index.json');
  set = new Set();
  for (const w of raw) {
    const n = norm(w);
    if (/^[A-Z]{2,15}$/.test(n)) set.add(n);
  }
  words = [...set];
}

/** Le mot existe-t-il ? */
function has(word) {
  load();
  return set.has(word);
}
/** Tous les mots (pour les bots). */
function all() {
  load();
  return words;
}

module.exports = { has, all, load };
