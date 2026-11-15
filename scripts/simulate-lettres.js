'use strict';
/** Simulation de parties de « Lettres d'Or » entre bots (vérifie les invariants du moteur). */
const { LettersGame, N } = require('../server/lettres/engine');
const { sanitize } = require('../server/lettres/settings');
const DICT = require('../server/lettres/dictionary');

const runs = Number(process.argv[2]) || 10;
let errors = 0;
let moves = 0;
let words = 0;
let bingos = 0;
let botMs = 0;
let botCalls = 0;
const scores = [];
const fail = (r, msg) => {
  errors++;
  if (errors < 12) console.log(`Partie ${r} : ${msg}`);
};
const t0 = Date.now();
DICT.load();
console.log(`Dictionnaire chargé en ${Date.now() - t0} ms`);
for (let r = 0; r < runs; r++) {
  const nb = 2 + (r % 3);
  const settings = sanitize({ targetScore: r % 4 === 3 ? 150 : 0 });
  let ended = null;
  const g = new LettersGame({
    players: Array.from({ length: nb }, (_, k) => ({ id: 'b' + k, name: 'Bot' + k, isBot: true })),
    settings,
    onEnd: (res) => (ended = res),
    onUpdate: ({ events }) => {
      for (const ev of events) {
        if (ev.t !== 'play') continue;
        moves++;
        words += ev.words.length;
        if (ev.bingo) bingos++;
        for (const w of ev.words) if (!DICT.has(w.word)) fail(r, `mot invalide joué : ${w.word}`);
      }
    },
  });
  g.schedule = () => {};
  g.start();
  let steps = 0;
  try {
    while (!g.over && steps < 600) {
      const t = Date.now();
      g.autoAct(true);
      botMs += Date.now() - t;
      botCalls++;
      steps++;
      // Invariant : nombre total de lettres constant (plateau + chevalets + sac)
      const onBoard = g.board.flat().filter(Boolean).length;
      const inRacks = g.players.reduce((s, p) => s + p.rack.length, 0);
      if (onBoard + inRacks + g.bag.length !== 103 && !g.players.some((p) => p.forfeit)) fail(r, `lettres perdues : ${onBoard + inRacks + g.bag.length}`);
    }
    if (!g.over) fail(r, 'partie non terminée');
    if (!ended) fail(r, 'onEnd jamais appelé');
    else {
      const ranks = ended.players.map((p) => p.rank).sort((a, b) => a - b);
      if (ranks.join() !== ranks.map((_, k) => k + 1).join()) fail(r, `rangs incohérents ${ranks}`);
      scores.push(Math.max(...ended.players.map((p) => p.score)));
    }
    // Le centre est occupé et toutes les lettres sont reliées (une seule composante)
    if (!g.board[7][7]) fail(r, 'centre vide');
    const seen = new Set();
    const stack = [[7, 7]];
    while (stack.length) {
      const [a, b] = stack.pop();
      const k = a * N + b;
      if (seen.has(k) || a < 0 || b < 0 || a >= N || b >= N || !g.board[a][b]) continue;
      seen.add(k);
      stack.push([a + 1, b], [a - 1, b], [a, b + 1], [a, b - 1]);
    }
    if (seen.size !== g.board.flat().filter(Boolean).length) fail(r, 'lettres isolées sur le plateau');
  } catch (e) {
    fail(r, e.stack);
  }
}
console.log(`${runs} parties simulées, ${errors} erreur(s). Coups joués : ${moves}, mots : ${words}, Lettres d'Or : ${bingos}. Meilleur score moyen : ${Math.round(scores.reduce((a, b) => a + b, 0) / Math.max(1, scores.length))}. Temps moyen de réflexion d'un bot : ${Math.round(botMs / Math.max(1, botCalls))} ms.`);
process.exit(errors ? 1 : 0);
