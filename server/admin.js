'use strict';
const express = require('express');
const db = require('./db');
const U = require('./users');
const rooms = require('./rooms');
const site = require('./site');
const { requireAuth, requireStaff } = require('./auth');

const router = express.Router();
router.use(requireAuth, requireStaff);

function audit(actor, action, target, details) {
  db.prepare('INSERT INTO audit_log (actor_id, action, target_id, details, created_at) VALUES (?, ?, ?, ?, ?)').run(actor.id, action, target || null, details ? JSON.stringify(details) : null, Date.now());
}

router.get('/overview', (_req, res) => {
  const users = db.prepare('SELECT COUNT(*) n FROM users').get().n;
  const vips = db.prepare('SELECT COUNT(*) n FROM users WHERE vip_until = 0 OR vip_until > ?').get(Date.now()).n;
  const banned = db.prepare('SELECT COUNT(*) n FROM users WHERE banned = 1').get().n;
  const games = db.prepare('SELECT COUNT(*) n FROM games').get().n;
  const games24 = db.prepare('SELECT COUNT(*) n FROM games WHERE ended_at > ?').get(Date.now() - 86400000).n;
  const new24 = db.prepare('SELECT COUNT(*) n FROM users WHERE created_at > ?').get(Date.now() - 86400000).n;
  res.json({ users, vips, banned, games, games24, new24, live: rooms.counts() });
});

router.get('/users', (req, res) => {
  const q = String(req.query.q || '').trim();
  const rows = db
    .prepare(
      `SELECT u.id, u.username, u.display_name, u.email, u.role, u.vip_until, u.banned, u.ban_reason, u.created_at, u.last_seen, u.xp, s.games, s.wins
       FROM users u LEFT JOIN stats s ON s.user_id = u.id
       WHERE u.username LIKE @q OR u.email LIKE @q OR u.display_name LIKE @q ORDER BY u.id DESC LIMIT 100`
    )
    .all({ q: `%${q}%` });
  res.json({ users: rows.map((r) => ({ ...r, vip: U.isVip(r) })) });
});

router.patch('/users/:id', (req, res) => {
  const target = U.getUser(Number(req.params.id));
  if (!target) return res.status(404).json({ error: 'Utilisateur introuvable.' });
  const actor = req.user;
  const body = req.body || {};
  const isAdmin = actor.role === 'admin';
  // Seul un admin peut toucher aux rôles et aux autres membres du staff
  if (U.isStaff(target) && !isAdmin && target.id !== actor.id) return res.status(403).json({ error: 'Seul un administrateur peut modifier un membre du staff.' });

  if (body.role !== undefined) {
    if (!isAdmin) return res.status(403).json({ error: 'Seul un administrateur peut changer les rôles.' });
    if (!['user', 'staff', 'admin'].includes(body.role)) return res.status(400).json({ error: 'Rôle invalide.' });
    if (target.id === actor.id && body.role !== 'admin') return res.status(400).json({ error: 'Vous ne pouvez pas retirer votre propre rôle admin.' });
    db.prepare('UPDATE users SET role = ? WHERE id = ?').run(body.role, target.id);
    audit(actor, 'role', target.id, { role: body.role });
  }
  if (body.vip !== undefined) {
    // vip: false | 'lifetime' | nombre de jours (ajoutés à la date actuelle ou à l'échéance en cours)
    let until = null;
    if (body.vip === 'lifetime') until = 0;
    else if (Number(body.vip) > 0) {
      const base = target.vip_until && target.vip_until > Date.now() ? target.vip_until : Date.now();
      until = base + Number(body.vip) * 86400000;
    }
    db.prepare('UPDATE users SET vip_until = ? WHERE id = ?').run(until, target.id);
    audit(actor, 'vip', target.id, { vip: body.vip });
  }
  if (body.banned !== undefined) {
    if (target.id === actor.id) return res.status(400).json({ error: 'Vous ne pouvez pas vous bannir.' });
    db.prepare('UPDATE users SET banned = ?, ban_reason = ? WHERE id = ?').run(body.banned ? 1 : 0, body.banned ? String(body.reason || '').slice(0, 200) : null, target.id);
    audit(actor, body.banned ? 'ban' : 'unban', target.id, { reason: body.reason });
    // Débannissement : on lève aussi les bannissements prononcés en partie (compte)
    if (!body.banned) db.prepare('DELETE FROM mod_bans WHERE key = ?').run('u:' + target.id);
  }
  if (body.resetStats) {
    if (!isAdmin) return res.status(403).json({ error: 'Réservé aux administrateurs.' });
    db.prepare('DELETE FROM stats WHERE user_id = ?').run(target.id);
    db.prepare('INSERT INTO stats (user_id) VALUES (?)').run(target.id);
    db.prepare('DELETE FROM user_badges WHERE user_id = ?').run(target.id);
    db.prepare('UPDATE users SET xp = 0 WHERE id = ?').run(target.id);
    audit(actor, 'reset_stats', target.id);
  }
  if (body.resetDisplayName) {
    db.prepare('UPDATE users SET display_name = NULL WHERE id = ?').run(target.id);
    audit(actor, 'reset_display_name', target.id, { was: target.display_name });
  }
  if (body.grantBadge) {
    if (!U.BADGES.find((b) => b.id === body.grantBadge)) return res.status(400).json({ error: 'Badge inconnu.' });
    db.prepare('INSERT OR IGNORE INTO user_badges (user_id, badge, earned_at) VALUES (?, ?, ?)').run(target.id, body.grantBadge, Date.now());
    audit(actor, 'grant_badge', target.id, { badge: body.grantBadge });
  }
  res.json({ ok: true });
});

