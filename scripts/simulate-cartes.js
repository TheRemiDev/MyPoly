'use strict';
/** Simulation de parties de « Carton ! » entre bots (vérifie les invariants du moteur). */
const { CardGame } = require('../server/cartes/engine');
const { sanitize } = require('../server/cartes/settings');

const runs = Number(process.argv[2]) || 200;
let errors = 0;
let turns = 0;
const wins = {};
for (let r = 0; r < runs; r++) {
  const nb = 2 + (r % 5);
  const settings = sanitize({ maxPlayers: 6, targetScore: r % 3 === 0 ? 200 : 0, stacking: r % 2 === 0, drawToPlay: r % 4 === 1, sevenZero: r % 5 < 2 });
  let ended = null;
  const g = new CardGame({
    players: Array.from({ length: nb }, (_, k) => ({ id: 'b' + k, name: 'Bot' + k, isBot: true })),
    settings,
    onEnd: (res) => (ended = res),
  });
  g.schedule = () => {};
  g.watchExposed = () => {};
  g.start();
  let steps = 0;
  try {
    while (!g.over && steps < 20000) {
      // Un bot attrape parfois l'oubli de « Carton ! »
      const exposed = g.players.find((p) => p.exposed);
      if (exposed && Math.random() < 0.5) g.doCatch(g.players.find((p) => p !== exposed && !p.out), exposed.id);
      if (r % 7 === 3 && steps === 40) g.forfeit('b0');
      g.autoAct(true);
      steps++;
      const total = g.deck.length + g.discard.length + g.players.reduce((s, p) => s + p.hand.length, 0);
      if (total !== 108) throw new Error('cartes perdues : ' + total);
      const ids = new Set([...g.deck, ...g.discard, ...g.players.flatMap((p) => p.hand)].map((c) => c.id));
      if (ids.size !== 108) throw new Error('cartes en double');
      if (g.cur.out && !g.over) throw new Error('tour d\'un joueur sorti');
    }
    if (!g.over) throw new Error('partie sans fin');
    if (!ended || !ended.players.find((p) => p.rank === 1)) throw new Error('résultat invalide');
    turns += g.turns;
    wins[settings.targetScore ? 'points' : 'manche'] = (wins[settings.targetScore ? 'points' : 'manche'] || 0) + 1;
  } catch (e) {
    errors++;
    console.error('Partie', r, ':', e.message);
  }
}
console.log(`${runs} parties simulées, ${errors} erreur(s). Tours moyens : ${(turns / runs).toFixed(1)}`, wins);
