'use strict';
/** Définition des badges et règles d'obtention. */
const BADGES = [
  { id: 'first_game', icon: '🎲', name: 'Premier lancer', desc: 'Jouer sa première partie', tier: 'bronze' },
  { id: 'first_win', icon: '🏆', name: 'Première victoire', desc: 'Remporter une partie', tier: 'bronze' },
  { id: 'wins_10', icon: '🥉', name: 'Habitué du podium', desc: 'Remporter 10 parties', tier: 'silver' },
  { id: 'wins_50', icon: '🥈', name: 'Magnat', desc: 'Remporter 50 parties', tier: 'gold' },
  { id: 'wins_100', icon: '🥇', name: 'Légende', desc: 'Remporter 100 parties', tier: 'legend' },
  { id: 'games_25', icon: '🎖️', name: 'Assidu', desc: 'Jouer 25 parties', tier: 'bronze' },
  { id: 'games_100', icon: '🏅', name: 'Vétéran', desc: 'Jouer 100 parties', tier: 'silver' },
  { id: 'win_triple', icon: '♟️', name: 'Triple monopole', desc: 'Gagner par triple monopole', tier: 'silver' },
  { id: 'win_line', icon: '📏', name: 'Maître de la ligne', desc: 'Gagner par monopole de ligne', tier: 'gold' },
  { id: 'win_resort', icon: '🏖️', name: 'Roi des plages', desc: 'Gagner par monopole balnéaire', tier: 'gold' },
  { id: 'win_last', icon: '🗿', name: 'Dernier debout', desc: 'Gagner en ruinant tous ses adversaires', tier: 'silver' },
  { id: 'streak_3', icon: '🔥', name: 'En feu', desc: '3 victoires d\'affilée', tier: 'silver' },
  { id: 'streak_5', icon: '☄️', name: 'Inarrêtable', desc: '5 victoires d\'affilée', tier: 'legend' },
  { id: 'tycoon', icon: '💎', name: 'Multimillionnaire', desc: 'Atteindre une fortune de 10M en partie', tier: 'gold' },
  { id: 'shark', icon: '🦈', name: 'Requin', desc: 'Racheter 25 propriétés au total', tier: 'silver' },
  { id: 'builder', icon: '🏗️', name: 'Bâtisseur', desc: 'Construire 200 bâtiments au total', tier: 'silver' },
  { id: 'knockout', icon: '🥊', name: 'Briseur de fortunes', desc: 'Provoquer 10 faillites', tier: 'gold' },
  { id: 'lucky', icon: '🍀', name: 'Main chanceuse', desc: 'Faire 6 doubles dans une même partie', tier: 'bronze' },
  { id: 'speed', icon: '⚡', name: 'Éclair', desc: 'Gagner une partie en moins de 10 minutes', tier: 'gold' },
  { id: 'full_table', icon: '👥', name: 'Table pleine', desc: 'Gagner une partie à 6 joueurs', tier: 'gold' },
  { id: 'comeback', icon: '🧗', name: 'Remontada', desc: 'Gagner après avoir été en dette', tier: 'silver' },
  { id: 'melenchon', icon: '🧓', name: 'Partie avec Mélenchon !', desc: 'Disputer une partie en mode Mélenchon', tier: 'gold' },
  // « Carton ! » (jeu de cartes)
  { id: 'c_first_win', icon: '🃏', name: 'Premier Carton', desc: 'Remporter une partie de Carton !', tier: 'bronze', game: 'cartes' },
  { id: 'c_wins_10', icon: '🎴', name: 'As des cartes', desc: 'Remporter 10 parties de Carton !', tier: 'silver', game: 'cartes' },
  { id: 'c_wins_50', icon: '👑', name: 'Roi du Carton', desc: 'Remporter 50 parties de Carton !', tier: 'gold', game: 'cartes' },
  { id: 'c_plus4', icon: '😈', name: 'Sans pitié', desc: 'Poser 3 Super Jokers +4 dans une même partie', tier: 'silver', game: 'cartes' },
  { id: 'c_avalanche', icon: '🌋', name: 'Avalanche', desc: 'Faire piocher 8 cartes ou plus d\'un coup', tier: 'gold', game: 'cartes' },
  { id: 'c_lynx', icon: '🐆', name: 'Œil de lynx', desc: 'Prendre 2 joueurs qui ont oublié de crier « Carton ! » dans une partie', tier: 'bronze', game: 'cartes' },
  { id: 'c_streak', icon: '🔥', name: 'Main brûlante', desc: '3 victoires de Carton ! d\'affilée', tier: 'silver', game: 'cartes' },
];

/**
 * Retourne la liste des badges nouvellement mérités.
 * @param {object} s     ligne de stats à jour
 * @param {object} me    résultat individuel de la partie
 * @param {object} game  résultat global
 * @param {Set} owned    badges déjà possédés
 */
function evaluate(s, me, game, owned) {
  const won = me.rank === 1;
  const checks = {
    first_game: s.games >= 1,
    first_win: s.wins >= 1,
    wins_10: s.wins >= 10,
    wins_50: s.wins >= 50,
    wins_100: s.wins >= 100,
    games_25: s.games >= 25,
    games_100: s.games >= 100,
    win_triple: won && game.winType === 'triple',
    win_line: won && game.winType === 'line',
    win_resort: won && game.winType === 'resort',
    win_last: won && game.winType === 'last',
    streak_3: s.current_streak >= 3,
    streak_5: s.current_streak >= 5,
    tycoon: (me.stats.maxNetWorth || 0) >= 10000,
    shark: s.takeovers >= 25,
    builder: s.houses_built >= 200,
    knockout: s.knockouts >= 10,
    lucky: (me.stats.doubles || 0) >= 6,
    speed: won && game.duration < 600 && game.players.length >= 2,
    full_table: won && game.players.length >= 6,
    comeback: won && !!me.stats.wasInDebt,
    melenchon: !!game.melenchon,
  };
  return BADGES.filter((b) => checks[b.id] && !owned.has(b.id)).map((b) => b.id);
}

/** Badges du jeu de cartes. */
function evaluateCards(s, me, game, owned) {
  const won = me.rank === 1;
  const st = me.stats || {};
  const checks = {
    c_first_win: s.wins >= 1,
    c_wins_10: s.wins >= 10,
    c_wins_50: s.wins >= 50,
    c_plus4: (st.plus4 || 0) >= 3,
    c_avalanche: (st.maxHit || 0) >= 8,
    c_lynx: (st.catches || 0) >= 2,
    c_streak: s.current_streak >= 3,
  };
  void won;
  return BADGES.filter((b) => checks[b.id] && !owned.has(b.id)).map((b) => b.id);
}

module.exports = { BADGES, evaluate, evaluateCards };
