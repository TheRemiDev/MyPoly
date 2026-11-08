'use strict';
/** Simulation de parties de « Fin de mois » entre bots (vérifie les invariants du moteur). */
const { MonthGame, PAYDAY } = require('../server/mois/engine');
const { sanitize } = require('../server/mois/settings');

const runs = Number(process.argv[2]) || 200;
let errors = 0;
let turns = 0;
let worthSum = 0;
let winSum = 0;
let saved = 0;
const t0 = Date.now();
for (let r = 0; r < runs; r++) {
  const nb = 2 + (r % 5);
  const settings = sanitize({ months: 1 + (r % 4), jackpotSix: r % 3 !== 1, sundayBet: r % 2 === 0, tombola: r % 4 !== 3, unsoldValue: r % 5 === 0, loanRate: (r % 3) * 10 });
  let ended = null;
  const g = new MonthGame({
    players: Array.from({ length: nb }, (_, k) => ({ id: 'b' + k, name: 'Bot' + k, isBot: true, color: '#fff', pawn: '🎩' })),
    settings,
    onEnd: (res) => (ended = res),
  });
  g.schedule = () => {};
  g.start();
  let steps = 0;
  try {
    while (!g.over && steps < 20000) {
      if (r % 9 === 4 && steps === 30) g.forfeit('b0');
      g.autoAct();
      steps++;
      const total = g.players.reduce((s, p) => s + p.cash, 0);
      for (const p of g.players) {
        if (p.cash < 0) throw new Error('argent négatif ' + p.cash);
        if (!(p.savings >= 0)) throw new Error('épargne invalide ' + p.savings);
        if (p.loans < 0 || p.loans % 1000) throw new Error('emprunt invalide ' + p.loans);
        if (p.day < 0 || p.day > PAYDAY) throw new Error('jour invalide ' + p.day);
        if (!Number.isFinite(total)) throw new Error('argent NaN');
      }
      if (!g.over && (g.cur.out || g.cur.done)) throw new Error('tour d\'un joueur sorti/fini');
    }
    if (!g.over) throw new Error('partie sans fin');
    if (!ended || !ended.players.find((p) => p.rank === 1)) throw new Error('résultat invalide');
    turns += g.turns;
    saved += g.players.reduce((t, p) => t + p.savings, 0) / g.players.length;
    const w = ended.players.find((p) => p.rank === 1);
    winSum += w.netWorth;
    worthSum += ended.players.reduce((s, p) => s + p.netWorth, 0) / ended.players.length;
  } catch (e) {
    errors++;
    console.error('Partie', r, ':', e.stack, JSON.stringify(settings));
  }
}
console.log(`${runs} parties simulées en ${Date.now() - t0} ms, ${errors} erreur(s). Tours moyens : ${(turns / runs).toFixed(1)}, patrimoine moyen ${Math.round(worthSum / runs)} €, gagnant moyen ${Math.round(winSum / runs)} €, épargne moyenne en fin ${Math.round(saved / runs)} €`);
