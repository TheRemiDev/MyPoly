'use strict';
const config = require('./config');
const path = require('path');
const http = require('http');
const express = require('express');
const helmet = require('helmet');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const { Server } = require('socket.io');

const auth = require('./auth');
const U = require('./users');
const rooms = require('./rooms');
const admin = require('./admin');
const site = require('./site');
const board = require('./game/board');
const { CARDS } = require('./game/cards');
const { DEFAULTS, LIMITS } = require('./game/settings');

const app = express();
app.set('trust proxy', config.trustProxy);
app.disable('x-powered-by');
app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        // YouTube : lecteur intégré pour la musique diffusée par l'hôte
        'script-src': ["'self'", 'https://www.youtube.com', 'https://s.ytimg.com'],
        'frame-src': ['https://www.youtube.com', 'https://www.youtube-nocookie.com'],
        'style-src': ["'self'", "'unsafe-inline'"],
        'img-src': ["'self'", 'data:', 'https://i.ytimg.com'],
        'connect-src': ["'self'", 'ws:', 'wss:'],
        'upgrade-insecure-requests': config.secureCookies ? [] : null,
      },
    },
    crossOriginEmbedderPolicy: false,
  })
);
app.use(compression());
app.use(express.json({ limit: '32kb' }));
app.use(cookieParser());
app.use(auth.attachUser);

// ---------------------------------------------------------------- API
app.get('/api/health', (_req, res) => res.json({ ok: true, ...rooms.counts() }));
app.use('/api/auth', auth.router);
app.use('/api/admin', admin);

app.get('/api/meta', (_req, res) => {
  res.set('Cache-Control', 'public, max-age=300');
  res.json({
    cells: board.CELLS,
    themes: require('./game/themes').THEMES,
    countries: board.COUNTRIES,
    sides: board.SIDES,
    resortRent: board.RESORT_RENT,
    cards: CARDS,
    badges: U.BADGES,
    pawns: U.PAWNS,
    vipPawns: U.VIP_PAWNS,
    colors: U.COLORS,
    vipColors: U.VIP_COLORS,
    defaults: DEFAULTS,
    limits: LIMITS,
    cardDefaults: require('./cartes/settings').DEFAULTS,
    horseDefaults: require('./chevaux/settings').DEFAULTS,
    monthDefaults: require('./mois/settings').DEFAULTS,
  });
});

app.get('/api/profile/:key', (req, res) => {
  const p = U.profile(String(req.params.key));
  if (!p) return res.status(404).json({ error: 'Joueur introuvable.' });
  res.json(p);
});

app.get('/api/leaderboard', (req, res) => {
  res.json({ players: U.leaderboard(String(req.query.sort || 'rating')) });
});

// Statistiques publiques de la page d'accueil (mises en cache 20 s)
let statsCache = null;
app.get('/api/stats', (_req, res) => {
  const now = Date.now();
  if (!statsCache || now - statsCache.at > 20000) {
    const db = require('./db');
    const kindOf = (wt) => (wt === 'cartes' || wt === 'chevaux' || wt === 'mois' ? wt : 'poly');
    const recent = db.prepare('SELECT win_type, winner_name, players, ended_at, duration FROM games WHERE winner_name IS NOT NULL ORDER BY id DESC LIMIT 12').all()
      .map((g) => ({ kind: kindOf(g.win_type), winner: g.winner_name, players: JSON.parse(g.players).length, at: g.ended_at, duration: g.duration }));
    const byKind = { poly: 0, cartes: 0, chevaux: 0, mois: 0 };
    for (const r of db.prepare("SELECT CASE WHEN win_type IN ('cartes','chevaux','mois') THEN win_type ELSE 'poly' END AS k, COUNT(*) AS n FROM games GROUP BY k").all()) byKind[r.k] = r.n;
    const top = {
      poly: U.leaderboard('wins', 3),
      cartes: U.leaderboard('c_wins', 3),
      chevaux: U.leaderboard('h_wins', 3),
      mois: U.leaderboard('m_wins', 3),
    };
    statsCache = {
      at: now,
      data: {
        players: db.prepare('SELECT COUNT(*) AS n FROM users WHERE banned = 0').get().n,
        games: Object.values(byKind).reduce((a, b) => a + b, 0),
        today: db.prepare('SELECT COUNT(*) AS n FROM games WHERE ended_at > ?').get(now - 86400000).n,
        byKind,
        recent,
        top: Object.fromEntries(Object.entries(top).map(([k, list]) => [k, list.map((p) => ({ id: p.id, name: p.name, pawn: p.pawn, color: p.color, wins: p.wins, vip: p.vip, role: p.role }))])),
      },
    };
  }
  res.json({ ...statsCache.data, live: rooms.counts() });
});

// Réglages publics du site (mode invité…)
app.get('/api/site', (_req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(site.get());
});

app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));

// ------------------------------------------------------------ fichiers
const pub = path.join(__dirname, '..', 'public');
// Three.js (rendu 3D du plateau) servi localement : aucune dépendance à un CDN
app.use('/vendor/three', express.static(path.join(__dirname, '..', 'node_modules', 'three', 'build'), { maxAge: config.production ? '7d' : 0 }));
// Revalidation à chaque chargement (ETag) : après une mise à jour, les joueurs
// reçoivent immédiatement la nouvelle version, jamais un mélange ancien/nouveau.
app.use(express.static(pub, { maxAge: 0, index: false }));
app.get('*', (_req, res) => res.sendFile(path.join(pub, 'index.html')));

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Erreur serveur.' });
});

// ------------------------------------------------------------ serveur
const server = http.createServer(app);
const io = new Server(server, {
  pingInterval: 20000,
  pingTimeout: 25000,
  maxHttpBufferSize: 1e5,
});
rooms.attach(io);

server.listen(config.port, config.host, () => {
  console.log(`🎲 MyPoly en ligne sur http://${config.host}:${config.port} ${config.publicUrl ? '(' + config.publicUrl + ')' : ''}`);
});

let stopping = false;
function shutdown() {
  if (stopping) return;
  stopping = true;
  console.log('Arrêt de MyPoly…');
  // Les salles et parties en cours sont sauvegardées : elles reprennent au redémarrage
  rooms.saveRooms();
  io.emit('announce', { text: 'Le serveur redémarre, reconnexion automatique dans quelques secondes…' });
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
