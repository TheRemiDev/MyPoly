'use strict';
/**
 * Simule N parties entre bots pour vérifier la robustesse du moteur.
 * Usage : node scripts/simulate.js [nbParties]
 */
const { Game } = require('../server/game/engine');
const { sanitize } = require('../server/game/settings');

const runs = Number(process.argv[2] || 20);
const winTypes = {};
let totalTurns = 0;
let errors = 0;
for (let r = 0; r < runs; r++) {
  const nb = 2 + (r % 5);
  const settings = sanitize({ maxPlayers: 6, turnTime: 30, maxRounds: r % 4 === 0 ? 30 : 0, takeover: r % 3 !== 0, resortMonopoly: r % 2 === 0 });
  let ended = null;
  const g = new Game({
    players: Array.from({ length: nb }, (_, k) => ({ id: 'b' + k, name: 'Bot' + k, isBot: true, color: '#fff', pawn: '🤖' })),
    settings,
    onEnd: (res) => (ended = res),
  });
  g.schedule = () => {};
  g.start();
  let steps = 0;
  try {
    while (!g.over && steps < 20000) {
      g.autoAct(true);
      steps++;
      // invariants
      for (const p of g.players) if (!p.bankrupt && p.cash < 0) throw new Error('cash négatif ' + p.name + ' ' + p.cash + ' phase=' + g.phase);
    }
    if (!g.over) throw new Error('partie non terminée après ' + steps + ' actions (round ' + g.round + ')');
    winTypes[ended.winType] = (winTypes[ended.winType] || 0) + 1;
    totalTurns += g.round;
  } catch (e) {
    errors++;
    console.error('Partie', r, 'ERREUR :', e.stack);
  }
  g.destroy();
}
console.log(`${runs} parties simulées, ${errors} erreur(s). Tours moyens : ${(totalTurns / Math.max(1, runs - errors)).toFixed(1)}`);
console.log('Types de victoire :', winTypes);
process.exit(errors ? 1 : 0);
