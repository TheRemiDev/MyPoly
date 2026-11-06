'use strict';
/**
 * Crée (ou promeut) un compte administrateur.
 * Usage : node scripts/create-admin.js <pseudo> <email> <motdepasse>
 *         node scripts/create-admin.js <pseudo>            (promeut un compte existant)
 */
require('../server/config');
const db = require('../server/db');
const { createUser } = require('../server/auth');

(async () => {
  const [username, email, password] = process.argv.slice(2);
  if (!username) {
    console.error('Usage : node scripts/create-admin.js <pseudo> [email] [motdepasse]');
    process.exit(1);
  }
  const existing = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (existing) {
    db.prepare("UPDATE users SET role = 'admin', vip_until = 0, banned = 0 WHERE id = ?").run(existing.id);
    console.log(`✅ ${username} est maintenant administrateur.`);
    return;
  }
  if (!email || !password || password.length < 8) {
    console.error('Email et mot de passe (8 caractères min.) requis pour créer un nouveau compte.');
    process.exit(1);
  }
  const u = await createUser({ username, email, password, role: 'admin' });
  db.prepare('UPDATE users SET vip_until = 0 WHERE id = ?').run(u.id);
  console.log(`✅ Compte administrateur « ${username} » créé.`);
})();
