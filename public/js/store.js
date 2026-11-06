// État global partagé entre les vues
import { storage } from './util.js';

export const store = {
  user: null, // utilisateur connecté (ou null pour un invité)
  meta: null, // plateau, badges, pions… fournis par /api/meta
  socket: null,
  key: null, // identifiant de connexion (u:ID ou g:hash)
};

export function guestId() {
  let id = storage('guestId');
  if (!id || !/^[a-zA-Z0-9]{16,64}$/.test(id)) {
    const arr = new Uint8Array(16);
    crypto.getRandomValues(arr);
    id = [...arr].map((b) => b.toString(16).padStart(2, '0')).join('');
    storage('guestId', id);
  }
  return id;
}
export function guestName() {
  return storage('guestName') || '';
}

/** Connexion Socket.IO (recréée après connexion / déconnexion du compte). */
export function connectSocket() {
  if (store.socket) {
    store.socket.removeAllListeners();
    store.socket.disconnect();
  }
  // eslint-disable-next-line no-undef
  const socket = io({
    auth: (cb) => cb({ guestId: guestId(), guestName: guestName() }),
    transports: ['websocket', 'polling'],
    reconnectionDelayMax: 4000,
  });
  store.socket = socket;
  socket.on('hello', (d) => (store.key = d.key));
  for (const [event, set] of handlers) for (const fn of set) socket.on(event, fn);
  return socket;
}

const handlers = new Map();
/**
 * Abonne un gestionnaire à un évènement socket, conservé lors des reconnexions
 * de compte. Retourne une fonction de désabonnement.
 */
export function on(event, fn) {
  if (!handlers.has(event)) handlers.set(event, new Set());
  handlers.get(event).add(fn);
  if (store.socket) store.socket.on(event, fn);
  return () => {
    handlers.get(event)?.delete(fn);
    store.socket?.off(event, fn);
  };
}

export function emit(event, data) {
  return new Promise((resolve) => {
    if (!store.socket) return resolve({ error: 'Non connecté.' });
    const t = setTimeout(() => resolve({ error: 'Le serveur ne répond pas.' }), 8000);
    const cb = (res) => {
      clearTimeout(t);
      resolve(res || {});
    };
    if (data === undefined) store.socket.emit(event, cb);
    else store.socket.emit(event, data, cb);
  });
}
