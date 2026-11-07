'use strict';
/** Simulation de courses de Petits chevaux entre bots (vérifie les invariants du moteur). */
const { HorseGame, CENTER } = require('../server/chevaux/engine');
const { sanitize } = require('../server/chevaux/settings');

const runs = Number(process.argv[2]) || 200;
let errors = 0;
let turns = 0;
const t0 = Date.now();
for (let r = 0; r < runs; r++) {
  const nb = 2 + (r % 3);
  const settings = sanitize({ horsesToWin: 1 + (r % 4), strictLadder: r % 2 === 0, sixToExit: r % 3 !== 1, noPassing: r % 5 === 0, captureReplay: r % 4 === 2 });
  let ended = null;
  const g = new HorseGame({
    players: Array.from({ length: nb }, (_, k) => ({ id: 'b' + k, name: 'Bot' + k, isBot: true })),
    settings,
    onEnd: (res) => (ended = res),
  });
  g.schedule = () => {};
  g.start();
  let steps = 0;
  try {
    while (!g.over && steps < 200000) {
      if (r % 9 === 4 && steps === 50) g.forfeit('b0');
      g.autoAct();
      steps++;
      for (const p of g.players) for (const h of p.horses) if (h < -1 || h > CENTER) throw new Error('position invalide ' + h);
      if (g.cur.out && !g.over) throw new Error('tour d\'un joueur sorti');
    }
    if (!g.over) throw new Error('course sans fin');
    if (!ended || !ended.players.find((p) => p.rank === 1)) throw new Error('résultat invalide');
    turns += g.turns;
  } catch (e) {
    errors++;
    console.error('Course', r, ':', e.message, JSON.stringify(settings));
  }
}
console.log(`${runs} courses simulées en ${Date.now() - t0} ms, ${errors} erreur(s). Tours moyens : ${(turns / runs).toFixed(1)}`);
