'use strict';
/**
 * Analyse d'équité des victoires d'un joueur à MyPoly, à partir de la base réelle.
 * Usage (sur le serveur) : cd /opt/mypoly && node scripts/analyse-joueur.js "Pseudo"
 *
 * Compare ses victoires à ce que le hasard donnerait à niveau égal (1 chance sur N par partie
 * à N joueurs), détaille contre qui il gagne (bots, humains, face à face), comment il gagne,
 * et, pour les parties récentes, l'ordre de jeu et les temps écoulés de chacun.
 */
const db = require('../server/db');

const who = process.argv[2];
if (!who) {
  console.log('Usage : node scripts/analyse-joueur.js "Pseudo"');
  process.exit(1);
}
const user = db.prepare('SELECT * FROM users WHERE lower(display_name) = lower(?) OR lower(username) = lower(?)').get(who, who);
if (!user) {
  console.log(`Joueur introuvable : ${who}`);
  process.exit(1);
}
const name = user.display_name || user.username;
const rows = db.prepare(`SELECT g.*, gp.rank AS myRank FROM game_players gp JOIN games g ON g.id = gp.game_id
  WHERE gp.user_id = ? AND COALESCE(g.win_type, '') NOT IN ('cartes', 'chevaux', 'mois', 'poker') ORDER BY g.id`).all(user.id);
if (!rows.length) {
  console.log(`${name} n'a aucune partie de MyPoly enregistrée.`);
  process.exit(0);
}

const pct = (a, b) => (b ? ((100 * a) / b).toFixed(1) : '0.0') + ' %';
// Probabilité qu'une loi normale centrée réduite dépasse z (approximation d'Abramowitz-Stegun)
const tail = (z) => {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp((-z * z) / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z > 0 ? p : 1 - p;
};
const bucket = () => ({ games: 0, wins: 0, exp: 0, vari: 0 });
const add = (b, win, n) => {
  b.games++;
  b.wins += win ? 1 : 0;
  b.exp += 1 / n;
  b.vari += (1 / n) * (1 - 1 / n);
};
const line = (label, b) => {
  if (!b.games) return;
  const z = b.vari ? (b.wins - b.exp) / Math.sqrt(b.vari) : 0;
  console.log(`  ${label.padEnd(34)} ${String(b.wins).padStart(3)} V / ${String(b.games).padStart(3)} P  (${pct(b.wins, b.games)})   attendu au hasard : ${b.exp.toFixed(1)} V   écart : ${z >= 0 ? '+' : ''}${z.toFixed(1)} σ`);
};

const all = bucket();
const vsBots = bucket();
const vsHumans = bucket();
const bySize = {};
const winTypes = {};
const h2h = {};
const byOrder = {};
let tracked = 0;
const toMine = [];
const toOthers = [];
for (const g of rows) {
  const players = JSON.parse(g.players);
  const n = players.length;
  const win = g.myRank === 1;
  add(all, win, n);
  const humans = players.filter((p) => !p.bot);
  add(humans.length > 1 ? vsHumans : vsBots, win, n);
  add((bySize[n] ||= bucket()), win, n);
  if (win) winTypes[g.win_type || '?'] = (winTypes[g.win_type || '?'] || 0) + 1;
  for (const p of humans) {
    if (p.userId === user.id) continue;
    const k = p.name;
    h2h[k] ||= { games: 0, me: 0, them: 0 };
    h2h[k].games++;
    if (win) h2h[k].me++;
    if (p.rank === 1) h2h[k].them++;
  }
  const me = players.find((p) => p.userId === user.id);
  if (me && me.order) {
    tracked++;
    add((byOrder[me.order] ||= bucket()), win, n);
    toMine.push(me.timeouts || 0);
    for (const p of humans) if (p.userId !== user.id) toOthers.push(p.timeouts || 0);
  }
}

console.log(`\n=== Analyse d'équité MyPoly : ${name} ===\n`);
const zAll = (all.wins - all.exp) / Math.sqrt(all.vari);
line('Toutes ses parties', all);
const p = tail(zAll);
console.log(`\n  Probabilité d'un tel score (ou mieux) par pur hasard, à niveau égal : ${p < 0.0001 ? '< 0,01 %' : (p * 100).toFixed(2) + ' %'}`);
console.log('  (au-delà de +2 σ, le hasard seul explique mal le résultat : talent, ou adversaires désavantagés)\n');

console.log('Selon les adversaires :');
line('Seul humain (contre des bots)', vsBots);
line('Avec d\'autres humains', vsHumans);
console.log('\nSelon le nombre de joueurs :');
for (const n of Object.keys(bySize).sort()) line(`${n} joueurs`, bySize[n]);

console.log('\nSes victoires par type :');
const WT = { last: 'Faillite des adversaires', triple: 'Triple monopole', line: 'Monopole de ligne', resort: 'Monopole balnéaire', time: 'Temps écoulé', rounds: 'Tours écoulés', forfeit: 'Abandon des adversaires' };
for (const [k, v] of Object.entries(winTypes).sort((a, b) => b[1] - a[1])) console.log(`  ${(WT[k] || k).padEnd(30)} ${v}`);

console.log('\nFace à face (parties où les deux étaient présents) :');
for (const [k, v] of Object.entries(h2h).sort((a, b) => b[1].games - a[1].games).slice(0, 12)) {
  console.log(`  contre ${k.padEnd(20)} ${String(v.games).padStart(3)} parties ensemble : ${name} gagne ${v.me}, ${k} gagne ${v.them}`);
}

if (tracked) {
  console.log(`\nParties récentes avec détails (${tracked}) :`);
  for (const o of Object.keys(byOrder).sort()) line(`joue en position ${o}`, byOrder[o]);
  const avg = (a) => (a.length ? (a.reduce((s, x) => s + x, 0) / a.length).toFixed(2) : '0');
  console.log(`  Temps écoulés par partie : ${name} ${avg(toMine)} · ses adversaires humains ${avg(toOthers)}`);
} else {
  console.log('\n(Ordre de jeu et temps écoulés : enregistrés à partir de la prochaine partie.)');
}

const gifts = db.prepare("SELECT action, details, created_at FROM audit_log WHERE target_id = ? AND action IN ('game_give', 'game_revive') ORDER BY id DESC").all(user.id);
console.log(`\nCadeaux / résurrections d'admin reçus en partie : ${gifts.length}`);
for (const r of gifts.slice(0, 10)) {
  const d = JSON.parse(r.details || '{}');
  console.log(`  ${new Date(r.created_at).toLocaleString('fr-FR')} · ${r.action === 'game_give' ? 'don' : 'résurrection'} de ${d.amount}K (salle ${d.room})`);
}
console.log('');
