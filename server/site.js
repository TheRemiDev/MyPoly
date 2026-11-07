'use strict';
/** Réglages globaux du site, modifiables depuis l'administration. */
const db = require('./db');

db.exec('CREATE TABLE IF NOT EXISTS site_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)');

const DEFAULTS = {
  guestsAllowed: true, // les visiteurs peuvent jouer sans compte
};

let cache = null;
function get() {
  if (cache) return cache;
  const rows = db.prepare('SELECT key, value FROM site_settings').all();
  const out = { ...DEFAULTS };
  for (const r of rows) {
    if (!(r.key in DEFAULTS)) continue;
    try {
      out[r.key] = JSON.parse(r.value);
    } catch {}
  }
  cache = out;
  return out;
}

function set(patch) {
  const up = db.prepare('INSERT INTO site_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
  for (const [k, v] of Object.entries(patch || {})) {
    if (!(k in DEFAULTS)) continue;
    if (typeof DEFAULTS[k] === 'boolean') up.run(k, JSON.stringify(!!v));
  }
  cache = null;
  return get();
}

module.exports = { get, set, DEFAULTS };
