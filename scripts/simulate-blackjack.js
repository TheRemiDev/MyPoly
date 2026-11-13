'use strict';
/** Simulation de parties de Blackjack entre bots (vérifie les invariants du moteur). */
const { BlackjackGame, handValue } = require('../server/blackjack/engine');
const { sanitize } = require('../server/blackjack/settings');

const runs = Number(process.argv[2]) || 200;
let errors = 0;
let hands = 0;
let houseNet = 0;
let wagered = 0;
const outcomes = {};
const fail = (r, msg) => {
  errors++;
  if (errors < 12) console.log(`Partie ${r} : ${msg}`);
};
for (let r = 0; r < runs; r++) {
  const nb = 1 + (r % 5);
  const settings = sanitize({ rounds: [5, 12, 30][r % 3], decks: [1, 6, 8][r % 3], hitSoft17: r % 2 === 0, bjPays: r % 4 === 3 ? 120 : 150, minBet: [10, 25][r % 2] });
  let ended = null;
  const g = new BlackjackGame({
    players: Array.from({ length: nb }, (_, k) => ({ id: 'b' + k, name: 'Bot' + k, isBot: true })),
    settings,
    onEnd: (res) => (ended = res),
    onUpdate: ({ events }) => {
      for (const ev of events) {
        if (ev.t === 'deal') {
          const hole = ev.seq.filter((x) => x.to === 'dealer')[1];
          if (hole && hole.card != null) fail(r, 'carte cachée divulguée');
        }
        if (ev.t === 'settle') {
          for (const x of ev.results) {
            hands++;
            outcomes[x.outcome] = (outcomes[x.outcome] || 0) + 1;
            houseNet -= x.net;
            wagered += x.bet;
            if (x.outcome === 'win' && x.payout !== x.bet * 2) fail(r, 'paiement gagnant faux');
          }
          if (ev.dealer < 17 && !ev.dealerBJ && ev.results.some((x) => x.outcome !== 'bust' && x.outcome !== 'blackjack')) fail(r, `banque arrêtée à ${ev.dealer}`);
        }
      }
    },
  });
  g.schedule = () => {};
  g.start();
  let steps = 0;
  try {
    while (!g.over && steps < 20000) {
      const st = g.publicState(null);
      if (st.dealer.hidden && st.dealer.cards[1] != null) fail(r, 'carte cachée dans l\'état public');
      g.autoAct(true);
      steps++;
      if (g.players.some((p) => p.chips < 0)) fail(r, 'jetons négatifs');
    }
    if (!g.over) fail(r, `partie non terminée (manche ${g.round})`);
    if (!ended) fail(r, 'onEnd jamais appelé');
    else {
      const ranks = ended.players.map((p) => p.rank).sort((a, b) => a - b);
      if (ranks.join() !== ranks.map((_, k) => k + 1).join()) fail(r, `rangs incohérents ${ranks}`);
      const win = ended.players.find((p) => p.rank === 1);
      if (ended.players.some((p) => !p.bankrupt && p.chips > win.chips)) fail(r, 'le vainqueur n\'est pas le plus riche');
    }
  } catch (e) {
    fail(r, e.stack);
  }
}
// Contrôle de l'évaluation des mains
const C = (rank, s = 0) => (rank - 2) * 4 + s;
const checks = [
  [[C(14), C(13)], 21, true],
  [[C(14), C(14)], 12, true],
  [[C(14), C(6), C(10)], 17, false],
  [[C(10), C(9), C(5)], 24, false],
  [[C(14), C(14), C(9)], 21, true],
];
for (const [cards, total, soft] of checks) {
  const v = handValue(cards);
  if (v.total !== total || v.soft !== soft) fail('éval', `${cards} → ${v.total}/${v.soft} au lieu de ${total}/${soft}`);
}
console.log(`${runs} parties simulées, ${errors} erreur(s). Mains : ${hands}. Résultats : ${JSON.stringify(outcomes)}. Avantage de la banque : ${((100 * houseNet) / Math.max(1, wagered)).toFixed(2)} %.`);
process.exit(errors ? 1 : 0);
