'use strict';
/** Simulation de parties de poker entre bots (vérifie les invariants du moteur). */
const { PokerGame } = require('../server/poker/engine');
const { sanitize } = require('../server/poker/settings');

const runs = Number(process.argv[2]) || 100;
let errors = 0;
let hands = 0;
let showdowns = 0;
let sidePots = 0;
const fail = (r, msg) => {
  errors++;
  if (errors < 12) console.log(`Partie ${r} : ${msg}`);
};
for (let r = 0; r < runs; r++) {
  const nb = 2 + (r % 5);
  const settings = sanitize({ maxPlayers: 6, startStack: [500, 1000, 2000][r % 3], bigBlind: [10, 20, 50][r % 3], blindUp: [4, 8, 0][r % 3], maxHands: r % 4 === 3 ? 25 : 0 });
  let ended = null;
  const g = new PokerGame({
    players: Array.from({ length: nb }, (_, k) => ({ id: 'b' + k, name: 'Bot' + k, isBot: true })),
    settings,
    onEnd: (res) => (ended = res),
    onUpdate: ({ events }) => {
      for (const ev of events) {
        if (ev.t === 'showdown') {
          showdowns++;
          if (ev.pots.length > 1) sidePots++;
        }
      }
    },
  });
  g.schedule = () => {};
  const total = nb * settings.startStack;
  let lost = 0; // jetons d'un joueur qui abandonne : retirés du jeu
  g.start();
  let steps = 0;
  try {
    while (!g.over && steps < 60000) {
      if (r % 9 === 4 && steps === 50) {
        const q = g.players.find((p) => !p.out);
        lost += q.stack;
        g.forfeit(q.id);
        continue;
      }
      g.autoAct(true);
      steps++;
      const sum = g.players.reduce((s, p) => s + p.stack + p.total, 0);
      if (!g.over && Math.abs(sum - (total - lost)) > 0 && !g.players.some((p) => p.forfeit)) fail(r, `jetons non conservés : ${sum} au lieu de ${total - lost} (main ${g.handNo})`);
      if (g.players.some((p) => p.stack < 0)) fail(r, 'tapis négatif');
    }
    hands += g.handNo;
    if (!g.over) fail(r, `partie non terminée après ${steps} étapes (main ${g.handNo})`);
    if (!ended) fail(r, 'onEnd jamais appelé');
    else {
      const ranks = ended.players.map((p) => p.rank).sort((a, b) => a - b);
      if (ranks.join() !== ranks.map((_, k) => k + 1).join()) fail(r, `rangs incohérents ${ranks}`);
      const final = g.players.reduce((s, p) => s + p.stack, 0);
      if (!g.players.some((p) => p.forfeit) && final !== total) fail(r, `jetons finaux ${final} au lieu de ${total}`);
      const win = ended.players.find((p) => p.rank === 1);
      if (!settings.maxHands && !g.players.some((p) => p.forfeit) && win.stack !== total) fail(r, `le vainqueur n'a pas tous les jetons (${win.stack}/${total})`);
    }
  } catch (e) {
    fail(r, e.stack);
  }
}
console.log(`${runs} parties simulées, ${errors} erreur(s). Mains jouées : ${hands} (moyenne ${(hands / runs).toFixed(1)}), abattages : ${showdowns}, avec pots secondaires : ${sidePots}.`);
process.exit(errors ? 1 : 0);
