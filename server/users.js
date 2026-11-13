'use strict';
const db = require('./db');
const { BADGES, evaluate, evaluateCards, evaluateHorses, evaluateMonth, evaluatePoker, evaluateBlackjack } = require('./badges');

const PAWNS = ['🎩', '🚗', '🐕', '🚀', '🐱', '⛵', '🎸', '🦖', '🐧', '🍀', '⚽', '🎯'];
const VIP_PAWNS = ['👑', '💎', '🦄', '🐉', '🦁', '🛸', '🔥', '⭐'];
const COLORS = ['#ff5a5f', '#3fa7ff', '#2ecc71', '#ffb020', '#a66bff', '#ff7ac6', '#1dd3c0', '#ff8a3d', '#8bc34a', '#e0e0e0'];
const VIP_COLORS = ['#ffd700', '#00ffd5', '#ff00aa', '#b388ff'];

function isVip(u) {
  if (!u || u.vip_until == null) return false;
  return u.vip_until === 0 || u.vip_until > Date.now();
}
function isStaff(u) {
  return !!u && (u.role === 'staff' || u.role === 'admin');
}
/** Nom visible par les autres joueurs : pseudo d'affichage, sinon pseudo de connexion. */
function displayOf(u) {
  return (u && (u.display_name || u.username)) || '';
}

