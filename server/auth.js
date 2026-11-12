'use strict';
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const db = require('./db');
const config = require('./config');
const U = require('./users');

const COOKIE = 'mp_token';
const TOKEN_TTL = 30 * 24 * 3600; // 30 jours

function sign(user) {
  return jwt.sign({ uid: user.id }, config.jwtSecret, { expiresIn: TOKEN_TTL });
}
function setCookie(res, token) {
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.secureCookies,
    maxAge: TOKEN_TTL * 1000,
    path: '/',
  });
}
/** Retourne l'utilisateur correspondant à un jeton (ou null). */
function userFromToken(token) {
  if (!token) return null;
  try {
    const { uid } = jwt.verify(token, config.jwtSecret);
    const u = U.getUser(uid);
    if (!u || u.banned) return null;
    return u;
  } catch {
    return null;
  }
}
function parseCookie(header, name) {
  if (!header) return null;
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}

function attachUser(req, _res, next) {
  req.user = userFromToken(req.cookies && req.cookies[COOKIE]);
  if (req.user) db.prepare('UPDATE users SET last_seen = ? WHERE id = ?').run(Date.now(), req.user.id);
  next();
}
function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Connexion requise.' });
  next();
}
function requireStaff(req, res, next) {
  if (!U.isStaff(req.user)) return res.status(403).json({ error: 'Accès réservé au staff.' });
  next();
}

const USERNAME_RE = /^[a-zA-Z0-9_\-.]{3,20}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

async function createUser({ username, email, password, role = 'user', displayName = null }) {
  const hash = await bcrypt.hash(password, 12);
  const info = db
    .prepare('INSERT INTO users (username, email, password_hash, role, pawn, color, created_at, last_seen, display_name) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(username, email, hash, role, U.PAWNS[Math.floor(Math.random() * U.PAWNS.length)], U.COLORS[Math.floor(Math.random() * U.COLORS.length)], Date.now(), Date.now(), displayName);
  db.prepare('INSERT OR IGNORE INTO stats (user_id) VALUES (?)').run(info.lastInsertRowid);
  return U.getUser(info.lastInsertRowid);
}

const router = express.Router();
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false, message: { error: 'Trop de tentatives, réessayez plus tard.' } });

router.post('/register', authLimiter, async (req, res) => {
  const { username, email, password, displayName } = req.body || {};
  if (!USERNAME_RE.test(username || '')) return res.status(400).json({ error: 'Pseudo invalide (3 à 20 caractères : lettres, chiffres, _ - .).' });
  if (!EMAIL_RE.test(email || '') || email.length > 120) return res.status(400).json({ error: 'Adresse e-mail invalide.' });
  if (typeof password !== 'string' || password.length < 8 || password.length > 128) return res.status(400).json({ error: 'Le mot de passe doit contenir au moins 8 caractères.' });
  if (db.prepare('SELECT 1 FROM users WHERE username = ? OR display_name = ? COLLATE NOCASE').get(username, username)) return res.status(409).json({ error: 'Ce pseudo est déjà pris.' });
  const dn = U.validateDisplayName(displayName, { id: 0, username, role: 'user' });
  if (dn.error) return res.status(400).json({ error: dn.error });
  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) return res.status(409).json({ error: 'Cette adresse e-mail est déjà utilisée.' });
  let u;
  try {
    u = await createUser({ username, email, password, displayName: dn.value });
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) return res.status(409).json({ error: 'Ce pseudo est déjà utilisé.' });
    throw e;
  }
  setCookie(res, sign(u));
  res.json({ user: me(u) });
});

router.post('/login', authLimiter, async (req, res) => {
  const { login, password } = req.body || {};
  if (!login || !password) return res.status(400).json({ error: 'Identifiants manquants.' });
  const u = db.prepare('SELECT * FROM users WHERE username = ? OR email = ?').get(String(login), String(login));
  if (!u || !(await bcrypt.compare(String(password), u.password_hash))) return res.status(401).json({ error: 'Identifiants incorrects.' });
  if (u.banned) return res.status(403).json({ error: `Compte suspendu${u.ban_reason ? ' : ' + u.ban_reason : ''}.` });
  setCookie(res, sign(u));
  res.json({ user: me(u) });
});

router.post('/logout', (_req, res) => {
  res.clearCookie(COOKIE, { path: '/' });
  res.json({ ok: true });
});

router.get('/me', (req, res) => {
  res.json({ user: req.user ? me(req.user) : null });
});

