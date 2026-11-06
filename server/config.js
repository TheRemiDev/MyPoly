'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Chargement minimal d'un fichier .env (sans dépendance externe)
const envFile = path.join(__dirname, '..', '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });
process.env.DATA_DIR = DATA_DIR;

let jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret) {
  const f = path.join(DATA_DIR, '.jwt_secret');
  if (!fs.existsSync(f)) fs.writeFileSync(f, crypto.randomBytes(48).toString('hex'), { mode: 0o600 });
  jwtSecret = fs.readFileSync(f, 'utf8').trim();
}

const production = process.env.NODE_ENV === 'production';
const publicUrl = process.env.PUBLIC_URL || '';

module.exports = {
  port: Number(process.env.PORT || 3000),
  host: process.env.HOST || '127.0.0.1',
  production,
  publicUrl,
  jwtSecret,
  secureCookies: publicUrl.startsWith('https://'),
  trustProxy: process.env.TRUST_PROXY !== undefined ? process.env.TRUST_PROXY : production ? 1 : 0,
  dataDir: DATA_DIR,
};