const RESERVED = ['admin', 'administrateur', 'administrator', 'staff', 'modo', 'moderateur', 'modérateur', 'moderator', 'mypoly', 'support', 'systeme', 'système', 'system', 'officiel', 'official'];
const DISPLAY_RE = /^[\p{L}\p{N}](?:[\p{L}\p{N} _.'-]*[\p{L}\p{N}])?$/u;

/**
 * Valide un pseudo d'affichage. Retourne { value } (null = revenir au pseudo de connexion)
 * ou { error }. Empêche l'usurpation : pas de nom déjà utilisé par un autre compte
 * (pseudo de connexion ou d'affichage), ni de nom réservé au staff.
 */
function validateDisplayName(raw, user) {
  const value = String(raw ?? '').normalize('NFC').replace(/\s+/g, ' ').trim();
  if (!value) return { value: null };
  if (value.length < 2 || value.length > 20) return { error: 'Le pseudo d\'affichage doit contenir entre 2 et 20 caractères.' };
  if (!DISPLAY_RE.test(value)) return { error: 'Pseudo d\'affichage invalide : lettres, chiffres, espaces et _ - . \' uniquement (pas d\'émoji).' };
  const flat = value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[\s_.'-]/g, '');
  if (!isStaff(user) && RESERVED.some((r) => flat.includes(r.normalize('NFD').replace(/[\u0300-\u036f]/g, '')))) return { error: 'Ce pseudo d\'affichage est réservé.' };
  const words = value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (/(^|[\s_.'-])(bot|invite)($|[\s_.'-])/.test(words)) return { error: 'Ce pseudo d\'affichage prête à confusion avec un invité ou un bot.' };
  const taken = db.prepare('SELECT 1 FROM users WHERE id != ? AND (username = ? COLLATE NOCASE OR display_name = ? COLLATE NOCASE)').get(user ? user.id : 0, value, value);
  if (taken) return { error: 'Ce pseudo est déjà utilisé par un autre joueur.' };
  return { value: value === user?.username ? null : value };
}

function levelFromXp(xp) {
  return Math.floor(Math.sqrt((xp || 0) / 100)) + 1;
}

const q = {
  byId: db.prepare('SELECT * FROM users WHERE id = ?'),
  byName: db.prepare('SELECT * FROM users WHERE username = ?'),
  byIdPublic: db.prepare('SELECT * FROM users WHERE id = ?'),
  stats: db.prepare('SELECT * FROM stats WHERE user_id = ?'),
  badges: db.prepare('SELECT badge, earned_at FROM user_badges WHERE user_id = ? ORDER BY earned_at'),
  history: db.prepare(`SELECT g.id, g.ended_at, g.duration, g.rounds, g.win_type, g.winner_name, g.players, gp.rank, gp.networth, gp.rating_delta
    FROM game_players gp JOIN games g ON g.id = gp.game_id WHERE gp.user_id = ? AND COALESCE(g.win_type, '') NOT IN ('cartes', 'chevaux', 'mois', 'poker', 'blackjack') ORDER BY g.id DESC LIMIT 20`),
  historyBlackjack: db.prepare(`SELECT g.id, g.ended_at, g.duration, g.rounds, g.win_type, g.winner_name, g.players, gp.rank, gp.networth, gp.rating_delta
    FROM game_players gp JOIN games g ON g.id = gp.game_id WHERE gp.user_id = ? AND g.win_type = 'blackjack' ORDER BY g.id DESC LIMIT 20`),
  historyPoker: db.prepare(`SELECT g.id, g.ended_at, g.duration, g.rounds, g.win_type, g.winner_name, g.players, gp.rank, gp.networth, gp.rating_delta
    FROM game_players gp JOIN games g ON g.id = gp.game_id WHERE gp.user_id = ? AND g.win_type = 'poker' ORDER BY g.id DESC LIMIT 20`),
  historyHorses: db.prepare(`SELECT g.id, g.ended_at, g.duration, g.rounds, g.win_type, g.winner_name, g.players, gp.rank, gp.networth, gp.rating_delta
    FROM game_players gp JOIN games g ON g.id = gp.game_id WHERE gp.user_id = ? AND g.win_type = 'chevaux' ORDER BY g.id DESC LIMIT 20`),
  historyMonths: db.prepare(`SELECT g.id, g.ended_at, g.duration, g.rounds, g.win_type, g.winner_name, g.players, gp.rank, gp.networth, gp.rating_delta
    FROM game_players gp JOIN games g ON g.id = gp.game_id WHERE gp.user_id = ? AND g.win_type = 'mois' ORDER BY g.id DESC LIMIT 20`),
  historyCards: db.prepare(`SELECT g.id, g.ended_at, g.duration, g.rounds, g.win_type, g.winner_name, g.players, gp.rank, gp.networth, gp.rating_delta
    FROM game_players gp JOIN games g ON g.id = gp.game_id WHERE gp.user_id = ? AND g.win_type = 'cartes' ORDER BY g.id DESC LIMIT 20`),
};

function getUser(id) {
  return q.byId.get(id);
}

/** Informations publiques d'un joueur (affichées en jeu et sur le profil). */
function publicUser(u) {
  if (!u) return null;
  return {
    id: u.id,
    name: displayOf(u),
    role: u.role,
    vip: isVip(u),
    vipUntil: u.vip_until,
    pawn: u.pawn,
    color: u.color,
    bio: u.bio,
    xp: u.xp,
    level: levelFromXp(u.xp),
    createdAt: u.created_at,
    lastSeen: u.last_seen,
  };
}

/** Profil public, par identifiant numérique (ou par pseudo de connexion pour les anciens liens). */
function profile(key) {
  const u = /^\d+$/.test(String(key)) ? q.byIdPublic.get(Number(key)) : q.byName.get(String(key));
  if (!u || u.banned) return null;
  const stats = q.stats.get(u.id) || {};
  const cards = cardStats.get(u.id) || null;
  const badges = q.badges.all(u.id);
  const parse = (h) => ({ ...h, players: JSON.parse(h.players) });
  const history = q.history.all(u.id).map(parse);
  const historyCards = q.historyCards.all(u.id).map(parse);
  const historyHorses = q.historyHorses.all(u.id).map(parse);
  const horses = horseStats.get(u.id) || null;
  const months = monthStats.get(u.id) || null;
  const historyMonths = q.historyMonths.all(u.id).map(parse);
  const poker = pokerStats.get(u.id) || null;
  const historyPoker = q.historyPoker.all(u.id).map(parse);
  const blackjack = bjStats.get(u.id) || null;
  const historyBlackjack = q.historyBlackjack.all(u.id).map(parse);
  return { user: publicUser(u), stats, cards, horses, months, poker, blackjack, badges, history, historyCards, historyHorses, historyMonths, historyPoker, historyBlackjack };
}

const insertGame = db.prepare(`INSERT INTO games (room_code, started_at, ended_at, duration, rounds, win_type, winner_name, winner_user_id, settings, players)
  VALUES (@room_code, @started_at, @ended_at, @duration, @rounds, @win_type, @winner_name, @winner_user_id, @settings, @players)`);
const insertGP = db.prepare('INSERT INTO game_players (game_id, user_id, rank, networth, rating_delta) VALUES (?, ?, ?, ?, ?)');
const ensureStats = db.prepare('INSERT OR IGNORE INTO stats (user_id) VALUES (?)');
const insertBadge = db.prepare('INSERT OR IGNORE INTO user_badges (user_id, badge, earned_at) VALUES (?, ?, ?)');
const addXp = db.prepare('UPDATE users SET xp = xp + ? WHERE id = ?');

/**
 * Enregistre une partie terminée : historique, statistiques, classement (rating),
 * XP et badges. Retourne { [userId]: { badges:[], xp, ratingDelta } }.
 */
const recordGame = db.transaction((room, result, settings) => {
  const now = Date.now();
  const n = result.players.length;
  const winner = result.players.find((p) => p.rank === 1);
  const gameId = insertGame.run({
    room_code: room,
    started_at: now - result.duration * 1000,
    ended_at: now,
    duration: result.duration,
    rounds: result.rounds,
    win_type: result.winType,
    winner_name: winner ? winner.name : null,
    winner_user_id: winner ? winner.userId : null,
    settings: JSON.stringify(settings),
    players: JSON.stringify(result.players.map((p) => ({ name: p.name, rank: p.rank, bot: p.isBot, userId: p.userId, netWorth: p.netWorth, order: p.order, timeouts: (p.stats && p.stats.timeouts) || 0, autoTurns: (p.stats && p.stats.autoTurns) || 0, adminGifts: (p.stats && p.stats.adminGifts) || 0 }))),
  }).lastInsertRowid;

  const rewards = {};
  for (const me of result.players) {
    if (!me.userId) continue;
    const uid = me.userId;
    ensureStats.run(uid);
    const old = q.stats.get(uid);
    const won = me.rank === 1;
    // Classement : +/- selon la place, pondéré par le nombre de joueurs humains/bots
    const score = n > 1 ? (n - me.rank) / (n - 1) : 1; // 1 = premier, 0 = dernier
    const humans = result.players.filter((p) => !p.isBot).length;
    const weight = humans >= 2 ? 1 : 0.35; // une partie contre des bots compte moins
    const ratingDelta = Math.round((score - 0.5) * 50 * weight);
    const streak = won ? old.current_streak + 1 : 0;
    const st = me.stats;
    const wt = result.winType;
    db.prepare(`UPDATE stats SET games = games + 1, wins = wins + ?, podiums = podiums + ?, bankruptcies = bankruptcies + ?,
      knockouts = knockouts + ?, win_last = win_last + ?, win_triple = win_triple + ?, win_line = win_line + ?, win_resort = win_resort + ?,
      win_time = win_time + ?, properties_bought = properties_bought + ?, houses_built = houses_built + ?, takeovers = takeovers + ?,
      rent_earned = rent_earned + ?, rent_paid = rent_paid + ?, doubles = doubles + ?, best_networth = MAX(best_networth, ?),
      play_seconds = play_seconds + ?, current_streak = ?, best_streak = MAX(best_streak, ?), rating = MAX(0, rating + ?)
      WHERE user_id = ?`).run(
      won ? 1 : 0,
      me.rank <= 3 && n >= 3 ? 1 : won ? 1 : 0,
      me.bankrupt ? 1 : 0,
      st.knockouts || 0,
      won && wt === 'last' ? 1 : 0,
      won && wt === 'triple' ? 1 : 0,
      won && wt === 'line' ? 1 : 0,
      won && wt === 'resort' ? 1 : 0,
      won && (wt === 'time' || wt === 'rounds') ? 1 : 0,
      st.bought || 0,
      st.built || 0,
      st.takeovers || 0,
      st.rentEarned || 0,
      st.rentPaid || 0,
      st.doubles || 0,
      st.maxNetWorth || 0,
      result.duration,
      streak,
      streak,
      ratingDelta,
      uid
    );
    insertGP.run(gameId, uid, me.rank, me.netWorth, ratingDelta);
    const xp = 25 + (won ? 100 : 0) + (me.rank === 2 ? 30 : 0) + (st.knockouts || 0) * 15;
    addXp.run(xp, uid);
    const fresh = q.stats.get(uid);
    const owned = new Set(q.badges.all(uid).map((b) => b.badge));
    const newBadges = evaluate(fresh, me, result, owned);
    for (const b of newBadges) insertBadge.run(uid, b, now);
    rewards[uid] = { xp, ratingDelta, badges: newBadges.map((id) => BADGES.find((b) => b.id === id)) };
  }
  return { gameId, rewards };
});

/** Enregistre une partie de « Carton ! » : historique, statistiques de cartes, XP et badges. */
const ensureCardStats = db.prepare('INSERT OR IGNORE INTO card_stats (user_id) VALUES (?)');
const cardStats = db.prepare('SELECT * FROM card_stats WHERE user_id = ?');
const recordCardGame = db.transaction((room, result, settings) => {
  const now = Date.now();
  const winner = result.players.find((p) => p.rank === 1);
  const gameId = insertGame.run({
    room_code: room,
    started_at: now - result.duration * 1000,
    ended_at: now,
    duration: result.duration,
    rounds: result.rounds,
    win_type: 'cartes',
    winner_name: winner ? winner.name : null,
    winner_user_id: winner ? winner.userId : null,
    settings: JSON.stringify({ ...settings, kind: 'cartes' }),
    players: JSON.stringify(result.players.map((p) => ({ name: p.name, rank: p.rank, bot: p.isBot, userId: p.userId, netWorth: p.score }))),
  }).lastInsertRowid;
  const rewards = {};
  for (const me of result.players) {
    if (!me.userId) continue;
    const uid = me.userId;
    ensureCardStats.run(uid);
    const old = cardStats.get(uid);
    const won = me.rank === 1;
    const streak = won ? old.current_streak + 1 : 0;
    const st = me.stats || {};
    db.prepare(`UPDATE card_stats SET games = games + 1, wins = wins + ?, rounds_won = rounds_won + ?, cards_played = cards_played + ?, plus4 = plus4 + ?,
      cartons = cartons + ?, catches = catches + ?, caught = caught + ?, best_hit = MAX(best_hit, ?), current_streak = ?, best_streak = MAX(best_streak, ?),
      play_seconds = play_seconds + ? WHERE user_id = ?`).run(
      won ? 1 : 0, st.roundsWon || 0, st.played || 0, st.plus4 || 0, st.cartons || 0, st.catches || 0, st.caught || 0, st.maxHit || 0, streak, streak, result.duration, uid
    );
    insertGP.run(gameId, uid, me.rank, me.score || 0, 0);
    const xp = 15 + (won ? 60 : 0) + (st.catches || 0) * 5;
    addXp.run(xp, uid);
    const owned = new Set(q.badges.all(uid).map((b) => b.badge));
    const newBadges = evaluateCards(cardStats.get(uid), me, result, owned);
    for (const b of newBadges) insertBadge.run(uid, b, now);
    rewards[uid] = { xp, ratingDelta: null, badges: newBadges.map((id) => BADGES.find((b) => b.id === id)) };
  }
  return { gameId, rewards };
});

/** Enregistre une course de Petits chevaux : historique, statistiques, XP et badges. */
const ensureHorseStats = db.prepare('INSERT OR IGNORE INTO horse_stats (user_id) VALUES (?)');
const horseStats = db.prepare('SELECT * FROM horse_stats WHERE user_id = ?');
const recordHorseGame = db.transaction((room, result, settings) => {
  const now = Date.now();
  const winner = result.players.find((p) => p.rank === 1);
  const gameId = insertGame.run({
    room_code: room,
    started_at: now - result.duration * 1000,
    ended_at: now,
    duration: result.duration,
    rounds: result.rounds,
    win_type: 'chevaux',
    winner_name: winner ? winner.name : null,
    winner_user_id: winner ? winner.userId : null,
    settings: JSON.stringify({ ...settings, kind: 'chevaux' }),
    players: JSON.stringify(result.players.map((p) => ({ name: p.name, rank: p.rank, bot: p.isBot, userId: p.userId, netWorth: p.home }))),
  }).lastInsertRowid;
  const rewards = {};
  for (const me of result.players) {
    if (!me.userId) continue;
    const uid = me.userId;
    ensureHorseStats.run(uid);
    const old = horseStats.get(uid);
    const won = me.rank === 1;
    const streak = won ? old.current_streak + 1 : 0;
    const st = me.stats || {};
    db.prepare(`UPDATE horse_stats SET games = games + 1, wins = wins + ?, horses_home = horses_home + ?, captures = captures + ?, captured = captured + ?,
      sixes = sixes + ?, rolls = rolls + ?, current_streak = ?, best_streak = MAX(best_streak, ?), play_seconds = play_seconds + ? WHERE user_id = ?`).run(
      won ? 1 : 0, me.home || 0, st.captures || 0, st.captured || 0, st.sixes || 0, st.rolls || 0, streak, streak, result.duration, uid
    );
    insertGP.run(gameId, uid, me.rank, me.home || 0, 0);
    const xp = 15 + (won ? 60 : 0) + (st.captures || 0) * 4;
    addXp.run(xp, uid);
    const owned = new Set(q.badges.all(uid).map((b) => b.badge));
    const newBadges = evaluateHorses(horseStats.get(uid), me, result, owned);
    for (const b of newBadges) insertBadge.run(uid, b, now);
    rewards[uid] = { xp, ratingDelta: null, badges: newBadges.map((id) => BADGES.find((b) => b.id === id)) };
  }
  return { gameId, rewards };
});

/** Enregistre une partie de Fin de mois : historique, statistiques, XP et badges. */
const ensureMonthStats = db.prepare('INSERT OR IGNORE INTO month_stats (user_id) VALUES (?)');
const monthStats = db.prepare('SELECT * FROM month_stats WHERE user_id = ?');
const recordMonthGame = db.transaction((room, result, settings) => {
  const now = Date.now();
  const winner = result.players.find((p) => p.rank === 1);
  const gameId = insertGame.run({
    room_code: room,
    started_at: now - result.duration * 1000,
    ended_at: now,
    duration: result.duration,
    rounds: result.rounds,
    win_type: 'mois',
    winner_name: winner ? winner.name : null,
    winner_user_id: winner ? winner.userId : null,
    settings: JSON.stringify({ ...settings, kind: 'mois' }),
    players: JSON.stringify(result.players.map((p) => ({ name: p.name, rank: p.rank, bot: p.isBot, userId: p.userId, netWorth: p.netWorth }))),
  }).lastInsertRowid;
  const rewards = {};
  for (const me of result.players) {
    if (!me.userId) continue;
    const uid = me.userId;
    ensureMonthStats.run(uid);
    const old = monthStats.get(uid);
    const won = me.rank === 1;
    const streak = won ? old.current_streak + 1 : 0;
    const st = me.stats || {};
    db.prepare(`UPDATE month_stats SET games = games + 1, wins = wins + ?, best_worth = MAX(best_worth, ?), deals_sold = deals_sold + ?, profit = profit + ?,
      jackpots = jackpots + ?, borrowed = borrowed + ?, current_streak = ?, best_streak = MAX(best_streak, ?), play_seconds = play_seconds + ? WHERE user_id = ?`).run(
      won ? 1 : 0, Math.max(0, me.netWorth || 0), st.sold || 0, st.profit || 0, st.jackpots || 0, st.borrowed || 0, streak, streak, result.duration, uid
    );
    insertGP.run(gameId, uid, me.rank, me.netWorth || 0, 0);
    const xp = 15 + (won ? 60 : 0) + (st.sold || 0) * 4;
    addXp.run(xp, uid);
    const owned = new Set(q.badges.all(uid).map((b) => b.badge));
    const newBadges = evaluateMonth(monthStats.get(uid), me, result, owned);
    for (const b of newBadges) insertBadge.run(uid, b, now);
    rewards[uid] = { xp, ratingDelta: null, badges: newBadges.map((id) => BADGES.find((b) => b.id === id)) };
  }
  return { gameId, rewards };
});

/** Enregistre une partie de poker : historique, statistiques, XP et badges. */
const ensurePokerStats = db.prepare('INSERT OR IGNORE INTO poker_stats (user_id) VALUES (?)');
const pokerStats = db.prepare('SELECT * FROM poker_stats WHERE user_id = ?');
const recordPokerGame = db.transaction((room, result, settings) => {
  const now = Date.now();
  const winner = result.players.find((p) => p.rank === 1);
  const gameId = insertGame.run({
    room_code: room,
    started_at: now - result.duration * 1000,
    ended_at: now,
    duration: result.duration,
    rounds: result.hands,
    win_type: 'poker',
    winner_name: winner ? winner.name : null,
    winner_user_id: winner ? winner.userId : null,
    settings: JSON.stringify({ ...settings, kind: 'poker' }),
    players: JSON.stringify(result.players.map((p) => ({ name: p.name, rank: p.rank, bot: p.isBot, userId: p.userId, netWorth: p.stack }))),
  }).lastInsertRowid;
  const rewards = {};
  for (const me of result.players) {
    if (!me.userId) continue;
    const uid = me.userId;
    ensurePokerStats.run(uid);
    const old = pokerStats.get(uid);
    const won = me.rank === 1;
    const streak = won ? old.current_streak + 1 : 0;
    const st = me.stats || {};
    db.prepare(`UPDATE poker_stats SET games = games + 1, wins = wins + ?, hands = hands + ?, hands_won = hands_won + ?, biggest_pot = MAX(biggest_pot, ?),
      best_cat = MAX(best_cat, ?), allin_wins = allin_wins + ?, showdown_wins = showdown_wins + ?, bluffs = bluffs + ?, royals = royals + ?, quads = quads + ?,
      current_streak = ?, best_streak = MAX(best_streak, ?), play_seconds = play_seconds + ? WHERE user_id = ?`).run(
      won ? 1 : 0, st.hands || 0, st.won || 0, st.biggestPot || 0, st.bestCat ?? -1, st.allInWins || 0, st.showdownWins || 0, st.bluffWins || 0, st.royal || 0, st.quads || 0,
      streak, streak, result.duration, uid
    );
    insertGP.run(gameId, uid, me.rank, me.stack || 0, 0);
    // XP : participation, victoire, et un peu selon le classement (tournoi)
    const n = result.players.length;
    const xp = 15 + (won ? 60 : 0) + Math.max(0, n - me.rank) * 5 + Math.min(20, (st.won || 0));
    addXp.run(xp, uid);
    const owned = new Set(q.badges.all(uid).map((b) => b.badge));
    const newBadges = evaluatePoker(pokerStats.get(uid), me, result, owned, settings);
    for (const b of newBadges) insertBadge.run(uid, b, now);
    rewards[uid] = { xp, ratingDelta: null, badges: newBadges.map((id) => BADGES.find((b) => b.id === id)) };
  }
  return { gameId, rewards };
});

/** Enregistre une partie de Blackjack : historique, statistiques, XP et badges. */
const ensureBjStats = db.prepare('INSERT OR IGNORE INTO blackjack_stats (user_id) VALUES (?)');
const bjStats = db.prepare('SELECT * FROM blackjack_stats WHERE user_id = ?');
const recordBlackjackGame = db.transaction((room, result, settings) => {
  const now = Date.now();
  const winner = result.players.find((p) => p.rank === 1);
  const gameId = insertGame.run({
    room_code: room,
    started_at: now - result.duration * 1000,
    ended_at: now,
    duration: result.duration,
    rounds: result.rounds,
    win_type: 'blackjack',
    winner_name: winner ? winner.name : null,
    winner_user_id: winner ? winner.userId : null,
    settings: JSON.stringify({ ...settings, kind: 'blackjack' }),
    players: JSON.stringify(result.players.map((p) => ({ name: p.name, rank: p.rank, bot: p.isBot, userId: p.userId, netWorth: p.chips }))),
  }).lastInsertRowid;
  const rewards = {};
  for (const me of result.players) {
    if (!me.userId) continue;
    const uid = me.userId;
    ensureBjStats.run(uid);
    const old = bjStats.get(uid);
    // Seul contre la banque : on « gagne » en finissant avec plus de jetons qu'au départ
    const solo = result.players.length === 1;
    const won = solo ? (me.chips || 0) > ((settings && settings.startChips) || 1000) : me.rank === 1;
    const streak = won ? old.current_streak + 1 : 0;
    const st = me.stats || {};
    db.prepare(`UPDATE blackjack_stats SET games = games + 1, wins = wins + ?, hands = hands + ?, hands_won = hands_won + ?, blackjacks = blackjacks + ?, doubles_won = doubles_won + ?,
      splits = splits + ?, biggest_win = MAX(biggest_win, ?), best_chips = MAX(best_chips, ?), current_streak = ?, best_streak = MAX(best_streak, ?), play_seconds = play_seconds + ? WHERE user_id = ?`).run(
      won ? 1 : 0, st.hands || 0, st.won || 0, st.blackjacks || 0, st.doublesWon || 0, st.splits || 0, st.biggestWin || 0, me.chips || 0, streak, streak, result.duration, uid
    );
    insertGP.run(gameId, uid, me.rank, me.chips || 0, 0);
    const xp = 12 + (won ? 50 : 0) + Math.min(25, (st.won || 0) * 2);
    addXp.run(xp, uid);
    const owned = new Set(q.badges.all(uid).map((b) => b.badge));
    const newBadges = evaluateBlackjack({ ...bjStats.get(uid) }, me, result, owned, settings);
    for (const b of newBadges) insertBadge.run(uid, b, now);
    rewards[uid] = { xp, ratingDelta: null, badges: newBadges.map((id) => BADGES.find((b) => b.id === id)) };
  }
  return { gameId, rewards };
});

function leaderboard(sort = 'rating', limit = 50) {
  // Classements du Blackjack
  if (sort.startsWith('b_')) {
    const bcols = { b_wins: 'b.wins', b_winrate: 'winrate', b_games: 'b.games', b_best: 'b.best_chips', b_bj: 'b.blackjacks' };
    const bcol = bcols[sort] || 'b.wins';
    return db
      .prepare(`SELECT u.id, COALESCE(u.display_name, u.username) AS name, u.role, u.vip_until, u.pawn, u.color, u.xp, b.games, b.wins, b.best_streak, b.best_chips, b.blackjacks, b.hands_won,
        CASE WHEN b.games > 0 THEN ROUND(100.0 * b.wins / b.games, 1) ELSE 0 END AS winrate
        FROM blackjack_stats b JOIN users u ON u.id = b.user_id WHERE u.banned = 0 AND b.games > 0 ${sort === 'b_winrate' ? 'AND b.games >= 5' : ''}
        ORDER BY ${bcol} DESC, b.wins DESC LIMIT ?`)
      .all(limit)
      .map((r) => ({ ...r, vip: isVip(r), level: levelFromXp(r.xp) }));
  }
  // Classements du poker
  if (sort.startsWith('p_')) {
    const pcols = { p_wins: 'p.wins', p_winrate: 'winrate', p_games: 'p.games', p_pot: 'p.biggest_pot', p_hands: 'p.hands_won' };
    const pcol = pcols[sort] || 'p.wins';
    return db
      .prepare(`SELECT u.id, COALESCE(u.display_name, u.username) AS name, u.role, u.vip_until, u.pawn, u.color, u.xp, p.games, p.wins, p.best_streak, p.biggest_pot, p.hands_won, p.hands,
        CASE WHEN p.games > 0 THEN ROUND(100.0 * p.wins / p.games, 1) ELSE 0 END AS winrate
        FROM poker_stats p JOIN users u ON u.id = p.user_id WHERE u.banned = 0 AND p.games > 0 ${sort === 'p_winrate' ? 'AND p.games >= 5' : ''}
        ORDER BY ${pcol} DESC, p.wins DESC LIMIT ?`)
      .all(limit)
      .map((r) => ({ ...r, vip: isVip(r), level: levelFromXp(r.xp) }));
  }
  // Classements de Fin de mois
  if (sort.startsWith('m_')) {
    const mcols = { m_wins: 'm.wins', m_winrate: 'winrate', m_games: 'm.games', m_best: 'm.best_worth', m_sold: 'm.deals_sold' };
    const mcol = mcols[sort] || 'm.wins';
    return db
      .prepare(`SELECT u.id, COALESCE(u.display_name, u.username) AS name, u.role, u.vip_until, u.pawn, u.color, u.xp, m.games, m.wins, m.best_streak, m.best_worth, m.deals_sold, m.jackpots,
        CASE WHEN m.games > 0 THEN ROUND(100.0 * m.wins / m.games, 1) ELSE 0 END AS winrate
        FROM month_stats m JOIN users u ON u.id = m.user_id WHERE u.banned = 0 AND m.games > 0 ${sort === 'm_winrate' ? 'AND m.games >= 5' : ''}
        ORDER BY ${mcol} DESC, m.wins DESC LIMIT ?`)
      .all(limit)
      .map((r) => ({ ...r, vip: isVip(r), level: levelFromXp(r.xp) }));
  }
  // Classements des Petits chevaux
  if (sort.startsWith('h_')) {
    const hcols = { h_wins: 'h.wins', h_winrate: 'winrate', h_games: 'h.games', h_captures: 'h.captures', h_home: 'h.horses_home' };
    const hcol = hcols[sort] || 'h.wins';
    return db
      .prepare(`SELECT u.id, COALESCE(u.display_name, u.username) AS name, u.role, u.vip_until, u.pawn, u.color, u.xp, h.games, h.wins, h.best_streak, h.captures, h.horses_home,
        CASE WHEN h.games > 0 THEN ROUND(100.0 * h.wins / h.games, 1) ELSE 0 END AS winrate
        FROM horse_stats h JOIN users u ON u.id = h.user_id WHERE u.banned = 0 AND h.games > 0 ${sort === 'h_winrate' ? 'AND h.games >= 5' : ''}
        ORDER BY ${hcol} DESC, h.wins DESC LIMIT ?`)
      .all(limit)
      .map((r) => ({ ...r, vip: isVip(r), level: levelFromXp(r.xp) }));
  }
  // Classements de « Carton ! » (tables séparées de MyPoly)
  if (sort === 'cartes' || sort.startsWith('c_')) {
    const ccols = { cartes: 'c.wins', c_wins: 'c.wins', c_winrate: 'winrate', c_games: 'c.games', c_streak: 'c.best_streak', c_cards: 'c.cards_played' };
    const ccol = ccols[sort] || 'c.wins';
    return db
      .prepare(`SELECT u.id, COALESCE(u.display_name, u.username) AS name, u.role, u.vip_until, u.pawn, u.color, u.xp, c.games, c.wins, c.best_streak, c.cards_played,
        CASE WHEN c.games > 0 THEN ROUND(100.0 * c.wins / c.games, 1) ELSE 0 END AS winrate
        FROM card_stats c JOIN users u ON u.id = c.user_id WHERE u.banned = 0 AND c.games > 0 ${sort === 'c_winrate' ? 'AND c.games >= 5' : ''}
        ORDER BY ${ccol} DESC, c.wins DESC LIMIT ?`)
      .all(limit)
      .map((r) => ({ ...r, vip: isVip(r), level: levelFromXp(r.xp) }));
  }
  const cols = { rating: 's.rating', wins: 's.wins', games: 's.games', xp: 'u.xp', winrate: 'winrate', best: 's.best_networth' };
  const col = cols[sort] || cols.rating;
  return db
    .prepare(
      `SELECT u.id, COALESCE(u.display_name, u.username) AS name, u.role, u.vip_until, u.pawn, u.color, u.xp, s.games, s.wins, s.rating, s.best_networth, s.best_streak,
       CASE WHEN s.games > 0 THEN ROUND(100.0 * s.wins / s.games, 1) ELSE 0 END AS winrate
       FROM stats s JOIN users u ON u.id = s.user_id
       WHERE u.banned = 0 AND s.games > 0 ${sort === 'winrate' ? 'AND s.games >= 5' : ''}
       ORDER BY ${col} DESC, s.wins DESC LIMIT ?`
    )
    .all(limit)
    .map((r) => ({ ...r, vip: isVip(r), level: levelFromXp(r.xp) }));
}

module.exports = { displayOf, validateDisplayName, PAWNS, VIP_PAWNS, COLORS, VIP_COLORS, isVip, isStaff, levelFromXp, getUser, publicUser, profile, recordGame, recordCardGame, recordHorseGame, recordMonthGame, recordPokerGame, recordBlackjackGame, leaderboard, BADGES };
