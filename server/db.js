'use strict';
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
require('./config');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'mypoly.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',          -- user | staff | admin
  vip_until INTEGER,                          -- timestamp ms, NULL = pas VIP, 0 = à vie
  banned INTEGER NOT NULL DEFAULT 0,
  ban_reason TEXT,
  pawn TEXT NOT NULL DEFAULT '🎩',
  color TEXT NOT NULL DEFAULT '#ff5a5f',
  bio TEXT NOT NULL DEFAULT '',
  xp INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  last_seen INTEGER
);

CREATE TABLE IF NOT EXISTS stats (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  games INTEGER NOT NULL DEFAULT 0,
  wins INTEGER NOT NULL DEFAULT 0,
  podiums INTEGER NOT NULL DEFAULT 0,
  bankruptcies INTEGER NOT NULL DEFAULT 0,
  knockouts INTEGER NOT NULL DEFAULT 0,
  win_last INTEGER NOT NULL DEFAULT 0,
  win_triple INTEGER NOT NULL DEFAULT 0,
  win_line INTEGER NOT NULL DEFAULT 0,
  win_resort INTEGER NOT NULL DEFAULT 0,
  win_time INTEGER NOT NULL DEFAULT 0,
  properties_bought INTEGER NOT NULL DEFAULT 0,
  houses_built INTEGER NOT NULL DEFAULT 0,
  takeovers INTEGER NOT NULL DEFAULT 0,
  rent_earned INTEGER NOT NULL DEFAULT 0,
  rent_paid INTEGER NOT NULL DEFAULT 0,
  doubles INTEGER NOT NULL DEFAULT 0,
  best_networth INTEGER NOT NULL DEFAULT 0,
  play_seconds INTEGER NOT NULL DEFAULT 0,
  current_streak INTEGER NOT NULL DEFAULT 0,
  best_streak INTEGER NOT NULL DEFAULT 0,
  rating INTEGER NOT NULL DEFAULT 1000
);

CREATE TABLE IF NOT EXISTS user_badges (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  badge TEXT NOT NULL,
  earned_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, badge)
);

CREATE TABLE IF NOT EXISTS games (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  room_code TEXT,
  started_at INTEGER NOT NULL,
  ended_at INTEGER NOT NULL,
  duration INTEGER NOT NULL,
  rounds INTEGER NOT NULL,
  win_type TEXT,
  winner_name TEXT,
  winner_user_id INTEGER,
  settings TEXT NOT NULL,
  players TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS game_players (
  game_id INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rank INTEGER NOT NULL,
  networth INTEGER NOT NULL,
  rating_delta INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (game_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_gp_user ON game_players(user_id, game_id DESC);

CREATE TABLE IF NOT EXISTS card_stats (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  games INTEGER NOT NULL DEFAULT 0,
  wins INTEGER NOT NULL DEFAULT 0,
  rounds_won INTEGER NOT NULL DEFAULT 0,
  cards_played INTEGER NOT NULL DEFAULT 0,
  plus4 INTEGER NOT NULL DEFAULT 0,
  cartons INTEGER NOT NULL DEFAULT 0,
  catches INTEGER NOT NULL DEFAULT 0,
  caught INTEGER NOT NULL DEFAULT 0,
  best_hit INTEGER NOT NULL DEFAULT 0,
  current_streak INTEGER NOT NULL DEFAULT 0,
  best_streak INTEGER NOT NULL DEFAULT 0,
  play_seconds INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS horse_stats (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  games INTEGER NOT NULL DEFAULT 0,
  wins INTEGER NOT NULL DEFAULT 0,
  horses_home INTEGER NOT NULL DEFAULT 0,
  captures INTEGER NOT NULL DEFAULT 0,
  captured INTEGER NOT NULL DEFAULT 0,
  sixes INTEGER NOT NULL DEFAULT 0,
  rolls INTEGER NOT NULL DEFAULT 0,
  current_streak INTEGER NOT NULL DEFAULT 0,
  best_streak INTEGER NOT NULL DEFAULT 0,
  play_seconds INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS month_stats (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  games INTEGER NOT NULL DEFAULT 0,
  wins INTEGER NOT NULL DEFAULT 0,
  best_worth INTEGER NOT NULL DEFAULT 0,
  deals_sold INTEGER NOT NULL DEFAULT 0,
  profit INTEGER NOT NULL DEFAULT 0,
  jackpots INTEGER NOT NULL DEFAULT 0,
  borrowed INTEGER NOT NULL DEFAULT 0,
  current_streak INTEGER NOT NULL DEFAULT 0,
  best_streak INTEGER NOT NULL DEFAULT 0,
  play_seconds INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id INTEGER,
  action TEXT NOT NULL,
  target_id INTEGER,
  details TEXT,
  created_at INTEGER NOT NULL
);
`);

// ------------------------------------------------------------ migrations
const userCols = db.prepare('PRAGMA table_info(users)').all().map((c) => c.name);
if (!userCols.includes('display_name')) db.exec('ALTER TABLE users ADD COLUMN display_name TEXT');
if (!userCols.includes('saved_settings')) db.exec('ALTER TABLE users ADD COLUMN saved_settings TEXT');
if (!userCols.includes('saved_card_settings')) db.exec('ALTER TABLE users ADD COLUMN saved_card_settings TEXT');
if (!userCols.includes('saved_horse_settings')) db.exec('ALTER TABLE users ADD COLUMN saved_horse_settings TEXT');
if (!userCols.includes('saved_month_settings')) db.exec('ALTER TABLE users ADD COLUMN saved_month_settings TEXT');
db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_display_name ON users(display_name COLLATE NOCASE) WHERE display_name IS NOT NULL");

module.exports = db;