router.patch('/me', requireAuth, async (req, res) => {
  const u = req.user;
  const { pawn, color, bio, currentPassword, newPassword, displayName } = req.body || {};
  const vip = U.isVip(u) || U.isStaff(u);
  const updates = {};
  if (pawn !== undefined) {
    if (!(U.PAWNS.includes(pawn) || (vip && U.VIP_PAWNS.includes(pawn)))) return res.status(400).json({ error: 'Pion indisponible.' });
    updates.pawn = pawn;
  }
  if (color !== undefined) {
    if (!(U.COLORS.includes(color) || (vip && U.VIP_COLORS.includes(color)))) return res.status(400).json({ error: 'Couleur indisponible.' });
    updates.color = color;
  }
  if (bio !== undefined) updates.bio = String(bio).slice(0, 200);
  if (displayName !== undefined) {
    const dn = U.validateDisplayName(displayName, u);
    if (dn.error) return res.status(400).json({ error: dn.error });
    if ((dn.value || null) !== (u.display_name || null)) {
      updates.display_name = dn.value;
      db.prepare('INSERT INTO audit_log (actor_id, action, target_id, details, created_at) VALUES (?, ?, ?, ?, ?)').run(u.id, 'display_name', u.id, JSON.stringify({ from: U.displayOf(u), to: dn.value || u.username }), Date.now());
    }
  }
  if (newPassword) {
    if (!(await bcrypt.compare(String(currentPassword || ''), u.password_hash))) return res.status(400).json({ error: 'Mot de passe actuel incorrect.' });
    if (String(newPassword).length < 8) return res.status(400).json({ error: 'Nouveau mot de passe trop court.' });
    updates.password_hash = await bcrypt.hash(String(newPassword), 12);
  }
  const keys = Object.keys(updates);
  try {
    if (keys.length) db.prepare(`UPDATE users SET ${keys.map((k) => `${k} = @${k}`).join(', ')} WHERE id = @id`).run({ ...updates, id: u.id });
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) return res.status(409).json({ error: 'Ce pseudo est déjà utilisé par un autre joueur.' });
    throw e;
  }
  res.json({ user: me(U.getUser(u.id)) });
});

// Règles de partie enregistrées pour les prochaines salles
router.put('/me/settings', requireAuth, (req, res) => {
  const body = req.body || {};
  const cards = body.kind === 'cartes';
  const horses = body.kind === 'chevaux';
  const months = body.kind === 'mois';
  const poker = body.kind === 'poker';
  // Chaque jeu a ses propres règles enregistrées
  const col = cards ? 'saved_card_settings' : horses ? 'saved_horse_settings' : months ? 'saved_month_settings' : poker ? 'saved_poker_settings' : 'saved_settings';
  if (body.settings === null) {
    db.prepare(`UPDATE users SET ${col} = NULL WHERE id = ?`).run(req.user.id);
    return res.json({ user: me(U.getUser(req.user.id)) });
  }
  if (poker) {
    const c = require('./poker/settings').sanitize(body.settings);
    db.prepare('UPDATE users SET saved_poker_settings = ? WHERE id = ?').run(JSON.stringify(c), req.user.id);
    return res.json({ user: me(U.getUser(req.user.id)) });
  }
  if (months) {
    const c = require('./mois/settings').sanitize(body.settings);
    db.prepare('UPDATE users SET saved_month_settings = ? WHERE id = ?').run(JSON.stringify(c), req.user.id);
    return res.json({ user: me(U.getUser(req.user.id)) });
  }
  if (horses) {
    const c = require('./chevaux/settings').sanitize(body.settings);
    db.prepare('UPDATE users SET saved_horse_settings = ? WHERE id = ?').run(JSON.stringify(c), req.user.id);
    return res.json({ user: me(U.getUser(req.user.id)) });
  }
  if (cards) {
    const c = require('./cartes/settings').sanitize(body.settings);
    db.prepare('UPDATE users SET saved_card_settings = ? WHERE id = ?').run(JSON.stringify(c), req.user.id);
    return res.json({ user: me(U.getUser(req.user.id)) });
  }
  const { sanitize } = require('./game/settings');
  const s = sanitize(body.settings);
  if (req.user.role !== 'admin') {
    delete s.melenchon;
    delete s.politicalBoard;
  }
  db.prepare('UPDATE users SET saved_settings = ? WHERE id = ?').run(JSON.stringify(s), req.user.id);
  res.json({ user: me(U.getUser(req.user.id)) });
});

function savedOf(u, col = 'saved_settings') {
  try {
    return u[col] ? JSON.parse(u[col]) : null;
  } catch {
    return null;
  }
}

function me(u) {
  return { ...U.publicUser(u), username: u.username, displayName: u.display_name || null, email: u.email, staff: U.isStaff(u), savedSettings: savedOf(u), savedCardSettings: savedOf(u, 'saved_card_settings'), savedHorseSettings: savedOf(u, 'saved_horse_settings'), savedMonthSettings: savedOf(u, 'saved_month_settings'), savedPokerSettings: savedOf(u, 'saved_poker_settings') };
}

module.exports = { router, attachUser, requireAuth, requireStaff, userFromToken, parseCookie, createUser, COOKIE, me };
