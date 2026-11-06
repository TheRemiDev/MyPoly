'use strict';
const crypto = require('crypto');
const { Game } = require('./game/engine');
const { sanitize, DEFAULTS } = require('./game/settings');
const R = require('./game/random');
const U = require('./users');
const { userFromToken, parseCookie, COOKIE } = require('./auth');

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

/** Identité d'une connexion : compte enregistré ou invité. */
function identify(socket) {
  const token = parseCookie(socket.handshake.headers.cookie, COOKIE);
  const user = userFromToken(token);
  if (user) {
    return {
      key: 'u:' + user.id,
      userId: user.id,
      name: user.username,
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
    host: room.host,
    name: room.name,
    settings: room.settings,
    state: room.state,
    seats: room.seats.map((s) => seatPublic(s, room)),
    spectators: [...room.sockets.keys()].filter((k) => !room.seats.some((s) => s.key === k) && isConnected(room, k)).length,
    result: room.result || null,
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

function createRoom(ident, settings) {
  const code = makeCode();
  const room = {
    code,
    name: `Salle de ${ident.name.replace(' (invité)', '')}`,
    host: ident.key,
    settings: sanitize(settings),
    state: 'lobby',
    seats: [],
    sockets: new Map(),
    chat: [],
    game: null,
    result: null,
    createdAt: Date.now(),
    lastActivity: Date.now(),
    leaveTimers: new Map(),
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
  for (const t of room.leaveTimers.values()) clearTimeout(t);
  io.to('room:' + room.code).emit('room:closed', { reason: reason || 'La salle a été fermée.' });
  io.in('room:' + room.code).socketsLeave('room:' + room.code);
  rooms.delete(room.code);
}

function startGame(room) {
  room.state = 'playing';
  room.result = null;
  const code = room.code;
  room.game = new Game({
    players: room.seats.map((s) => ({ id: s.key, userId: s.userId, name: s.name, color: s.color, pawn: s.pawn, isBot: s.isBot, role: s.role, vip: s.vip, level: s.level })),
    settings: room.settings,
    onUpdate: (payload) => {
      touch(room);
      io.to('room:' + code).emit('game:update', payload);
    },
    onEnd: (result) => setImmediate(() => endGame(room, result)),
  });
  for (const s of room.seats) if (!s.isBot && !isConnected(room, s.key)) room.game.player(s.key).connected = false;
  broadcastRoom(room);
  room.game.start();
}

function endGame(room, result) {
  if (!rooms.has(room.code)) return;
  room.state = 'ended';
  room.result = result;
  let rewards = {};
  // On n'enregistre que des parties "réelles" (au moins 2 tours) pour éviter les abus
  const registered = result.players.some((p) => p.userId);
  if (registered && result.rounds >= 2) {
    try {
      ({ rewards } = U.recordGame(room.code, result, room.settings));
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

  io.on('connection', (socket) => {
    const ident = identify(socket);
    socket.data.ident = ident;
    socket.data.room = null;
    socket.emit('hello', { key: ident.key, name: ident.name, guest: ident.guest });

    // Limiteur simple : 25 évènements / seconde
    let bucket = 25;
    const refill = setInterval(() => (bucket = 25), 1000);
    socket.use((_packet, next) => (bucket-- > 0 ? next() : next(new Error('rate'))));
    socket.on('error', () => {});

    const reply = (cb, data) => typeof cb === 'function' && cb(data);
    const current = () => (socket.data.room ? rooms.get(socket.data.room) : null);
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
      if (room.game) socket.emit('game:update', { events: [], state: room.game.publicState(), sync: true });
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

    socket.on('room:create', (data, cb) => {
      if (rooms.size >= MAX_ROOMS) return reply(cb, { error: 'Le serveur est plein, réessayez plus tard.' });
      const room = createRoom(ident, data && data.settings);
      if (data && data.bots) for (let i = 0; i < Math.min(5, Number(data.bots) || 0); i++) addBot(room);
      seat(room, ident);
      // L'hôte est placé en premier
      room.seats.unshift(room.seats.pop());
      systemChat(room, `✨ Salle créée par ${ident.name}.`);
      joinSocketRoom(room);
      broadcastRoom(room);
      reply(cb, { code: room.code });
    });

    socket.on('room:join', (data, cb) => {
      const code = String((data && data.code) || '').toUpperCase().trim();
      const room = rooms.get(code);
      if (!room) return reply(cb, { error: 'Salle introuvable. Vérifiez le code.' });
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
      room.settings = sanitize(data && data.settings, room.settings);
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

    socket.on('room:rematch', (cb) => {
      const room = current();
      if (!isHost(room) || room.state !== 'ended') return reply(cb, { error: 'Action réservée à l\'hôte.' });
      if (room.game) room.game.destroy();
      room.game = null;
      room.state = 'lobby';
      room.result = null;
      room.seats = room.seats.filter((s) => s.isBot || isConnected(room, s.key));
      systemChat(room, '🔁 Nouvelle partie ! Retour au salon.');
      broadcastRoom(room);
      reply(cb, { ok: true });
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
      if (!room || !room.game || room.state !== 'playing') return reply(cb, { error: 'Aucune partie en cours.' });
      const { type, ...rest } = data || {};
      const res = room.game.act(ident.key, String(type || ''), rest);
      reply(cb, res);
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
function announce(text) {
  if (io) io.emit('announce', { text: cleanText(text, 300) });
}
function counts() {
  let playing = 0;
  for (const r of rooms.values()) if (r.state === 'playing') playing++;
  return { rooms: rooms.size, playing, online: io ? io.engine.clientsCount : 0 };
}

module.exports = { attach, adminList, adminClose, announce, counts, DEFAULTS };
