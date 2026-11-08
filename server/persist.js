'use strict';
/**
 * Sauvegarde des salles et des parties en cours dans la base SQLite, pour qu'elles
 * reprennent après un redémarrage du serveur (mise à jour, plantage…).
 * Les moteurs de jeu sont des objets simples : on sauvegarde leurs données et on
 * les recrée avec le bon prototype au démarrage.
 */
const db = require('./db');
const { Game } = require('./game/engine');
const { CardGame } = require('./cartes/engine');
const { HorseGame } = require('./chevaux/engine');

const ENGINES = { poly: Game, cartes: CardGame, chevaux: HorseGame };
/** Champs propres à l'exécution (minuteurs, rappels) : jamais sauvegardés. */
const SKIP_GAME = new Set(['onUpdate', 'onEnd', 'timer', 'botTimers', 'afterDebt', 'events', 'anim']);
const SKIP_ROOM = new Set(['sockets', 'leaveTimers', 'game', 'graceTimer']);
/** Une partie sauvegardée depuis plus longtemps n'est pas restaurée. */
const MAX_AGE = 6 * 60 * 60 * 1000;

db.exec(`CREATE TABLE IF NOT EXISTS saved_rooms (
  code TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  saved_at INTEGER NOT NULL
)`);
const qAll = db.prepare('SELECT code, data, saved_at FROM saved_rooms');
const qClear = db.prepare('DELETE FROM saved_rooms');
const qInsert = db.prepare('INSERT INTO saved_rooms (code, data, saved_at) VALUES (?, ?, ?)');

function serializeGame(game) {
  const data = {};
  for (const [k, v] of Object.entries(game)) {
    if (SKIP_GAME.has(k) || typeof v === 'function') continue;
    data[k] = v;
  }
  // Références vers des joueurs : enregistrées par identifiant
  if (game.pendingBy) data.pendingBy = game.pendingBy.id;
  return data;
}

function serializeRoom(room) {
  const data = {};
  for (const [k, v] of Object.entries(room)) {
    if (SKIP_ROOM.has(k) || typeof v === 'function') continue;
    data[k] = v;
  }
  if (room.game) data.gameData = serializeGame(room.game);
  return data;
}

/** Recrée un moteur de jeu à partir de ses données (sans lancer de minuteur). */
function restoreGame(kind, data, callbacks) {
  const Engine = ENGINES[kind] || Game;
  const g = Object.create(Engine.prototype);
  Object.assign(g, JSON.parse(JSON.stringify(data)));
  g.onUpdate = callbacks.onUpdate;
  g.onEnd = callbacks.onEnd;
  g.timer = null;
  g.botTimers = [];
  g.events = [];
  g.anim = 0;
  if (typeof data.pendingBy === 'string') g.pendingBy = g.player(data.pendingBy) || null;
  if (g.rebuildAfterDebt) g.rebuildAfterDebt();
  return g;
}

/** Sauvegarde toutes les salles (transaction : jamais d'état à moitié écrit). */
const saveAll = db.transaction((rooms) => {
  qClear.run();
  const now = Date.now();
  for (const room of rooms) {
    if (!room.seats.some((s) => !s.isBot)) continue;
    try {
      qInsert.run(room.code, JSON.stringify(serializeRoom(room)), now);
    } catch (e) {
      console.error('[sauvegarde] salle', room.code, e.message);
    }
  }
});

/** Salles sauvegardées encore valables (données brutes). */
function loadAll() {
  const now = Date.now();
  const out = [];
  for (const row of qAll.all()) {
    if (now - row.saved_at > MAX_AGE) continue;
    try {
      out.push(JSON.parse(row.data));
    } catch (e) {
      console.error('[sauvegarde] salle illisible', row.code, e.message);
    }
  }
  return out;
}

module.exports = { saveAll, loadAll, restoreGame };
