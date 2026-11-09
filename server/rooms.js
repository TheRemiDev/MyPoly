'use strict';
const crypto = require('crypto');
const { Game } = require('./game/engine');
const { CardGame } = require('./cartes/engine');
const CS = require('./cartes/settings');
const { HorseGame } = require('./chevaux/engine');
const HS = require('./chevaux/settings');
const { MonthGame } = require('./mois/engine');
const MS = require('./mois/settings');
/** Jeux disponibles sur le site. */
const KINDS = ['poly', 'cartes', 'chevaux', 'mois'];
const kindOf = (k) => (KINDS.includes(k) ? k : 'poly');
const { sanitize, DEFAULTS } = require('./game/settings');
const R = require('./game/random');
const U = require('./users');
const { userFromToken, parseCookie, COOKIE } = require('./auth');
const site = require('./site');
const persist = require('./persist');
/** Temps laissé aux joueurs pour revenir après un redémarrage du serveur. */
const RESUME_GRACE_MS = 90 * 1000;

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const BOT_NAMES = ['Robo Rita', 'Capitaine Cash', 'Baron Béton', 'Lady Loyer', 'Dr. Dé', 'Mme Monopole', 'Sir Spéculo', 'Zara Zillion', 'Max Magnat', 'Polly Bot'];
const MAX_ROOMS = 2000;
const LOBBY_GRACE_MS = 45 * 1000;

const rooms = new Map();
let io = null;

function makeCode() {
  let code;
  do {
    code = Array.from({ length: 6 }, () => CODE_ALPHABET[crypto.randomInt(0, CODE_ALPHABET.length)]).join('');
  } while (rooms.has(code));
  return code;
}

function cleanText(s, max) {
  return String(s || '')
    .replace(/[\u0000-\u001f\u007f<>]/g, '')
    .trim()
    .slice(0, max);
}

// ------------------------------------------------------------ modération (bannissements)
const DB = require('./db');
/** Clé « invité » d'un navigateur (envoyée même quand on est connecté à un compte). */
function guestKeyOf(socket) {
  const gid = (socket.handshake.auth || {}).guestId;
  return /^[a-zA-Z0-9]{16,64}$/.test(gid || '') ? 'g:' + crypto.createHash('sha256').update(gid).digest('hex').slice(0, 16) : null;
}
/** Bannissement en cours pour l'une de ces clés (compte ou navigateur) ? */
function activeBan(keys) {
  const now = Date.now();
  for (const k of keys) {
    if (!k) continue;
    const row = DB.prepare('SELECT * FROM mod_bans WHERE key = ?').get(k);
    if (row && (!row.until || row.until > now)) return row;
  }
  return null;
}
const banText = (b) => (b.until ? `jusqu'au ${new Date(b.until).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', dateStyle: 'short', timeStyle: 'short' })}` : 'définitivement');

/** Identité d'une connexion : compte enregistré ou invité. */
function identify(socket) {
  const token = parseCookie(socket.handshake.headers.cookie, COOKIE);
  const user = userFromToken(token);
  if (user) {
    return {
      key: 'u:' + user.id,
      userId: user.id,
      name: U.displayOf(user),
      role: user.role,
      vip: U.isVip(user),
      pawn: user.pawn,
      color: user.color,
      level: U.levelFromXp(user.xp),
      guest: false,
    };
  }
  const auth = socket.handshake.auth || {};
  const gid = /^[a-zA-Z0-9]{16,64}$/.test(auth.guestId || '') ? auth.guestId : crypto.randomBytes(16).toString('hex');
  let name = cleanText(auth.guestName, 16).replace(/[^\p{L}\p{N} _\-.]/gu, '');
  if (name.length < 2) name = 'Invité' + crypto.randomInt(100, 999);
  return {
    key: 'g:' + crypto.createHash('sha256').update(gid).digest('hex').slice(0, 16),
    userId: null,
    name: name + ' (invité)',
    role: 'guest',
    vip: false,
    pawn: U.PAWNS[crypto.randomInt(0, U.PAWNS.length)],
    color: U.COLORS[crypto.randomInt(0, U.COLORS.length)],
    level: 0,
    guest: true,
  };
}

// ------------------------------------------------------------------ helpers
function seatPublic(s, room) {
  return {
    key: s.key,
    name: s.name,
    isBot: s.isBot,
    role: s.role,
    vip: s.vip,
    pawn: s.pawn,
    color: s.color,
    level: s.level,
    userId: s.userId,
    host: room.host === s.key,
    connected: s.isBot || isConnected(room, s.key),
  };
}
function isConnected(room, key) {
  const set = room.sockets.get(key);
  return !!set && set.size > 0;
}
function roomPublic(room) {
  return {
    code: room.code,
    kind: room.kind,
    host: room.host,
    name: room.name,
    settings: room.settings,
    state: room.state,
    seats: room.seats.map((s) => seatPublic(s, room)),
    spectators: [...room.sockets.keys()].filter((k) => !room.seats.some((s) => s.key === k) && isConnected(room, k)).length,
    result: room.result || null,
    music: musicPublic(room.music),
    createdAt: room.createdAt,
  };
}
function broadcastRoom(room) {
  io.to('room:' + room.code).emit('room:state', roomPublic(room));
}
function systemChat(room, text) {
  const msg = { id: crypto.randomUUID(), system: true, text, t: Date.now() };
  room.chat.push(msg);
  if (room.chat.length > 100) room.chat.shift();
  io.to('room:' + room.code).emit('chat:msg', msg);
}
function freeColor(room, wanted) {
  const used = new Set(room.seats.map((s) => s.color));
  if (wanted && !used.has(wanted)) return wanted;
  return U.COLORS.find((c) => !used.has(c)) || wanted;
}
function touch(room) {
  room.lastActivity = Date.now();
}