// Réglages du site (administrateurs uniquement pour la modification)
router.get('/site', (_req, res) => res.json(site.get()));
router.patch('/site', (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Réservé aux administrateurs.' });
  const next = site.set(req.body || {});
  audit(req.user, 'site_settings', null, req.body || {});
  if (!next.guestsAllowed) rooms.kickGuests();
  res.json(next);
});

router.get('/rooms', (_req, res) => res.json({ rooms: rooms.adminList() }));
router.delete('/rooms/:code', (req, res) => {
  const ok = rooms.adminClose(String(req.params.code).toUpperCase(), 'Salle fermée par un membre du staff.');
  if (ok) audit(req.user, 'close_room', null, { code: req.params.code });
  res.json({ ok });
});
router.post('/announce', (req, res) => {
  const text = String((req.body && req.body.text) || '').trim();
  if (!text) return res.status(400).json({ error: 'Message vide.' });
  rooms.announce(text);
  audit(req.user, 'announce', null, { text });
  res.json({ ok: true });
});
// Bannissements prononcés en partie (comptes et navigateurs d'invités)
router.get('/bans', (_req, res) => {
  const rows = db.prepare('SELECT b.*, u.username by_name FROM mod_bans b LEFT JOIN users u ON u.id = b.by_id WHERE b.until IS NULL OR b.until > ? ORDER BY b.created_at DESC LIMIT 200').all(Date.now());
  res.json({ bans: rows });
});
router.delete('/bans/:key', (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Réservé aux administrateurs.' });
  const key = String(req.params.key);
  const row = db.prepare('SELECT * FROM mod_bans WHERE key = ?').get(key);
  if (!row) return res.status(404).json({ error: 'Bannissement introuvable.' });
  // Lève tous les bannissements de la même personne (compte + navigateurs), prononcés ensemble
  db.prepare('DELETE FROM mod_bans WHERE created_at = ? AND name IS ?').run(row.created_at, row.name);
  if (key.startsWith('u:')) db.prepare('UPDATE users SET banned = 0, ban_reason = NULL WHERE id = ?').run(Number(key.slice(2)));
  audit(req.user, 'unban', key.startsWith('u:') ? Number(key.slice(2)) : null, { name: row.name, key });
  res.json({ ok: true });
});
router.get('/audit', (_req, res) => {
  const rows = db
    .prepare('SELECT a.*, u.username || COALESCE(\' (\' || u.display_name || \')\', \'\') actor, t.username || COALESCE(\' (\' || t.display_name || \')\', \'\') target FROM audit_log a LEFT JOIN users u ON u.id = a.actor_id LEFT JOIN users t ON t.id = a.target_id ORDER BY a.id DESC LIMIT 100')
    .all();
  res.json({ entries: rows });
});

module.exports = router;