// ------------------------------------------------------------ musique (YouTube)
/** Extrait l'identifiant d'une vidéo YouTube depuis un lien (ou l'identifiant seul). */
function youtubeId(input) {
  const s = String(input || '').trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s;
  const m = s.match(/(?:youtu\.be\/|[?&]v=|\/embed\/|\/shorts\/|\/live\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}
async function youtubeTitle(id) {
  try {
    const r = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${id}&format=json`, { signal: AbortSignal.timeout(4000) });
    if (!r.ok) return null;
    const j = await r.json();
    return cleanText(j.title, 120) || null;
  } catch {
    return null;
  }
}
/** Extrait l'identifiant d'une playlist YouTube (paramètre « list= »). */
function playlistId(input) {
  const m = String(input || '').match(/[?&]list=([A-Za-z0-9_-]{10,64})/);
  return m ? m[1] : null;
}
const PLAYLIST_MAX = 50;
/** Titres d'une playlist YouTube : page de la playlist, puis flux RSS (15 titres) en secours. */
async function youtubePlaylist(list) {
  const seen = new Set();
  const out = [];
  const push = (id, title) => {
    if (!/^[A-Za-z0-9_-]{11}$/.test(id || '') || seen.has(id) || out.length >= PLAYLIST_MAX) return;
    seen.add(id);
    out.push({ id, title: cleanText(title, 120) || 'Vidéo YouTube' });
  };
  try {
    const r = await fetch(`https://www.youtube.com/playlist?list=${list}&hl=fr`, {
      headers: { 'Accept-Language': 'fr-FR,fr;q=0.9', 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36' },
      signal: AbortSignal.timeout(8000),
    });
    if (r.ok) {
      const html = await r.text();
      const m = html.match(/var ytInitialData = (\{.*?\});<\/script>/s);
      if (m) {
        const walk = (o) => {
          if (!o || typeof o !== 'object' || out.length >= PLAYLIST_MAX) return;
          const v = o.playlistVideoRenderer;
          if (v) push(v.videoId, (v.title && (v.title.simpleText || (v.title.runs || []).map((x) => x.text).join(''))) || '');
          const l = o.lockupViewModel;
          if (l && l.contentType === 'LOCKUP_CONTENT_TYPE_VIDEO') {
            const t = l.metadata && l.metadata.lockupMetadataViewModel && l.metadata.lockupMetadataViewModel.title;
            push(l.contentId, t && t.content);
          }
          for (const x of Object.values(o)) walk(x);
        };
        walk(JSON.parse(m[1]));
      }
    }
  } catch {}
  if (out.length) return out;
  try {
    const r = await fetch(`https://www.youtube.com/feeds/videos.xml?playlist_id=${list}`, { signal: AbortSignal.timeout(6000) });
    if (r.ok) {
      const xml = await r.text();
      const dec = (t) => t.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
      for (const e of xml.split('<entry>').slice(1)) {
        const id = (e.match(/<yt:videoId>([^<]+)</) || [])[1];
        const title = (e.match(/<title>([^<]*)</) || [])[1];
        push(id, dec(title || ''));
      }
    }
  } catch {}
  return out;
}
/** Musique telle qu'envoyée aux clients. */
function musicPublic(music) {
  const strip = (t) => t && { id: t.id, title: t.title, by: t.by, byKey: t.byKey, startedAt: t.startedAt };
  return { current: strip(music.current), queue: music.queue.map(strip), open: !!music.open, serverNow: Date.now() };
}
function musicNext(room) {
  const next = room.music.queue.shift();
  room.music.current = next ? { ...next, startedAt: Date.now() } : null;
  broadcastRoom(room);
}

function sanitizeFor(kind, input, base) {
  if (kind === 'cartes') return CS.sanitize(input, base);
  if (kind === 'chevaux') return HS.sanitize(input, base);
  if (kind === 'mois') return MS.sanitize(input, base);
  return sanitize(input, base);
}

function createRoom(ident, settings, kind = 'poly') {
  const code = makeCode();
  const room = {
    code,
    kind,
    name: `Salle de ${ident.name.replace(' (invité)', '')}`,
    host: ident.key,
    settings: kind !== 'poly' ? sanitizeFor(kind, settings) : { ...sanitize(settings), melenchon: ident.role === 'admin' ? !!(settings && settings.melenchon) : false, politicalBoard: ident.role === 'admin' ? !!(settings && settings.politicalBoard) : false },
    state: 'lobby',
    seats: [],
    sockets: new Map(),
    chat: [],
    game: null,
    result: null,
    createdAt: Date.now(),
    lastActivity: Date.now(),
    leaveTimers: new Map(),
    music: { current: null, queue: [], open: false }, // musique YouTube (l'hôte peut l'ouvrir à tous)
  };
  rooms.set(code, room);
  return room;
}

function seat(room, ident) {
  room.seats.push({
    key: ident.key,
    userId: ident.userId,
    name: ident.name,
    isBot: false,
    role: ident.role,
    vip: ident.vip,
    pawn: ident.pawn,
    color: freeColor(room, ident.color),
    level: ident.level,
  });
}

function addBot(room) {
  const used = new Set(room.seats.map((s) => s.name));
  const name = R.shuffle(BOT_NAMES).find((n) => !used.has(n)) || 'Bot ' + R.int(10, 99);
  const usedPawns = new Set(room.seats.map((s) => s.pawn));
  room.seats.push({
    key: 'bot:' + crypto.randomBytes(5).toString('hex'),
    userId: null,
    name,
    isBot: true,
    role: 'bot',
    vip: false,
    pawn: R.shuffle(U.PAWNS).find((p) => !usedPawns.has(p)) || '🤖',
    color: freeColor(room, null),
    level: 0,
  });
}

function removeSeat(room, key) {
  const idx = room.seats.findIndex((s) => s.key === key);
  if (idx === -1) return;
  room.seats.splice(idx, 1);
  if (room.host === key) {
    const next = room.seats.find((s) => !s.isBot && isConnected(room, s.key)) || room.seats.find((s) => !s.isBot);
    if (next) {
      room.host = next.key;
      systemChat(room, `👑 ${next.name} devient l'hôte de la salle.`);
    }
  }
}

function deleteRoom(room, reason) {
  if (room.game) room.game.destroy();
  clearTimeout(room.graceTimer);
  for (const t of room.leaveTimers.values()) clearTimeout(t);
  io.to('room:' + room.code).emit('room:closed', { reason: reason || 'La salle a été fermée.' });
  io.in('room:' + room.code).socketsLeave('room:' + room.code);
  rooms.delete(room.code);
}

/** Envoie à chaque joueur (et spectateur) sa propre vue de la partie de cartes. */
function sendCardUpdate(room, events) {
  const g = room.game;
  if (!g) return;
  for (const [key, set] of room.sockets) {
    if (!set.size) continue;
    const viewer = g.player(key) ? key : null;
    const payload = { events: g.eventsFor(events, viewer), state: g.publicState(viewer) };
    for (const sid of set) io.to(sid).emit('game:update', payload);
  }
}

/** Rappels du moteur de jeu d'une salle (diffusion des mises à jour, fin de partie). */
function gameCallbacks(room) {
  return {
    onUpdate: room.kind === 'cartes'
      ? ({ events }) => {
          touch(room);
          sendCardUpdate(room, events);
        }
      : (payload) => {
          touch(room);
          io.to('room:' + room.code).emit('game:update', payload);
        },
    onEnd: (result) => setImmediate(() => endGame(room, result)),
  };
}

function startGame(room) {
  room.state = 'playing';
  room.result = null;
  const players = room.seats.map((s) => ({ id: s.key, userId: s.userId, name: s.name, color: s.color, pawn: s.pawn, isBot: s.isBot, role: s.role, vip: s.vip, level: s.level }));
  const Engine = { cartes: CardGame, chevaux: HorseGame, mois: MonthGame }[room.kind] || Game;
  room.game = new Engine({ players, settings: room.settings, ...gameCallbacks(room) });
  for (const s of room.seats) if (!s.isBot && !isConnected(room, s.key)) room.game.player(s.key).connected = false;
  broadcastRoom(room);
  room.game.start();
}

// ------------------------------------------------- sauvegarde / reprise
/** Sauvegarde toutes les salles (appelée régulièrement et à l'arrêt du serveur). */
function saveRooms() {
  try {
    persist.saveAll([...rooms.values()]);
  } catch (e) {
    console.error('[sauvegarde] échec', e);
  }
}

/** Recharge les salles sauvegardées au démarrage : les parties reprennent où elles en étaient. */
function restoreRooms() {
  let n = 0;
  for (const data of persist.loadAll()) {
    if (rooms.has(data.code)) continue;
    const { gameData, ...fields } = data;
    const room = { ...fields, kind: fields.kind || 'poly', sockets: new Map(), leaveTimers: new Map(), game: null, lastActivity: Date.now() };
    room.music = room.music || { current: null, queue: [], open: false };
    try {
      if (gameData && room.state === 'playing') {
        room.game = persist.restoreGame(room.kind, gameData, gameCallbacks(room));
        if (room.game.over) room.game = null;
      } else if (gameData && room.state === 'ended') {
        room.game = persist.restoreGame(room.kind, gameData, gameCallbacks(room));
      }
    } catch (e) {
      console.error('[reprise] partie illisible', room.code, e.message);
      continue;
    }
    if (room.state === 'playing' && !room.game) room.state = 'lobby';
    rooms.set(room.code, room);
    n++;
    // Les joueurs ont un délai pour revenir ; ensuite ils sont joués automatiquement (partie)
    // ou retirés du salon.
    room.graceTimer = setTimeout(() => {
      if (!rooms.has(room.code)) return;
      if (room.game) delete room.game.schedule; // fin de la pause : minuteur normal
      for (const st of [...room.seats]) {
        if (st.isBot || isConnected(room, st.key)) continue;
        if (room.game && room.state === 'playing') room.game.setConnected(st.key, false);
        else if (room.state === 'lobby') removeSeat(room, st.key);
      }
      if (!cleanupIfEmpty(room)) broadcastRoom(room);
    }, RESUME_GRACE_MS);
    if (room.game && room.state === 'playing') {
      const g = room.game;
      // Pendant le délai de retour, le tour d'un joueur humain pas encore reconnecté est en pause
      // (ni chrono ni jeu automatique) ; les bots et les joueurs revenus jouent normalement.
      for (const pl of g.players) if (!pl.isBot) pl.connected = true;
      const proto = Object.getPrototypeOf(g);
      g.schedule = function () {
        const cur = this.cur;
        if (!this.over && cur && !cur.isBot && !isConnected(room, cur.id)) {
          clearTimeout(this.timer);
          this.deadline = null;
          return;
        }
        return proto.schedule.call(this);
      };
      room.game.say('🔄 Le serveur a redémarré : la partie reprend !');
      room.game.flush();
    }
  }
  if (n) console.log(`🔄 ${n} salle(s) restaurée(s) après redémarrage`);
}

function endGame(room, result) {
  if (!rooms.has(room.code)) return;
  room.state = 'ended';
  room.result = result;
  let rewards = {};
  // On n'enregistre que des parties "réelles" (au moins 2 tours) pour éviter les abus
  const registered = result.players.some((p) => p.userId);
  const real = room.kind === 'cartes' || room.kind === 'chevaux' || room.kind === 'mois' ? result.turns >= 6 : result.rounds >= 2;
  if (registered && real) {
    try {
      const rec = { cartes: U.recordCardGame, chevaux: U.recordHorseGame, mois: U.recordMonthGame }[room.kind] || U.recordGame;
      ({ rewards } = rec(room.code, result, room.settings));
    } catch (e) {
      console.error('[stats] erreur enregistrement partie', e);
    }
  }
  for (const [uid, rw] of Object.entries(rewards)) {
    const set = room.sockets.get('u:' + uid);
    if (set) for (const sid of set) io.to(sid).emit('game:rewards', rw);
  }
  broadcastRoom(room);
}

// ------------------------------------------------------------------ sockets
function attach(server) {
  io = server;
  restoreRooms();
  // Sauvegarde régulière (en cas d'arrêt brutal) ; l'arrêt normal sauvegarde aussi
  setInterval(saveRooms, 10000).unref();

  io.on('connection', (socket) => {
    const ident = identify(socket);
    socket.data.ident = ident;
    socket.data.guestKey = guestKeyOf(socket);
    // Joueur banni (compte ou navigateur) : on le prévient et on coupe
    const ban = activeBan([ident.key, socket.data.guestKey]);
    if (ban) {
      socket.emit('banned', { reason: ban.reason || '', until: ban.until || null, text: banText(ban) });
      setTimeout(() => socket.disconnect(true), 300);
      return;
    }
    socket.data.room = null;
    socket.emit('hello', { key: ident.key, name: ident.name, guest: ident.guest });

    // Limiteur simple : 25 évènements / seconde
    let bucket = 25;
    const refill = setInterval(() => (bucket = 25), 1000);
    socket.use((_packet, next) => (bucket-- > 0 ? next() : next(new Error('rate'))));
    socket.on('error', () => {});

    const reply = (cb, data) => typeof cb === 'function' && cb(data);
    const current = () => {
      const r = socket.data.room ? rooms.get(socket.data.room) : null;
      if (r) return r;
      // Filet de sécurité (reconnexion…) : on retrouve la salle où cette connexion est inscrite
      for (const room of rooms.values()) {
        const set = room.sockets.get(ident.key);
        if (set && set.has(socket.id)) {
          socket.data.room = room.code;
          return room;
        }
      }
      return null;
    };
    const isHost = (room) => room && room.host === ident.key;

    function joinSocketRoom(room) {
      if (socket.data.room && socket.data.room !== room.code) leaveCurrent(true);
      socket.join('room:' + room.code);
      socket.data.room = room.code;
      if (!room.sockets.has(ident.key)) room.sockets.set(ident.key, new Set());
      room.sockets.get(ident.key).add(socket.id);
      // Mise à jour de l'identité (profil modifié entre-temps)
      const seatRow = room.seats.find((x) => x.key === ident.key);
      if (seatRow && room.state === 'lobby') Object.assign(seatRow, { name: ident.name, role: ident.role, vip: ident.vip, level: ident.level });
      const t = room.leaveTimers.get(ident.key);
      if (t) {
        clearTimeout(t);
        room.leaveTimers.delete(ident.key);
      }
      if (room.game && room.game.player(ident.key)) room.game.setConnected(ident.key, true);
      touch(room);
      socket.emit('room:state', roomPublic(room));
      socket.emit('chat:history', room.chat);
      if (room.game) socket.emit('game:update', { events: [], state: room.game.publicState(ident.key), sync: true });
    }

    function leaveCurrent(explicit) {
      const room = current();
      if (!room) return;
      socket.leave('room:' + room.code);
      socket.data.room = null;
      const set = room.sockets.get(ident.key);
      if (set) {
        set.delete(socket.id);
        if (set.size) return; // autre onglet encore connecté
        room.sockets.delete(ident.key);
      }
      const seated = room.seats.some((s) => s.key === ident.key);
      if (room.state === 'playing' && room.game && room.game.player(ident.key)) {
        if (explicit) {
          room.game.forfeit(ident.key);
          systemChat(room, `🚪 ${ident.name} a quitté la partie.`);
        } else room.game.setConnected(ident.key, false);
      } else if (seated && room.state !== 'playing') {
        if (explicit) {
          removeSeat(room, ident.key);
          systemChat(room, `🚪 ${ident.name} a quitté la salle.`);
        } else {
          // Délai de grâce (rafraîchissement de page, réseau mobile…)
          room.leaveTimers.set(
            ident.key,
            setTimeout(() => {
              room.leaveTimers.delete(ident.key);
              if (isConnected(room, ident.key) || !rooms.has(room.code)) return;
              if (room.state === 'playing') return;
              removeSeat(room, ident.key);
              systemChat(room, `🚪 ${ident.name} s'est déconnecté(e).`);
              cleanupIfEmpty(room);
              if (rooms.has(room.code)) broadcastRoom(room);
            }, LOBBY_GRACE_MS)
          );
        }
      }
      if (!cleanupIfEmpty(room)) broadcastRoom(room);
    }

    socket.on('rooms:list', (cb) => {
      const list = [...rooms.values()]
        .filter((r) => r.settings.isPublic)
        .map((r) => ({
          code: r.code,
          kind: r.kind,
          name: r.name,
          state: r.state,
          players: r.seats.length,
          max: r.settings.maxPlayers,
          host: (r.seats.find((s) => s.key === r.host) || {}).name || '?',
          hostVip: (r.seats.find((s) => s.key === r.host) || {}).vip || false,
          settings: r.settings,
        }))
        .sort((a, b) => (a.state === 'lobby' ? -1 : 1) - (b.state === 'lobby' ? -1 : 1))
        .slice(0, 50);
      reply(cb, { rooms: list, online: io.engine.clientsCount });
    });

    const guestBlocked = (cb) => {
      if (ident.guest && !site.get().guestsAllowed) {
        reply(cb, { error: 'Le mode invité est désactivé : connectez-vous ou créez un compte pour jouer.', needAccount: true });
        return true;
      }
      return false;
    };

    socket.on('room:create', (data, cb) => {
      if (guestBlocked(cb)) return;
      if (rooms.size >= MAX_ROOMS) return reply(cb, { error: 'Le serveur est plein, réessayez plus tard.' });
      const kind = kindOf(data && data.kind);
      const room = createRoom(ident, data && data.settings, kind);
      // L'hôte est placé en premier, puis les bots (qui prennent des pions et couleurs libres)
      seat(room, ident);
      if (data && data.bots) for (let i = 0; i < Math.min(5, Number(data.bots) || 0); i++) addBot(room);
      systemChat(room, `✨ Salle créée par ${ident.name}.`);
      joinSocketRoom(room);
      broadcastRoom(room);
      reply(cb, { code: room.code });
    });

    socket.on('room:join', (data, cb) => {
      if (guestBlocked(cb)) return;
      const code = String((data && data.code) || '').toUpperCase().trim();
      const room = rooms.get(code);
      if (!room) return reply(cb, { error: 'Salle introuvable. Vérifiez le code.' });
      if (room.kicked && room.kicked.has(ident.key) && ident.role !== 'admin') return reply(cb, { error: 'Vous avez été expulsé(e) de cette salle par un administrateur.' });
      const seated = room.seats.some((s) => s.key === ident.key);
      if (!seated && room.state === 'lobby') {
        if (room.seats.length >= room.settings.maxPlayers) {
          if (!room.settings.allowSpectators && !U.isStaff({ role: ident.role })) return reply(cb, { error: 'La salle est pleine.' });
        } else {
          seat(room, ident);
          systemChat(room, `👋 ${ident.name} rejoint la salle.`);
        }
      } else if (!seated && !room.settings.allowSpectators && !U.isStaff({ role: ident.role })) {
        return reply(cb, { error: 'Partie en cours : les spectateurs ne sont pas autorisés.' });
      }
      joinSocketRoom(room);
      broadcastRoom(room);
      reply(cb, { ok: true, code });
    });

    socket.on('room:leave', (cb) => {
      leaveCurrent(true);
      reply(cb, { ok: true });
    });

    socket.on('room:settings', (data, cb) => {
      const room = current();
      if (!isHost(room) || room.state !== 'lobby') return reply(cb, { error: 'Seul l\'hôte peut modifier les règles.' });
      const before = { melenchon: room.settings.melenchon, politicalBoard: room.settings.politicalBoard };
      room.settings = sanitizeFor(room.kind, data && data.settings, room.settings);
      // Options réservées : seul un administrateur peut les changer
      if (ident.role !== 'admin' && room.kind === 'poly') Object.assign(room.settings, before);
      if (data && data.name) room.name = cleanText(data.name, 40) || room.name;
      while (room.seats.length > room.settings.maxPlayers) {
        const bot = [...room.seats].reverse().find((s) => s.isBot);
        if (!bot) break;
        removeSeat(room, bot.key);
      }
      if (room.seats.length > room.settings.maxPlayers) room.settings.maxPlayers = room.seats.length;
      broadcastRoom(room);
      reply(cb, { ok: true });
    });

    socket.on('room:look', (data, cb) => {
      const room = current();
      if (!room || room.state === 'playing') return reply(cb, { error: 'Impossible maintenant.' });
      const s = room.seats.find((x) => x.key === ident.key);
      if (!s) return reply(cb, { error: 'Vous n\'êtes pas assis.' });
      const vip = ident.vip || U.isStaff({ role: ident.role });
      const { pawn, color } = data || {};
      if (pawn && (U.PAWNS.includes(pawn) || (vip && U.VIP_PAWNS.includes(pawn)))) s.pawn = pawn;
      if (color && (U.COLORS.includes(color) || (vip && U.VIP_COLORS.includes(color)))) {
        if (room.seats.some((x) => x !== s && x.color === color)) return reply(cb, { error: 'Couleur déjà prise.' });
        s.color = color;
      }
      broadcastRoom(room);
      reply(cb, { ok: true });
    });

    socket.on('room:addBot', (cb) => {
      const room = current();
      if (!isHost(room) || room.state !== 'lobby') return reply(cb, { error: 'Action réservée à l\'hôte.' });
      if (room.seats.length >= room.settings.maxPlayers) return reply(cb, { error: 'La salle est pleine.' });
      addBot(room);
      broadcastRoom(room);
      reply(cb, { ok: true });
    });

    socket.on('room:kick', (data, cb) => {
      const room = current();
      if (!isHost(room) || room.state !== 'lobby') return reply(cb, { error: 'Action réservée à l\'hôte.' });
      const key = data && data.key;
      if (key === ident.key) return reply(cb, { error: 'Vous ne pouvez pas vous exclure.' });
      const s = room.seats.find((x) => x.key === key);
      if (!s) return reply(cb, { error: 'Joueur introuvable.' });
      removeSeat(room, key);
      if (!s.isBot) {
        systemChat(room, `⛔ ${s.name} a été exclu(e).`);
        const set = room.sockets.get(key);
        if (set) for (const sid of set) io.to(sid).emit('room:kicked');
      }
      broadcastRoom(room);
      reply(cb, { ok: true });
    });

    socket.on('room:start', (cb) => {
      const room = current();
      if (!isHost(room) || room.state !== 'lobby') return reply(cb, { error: 'Seul l\'hôte peut lancer la partie.' });
      if (room.seats.length < 2) return reply(cb, { error: 'Il faut au moins 2 joueurs (ajoutez un bot !).' });
      startGame(room);
      reply(cb, { ok: true });
    });

    const backToLobby = (room) => {
      if (room.game) room.game.destroy();
      room.game = null;
      room.state = 'lobby';
      room.result = null;
      room.seats = room.seats.filter((s) => s.isBot || isConnected(room, s.key));
    };
    socket.on('room:rematch', (cb) => {
      const room = current();
      if (!isHost(room) || room.state !== 'ended') return reply(cb, { error: 'Action réservée à l\'hôte.' });
      backToLobby(room);
      systemChat(room, '🔁 Nouvelle partie ! Retour au salon.');
      broadcastRoom(room);
      reply(cb, { ok: true });
    });

    // Changer de jeu sans quitter la table : tout le monde reste assis (salon ou fin de partie)
    socket.on('room:kind', (data, cb) => {
      const room = current();
      if (!isHost(room) || room.state === 'playing') return reply(cb, { error: 'Seul l\'hôte peut changer de jeu, en dehors d\'une partie.' });
      const kind = kindOf(data && data.kind);
      if (kind === room.kind && room.state === 'lobby') return reply(cb, { ok: true });
      // Règles du nouveau jeu (celles enregistrées par l'hôte si fournies), en gardant les options de la salle
      const keep = { isPublic: !!room.settings.isPublic, allowSpectators: room.settings.allowSpectators !== false };
      let settings = sanitizeFor(kind, { ...((data && data.settings) || {}), ...keep });
      if (kind === 'poly') settings = { ...settings, melenchon: ident.role === 'admin' && !!(data && data.settings && data.settings.melenchon), politicalBoard: ident.role === 'admin' && !!(data && data.settings && data.settings.politicalBoard) };
      const limit = sanitizeFor(kind, { maxPlayers: 99 }).maxPlayers;
      const seated = room.state === 'ended' ? room.seats.filter((s) => s.isBot || isConnected(room, s.key)) : room.seats;
      const humans = seated.filter((s) => !s.isBot).length;
      if (humans > limit) return reply(cb, { error: `Trop de joueurs pour ce jeu : ${limit} maximum (vous êtes ${humans}).` });
      if (room.state === 'ended') backToLobby(room);
      room.kind = kind;
      room.settings = settings;
      // Places : on garde tout le monde, on retire des bots si la table du nouveau jeu est plus petite
      while (room.seats.length > limit) {
        const bot = [...room.seats].reverse().find((x) => x.isBot);
        if (!bot) break;
        removeSeat(room, bot.key);
      }
      room.settings.maxPlayers = Math.min(limit, Math.max(room.settings.maxPlayers, room.seats.length));
      const NAMES = { poly: '🎲 MyPoly', cartes: '🃏 Carton !', chevaux: '🐴 Petits chevaux', mois: '📅 Fin de mois' };
      systemChat(room, `🎮 ${ident.name} change de jeu : ${NAMES[kind]}. Tout le monde garde sa place !`);
      broadcastRoom(room);
      reply(cb, { ok: true });
    });

    // Musique : l'hôte choisit, ou ouvre la file à tout le monde (chacun gère son volume)
    const MUSIC_QUEUE_MAX = 150;
    const inRoom = (room) => room && (room.seats.some((x) => x.key === ident.key) || room.sockets.has(ident.key));
    const canAddMusic = (room) => isHost(room) || (room && room.music.open && inRoom(room));
    socket.on('music:open', (data, cb) => {
      const room = current();
      if (!isHost(room)) return reply(cb, { error: 'Seul l\'hôte peut changer ce réglage.' });
      const open = !!(data && data.open);
      if (room.music.open === open) return reply(cb, { ok: true });
      room.music.open = open;
      broadcastRoom(room);
      systemChat(room, open ? `🎵 ${ident.name} autorise tout le monde à ajouter de la musique.` : `🎵 ${ident.name} reprend la main sur la musique.`);
      reply(cb, { ok: true });
    });
    socket.on('music:add', async (data, cb) => {
      const room = current();
      if (!room) return reply(cb, { error: 'Aucune salle.' });
      if (!canAddMusic(room)) return reply(cb, { error: 'Seul l\'hôte peut choisir la musique.' });
      const now0 = Date.now();
      if (!isHost(room) && socket.data.lastMusic && now0 - socket.data.lastMusic < 3000) return reply(cb, { error: 'Doucement ! Attendez quelques secondes.' });
      socket.data.lastMusic = now0;
      const url = data && data.url;
      const list = playlistId(url);
      const id = youtubeId(url);
      if (!id && !list) return reply(cb, { error: 'Lien YouTube invalide.' });
      const room2 = room;
      const free = () => MUSIC_QUEUE_MAX - room2.music.queue.length + (room2.music.current ? 0 : 1);
      if (free() <= 0) return reply(cb, { error: `La file d'attente est pleine (${MUSIC_QUEUE_MAX} titres).` });
      let tracks = [];
      let fromList = false;
      // Les « mix » automatiques (RD…) ne sont pas de vraies playlists : on garde la vidéo seule
      if (list && !/^RD/.test(list)) {
        const items = await youtubePlaylist(list);
        if (items.length) {
          fromList = true;
          // Lien « watch?v=X&list=Y » : la playlist démarre à la vidéo choisie
          const at = id ? items.findIndex((x) => x.id === id) : -1;
          tracks = at > 0 ? items.slice(at).concat(items.slice(0, at)) : items;
        }
      }
      if (!tracks.length) {
        if (!id) return reply(cb, { error: 'Playlist introuvable ou privée.' });
        tracks = [{ id, title: (await youtubeTitle(id)) || 'Vidéo YouTube' }];
      }
      if (rooms.get(room2.code) !== room2) return reply(cb, { error: 'Salle fermée.' });
      tracks = tracks.slice(0, Math.max(0, free())).map((t) => ({ ...t, by: ident.name, byKey: ident.key }));
      if (!tracks.length) return reply(cb, { error: 'La file d\'attente est pleine.' });
      const startNow = !room2.music.current;
      if (startNow) room2.music.current = { ...tracks.shift(), startedAt: Date.now() };
      room2.music.queue.push(...tracks);
      broadcastRoom(room2);
      const n = tracks.length + (startNow ? 1 : 0);
      if (fromList) systemChat(room2, `🎵 ${ident.name} ajoute une playlist (${n} titre${n > 1 ? 's' : ''}).`);
      else systemChat(room2, startNow ? `🎵 ${ident.name} lance « ${room2.music.current.title} ».` : `🎵 ${ident.name} ajoute « ${tracks[0].title} » à la file.`);
      reply(cb, { ok: true, count: n });
    });
    socket.on('music:skip', (cb) => {
      const room = current();
      if (!isHost(room)) return reply(cb, { error: 'Seul l\'hôte peut changer la musique.' });
      musicNext(room);
      reply(cb, { ok: true });
    });
    socket.on('music:stop', (cb) => {
      const room = current();
      if (!isHost(room)) return reply(cb, { error: 'Seul l\'hôte peut arrêter la musique.' });
      room.music = { current: null, queue: [], open: room.music.open };
      broadcastRoom(room);
      reply(cb, { ok: true });
    });
    socket.on('music:clear', (cb) => {
      const room = current();
      if (!isHost(room)) return reply(cb, { error: 'Action réservée à l\'hôte.' });
      room.music.queue = [];
      broadcastRoom(room);
      reply(cb, { ok: true });
    });
    socket.on('music:remove', (data, cb) => {
      const room = current();
      if (!room) return reply(cb, { error: 'Aucune salle.' });
      const k = Number(data && data.index);
      const t = Number.isInteger(k) && k >= 0 && k < room.music.queue.length ? room.music.queue[k] : null;
      if (!t) return reply(cb, { ok: true });
      // L'hôte retire ce qu'il veut ; les autres seulement leurs propres titres
      if (!isHost(room) && t.byKey !== ident.key) return reply(cb, { error: 'Vous ne pouvez retirer que vos propres titres.' });
      if (data.id && t.id !== data.id) return reply(cb, { ok: true });
      room.music.queue.splice(k, 1);
      broadcastRoom(room);
      reply(cb, { ok: true });
    });
    // Fin de piste signalée par un client : on passe au titre suivant (une seule fois)
    socket.on('music:ended', (data) => {
      const room = current();
      const cur = room && room.music.current;
      if (!cur || !data || data.id !== cur.id || Date.now() - cur.startedAt < 10000) return;
      musicNext(room);
    });

    socket.on('chat:send', (data) => {
      const room = current();
      if (!room) return;
      const now = Date.now();
      if (socket.data.lastChat && now - socket.data.lastChat < 600) return;
      socket.data.lastChat = now;
      const text = cleanText(data && data.text, 200);
      if (!text) return;
      const msg = { id: crypto.randomUUID(), key: ident.key, name: ident.name, role: ident.role, vip: ident.vip, text, t: now };
      room.chat.push(msg);
      if (room.chat.length > 100) room.chat.shift();
      io.to('room:' + room.code).emit('chat:msg', msg);
    });

    socket.on('game:emote', (data) => {
      const room = current();
      if (!room || !room.game) return;
      const now = Date.now();
      if (socket.data.lastEmote && now - socket.data.lastEmote < 1500) return;
      socket.data.lastEmote = now;
      const emoji = ['👍', '😂', '😱', '😡', '🔥', '💸', '🎉', '😎', '🙏', '💀'].find((e) => e === (data && data.emoji));
      if (emoji && room.game.player(ident.key)) io.to('room:' + room.code).emit('game:emote', { key: ident.key, emoji });
    });

    socket.on('game:action', (data, cb) => {
      const room = current();
      if (!room) return reply(cb, { error: 'Connexion à la salle perdue : rechargez la page.', resync: true });
      if (!room.game || room.state !== 'playing') return reply(cb, { error: 'La partie est terminée.' });
      const { type, ...rest } = data || {};
      const res = room.game.act(ident.key, String(type || ''), rest);
      reply(cb, res);
    });

    // Actions réservées aux administrateurs (MyPoly) : faire renaître un joueur, offrir de l'argent
    socket.on('admin:game', (data, cb) => {
      const room = current();
      if (ident.role !== 'admin') return reply(cb, { error: 'Action réservée aux administrateurs.' });
      if (!room || !room.game || room.state !== 'playing' || room.kind !== 'poly') return reply(cb, { error: 'Aucune partie de MyPoly en cours.' });
      const amount = Math.round(Number(data && data.amount));
      if (!Number.isFinite(amount) || amount < 1 || amount > 100000) return reply(cb, { error: 'Montant invalide (1 à 100 000 K).' });
      const who = ident.name;
      const res = data.action === 'revive' ? room.game.adminRevive(String(data.pid || ''), amount, who) : data.action === 'give' ? room.game.adminGive(String(data.pid || ''), amount, who) : { error: 'Action inconnue.' };
      if (res.ok) {
        const p = room.game.player(String(data.pid));
        p.stats.adminGifts = (p.stats.adminGifts || 0) + amount;
        try {
          require('./db').prepare('INSERT INTO audit_log (actor_id, action, target_id, details, created_at) VALUES (?, ?, ?, ?, ?)')
            .run(ident.userId || null, 'game_' + data.action, p.userId || null, JSON.stringify({ room: room.code, player: p.name, amount }), Date.now());
        } catch (e) {
          console.error('[audit]', e.message);
        }
        systemChat(room, data.action === 'revive' ? `✨ ${who} (admin) fait renaître ${p.name} avec ${amount}K.` : `🎁 ${who} (admin) offre ${amount}K à ${p.name}.`);
      }
      reply(cb, res);
    });

    // ------------------------------------------------ modération (administrateurs, tous les jeux)
    /** Personnes présentes dans la salle (joueurs et spectateurs connectés). */
    socket.on('admin:people', (cb) => {
      const room = current();
      if (ident.role !== 'admin') return reply(cb, { error: 'Action réservée aux administrateurs.' });
      if (!room) return reply(cb, { error: 'Aucune salle.' });
      const people = new Map();
      for (const s of room.seats) if (!s.isBot) people.set(s.key, { key: s.key, name: s.name, role: s.role, seated: true, connected: isConnected(room, s.key) });
      for (const [key, set] of room.sockets) {
        if (people.has(key)) continue;
        const sock = io.sockets.sockets.get([...set][0]);
        const id = sock && sock.data.ident;
        if (id) people.set(key, { key, name: id.name, role: id.role, seated: false, connected: true });
      }
      reply(cb, { people: [...people.values()].filter((p) => p.key !== ident.key) });
    });

    /** Expulser (de cette salle) ou bannir (du site, pour une durée ou définitivement). */
    socket.on('admin:moderate', (data, cb) => {
      const room = current();
      if (ident.role !== 'admin') return reply(cb, { error: 'Action réservée aux administrateurs.' });
      if (!room) return reply(cb, { error: 'Aucune salle.' });
      const action = data && data.action;
      const key = String((data && data.key) || '');
      if (!['kick', 'ban'].includes(action)) return reply(cb, { error: 'Action inconnue.' });
      if (key === ident.key) return reply(cb, { error: 'Vous ne pouvez pas vous viser vous-même.' });
      const seatRow = room.seats.find((x) => x.key === key && !x.isBot);
      const set = room.sockets.get(key);
      const anySock = set && io.sockets.sockets.get([...set][0]);
      const target = seatRow ? { name: seatRow.name, role: seatRow.role } : anySock ? anySock.data.ident : null;
      if (!target) return reply(cb, { error: 'Cette personne n\'est plus dans la salle.' });
      if (target.role === 'admin') return reply(cb, { error: 'Impossible de viser un autre administrateur.' });
      const reason = cleanText(data.reason, 120);
      const minutes = Math.max(0, Math.min(60 * 24 * 365, Math.round(Number(data.minutes) || 0)));
      const ban = action === 'ban';
      const until = ban && minutes ? Date.now() + minutes * 60000 : null;
      const userId = key.startsWith('u:') ? Number(key.slice(2)) : null;

      // 1. Sortie de la partie / de la salle
      if (room.game && room.state === 'playing' && room.game.player(key)) room.game.forfeit(key);
      else if (seatRow && room.state !== 'playing') removeSeat(room, key);
      (room.kicked ||= new Set()).add(key);

      // 2. Bannissement : compte + navigateur(s) utilisés, coupure de toutes ses connexions
      const sockets = [...io.sockets.sockets.values()].filter((x) => x.data.ident && x.data.ident.key === key);
      if (ban) {
        const keys = new Set([key, ...sockets.map((x) => x.data.guestKey).filter(Boolean)]);
        const ins = DB.prepare('INSERT OR REPLACE INTO mod_bans (key, name, until, reason, by_id, created_at) VALUES (?, ?, ?, ?, ?, ?)');
        for (const k of keys) ins.run(k, target.name, until, reason || null, ident.userId || null, Date.now());
        if (userId && !until) DB.prepare('UPDATE users SET banned = 1, ban_reason = ? WHERE id = ?').run(reason || 'Banni par un administrateur', userId);
      }
      const text = ban ? banText({ until }) : '';
      for (const sk of sockets) {
        if (ban) {
          sk.emit('banned', { reason, until, text, by: ident.name });
          setTimeout(() => sk.disconnect(true), 400);
        } else if (sk.data.room === room.code) {
          sk.leave('room:' + room.code);
          sk.data.room = null;
          sk.emit('room:kicked', { by: ident.name, reason });
        }
      }
      room.sockets.delete(key);
      try {
        DB.prepare('INSERT INTO audit_log (actor_id, action, target_id, details, created_at) VALUES (?, ?, ?, ?, ?)')
          .run(ident.userId || null, ban ? 'game_ban' : 'game_kick', userId, JSON.stringify({ room: room.code, player: target.name, key, reason, minutes }), Date.now());
      } catch (e) {
        console.error('[audit]', e.message);
      }

      // 3. Prévenir : toute la salle pour une expulsion, tout le site pour un bannissement
      const why = reason ? ` (motif : ${reason})` : '';
      const msg = ban ? `🔨 ${target.name} a été banni(e) ${text} par ${ident.name}${why}.` : `⛔ ${target.name} a été expulsé(e) de la partie par ${ident.name}${why}.`;
      systemChat(room, msg);
      if (ban) io.emit('mod:notice', { text: msg, ban: true });
      else io.to('room:' + room.code).emit('mod:notice', { text: msg, ban: false });
      if (!cleanupIfEmpty(room)) broadcastRoom(room);
      reply(cb, { ok: true });
    });

    socket.on('game:forfeit', (cb) => {
      const room = current();
      if (!room || !room.game || room.state !== 'playing') return reply(cb, { error: 'Aucune partie en cours.' });
      room.game.forfeit(ident.key);
      systemChat(room, `🏳️ ${ident.name} abandonne.`);
      reply(cb, { ok: true });
    });

    socket.on('disconnect', () => {
      clearInterval(refill);
      leaveCurrent(false);
    });
  });

  // Nettoyage périodique des salles abandonnées
  setInterval(() => {
    const now = Date.now();
    for (const room of rooms.values()) {
      const humansOnline = [...room.sockets.values()].some((s) => s.size > 0);
      if (humansOnline) continue;
      const idle = now - room.lastActivity;
      if ((room.state === 'playing' && idle > 3 * 60000) || (room.state !== 'playing' && idle > 5 * 60000)) deleteRoom(room, 'Salle fermée pour inactivité.');
    }
  }, 30000).unref();
}

function cleanupIfEmpty(room) {
  const humansSeated = room.seats.some((s) => !s.isBot);
  const anyoneOnline = [...room.sockets.values()].some((s) => s.size > 0);
  if (!humansSeated && !anyoneOnline) {
    deleteRoom(room);
    return true;
  }
  return false;
}

// ------------------------------------------------------------ admin helpers
function adminList() {
  return [...rooms.values()].map((r) => ({
    code: r.code,
    kind: r.kind,
    name: r.name,
    state: r.state,
    isPublic: r.settings.isPublic,
    players: r.seats.map((s) => ({ name: s.name, isBot: s.isBot, connected: s.isBot || isConnected(r, s.key) })),
    round: r.game ? r.game.round : 0,
    createdAt: r.createdAt,
    lastActivity: r.lastActivity,
  }));
}
function adminClose(code, reason) {
  const room = rooms.get(code);
  if (!room) return false;
  deleteRoom(room, reason || 'Salle fermée par le staff.');
  return true;
}
/** Mode invité désactivé : les invités sont retirés des salons (pas des parties en cours). */
function kickGuests() {
  if (!io) return;
  for (const s of io.sockets.sockets.values()) {
    const id = s.data.ident;
    if (!id || !id.guest || !s.data.room) continue;
    const room = rooms.get(s.data.room);
    if (room && room.state === 'playing' && room.game && room.game.player(id.key)) continue;
    s.emit('room:closed', { reason: 'Le mode invité a été désactivé : créez un compte pour continuer à jouer.' });
  }
}

function announce(text) {
  if (io) io.emit('announce', { text: cleanText(text, 300) });
}
function counts() {
  let playing = 0;
  for (const r of rooms.values()) if (r.state === 'playing') playing++;
  return { rooms: rooms.size, playing, online: io ? io.engine.clientsCount : 0 };
}

module.exports = { saveRooms, attach, adminList, adminClose, announce, counts, kickGuests, DEFAULTS };
