// Point d'entrée : routeur, navigation et pages hors partie
import { $, h, api, toast, modal, roleTags, nameClass, fmt, timeAgo, duration, storage, esc, IN_APP } from './util.js';
import { store, connectSocket, on, emit, guestName, savedSettings } from './store.js';
import * as Sound from './sound.js';
import { renderRoom } from './game.js';
import { cardEl } from './cartes.js';
import { handChart } from './poker-art.js';

const app = $('#app');
let cleanup = null;

// ------------------------------------------------------------------ routeur
const routes = [
  [/^\/$/, homePage],
  [/^\/login$/, () => authPage('login')],
  [/^\/register$/, () => authPage('register')],
  [/^\/leaderboard$/, leaderboardPage],
  [/^\/joueur\/(\d+)$/, (m) => profilePage(m[1])],
  [/^\/profile\/([^/]+)$/, (m) => profilePage(decodeURIComponent(m[1]))],
  [/^\/settings$/, settingsPage],
  [/^\/admin$/, adminPage],
  [/^\/rules$/, rulesPage],
  [/^\/r\/([A-Za-z0-9]{6})$/, (m) => renderRoom(app, m[1].toUpperCase())],
];

export function navigate(path, replace = false) {
  if (replace) history.replaceState({}, '', path);
  else if (location.pathname !== path) history.pushState({}, '', path);
  route();
}
window.addEventListener('popstate', route);
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[data-link]');
  if (a && !e.ctrlKey && !e.metaKey && a.target !== '_blank') {
    e.preventDefault();
    Sound.play('click');
    navigate(a.getAttribute('href'));
  }
});

async function route() {
  if (cleanup) {
    try {
      await cleanup();
    } catch {}
    cleanup = null;
  }
  app.innerHTML = '';
  document.body.classList.remove('in-game');
  window.scrollTo(0, 0);
  const path = location.pathname;
  for (const [re, fn] of routes) {
    const m = path.match(re);
    if (m) {
      cleanup = (await fn(m)) || null;
      updateNav();
      return;
    }
  }
  app.append(h('div.page.center', h('h1', '404'), h('p', 'Cette page n\'existe pas.'), h('a.btn.primary', { href: '/', 'data-link': true }, 'Retour à l\'accueil')));
}

// ------------------------------------------------- barre d'onglets (téléphone)
const TAB_ICONS = {
  play: '<path d="M8 5.5v13l11-6.5z" fill="currentColor" stroke="none"/>',
  trophy: '<path d="M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4M10 16h4M12 14v2M8 20h8"/>',
  book: '<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 19V5M9 7h6"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  shield: '<path d="M12 3 4.5 6v6c0 4.4 3.2 7.6 7.5 9 4.3-1.4 7.5-4.6 7.5-9V6Z"/>',
};
const tabIcon = (k) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${TAB_ICONS[k]}</svg>`;
const tabbar = h('nav#tabbar', { 'aria-label': 'Navigation' });
document.body.append(tabbar);
function updateTabbar() {
  const u = store.user;
  const path = location.pathname;
  // Pas d'onglets dans une salle (salon ou partie) : on ne quitte pas par erreur
  document.body.classList.toggle('no-tabbar', path.startsWith('/r/'));
  const tabs = [
    ['/', 'play', 'Jouer', path === '/'],
    ['/leaderboard', 'trophy', 'Classement', path === '/leaderboard'],
    ['/rules', 'book', 'Règles', path === '/rules'],
    u && u.staff ? ['/admin', 'shield', 'Admin', path === '/admin'] : null,
    u ? ['/joueur/' + u.id, 'user', 'Profil', path.startsWith('/joueur/') || path === '/settings'] : ['/login', 'user', 'Connexion', path === '/login' || path === '/register'],
  ].filter(Boolean);
  tabbar.replaceChildren(...tabs.map(([href, ic, label, on]) => h('a.nav-tab' + (on ? '.on' : ''), { href, 'data-link': true }, h('span.tab-ico', { html: tabIcon(ic) }), h('span.tab-label', label))));
}

// --------------------------------------------------------------- navigation
function updateNav() {
  updateTabbar();
  const nav = $('#nav-user');
  nav.innerHTML = '';
  const u = store.user;
  $('#nav-admin').hidden = !(u && u.staff);
  for (const a of document.querySelectorAll('#topbar .nav-links a')) a.classList.toggle('active', a.getAttribute('href') === location.pathname);
  if (u) {
    nav.append(
      h('a.nav-profile', { href: '/joueur/' + u.id, 'data-link': true },
        h('span.avatar.sm', { style: { '--c': u.color } }, u.pawn),
        h('span.' + (nameClass({ ...u, role: u.role }) || 'plain'), u.name),
        ...roleTags(u, { level: false })
      ),
      h('button.btn.ghost.sm', { onclick: logout, title: 'Déconnexion' }, '🚪')
    );
  } else {
    nav.append(h('a.btn.ghost.sm', { href: '/login', 'data-link': true }, 'Connexion'), h('a.btn.primary.sm', { href: '/register', 'data-link': true }, 'Inscription'));
  }
}

async function logout() {
  await api('/auth/logout', { method: 'POST' });
  store.user = null;
  connectSocket();
  toast('À bientôt !');
  navigate('/');
}

$('#btn-sound').addEventListener('click', () => {
  const on = Sound.toggle();
  $('#btn-sound').textContent = on ? '🔊' : '🔇';
});
$('#btn-sound').textContent = Sound.isEnabled() ? '🔊' : '🔇';
$('#btn-fullscreen').addEventListener('click', toggleFullscreen);
export function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen?.().catch(() => toast('Plein écran indisponible sur cet appareil.', 'warn'));
}

// ---------------------------------------------------------------- accueil
/** Petite illustration animée du plateau pour l'en-tête de l'accueil. */
function heroBoard() {
  const colors = ['#8d6e63', '#4fc3f7', '#ec407a', '#ff9800', '#f44336', '#fdd835', '#66bb6a', '#3f51b5'];
  const tiles = [];
  for (let r = 0; r < 6; r++) {
    for (let c = 0; c < 6; c++) {
      const edge = r === 0 || r === 5 || c === 0 || c === 5;
      if (!edge) continue;
      const corner = (r === 0 || r === 5) && (c === 0 || c === 5);
      const k = tiles.length;
      tiles.push(h('i.hb-tile' + (corner ? '.corner' : ''), { style: { gridRow: r + 1, gridColumn: c + 1, '--band': colors[k % colors.length], '--d': k * 60 + 'ms' } }, corner ? ['🏁', '🏝️', '🎪', '✈️'][[0, 5, 30, 35].indexOf(r * 6 + c)] || '' : ''));
    }
  }
  return h('div.hero-art2',
    h('div.hb-glow'),
    h('div.hb-board', ...tiles,
      h('div.hb-center', h('span', 'My'), h('b', 'Poly')),
      h('div.hb-house.h1', '🏠'), h('div.hb-house.h2', '🏨'), h('div.hb-house.h3', '🏠')
    ),
    h('div.hb-die.d1', '⚄'), h('div.hb-die.d2', '⚂'),
    h('div.hb-coin.c1', '$'), h('div.hb-coin.c2', '$'), h('div.hb-coin.c3', '$'),
    h('div.hb-pawn', '🎩')
  );
}

/** Petits chevaux pour le choix du jeu. */
function miniHorses() {
  const wrap = h('span', { style: { position: 'relative', width: '54px', height: '54px', display: 'block' } });
  [['#ff5a5f', 2, 0], ['#2ecc71', 22, 4], ['#3fa7ff', 10, 16]].forEach(([c, x, y]) => {
    wrap.append(h('span.mini-horse', { style: { '--c': c, left: x + 'px', top: y + 'px' } }, '♞'));
  });
  return wrap;
}

/** Petit éventail de cartes pour le choix du jeu. */
function miniCards() {
  const wrap = h('span', { style: { position: 'relative', width: '54px', height: '54px', display: 'block' } });
  [['r', '7', -16, 6], ['b', '+2', 0, 12], ['y', '5', 16, 18]].forEach(([c, v, rot, x]) => {
    const el = cardEl({ id: 0, c, v });
    el.style.transform = `rotate(${rot}deg)`;
    el.style.left = x + 'px';
    el.style.top = '4px';
    wrap.append(el);
  });
  return wrap;
}

async function homePage() {
  const guestsOk = !store.site || store.site.guestsAllowed !== false;
  const needAccount = !store.user && !guestsOk;
  const roomsBox = h('div.room-list2', h('div.muted', 'Chargement…'));
  const onlineEl = h('b', '…');
  const playingEl = h('b', '…');
  const nameInput = h('input.input.lg', { placeholder: 'Ton pseudo', maxlength: 16, value: guestName() });
  const codeInput = h('input.input.code-input', { placeholder: 'CODE', maxlength: 6, autocomplete: 'off', 'aria-label': 'Code de salle' });

  function saveGuest() {
    if (store.user) return true;
    if (needAccount) {
      toast('Le mode invité est désactivé : créez un compte ou connectez-vous pour jouer.', 'warn');
      navigate('/register');
      return false;
    }
    const n = nameInput.value.trim();
    if (n.length < 2) {
      toast('Choisis un pseudo (2 caractères minimum) ou connecte-toi.', 'warn');
      nameInput.focus();
      return false;
    }
    if (n !== guestName()) {
      storage('guestName', n);
      connectSocket();
    }
    return true;
  }
  let kind = ['cartes', 'chevaux', 'mois', 'poker', 'blackjack'].includes(storage('game')) ? storage('game') : 'poly';
  async function create(bots, k = kind, isPublic = null) {
    kind = k;
    storage('game', k);
    if (!saveGuest()) return;
    await new Promise((r) => (store.socket.connected ? r() : store.socket.once('connect', r)));
    // Les règles enregistrées par le joueur sont appliquées à chaque nouvelle salle (MyPoly)
    const settings = { ...(savedSettings(kind) || {}) };
    if (isPublic !== null) settings.isPublic = isPublic;
    const res = await emit('room:create', { kind, settings, bots });
    if (res.needAccount) return navigate('/register');
    if (res.error) return toast(res.error, 'error');
    navigate('/r/' + res.code);
  }
  /** Choix du type de salle : privée (avec le code) ou publique (visible par tous). */
  function chooseRoom(g) {
    const opt = (pub, icon, title, text) => h('button.room-choice' + (pub ? '.pub' : ''), { type: 'button', style: { '--c': g.color }, onclick: () => {
      document.querySelector('#modals .modal-overlay:last-child')?._close(null);
      create(0, g.k, pub);
    } }, h('span.room-choice-ico', icon), h('span.room-choice-txt', h('b', title), h('small', text)), h('span.room-choice-go', '→'));
    modal({
      title: `Nouvelle salle · ${g.name}`,
      body: h('div.room-choices',
        opt(true, '🌍', 'Salle publique', 'Affichée dans « Salles publiques » : n\'importe qui peut rejoindre. Parfait pour trouver des adversaires.'),
        opt(false, '🔒', 'Salle privée', 'Seuls tes amis avec le code ou le lien d\'invitation peuvent entrer.'),
        h('small.muted.room-choice-hint', 'Tu pourras changer d\'avis dans le salon, et ajouter des bots pour compléter la table.')
      ),
      buttons: [],
      className: 'room-choice-modal',
    });
  }
  /** Salle publique depuis la liste vide : choisir le jeu. */
  function chooseGame() {
    modal({
      title: '🌍 Créer une salle publique',
      body: h('div.room-choices', GAMES_INFO.map((g) => h('button.room-choice', { type: 'button', style: { '--c': g.color }, onclick: () => {
        document.querySelector('#modals .modal-overlay:last-child')?._close(null);
        create(0, g.k, true);
      } }, h('span.room-choice-art', { html: g.art }), h('span.room-choice-txt', h('b', g.name), h('small', g.tag)), h('span.room-choice-go', '→')))),
      buttons: [],
      className: 'room-choice-modal',
    });
  }
  async function join(code) {
    code = (code || codeInput.value).trim().toUpperCase();
    if (code.length !== 6) {
      codeInput.focus();
      return toast('Le code de salle contient 6 caractères.', 'warn');
    }
    if (!saveGuest()) return;
    navigate('/r/' + code);
  }
  codeInput.addEventListener('keydown', (e) => e.key === 'Enter' && join());
  codeInput.addEventListener('input', () => (codeInput.value = codeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, '')));

  async function refresh() {
    const res = await emit('rooms:list');
    if (res.error) return;
    onlineEl.textContent = res.online;
    playingEl.textContent = res.rooms.filter((r) => r.state !== 'lobby').length;
    roomsBox.innerHTML = '';
    if (!res.rooms.length) {
      roomsBox.append(h('div.rooms-empty', h('div', '🌙'), h('b', 'Aucune salle publique pour le moment'), h('span.muted', 'Lance la tienne : n\'importe qui pourra la rejoindre.'),
        h('button.btn.primary.sm', { onclick: () => chooseGame(), disabled: needAccount }, '🌍 Créer une salle publique')));
    }
    for (const r of res.rooms) {
      const full = r.players >= r.max;
      const dots = Array.from({ length: r.max }, (_, k) => h('i' + (k < r.players ? '.on' : '')));
      roomsBox.append(
        h('div.room-card' + (r.state !== 'lobby' ? '.live' : ''),
          h('div.room-card-top',
            h('div.room-card-name', h('span.room-card-kind', { cartes: '🃏 Carton !', chevaux: '🐴 Petits chevaux', mois: '📅 Fin de mois', poker: '♠ Poker', blackjack: '♣ Blackjack' }[r.kind] || '🎲 MyPoly'), r.name, r.hostVip ? h('span.tag.tag-vip', '👑 VIP') : null),
            h('span.room-card-state', r.state === 'lobby' ? '🟢 En attente' : '🔴 En jeu')
          ),
          r.kind === 'blackjack'
            ? h('div.room-card-meta',
                h('span', r.settings.rounds + ' manches'),
                h('span', 'Mise ' + r.settings.minBet + '+'),
                h('span', r.settings.bjPays === 150 ? 'BJ 3:2' : 'BJ 6:5')
              )
            : r.kind === 'poker'
            ? h('div.room-card-meta',
                h('span', r.settings.startStack.toLocaleString('fr-FR') + ' jetons'),
                h('span', 'Blindes ' + r.settings.bigBlind / 2 + '/' + r.settings.bigBlind),
                h('span', r.settings.turnTime ? r.settings.turnTime + ' s' : 'Sans chrono')
              )
            : r.kind === 'mois'
            ? h('div.room-card-meta',
                h('span', '📅 ' + r.settings.months + ' mois'),
                h('span', '⏱️ ' + (r.settings.turnTime ? r.settings.turnTime + ' s' : '∞')),
                h('span', '💶 ' + r.settings.salary.toLocaleString('fr-FR') + ' €')
              )
            : r.kind === 'chevaux'
            ? h('div.room-card-meta',
                h('span', '🐴 ' + r.settings.horsesToWin + ' cheva' + (r.settings.horsesToWin > 1 ? 'ux' : 'l')),
                h('span', '⏱️ ' + (r.settings.turnTime ? r.settings.turnTime + ' s' : '∞')),
                h('span', r.settings.strictLadder ? '🪜 Classique' : '⚡ Simplifiée')
              )
            : r.kind === 'cartes'
            ? h('div.room-card-meta',
                h('span', '🃏 ' + r.settings.startCards + ' cartes'),
                h('span', '⏱️ ' + (r.settings.turnTime ? r.settings.turnTime + ' s' : '∞')),
                h('span', r.settings.targetScore ? '🏆 ' + r.settings.targetScore + ' pts' : '🏁 1 manche')
              )
            : h('div.room-card-meta',
                h('span', '💰 ' + fmt(r.settings.startMoney)),
                h('span', '⏱️ ' + (r.settings.turnTime ? r.settings.turnTime + ' s' : '∞')),
                h('span', r.settings.takeover ? '🤝 Rachat' : '🚫 Sans rachat')
              ),
          h('div.room-card-bottom',
            h('div.room-dots', dots, h('small', `${r.players}/${r.max}`)),
            r.state === 'lobby'
              ? h('button.btn.primary.sm', { onclick: () => join(r.code), disabled: full }, full ? 'Pleine' : 'Rejoindre')
              : h('button.btn.ghost.sm', { onclick: () => join(r.code) }, '👁 Regarder')
          )
        )
      );
    }
  }
  const timer = setInterval(refresh, 5000);
  const off = on('connect', refresh);
  if (store.socket?.connected) refresh();

  const u = store.user;
  const xpCur = u ? (u.level - 1) ** 2 * 100 : 0;
  const xpNext = u ? u.level ** 2 * 100 : 1;
  // Bandeau joueur : profil (connecté) ou pseudo (invité), + rejoindre avec un code
  const who = u
    ? h('div.hp-me',
        h('span.avatar.lg', { style: { '--c': u.color } }, u.pawn),
        h('div.hp-me-info',
          h('div.hp-me-name', 'Salut ', h('b.' + (nameClass(u) || 'plain'), u.name), ' 👋', ...roleTags(u, { level: false })),
          h('div.hp-me-xp', h('span', `Niveau ${u.level}`), h('div.xp-bar', h('div', { style: { width: Math.min(100, ((u.xp - xpCur) / (xpNext - xpCur)) * 100) + '%' } })), h('a', { href: '/joueur/' + u.id, 'data-link': true }, 'Mon profil →'))
        )
      )
    : needAccount
      ? h('div.hp-me.locked', h('span.hp-lock', '🔒'), h('div.hp-me-info', h('b', 'Un compte est nécessaire pour jouer'), h('span.muted', 'Gratuit, 20 secondes. Tes victoires et badges sont enregistrés.')),
          h('a.btn.primary', { href: '/register', 'data-link': true }, 'Créer un compte'))
      : h('div.hp-me.guest', h('label.hp-label', 'Ton pseudo'), nameInput, h('small.muted', 'En invité · ', h('a', { href: '/register', 'data-link': true }, 'crée un compte'), ' pour garder tes victoires'));
  const joinBox = h('div.hp-join', h('label.hp-label', 'Rejoindre avec un code'), h('div.join-inline', codeInput, h('button.btn.accent', { onclick: () => join(), disabled: needAccount }, 'Rejoindre')));

  // Les trois jeux, en grandes affiches
  const GAMES_INFO = [
    { k: 'poly', name: 'MyPoly', tag: 'Achète le monde, ruine tes amis', color: '#ff8a3d', art: ART.poly, meta: ['👥 2 à 4', '⏱️ 30 min', '🏗️ Stratégie'], points: ['Plateau 3D, maisons qui poussent', 'Rachats, festivals, avions', '4 façons de gagner'] },
    { k: 'cartes', name: 'Carton !', tag: 'Vide ta main… et crie « Carton ! »', color: '#ff5a5f', art: ART.cartes, meta: ['👥 2 à 6', '⏱️ 10 min', '⚡ Rapide'], points: ['+2, +4, Jokers, Demi-tour', 'Prends ceux qui oublient de crier', 'Partie en une manche ou en points'] },
    { k: 'chevaux', name: 'Petits chevaux', tag: 'La course classique en 3D', color: '#2ecc71', art: ART.chevaux, meta: ['👥 2 à 4', '⏱️ 15 min', '🎲 Chance'], points: ['Sors tes chevaux sur un 6', 'Renvoie les autres à l\'écurie', 'Échelle jusqu\'au centre'] },
    { k: 'poker', name: 'Poker', tag: 'Texas Hold\'em : bluffe, relance, fais tapis', color: '#16916c', art: ART.poker, meta: ['2 à 6 joueurs', '20 min', 'Bluff'], points: ['Table 3D, jetons et cartes maison', 'Mode Débutant : conseils et chances de gagner', 'Blindes qui montent, pots secondaires'], fresh: true },
    { k: 'blackjack', name: 'Blackjack', tag: 'Approche 21 sans le dépasser… et bats la banque', color: '#2d5bd0', art: ART.blackjack, meta: ['1 à 5 joueurs', '15 min', 'Casino'], points: ['Table de casino 3D, sabot et jetons', 'Doubler, séparer, blackjack payé 3:2', 'Aide au calcul : le total de chaque main'], fresh: true },
    { k: 'mois', name: 'Fin de mois', tag: 'Tiendras-tu jusqu\'à la paye ?', color: '#3fa7ff', art: ART.mois, meta: ['👥 2 à 6', '⏱️ 25 min', '💶 Gestion'], points: ['Courrier, factures et imprévus', 'Achète malin, revends plus cher', 'Paye le 31 et cagnotte sur un 6'] },
  ];
  const poster = (g) => h('article.hp-poster' + (g.fresh ? '.fresh' : ''), { style: { '--c': g.color } },
    g.fresh ? h('span.hp-new', 'Nouveau') : null,
    h('div.hp-poster-art', { html: g.art }),
    h('div.hp-poster-body',
      h('h3', g.name),
      h('p.hp-poster-tag', g.tag),
      h('div.hp-poster-meta', g.meta.map((m) => h('span', m))),
      h('ul.hp-poster-points', g.points.map((x) => h('li', x))),
      h('div.hp-poster-btns',
        h('button.btn.primary', { onclick: () => create(3, g.k), disabled: needAccount }, '⚡ Partie rapide'),
        h('button.btn.ghost', { onclick: () => chooseRoom(g), disabled: needAccount }, '✨ Créer une salle')
      )
    ),
    h('span.hp-poster-count', { 'data-kind': g.k })
  );

  // Compteurs en direct, dernières victoires, champions
  const kpis = Object.fromEntries(['online', 'playing', 'games', 'players'].map((k) => [k, h('b', '…')]));
  const feed = h('div.hp-feed', h('div.muted', 'Chargement…'));
  const champs = h('div.hp-champs');
  const KIND = { poly: ['🎲', 'MyPoly'], cartes: ['🃏', 'Carton !'], chevaux: ['🐴', 'Petits chevaux'], mois: ['📅', 'Fin de mois'], poker: ['♠', 'Poker'], blackjack: ['♣', 'Blackjack'] };
  const countUp = (el, v) => {
    const from = Number(el.dataset.v || 0);
    el.dataset.v = v;
    if (from === v || matchMedia('(prefers-reduced-motion: reduce)').matches) return (el.textContent = v.toLocaleString('fr-FR'));
    const t0 = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - t0) / 900);
      el.textContent = Math.round(from + (v - from) * (1 - Math.pow(1 - t, 3))).toLocaleString('fr-FR');
      if (t < 1 && el.isConnected) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };
  async function loadStats() {
    let st;
    try {
      st = await api('/stats');
    } catch {
      return;
    }
    countUp(kpis.online, st.live.online);
    countUp(kpis.playing, st.live.playing);
    countUp(kpis.games, st.games);
    countUp(kpis.players, st.players);
    for (const el of document.querySelectorAll('.hp-poster-count')) {
      const n = st.byKind[el.dataset.kind] || 0;
      el.textContent = n ? `${n.toLocaleString('fr-FR')} partie${n > 1 ? 's' : ''} jouée${n > 1 ? 's' : ''}` : 'Nouveau !';
    }
    feed.innerHTML = '';
    if (!st.recent.length) feed.append(h('div.hp-empty', h('span', '🏁'), 'Les premières victoires s\'afficheront ici. À toi de jouer !'));
    st.recent.slice(0, 8).forEach((g, i) => feed.append(h('div.hp-feed-row', { style: { '--d': i * 50 + 'ms' } },
      h('span.hp-feed-ico', KIND[g.kind][0]),
      h('div', h('b', g.winner), ' a gagné une partie de ', h('b', KIND[g.kind][1]), h('small', `${g.players} joueurs · ${timeAgo(g.at)}`))
    )));
    champs.innerHTML = '';
    for (const k of ['poly', 'cartes', 'chevaux', 'mois', 'poker', 'blackjack']) {
      const list = st.top[k] || [];
      champs.append(h('div.hp-champ',
        h('div.hp-champ-head', h('span', KIND[k][0]), h('b', KIND[k][1])),
        list.length
          ? h('ol', list.map((p, i) => h('li', h('a', { href: '/joueur/' + p.id, 'data-link': true },
              h('span.hp-medal', ['🥇', '🥈', '🥉'][i]),
              h('span.avatar.sm', { style: { '--c': p.color } }, p.pawn),
              h('span.hp-champ-name.' + (nameClass(p) || 'plain'), p.name),
              h('span.hp-champ-wins', `${p.wins} V`)))))
          : h('div.hp-empty.sm', 'Pas encore de champion : la place est libre !')
      ));
    }
  }
  loadStats();
  const statsTimer = setInterval(loadStats, 30000);
  const scrollPlay = () => document.getElementById('jouer').scrollIntoView({ behavior: 'smooth', block: 'start' });

  // Application Android : accueil épuré, on joue tout de suite
  if (IN_APP) {
    app.append(
      h('div.page.hp.hp-appmode',
        h('section.app-hello', who, joinBox),
        h('div.app-sec', h('h2', 'Choisis ton jeu'), h('small', 'Partie rapide avec des bots, ou salle privée pour tes amis')),
        h('div.hp-posters', GAMES_INFO.map(poster)),
        h('div.app-sec', h('h2', 'Salles publiques'), h('button.icon-btn', { onclick: refresh, title: 'Actualiser' }, '↻')),
        h('div.hp-panel', roomsBox),
        h('div.app-sec', h('h2', 'Les champions')),
        champs
      )
    );
    return () => {
      clearInterval(timer);
      clearInterval(statsTimer);
      off();
    };
  }

  app.append(
    h('div.page.hp',
      // ------------------------------------------------------------- héros
      h('section.hp-hero',
        h('div.hp-hero-bg', h('i.b1'), h('i.b2'), h('i.b3')),
        h('div.hp-hero-text',
          h('span.hp-live', h('i.live-dot'), kpis.online, ' joueurs en ligne'),
          h('h1.hp-title', 'Le salon de jeux', h('br'), h('span', 'entre amis.')),
          h('p.hp-sub', 'MyPoly, Carton !, Petits chevaux, Fin de mois, Poker et Blackjack : six jeux multijoueurs gratuits, en 3D, sans téléchargement. Crée une salle, envoie le code à tes potes… et que le meilleur gagne.'),
          h('div.hp-cta',
            h('button.btn.primary.xl', { onclick: scrollPlay }, '▶ Jouer maintenant'),
            !u ? h('a.btn.ghost.xl', { href: '/register', 'data-link': true }, 'Créer un compte') : h('a.btn.ghost.xl', { href: '/leaderboard', 'data-link': true }, '🏆 Classement')
          ),
          h('div.hp-kpis',
            h('div', kpis.playing, h('small', 'parties en cours')),
            h('div', kpis.games, h('small', 'parties jouées')),
            h('div', kpis.players, h('small', 'joueurs inscrits')),
            h('div', h('b', '100 %'), h('small', 'gratuit'))
          )
        ),
        h('div.hp-hero-art',
          h('div.hp-stack', GAMES_INFO.map((g, i) => h('div.hp-stack-card.s' + i, { style: { '--c': g.color }, html: g.art })))
        )
      ),
      // ----------------------------------------------------------- jouer
      // Téléphone Android (navigateur) : proposer l'application
      /Android/i.test(navigator.userAgent) && !IN_APP
        ? h('a.hp-app', { href: '/downloads/MyPoly.apk', download: 'MyPoly.apk' },
            h('span.hp-app-icon', { html: '<svg viewBox="0 0 64 64"><defs><linearGradient id="hpa" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff5a5f"/><stop offset="1" stop-color="#a66bff"/></linearGradient></defs><rect x="4" y="4" width="56" height="56" rx="14" fill="url(#hpa)"/><g fill="#fff"><circle cx="20" cy="20" r="5"/><circle cx="44" cy="20" r="5"/><circle cx="32" cy="32" r="5"/><circle cx="20" cy="44" r="5"/><circle cx="44" cy="44" r="5"/></g></svg>' }),
            h('span.hp-app-txt', h('b', 'Installer l\'application Android'), h('small', 'Plein écran, vibrations, invitations en un clic')),
            h('span.hp-app-go', 'Télécharger'))
        : null,
      h('section.hp-play#jouer',
        h('div.hp-section-head', h('span.hp-kicker', 'Choisis ton jeu'), h('h2', 'Six jeux, une seule salle d\'amis')),
        h('div.hp-bar', who, joinBox),
        h('div.hp-posters', GAMES_INFO.map(poster))
      ),
      // -------------------------------------------------------- en direct
      h('section.hp-live-grid',
        h('div.hp-panel',
          h('div.card-head', h('h2', '🌍 Salles publiques'), h('button.icon-btn', { onclick: refresh, title: 'Actualiser' }, '↻')),
          roomsBox
        ),
        h('div.hp-panel', h('div.card-head', h('h2', '🔥 Dernières victoires')), feed)
      ),
      h('section.hp-champions',
        h('div.hp-section-head', h('span.hp-kicker', 'Hall of fame'), h('h2', 'Les champions du moment')),
        champs,
        h('div.center', h('a.btn.ghost', { href: '/leaderboard', 'data-link': true }, 'Voir le classement complet →'))
      ),
      // --------------------------------------------------------- comment
      h('section.hp-steps',
        h('div.hp-section-head', h('span.hp-kicker', 'En 30 secondes'), h('h2', 'Comment ça marche ?')),
        h('div.hp-steps-row',
          hpStep('1', '✨', 'Crée ta salle', 'Choisis ton jeu, tes règles, et obtiens un code à partager.'),
          hpStep('2', '📲', 'Invite tes amis', 'Envoie le lien. Pas assez nombreux ? Ajoute des bots.'),
          hpStep('3', '🏆', 'Gagne et grimpe', 'XP, badges, séries de victoires et classement par jeu.')
        )
      ),
      h('section.hp-features',
        h('div.hp-section-head', h('span.hp-kicker', 'Pourquoi MyPoly'), h('h2', 'Tout ce qu\'il faut pour des soirées mémorables')),
        h('div.features2-grid',
          feature('🎮', 'Vraie 3D dans le navigateur', 'Plateaux, cartes et pions en 3D, animations soignées, sur ordinateur comme sur mobile.', '#3fa7ff'),
          feature('🔗', 'Salles privées en un clic', 'Un code de 6 lettres, un lien à partager : tes amis te rejoignent instantanément.', '#a66bff'),
          feature('⚙️', 'Tes règles', 'Argent, chrono, cartes, chevaux… règle chaque jeu et retrouve tes réglages à chaque partie.', '#2ecc71'),
          feature('🎵', 'Musique partagée', 'L\'hôte diffuse ses liens YouTube, chacun règle son volume.', '#ff7ac6'),
          feature('🏅', 'Badges et classements', 'Plus de 30 badges à débloquer et un classement par jeu.', '#ffd166'),
          feature('🎲', '100 % équitable', 'Dés et mélanges tirés côté serveur : rien n\'est truqué, rien n\'est scripté.', '#ff5a5f')
        )
      ),
      h('section.hp-faq',
        h('div.hp-section-head', h('span.hp-kicker', 'Questions fréquentes'), h('h2', 'FAQ')),
        h('div.hp-faq-list',
          faq('C\'est vraiment gratuit ?', 'Oui, entièrement. Pas de pub intrusive, pas d\'achat obligatoire : tu crées une salle et tu joues.'),
          faq('Faut-il un compte ?', store.site && store.site.guestsAllowed === false ? 'Oui, un compte gratuit est nécessaire. Il enregistre tes victoires, ton XP et tes badges.' : 'Non, tu peux jouer en invité avec un simple pseudo. Un compte gratuit enregistre tes victoires, ton XP et tes badges.'),
          faq('Combien de joueurs ?', 'De 2 à 4 joueurs pour MyPoly et les Petits chevaux, jusqu\'à 6 pour Carton !, Fin de mois et le Poker. Des bots complètent la table si besoin.'),
          faq('Ça marche sur mobile ?', 'Oui, tout fonctionne dans le navigateur du téléphone, de la tablette ou de l\'ordinateur. Rien à installer.'),
          faq('Et si quelqu\'un se déconnecte ?', 'La partie continue : il est joué automatiquement jusqu\'à son retour, et il retrouve sa place en rechargeant la page.')
        )
      ),
      h('section.hp-final',
        h('div', h('h2', 'Ta prochaine soirée jeux commence ici.'), h('p', 'Crée une salle, partage le code, et c\'est parti.')),
        h('button.btn.primary.xl', { onclick: scrollPlay }, '🚀 Lancer une partie')
      ),
      siteFooter()
    )
  );
  return () => {
    clearInterval(timer);
    clearInterval(statsTimer);
    off();
  };
}

function hpStep(n, icon, title, text) {
  return h('div.hp-step', h('span.hp-step-n', n), h('span.hp-step-icon', icon), h('b', title), h('p', text));
}
function faq(q, a) {
  return h('details.hp-faq-item', h('summary', q), h('p', a));
}

/** Illustrations vectorielles des trois jeux (affiches de l'accueil). */
const ART = {
  poly: `<svg viewBox="0 0 200 150" aria-hidden="true"><defs><linearGradient id="apb" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2aa3b4"/><stop offset="1" stop-color="#0a3a4c"/></linearGradient></defs>
    <g transform="translate(100 78) rotate(-8) skewX(-8)"><rect x="-62" y="-50" width="124" height="100" rx="8" fill="#6b4420"/><rect x="-57" y="-45" width="114" height="90" rx="5" fill="url(#apb)"/>
    ${['#f44336','#ff9800','#fdd835','#66bb6a','#4fc3f7','#3f51b5','#ec407a','#8d6e63'].map((c, i) => `<rect x="${-55 + i * 14}" y="-43" width="12" height="14" rx="2" fill="#f3ead5"/><rect x="${-55 + i * 14}" y="-43" width="12" height="4" fill="${c}"/><rect x="${-55 + i * 14}" y="29" width="12" height="14" rx="2" fill="#f3ead5"/><rect x="${-55 + i * 14}" y="39" width="12" height="4" fill="${c}"/>`).join('')}
    <text x="0" y="6" text-anchor="middle" font-size="20" font-weight="900" font-style="italic" fill="#fff" stroke="#14102e" stroke-width="1.5">MyPoly</text></g>
    <g class="a-float"><path d="M58 38 l12 -10 l12 10 v14 h-24 z" fill="#ff5a5f" stroke="#fff" stroke-width="2"/><rect x="66" y="44" width="8" height="8" fill="#fff"/></g>
    <g class="a-float2"><rect x="128" y="96" width="22" height="22" rx="5" fill="#fff" transform="rotate(14 139 107)"/><circle cx="134" cy="102" r="2.4" fill="#14102e"/><circle cx="144" cy="112" r="2.4" fill="#14102e"/><circle cx="139" cy="107" r="2.4" fill="#14102e"/></g>
    <circle class="a-float" cx="160" cy="40" r="10" fill="#ffd166" stroke="#d19a1a" stroke-width="2"/><text x="160" y="44" text-anchor="middle" font-size="11" font-weight="900" fill="#7a5200">$</text></svg>`,
  cartes: `<svg viewBox="0 0 200 150" aria-hidden="true">${[['#ff5a5f', -24, '7'], ['#3fa7ff', -8, '+2'], ['#2ecc71', 8, '5'], ['#ffb020', 24, '9']].map(([c, r, v], i) => `<g transform="translate(100 128) rotate(${r}) translate(0 -62)"><rect x="-26" y="-38" width="52" height="76" rx="8" fill="#fff"/><rect x="-22" y="-34" width="44" height="68" rx="6" fill="${c}"/><rect x="-13" y="-13" width="26" height="26" rx="5" transform="rotate(45)" fill="#fff"/><text y="7" text-anchor="middle" font-size="${v.length > 1 ? 14 : 19}" font-weight="900" fill="${c}">${v}</text></g>`).join('')}
    <g class="a-float"><rect x="146" y="20" width="40" height="22" rx="11" fill="#ffd166" stroke="#14102e" stroke-width="2"/><text x="166" y="35" text-anchor="middle" font-size="10" font-weight="900" fill="#3b1e05">CARTON!</text></g></svg>`,
  chevaux: `<svg viewBox="0 0 200 150" aria-hidden="true"><g transform="translate(100 76) rotate(45) scale(.72)">
    <rect x="-70" y="-70" width="140" height="140" rx="12" fill="#6b4420"/><rect x="-64" y="-64" width="128" height="128" rx="8" fill="#0f5c63"/>
    ${[['#2ecc71', -1, -1], ['#ffb020', 1, -1], ['#3fa7ff', 1, 1], ['#ff5a5f', -1, 1]].map(([c, sx, sy]) => `<rect x="${sx < 0 ? -60 : 16}" y="${sy < 0 ? -60 : 16}" width="44" height="44" rx="8" fill="${c}"/>`).join('')}
    <rect x="-12" y="-60" width="24" height="120" fill="#f3ead5"/><rect x="-60" y="-12" width="120" height="24" fill="#f3ead5"/>
    <polygon points="-12,-12 12,-12 12,12 -12,12" fill="#ffd166"/></g>
    ${[['#ff5a5f', 70, 92], ['#2ecc71', 128, 58], ['#3fa7ff', 104, 108]].map(([c, x, y], i) => `<g class="${i ? 'a-float2' : 'a-float'}" transform="translate(${x} ${y})"><ellipse cx="0" cy="12" rx="11" ry="4" fill="rgba(0,0,0,.3)"/><path d="M-8 10 h16 l-2 -6 c4 -3 5 -9 0 -14 c-3 -3 -9 -2 -11 1 l-4 4 l3 2 l-1 6 z" fill="${c}" stroke="#fff" stroke-width="2"/></g>`).join('')}</svg>`,
  mois: `<svg viewBox="0 0 200 150" aria-hidden="true"><defs><linearGradient id="amh" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#ff8a3d"/><stop offset="1" stop-color="#ff4f79"/></linearGradient></defs>
    <g transform="translate(98 80) rotate(-6)"><rect x="-58" y="-50" width="116" height="102" rx="10" fill="#c9b994"/><rect x="-60" y="-54" width="116" height="102" rx="10" fill="#fffaf0"/>
    <rect x="-56" y="-50" width="108" height="24" rx="7" fill="url(#amh)"/><text x="-2" y="-34" text-anchor="middle" font-size="11" font-weight="900" fill="#fff">FIN DE MOIS</text>
    ${Array.from({ length: 9 }, (_, i) => `<rect x="${-50 + i * 12}" y="-60" width="4" height="12" rx="2" fill="#aeb4c2"/>`).join('')}
    ${Array.from({ length: 21 }, (_, i) => { const c = i % 7, r = Math.floor(i / 7); const pay = i === 20; return `<rect x="${-55 + c * 15.4}" y="${-21 + r * 22}" width="13.5" height="19" rx="3" fill="${pay ? '#16a34a' : ['#dbeeff', '#ffe9c2', '#d9f7e5', '#ffd9de'][(i * 3) % 4]}"/>${pay ? '<text x="40" y="31" text-anchor="middle" font-size="11" font-weight="900" fill="#fff">€</text>' : `<text x="${-52 + c * 15.4}" y="${-12 + r * 22}" font-size="6" font-weight="900" fill="${c === 6 ? '#e23b4b' : '#2b2b3a'}">${i + 10}</text>`}`; }).join('')}</g>
    <g class="a-float"><rect x="18" y="22" width="44" height="30" rx="4" fill="#fbf3e1" stroke="#c8b48a" stroke-width="1.5" transform="rotate(-12 40 37)"/><path d="M20 26 l22 14 l20 -18" fill="none" stroke="#c8b48a" stroke-width="1.5" transform="rotate(-12 40 37)"/><circle cx="40" cy="38" r="4" fill="#e23b4b"/></g>
    <g class="a-float2"><circle cx="168" cy="108" r="15" fill="#ffd166" stroke="#d19a1a" stroke-width="3"/><text x="168" y="113" text-anchor="middle" font-size="14" font-weight="900" fill="#7a5200">€</text></g>
    <g class="a-float"><rect x="150" y="20" width="42" height="22" rx="4" fill="#5fd38d" stroke="#1e8f4e" stroke-width="2" transform="rotate(10 171 31)"/><circle cx="171" cy="31" r="6" fill="#1e8f4e" transform="rotate(10 171 31)"/></g></svg>`,
  poker: `<svg viewBox="0 0 200 150" aria-hidden="true"><defs><radialGradient id="apk" cx=".5" cy=".45" r=".6"><stop offset="0" stop-color="#16916c"/><stop offset="1" stop-color="#074233"/></radialGradient></defs>
    <rect x="14" y="40" width="172" height="96" rx="48" fill="#2a1622"/><rect x="22" y="47" width="156" height="82" rx="41" fill="url(#apk)" stroke="#e0b54f" stroke-width="2"/>
    <rect x="44" y="62" width="112" height="52" rx="26" fill="none" stroke="rgba(255,209,102,.45)" stroke-width="1.5" stroke-dasharray="5 4"/>
    ${[0, 1, 2].map((k) => `<rect x="${66 + k * 24}" y="76" width="20" height="28" rx="3" fill="#fff" stroke="#d9d0bb"/>`).join('')}
    <path d="M76 84c-3 4-7 5-7 9a3 3 0 0 0 6 1l-1 4h4l-1-4a3 3 0 0 0 6-1c0-4-4-5-7-9Z" fill="#1b1f2e"/>
    <path d="M100 98c-2-2-7-5-7-9a3 3 0 0 1 7-2 3 3 0 0 1 7 2c0 4-5 7-7 9Z" fill="#d42a3c"/>
    <path d="M124 82l5 8-5 8-5-8Z" fill="#d42a3c"/>
    <g class="a-float" transform="translate(30 6) rotate(-14)"><rect x="0" y="0" width="38" height="54" rx="5" fill="#fff" stroke="#d9d0bb" stroke-width="1.5"/><text x="6" y="14" font-size="12" font-weight="900" fill="#1b1f2e">A</text><path d="M19 22c-5 6-10 7-10 13a4.5 4.5 0 0 0 8 2l-1.5 6h7l-1.5-6a4.5 4.5 0 0 0 8-2c0-6-5-7-10-13Z" fill="#1b1f2e"/></g>
    <g class="a-float2" transform="translate(52 2) rotate(8)"><rect x="0" y="0" width="38" height="54" rx="5" fill="#fff" stroke="#d9d0bb" stroke-width="1.5"/><text x="6" y="14" font-size="12" font-weight="900" fill="#d42a3c">R</text><rect x="9" y="19" width="20" height="28" rx="3" fill="#c22a3d"/><path d="M12 33l1-9 4 4 2-6 2 6 4-4 1 9Z" fill="#f5c451"/></g>
    ${[['#1b1f2e', 150, 0], ['#d93a3a', 166, 1], ['#1f9d55', 158, 2]].map(([c, x, k]) => `<g class="${k === 1 ? 'a-float2' : 'a-float'}">${Array.from({ length: 4 - k }, (_, i) => `<ellipse cx="${x}" cy="${36 - i * 5 + k * 6}" rx="11" ry="4.5" fill="${c}" stroke="#fff" stroke-width="1.6" stroke-dasharray="3 3"/>`).join('')}</g>`).join('')}</svg>`,
  blackjack: `<svg viewBox="0 0 200 150" aria-hidden="true"><defs><radialGradient id="abj" cx=".5" cy=".2" r=".8"><stop offset="0" stop-color="#2d5bd0"/><stop offset="1" stop-color="#0a1d52"/></radialGradient></defs>
    <path d="M14 34 H186 A86 100 0 0 1 14 34 Z" fill="#2b1626"/><path d="M22 36 H178 A78 92 0 0 1 22 36 Z" fill="url(#abj)" stroke="#e0b54f" stroke-width="2"/>
    <path d="M52 48 A50 52 0 0 0 148 48" fill="none" stroke="rgba(255,209,102,.6)" stroke-width="1.5"/>
    ${[[64, 92], [100, 104], [136, 92]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="9" fill="none" stroke="#ffd166" stroke-width="1.6"/>`).join('')}
    <rect x="70" y="18" width="28" height="22" rx="2" fill="#15121f"/><rect x="120" y="16" width="56" height="12" rx="3" fill="#6b4420"/>
    ${['#e04e9a', '#f07f13', '#f2b705', '#7b3fc4', '#23262f', '#1f9d55'].map((c, i) => `<rect x="${123 + i * 8.5}" y="18" width="7" height="8" rx="1.5" fill="${c}"/>`).join('')}
    <g class="a-float" transform="translate(70 46) rotate(-10)"><rect x="0" y="0" width="34" height="48" rx="4" fill="#fff" stroke="#d9d0bb" stroke-width="1.5"/><text x="5" y="13" font-size="11" font-weight="900" fill="#1b1f2e">A</text><path d="M17 18c-4 5-9 6-9 11a4 4 0 0 0 7 2l-1.4 5h6.8l-1.4-5a4 4 0 0 0 7-2c0-5-5-6-9-11Z" fill="#1b1f2e"/></g>
    <g class="a-float2" transform="translate(96 44) rotate(8)"><rect x="0" y="0" width="34" height="48" rx="4" fill="#fff" stroke="#d9d0bb" stroke-width="1.5"/><text x="5" y="13" font-size="11" font-weight="900" fill="#d42a3c">V</text><rect x="8" y="17" width="18" height="25" rx="3" fill="#c22a3d"/><ellipse cx="17" cy="27" rx="6" ry="2.4" fill="#f5c451"/></g>
    <g class="a-float"><circle cx="160" cy="108" r="17" fill="#ffd166" stroke="#fff" stroke-width="2"/><text x="160" y="114" text-anchor="middle" font-size="16" font-weight="900" fill="#6a4500">21</text></g></svg>`,
};
function step(n, icon, title, text) {
  return h('div.step', h('div.step-num', n), h('div.step-icon', icon), h('h3', title), h('p', text));
}
function feature(icon, title, text, color = '#3fa7ff') {
  return h('div.feature2', { style: { '--fc': color } }, h('div.feature2-icon', icon), h('h3', title), h('p', text));
}
function siteFooter() {
  return h('footer.site-footer',
    h('div.logo', 'My', h('span', 'Poly')),
    h('nav', h('a', { href: '/rules', 'data-link': true }, 'Règles'), !IN_APP ? h('a', { href: '/downloads/MyPoly.apk', download: 'MyPoly.apk' }, 'Application Android') : null, h('a', { href: '/leaderboard', 'data-link': true }, 'Classement'), store.user ? h('a', { href: '/settings', 'data-link': true }, 'Mon compte') : h('a', { href: '/register', 'data-link': true }, 'Créer un compte')),
    h('small.muted', '© ' + new Date().getFullYear() + ' MyPoly · Jeu gratuit entre amis')
  );
}

// ------------------------------------------------------------ authentification
function authPage(mode) {
  if (store.user) return navigate('/', true);
  const isLogin = mode === 'login';
  const err = h('div.form-error');
  const fields = isLogin
    ? [['login', 'Pseudo ou e-mail', 'text', 'username'], ['password', 'Mot de passe', 'password', 'current-password']]
    : [['username', 'Pseudo de connexion (privé)', 'text', 'username'], ['email', 'E-mail', 'email', 'email'], ['password', 'Mot de passe (8 caractères min.)', 'password', 'new-password']];
  const form = h('form.card.auth-card',
    { onsubmit: async (e) => {
      e.preventDefault();
      err.textContent = '';
      const body = Object.fromEntries(new FormData(form));
      const btn = form.querySelector('button[type=submit]');
      btn.disabled = true;
      try {
        const res = await api('/auth/' + mode, { body });
        store.user = res.user;
        connectSocket();
        toast(isLogin ? `Bon retour, ${res.user.name} !` : `Bienvenue sur MyPoly, ${res.user.name} ! 🎉`, 'success');
        Sound.play('buy');
        const back = sessionStorage.getItem('mp_after_login');
        sessionStorage.removeItem('mp_after_login');
        navigate(back || '/');
      } catch (ex) {
        err.textContent = ex.message;
        Sound.play('error');
      } finally {
        btn.disabled = false;
      }
    } },
    h('h1', isLogin ? 'Connexion' : 'Créer un compte'),
    h('p.muted', isLogin ? 'Retrouvez vos statistiques, badges et votre classement.' : 'Gratuit. Statistiques, badges, classement et profil personnalisé.'),
    ...fields.map(([name, label, type, ac]) => h('div.field', h('label', label), h('input.input', { name, type, autocomplete: ac, required: true }))),
    isLogin
      ? null
      : h('div.field',
          h('label', 'Pseudo d\'affichage ', h('span.muted', '(facultatif)')),
          h('input.input', { name: 'displayName', type: 'text', maxlength: 20, autocomplete: 'nickname', placeholder: 'Le nom que les autres joueurs verront' }),
          h('small.muted', 'Modifiable à tout moment. Votre pseudo de connexion reste privé.')
        ),
    err,
    h('button.btn.primary.lg.block', { type: 'submit' }, isLogin ? 'Se connecter' : 'Créer mon compte'),
    h('p.center.muted', isLogin ? 'Pas encore de compte ? ' : 'Déjà inscrit ? ', h('a', { href: isLogin ? '/register' : '/login', 'data-link': true }, isLogin ? 'Inscription' : 'Connexion'))
  );
  app.append(h('div.page.auth', form));
  form.querySelector('input').focus();
}

// --------------------------------------------------------------- classement
async function leaderboardPage() {
  // Un classement par jeu
  const TABS = {
    poly: [['rating', 'Classement'], ['wins', 'Victoires'], ['winrate', '% victoires'], ['games', 'Parties'], ['best', 'Record fortune'], ['xp', 'Expérience']],
    cartes: [['c_wins', 'Victoires'], ['c_winrate', '% victoires'], ['c_games', 'Parties'], ['c_streak', 'Meilleure série'], ['c_cards', 'Cartes posées']],
    chevaux: [['h_wins', 'Victoires'], ['h_winrate', '% victoires'], ['h_games', 'Courses'], ['h_captures', 'Chevaux renvoyés'], ['h_home', 'Chevaux arrivés']],
    mois: [['m_wins', 'Victoires'], ['m_winrate', '% victoires'], ['m_games', 'Parties'], ['m_best', 'Record de fortune'], ['m_sold', 'Affaires revendues']],
    poker: [['p_wins', 'Victoires'], ['p_winrate', '% victoires'], ['p_games', 'Parties'], ['p_pot', 'Plus gros pot'], ['p_hands', 'Mains gagnées']],
    blackjack: [['b_wins', 'Victoires'], ['b_winrate', '% victoires'], ['b_games', 'Parties'], ['b_best', 'Record de jetons'], ['b_bj', 'Blackjacks']],
  };
  let game = TABS[storage('game')] ? storage('game') : 'poly';
  let sort = TABS[game][0][0];
  const table = h('div.lb-table');
  const tabBox = h('div.tabs');
  const gameTabs = h('div.game-switch');
  async function load() {
    gameTabs.innerHTML = '';
    for (const [k, icon, label] of [['poly', '🎲', 'MyPoly'], ['cartes', '🃏', 'Carton !'], ['chevaux', '🐴', 'Petits chevaux'], ['mois', '📅', 'Fin de mois'], ['poker', '♠', 'Poker'], ['blackjack', '♣', 'Blackjack']]) {
      gameTabs.append(h('button.game-switch-btn' + (game === k ? '.on' : ''), { onclick: () => {
        game = k;
        sort = TABS[k][0][0];
        load();
      } }, h('span.gs-icon', icon), h('b', label), h('small', { poly: 'Jeu de plateau', cartes: 'Jeu de cartes', chevaux: 'Jeu de course', mois: 'Jeu de gestion', poker: 'Texas Hold\'em', blackjack: 'Jeu de casino' }[k])));
    }
    tabBox.innerHTML = '';
    for (const [k, l] of TABS[game]) tabBox.append(h('button.tab' + (k === sort ? '.active' : ''), { onclick: () => ((sort = k), load()) }, l));
    table.innerHTML = '<div class="muted">Chargement…</div>';
    const { players } = await api('/leaderboard?sort=' + sort);
    table.innerHTML = '';
    if (!players.length) {
      return table.append(h('div.lb-empty', h('div.lb-empty-icon', '🏆'), h('h3', 'Le trône est libre !'), h('p', 'Personne n\'est encore classé dans ce jeu. Gagne une partie avec un compte et deviens le premier champion.'),
        h('div.btn-row.center', h('a.btn.primary', { href: '/', 'data-link': true }, '▶ Jouer maintenant'), !store.user ? h('a.btn.ghost', { href: '/register', 'data-link': true }, 'Créer un compte') : null)));
    }
    const valOf = (p) => ({ rating: p.rating + ' pts', wins: p.wins + ' victoires', winrate: p.winrate + ' %', games: p.games + ' parties', best: fmt(p.best_networth), xp: p.xp + ' XP',
        c_wins: p.wins + ' victoire' + (p.wins > 1 ? 's' : ''), c_winrate: p.winrate + ' %', c_games: p.games + ' parties', c_streak: p.best_streak + ' d\'affilée', c_cards: p.cards_played + ' cartes',
        h_wins: p.wins + ' victoire' + (p.wins > 1 ? 's' : ''), h_winrate: p.winrate + ' %', h_games: p.games + ' courses', h_captures: p.captures + ' renvois', h_home: p.horses_home + ' chevaux',
        m_wins: p.wins + ' victoire' + (p.wins > 1 ? 's' : ''), m_winrate: p.winrate + ' %', m_games: p.games + ' parties', m_best: (p.best_worth || 0).toLocaleString('fr-FR') + ' €', m_sold: p.deals_sold + ' ventes',
        p_wins: p.wins + ' victoire' + (p.wins > 1 ? 's' : ''), p_winrate: p.winrate + ' %', p_games: p.games + ' parties', p_pot: (p.biggest_pot || 0).toLocaleString('fr-FR') + ' jetons', p_hands: p.hands_won + ' mains',
        b_wins: p.wins + ' victoire' + (p.wins > 1 ? 's' : ''), b_winrate: p.winrate + ' %', b_games: p.games + ' parties', b_best: (p.best_chips || 0).toLocaleString('fr-FR') + ' jetons', b_bj: p.blackjacks + ' blackjacks' }[sort]);
    // Podium des trois premiers
    const top = players.slice(0, 3);
    table.append(h('div.lb-podium', [top[1], top[0], top[2]].map((p, k) => {
      if (!p) return h('div.lb-pod.empty');
      const rank = [2, 1, 3][k];
      return h('a.lb-pod.r' + rank, { href: '/joueur/' + p.id, 'data-link': true, style: { '--c': p.color } },
        rank === 1 ? h('span.lb-crown', '👑') : null,
        h('span.avatar.xl', { style: { '--c': p.color } }, p.pawn),
        h('b.lb-pod-name.' + (nameClass(p) || 'plain'), p.name),
        h('div.lb-pod-tags', ...roleTags(p, { level: false })),
        h('div.lb-pod-val', valOf(p)),
        h('div.lb-pod-step', h('span', ['🥇', '🥈', '🥉'][rank - 1]), h('small', `${p.wins} V · ${p.games} P`))
      );
    })));
    players.slice(3).forEach((p, j) => {
      const i = j + 3;
      const val = valOf(p);
      table.append(
        h('a.lb-row' + (i < 3 ? '.top' + (i + 1) : ''), { href: '/joueur/' + p.id, 'data-link': true },
          h('div.lb-rank', i < 3 ? ['🥇', '🥈', '🥉'][i] : '#' + (i + 1)),
          h('span.avatar', { style: { '--c': p.color } }, p.pawn),
          h('div.lb-name', h('span.' + (nameClass(p) || 'plain'), p.name), ...roleTags(p)),
          h('div.lb-sub.muted', `${p.wins}V / ${p.games}P`),
          h('div.lb-val', val)
        )
      );
    });
  }
  app.append(h('div.page.lb-page',
    h('header.lb-hero', h('span.hp-kicker', 'Hall of fame'), h('h1', 'Classement'), h('p', 'Les meilleurs joueurs de chaque jeu. Joue avec un compte pour y apparaître.')),
    gameTabs, tabBox, table));
  load();
}

// ------------------------------------------------------------------ profil
async function profilePage(key) {
  const box = h('div.page.profile', h('div.muted', 'Chargement…'));
  app.append(box);
  let data;
  try {
    data = await api('/profile/' + encodeURIComponent(key));
  } catch (e) {
    box.innerHTML = '';
    box.append(h('div.empty', '😕 ' + e.message));
    return;
  }
  const { user: u, stats: s, cards: cs, horses: hs, months: ms, poker: ps, blackjack: bs, badges, history } = data;
  const mine = store.user && store.user.id === u.id;
  const owned = new Map(badges.map((b) => [b.badge, b.earned_at]));
  const xpCur = (u.level - 1) ** 2 * 100;
  const xpNext = u.level ** 2 * 100;
  const pct = Math.min(100, ((u.xp - xpCur) / (xpNext - xpCur)) * 100);
  // Un onglet par jeu : statistiques, badges et historique bien séparés
  const counts = { poly: s.games || 0, cartes: (cs && cs.games) || 0, chevaux: (hs && hs.games) || 0, mois: (ms && ms.games) || 0, poker: (ps && ps.games) || 0, blackjack: (bs && bs.games) || 0 };
  let game = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
  const gameTabs = h('div.game-switch');
  const gameBox = h('div.profile-game');
  const ctx = { s, cs, hs, ms, owned, history, historyCards: data.historyCards || [], historyHorses: data.historyHorses || [], historyMonths: data.historyMonths || [], ps, historyPoker: data.historyPoker || [], bs, historyBlackjack: data.historyBlackjack || [] };
  const render = () => {
    gameTabs.innerHTML = '';
    for (const [k, icon, label] of [['poly', '🎲', 'MyPoly'], ['cartes', '🃏', 'Carton !'], ['chevaux', '🐴', 'Petits chevaux'], ['mois', '📅', 'Fin de mois'], ['poker', '♠', 'Poker'], ['blackjack', '♣', 'Blackjack']]) {
      const n = counts[k];
      gameTabs.append(h('button.game-switch-btn' + (game === k ? '.on' : ''), { onclick: () => ((game = k), render()) }, h('span.gs-icon', icon), h('b', label), h('small', `${n} partie${n > 1 ? 's' : ''}`)));
    }
    gameBox.innerHTML = '';
    gameBox.append(...profileGame(game, ctx));
  };
  box.innerHTML = '';
  box.append(
    h('div.card.profile-head' + (u.vip ? '.vip' : ''),
      h('div.avatar.xl', { style: { '--c': u.color } }, u.pawn),
      h('div.profile-info',
        h('h1', h('span.' + (nameClass(u) || 'plain'), u.name), ...roleTags(u, { level: false })),
        u.bio ? h('p.bio', u.bio) : null,
        h('div.xp', h('div.xp-label', `Niveau ${u.level}`, h('span.muted', ` · ${u.xp} XP`)), h('div.xp-bar', h('div', { style: { width: pct + '%' } }))),
        h('div.muted.small', `Membre depuis ${new Date(u.createdAt).toLocaleDateString('fr-FR')}`, u.vip && u.vipUntil ? ` · VIP jusqu'au ${new Date(u.vipUntil).toLocaleDateString('fr-FR')}` : u.vip ? ' · VIP à vie' : '')
      ),
      mine ? h('a.btn.ghost', { href: '/settings', 'data-link': true }, '⚙️ Personnaliser') : null
    ),
    gameTabs,
    gameBox
  );
  render();
}

/** Contenu du profil propre à un jeu : statistiques, badges et dernières parties. */
function profileGame(game, ctx) {
  if (game === 'chevaux') return profileHorses(ctx);
  if (game === 'mois') return profileMonths(ctx);
  if (game === 'poker') return profilePoker(ctx);
  if (game === 'blackjack') return profileBlackjack(ctx);
  const { s, cs, owned, history, historyCards } = ctx;
  const cards = game === 'cartes';
  const c = cs || {};
  const pct = (w, g) => (g ? Math.round((100 * w) / g) : 0) + ' %';
  const grid = cards
    ? h('div.stat-grid',
        stat('🎴', c.games || 0, 'Parties jouées'),
        stat('🏆', c.wins || 0, 'Victoires'),
        stat('📈', pct(c.wins, c.games), 'Taux de victoire'),
        stat('🔥', c.best_streak || 0, 'Meilleure série'),
        stat('🏁', c.rounds_won || 0, 'Manches gagnées'),
        stat('🃏', c.cards_played || 0, 'Cartes posées'),
        stat('😈', c.plus4 || 0, 'Super Jokers +4'),
        stat('📣', c.cartons || 0, '« Carton ! » criés'),
        stat('🐆', c.catches || 0, 'Oublis attrapés'),
        stat('🙈', c.caught || 0, 'Fois pris sans crier'),
        stat('🌋', c.best_hit || 0, 'Plus grosse pioche infligée'),
        stat('⏱️', duration(c.play_seconds || 0), 'Temps de jeu')
      )
    : h('div.stat-grid',
        stat('🏅', s.rating ?? 1000, 'Points de classement'),
        stat('🎮', s.games || 0, 'Parties jouées'),
        stat('🏆', s.wins || 0, 'Victoires'),
        stat('📈', pct(s.wins, s.games), 'Taux de victoire'),
        stat('🔥', s.best_streak || 0, 'Meilleure série'),
        stat('💎', fmt(s.best_networth || 0), 'Record de fortune'),
        stat('🥊', s.knockouts || 0, 'Faillites provoquées'),
        stat('🏠', s.properties_bought || 0, 'Propriétés achetées'),
        stat('🏗️', s.houses_built || 0, 'Bâtiments construits'),
        stat('🦈', s.takeovers || 0, 'Rachats'),
        stat('💰', fmt(s.rent_earned || 0), 'Loyers encaissés'),
        stat('⏱️', duration(s.play_seconds || 0), 'Temps de jeu')
      );
  const list = store.meta.badges.filter((b) => (b.game || 'poly') === game);
  const got = list.filter((b) => owned.has(b.id)).length;
  const hist = cards ? historyCards : history;
  return [
    grid,
    h('div.card', h('h2', `🎖️ Badges ${cards ? 'Carton !' : 'MyPoly'} (${got}/${list.length})`),
      h('div.badge-grid', list.map((b) => {
        const at = owned.get(b.id);
        return h('div.badge.tier-' + b.tier + (at ? '' : '.locked'), { title: b.desc + (at ? ` — obtenu ${timeAgo(at)}` : '') }, h('div.badge-icon', b.icon), h('div.badge-name', b.name), h('div.badge-desc', b.desc));
      }))
    ),
    h('div.card', h('h2', `📜 Dernières parties de ${cards ? 'Carton !' : 'MyPoly'}`),
      hist.length
        ? h('div.history', hist.map((g) =>
            h('div.history-row.' + (g.rank === 1 ? 'won' : 'lost'),
              h('div.history-rank', g.rank === 1 ? '🏆' : '#' + g.rank),
              h('div.history-main', h('div', g.players.map((p) => p.name).join(' · ')),
                h('small.muted', cards
                  ? `${timeAgo(g.ended_at)} · ${duration(g.duration)} · ${g.rounds} manche${g.rounds > 1 ? 's' : ''}`
                  : `${timeAgo(g.ended_at)} · ${duration(g.duration)} · ${g.rounds} tours · ${winLabel(g.win_type)}`)),
              cards ? h('div.history-delta', g.rank === 1 ? '🃏' : '') : h('div.history-delta.' + (g.rating_delta >= 0 ? 'pos' : 'neg'), (g.rating_delta >= 0 ? '+' : '') + g.rating_delta)
            )))
        : h('div.empty', cards ? 'Aucune partie de Carton ! pour l\'instant.' : 'Aucune partie de MyPoly pour l\'instant.')
    ),
  ];
}
function stat(icon, value, label) {
  return h('div.stat', h('div.stat-icon', icon), h('div.stat-value', String(value)), h('div.stat-label', label));
}
/** Profil : section Petits chevaux. */
function profileHorses({ hs, owned, historyHorses }) {
  const c = hs || {};
  const pct = (w, g) => (g ? Math.round((100 * w) / g) : 0) + ' %';
  const list = store.meta.badges.filter((b) => b.game === 'chevaux');
  const got = list.filter((b) => owned.has(b.id)).length;
  return [
    h('div.stat-grid',
      stat('🐴', c.games || 0, 'Courses jouées'),
      stat('🏆', c.wins || 0, 'Victoires'),
      stat('📈', pct(c.wins, c.games), 'Taux de victoire'),
      stat('🔥', c.best_streak || 0, 'Meilleure série'),
      stat('🏁', c.horses_home || 0, 'Chevaux arrivés'),
      stat('💥', c.captures || 0, 'Chevaux renvoyés'),
      stat('🤕', c.captured || 0, 'Chevaux perdus'),
      stat('🎲', c.sixes || 0, '6 obtenus'),
      stat('🎯', c.rolls ? Math.round((100 * c.sixes) / c.rolls) + ' %' : '0 %', 'Taux de 6'),
      stat('⏱️', duration(c.play_seconds || 0), 'Temps de jeu')
    ),
    h('div.card', h('h2', `🎖️ Badges Petits chevaux (${got}/${list.length})`),
      h('div.badge-grid', list.map((b) => {
        const at = owned.get(b.id);
        return h('div.badge.tier-' + b.tier + (at ? '' : '.locked'), { title: b.desc + (at ? ` — obtenu ${timeAgo(at)}` : '') }, h('div.badge-icon', b.icon), h('div.badge-name', b.name), h('div.badge-desc', b.desc));
      }))
    ),
    h('div.card', h('h2', '📜 Dernières courses'),
      historyHorses.length
        ? h('div.history', historyHorses.map((g) =>
            h('div.history-row.' + (g.rank === 1 ? 'won' : 'lost'),
              h('div.history-rank', g.rank === 1 ? '🏆' : '#' + g.rank),
              h('div.history-main', h('div', g.players.map((p) => p.name).join(' · ')), h('small.muted', `${timeAgo(g.ended_at)} · ${duration(g.duration)} · ${g.networth} cheva${g.networth > 1 ? 'ux' : 'l'} arrivé${g.networth > 1 ? 's' : ''}`)),
              h('div.history-delta', g.rank === 1 ? '🐴' : '')
            )))
        : h('div.empty', 'Aucune course de Petits chevaux pour l\'instant.')
    ),
  ];
}

/** Profil : section Fin de mois. */
function profileMonths({ ms, owned, historyMonths }) {
  const c = ms || {};
  const pct = (w, g) => (g ? Math.round((100 * w) / g) : 0) + ' %';
  const eur = (n) => (n || 0).toLocaleString('fr-FR') + ' €';
  const list = store.meta.badges.filter((b) => b.game === 'mois');
  const got = list.filter((b) => owned.has(b.id)).length;
  return [
    h('div.stat-grid',
      stat('📅', c.games || 0, 'Parties jouées'),
      stat('🏆', c.wins || 0, 'Victoires'),
      stat('📈', pct(c.wins, c.games), 'Taux de victoire'),
      stat('🔥', c.best_streak || 0, 'Meilleure série'),
      stat('💎', eur(c.best_worth), 'Record de fortune'),
      stat('🤑', c.deals_sold || 0, 'Affaires revendues'),
      stat('📈', eur(c.profit), 'Bénéfices sur les ventes'),
      stat('💰', c.jackpots || 0, 'Cagnottes raflées'),
      stat('🏦', eur(c.borrowed), 'Total emprunté'),
      stat('⏱️', duration(c.play_seconds || 0), 'Temps de jeu')
    ),
    h('div.card', h('h2', `🎖️ Badges Fin de mois (${got}/${list.length})`),
      h('div.badge-grid', list.map((b) => {
        const at = owned.get(b.id);
        return h('div.badge.tier-' + b.tier + (at ? '' : '.locked'), { title: b.desc + (at ? ` — obtenu ${timeAgo(at)}` : '') }, h('div.badge-icon', b.icon), h('div.badge-name', b.name), h('div.badge-desc', b.desc));
      }))
    ),
    h('div.card', h('h2', '📜 Dernières parties de Fin de mois'),
      historyMonths.length
        ? h('div.history', historyMonths.map((g) =>
            h('div.history-row.' + (g.rank === 1 ? 'won' : 'lost'),
              h('div.history-rank', g.rank === 1 ? '🏆' : '#' + g.rank),
              h('div.history-main', h('div', g.players.map((p) => p.name).join(' · ')), h('small.muted', `${timeAgo(g.ended_at)} · ${duration(g.duration)} · patrimoine ${eur(g.networth)}`)),
              h('div.history-delta', g.rank === 1 ? '💶' : '')
            )))
        : h('div.empty', 'Aucune partie de Fin de mois pour l\'instant.')
    ),
  ];
}

/** Profil : section Poker. */
function profilePoker({ ps, owned, historyPoker }) {
  const c = ps || {};
  const pct = (w, g) => (g ? Math.round((100 * w) / g) : 0) + ' %';
  const chips = (n) => (n || 0).toLocaleString('fr-FR');
  const CATS = ['Hauteur', 'Paire', 'Double paire', 'Brelan', 'Quinte', 'Couleur', 'Full', 'Carré', 'Quinte flush'];
  const list = store.meta.badges.filter((b) => b.game === 'poker');
  const got = list.filter((b) => owned.has(b.id)).length;
  return [
    h('div.stat-grid',
      stat('♠', c.games || 0, 'Parties jouées'),
      stat('♦', c.wins || 0, 'Victoires'),
      stat('%', pct(c.wins, c.games), 'Taux de victoire'),
      stat('♥', c.best_streak || 0, 'Meilleure série'),
      stat('◎', chips(c.biggest_pot), 'Plus gros pot'),
      stat('♣', c.hands_won || 0, 'Mains gagnées'),
      stat('=', pct(c.hands_won, c.hands), 'Mains gagnées (%)'),
      stat('∞', c.allin_wins || 0, 'Tapis gagnés'),
      stat('?', c.bluffs || 0, 'Bluffs réussis'),
      stat('★', c.best_cat >= 0 ? CATS[c.best_cat] : '—', 'Meilleure main gagnante'),
      stat('⏱️', duration(c.play_seconds || 0), 'Temps de jeu')
    ),
    h('div.card', h('h2', `🎖️ Badges Poker (${got}/${list.length})`),
      h('div.badge-grid', list.map((b) => {
        const at = owned.get(b.id);
        return h('div.badge.tier-' + b.tier + (at ? '' : '.locked'), { title: b.desc + (at ? ` — obtenu ${timeAgo(at)}` : '') }, h('div.badge-icon', b.icon), h('div.badge-name', b.name), h('div.badge-desc', b.desc));
      }))
    ),
    h('div.card', h('h2', '📜 Dernières parties de poker'),
      historyPoker.length
        ? h('div.history', historyPoker.map((g) =>
            h('div.history-row.' + (g.rank === 1 ? 'won' : 'lost'),
              h('div.history-rank', g.rank === 1 ? '🏆' : '#' + g.rank),
              h('div.history-main', h('div', g.players.map((p) => p.name).join(' · ')), h('small.muted', `${timeAgo(g.ended_at)} · ${duration(g.duration)} · ${g.rounds} mains · ${chips(g.networth)} jetons`)),
              h('div.history-delta', g.rank === 1 ? '♠' : '')
            )))
        : h('div.empty', 'Aucune partie de poker pour l\'instant.')
    ),
  ];
}

/** Profil : section Blackjack. */
function profileBlackjack({ bs, owned, historyBlackjack }) {
  const c = bs || {};
  const pct = (w, g) => (g ? Math.round((100 * w) / g) : 0) + ' %';
  const chips = (n) => (n || 0).toLocaleString('fr-FR');
  const list = store.meta.badges.filter((b) => b.game === 'blackjack');
  const got = list.filter((b) => owned.has(b.id)).length;
  return [
    h('div.stat-grid',
      stat('♣', c.games || 0, 'Parties jouées'),
      stat('♦', c.wins || 0, 'Victoires'),
      stat('%', pct(c.wins, c.games), 'Taux de victoire'),
      stat('♥', c.best_streak || 0, 'Meilleure série'),
      stat('◎', chips(c.best_chips), 'Record de jetons'),
      stat('21', c.blackjacks || 0, 'Blackjacks'),
      stat('=', pct(c.hands_won, c.hands), 'Mains gagnées'),
      stat('×2', c.doubles_won || 0, 'Doubles gagnés'),
      stat('+', chips(c.biggest_win), 'Plus gros gain'),
      stat('⏱️', duration(c.play_seconds || 0), 'Temps de jeu')
    ),
    h('div.card', h('h2', `🎖️ Badges Blackjack (${got}/${list.length})`),
      h('div.badge-grid', list.map((b) => {
        const at = owned.get(b.id);
        return h('div.badge.tier-' + b.tier + (at ? '' : '.locked'), { title: b.desc + (at ? ` — obtenu ${timeAgo(at)}` : '') }, h('div.badge-icon', b.icon), h('div.badge-name', b.name), h('div.badge-desc', b.desc));
      }))
    ),
    h('div.card', h('h2', '📜 Dernières parties de Blackjack'),
      historyBlackjack.length
        ? h('div.history', historyBlackjack.map((g) =>
            h('div.history-row.' + (g.rank === 1 ? 'won' : 'lost'),
              h('div.history-rank', g.rank === 1 ? '🏆' : '#' + g.rank),
              h('div.history-main', h('div', g.players.map((p) => p.name).join(' · ')), h('small.muted', `${timeAgo(g.ended_at)} · ${duration(g.duration)} · ${g.rounds} manches · ${chips(g.networth)} jetons`)),
              h('div.history-delta', g.rank === 1 ? '♣' : '')
            )))
        : h('div.empty', 'Aucune partie de Blackjack pour l\'instant.')
    ),
  ];
}

export function winLabel(t) {
  return { last: 'Faillite des adversaires', triple: 'Triple monopole', line: 'Monopole de ligne', resort: 'Monopole balnéaire', time: 'Temps écoulé', rounds: 'Tours écoulés', cartes: '🃏 Carton !', chevaux: '🐴 Petits chevaux', mois: '📅 Fin de mois', poker: '♠ Poker', blackjack: '♣ Blackjack', forfeit: 'Abandon des adversaires' }[t] || t || '—';
}

// --------------------------------------------------------------- paramètres
function settingsPage() {
  const u = store.user;
  if (!u) {
    sessionStorage.setItem('mp_after_login', '/settings');
    return navigate('/login', true);
  }
  const vip = u.vip || u.staff;
  let pawn = u.pawn;
  let color = u.color;
  const preview = h('div.avatar.xl', { style: { '--c': color } }, pawn);
  const pawnGrid = h('div.pick-grid');
  const colorGrid = h('div.pick-grid');
  function draw() {
    preview.textContent = pawn;
    preview.style.setProperty('--c', color);
    pawnGrid.innerHTML = '';
    colorGrid.innerHTML = '';
    for (const p of store.meta.pawns) pawnGrid.append(h('button.pick' + (p === pawn ? '.on' : ''), { onclick: () => ((pawn = p), draw()) }, p));
    for (const p of store.meta.vipPawns) pawnGrid.append(h('button.pick.vip' + (p === pawn ? '.on' : '') + (vip ? '' : '.locked'), { title: vip ? 'Exclusivité VIP' : 'Réservé aux VIP', onclick: () => (vip ? ((pawn = p), draw()) : toast('Ce pion est réservé aux membres VIP 👑', 'warn')) }, p));
    for (const c of store.meta.colors) colorGrid.append(h('button.pick.color' + (c === color ? '.on' : ''), { style: { '--c': c }, onclick: () => ((color = c), draw()) }));
    for (const c of store.meta.vipColors) colorGrid.append(h('button.pick.color.vip' + (c === color ? '.on' : '') + (vip ? '' : '.locked'), { style: { '--c': c }, title: 'Couleur VIP', onclick: () => (vip ? ((color = c), draw()) : toast('Couleur réservée aux membres VIP 👑', 'warn')) }));
  }
  draw();
  const bio = h('textarea.input', { maxlength: 200, rows: 3, placeholder: 'Quelques mots sur vous…' }, u.bio || '');
  const displayInput = h('input.input', { maxlength: 20, value: u.displayName || '', placeholder: u.username, autocomplete: 'nickname' });
  const namePreview = h('b', u.name);
  displayInput.addEventListener('input', () => (namePreview.textContent = displayInput.value.trim() || u.username));
  const cur = h('input.input', { type: 'password', autocomplete: 'current-password', placeholder: 'Mot de passe actuel' });
  const next = h('input.input', { type: 'password', autocomplete: 'new-password', placeholder: 'Nouveau mot de passe' });
  async function save() {
    try {
      const body = { pawn, color, bio: bio.value, displayName: displayInput.value };
      if (next.value) Object.assign(body, { currentPassword: cur.value, newPassword: next.value });
      const res = await api('/auth/me', { method: 'PATCH', body });
      store.user = res.user;
      connectSocket();
      cur.value = next.value = '';
      updateNav();
      toast('Profil mis à jour ✔', 'success');
    } catch (e) {
      toast(e.message, 'error');
    }
  }
  app.append(
    h('div.page.narrow',
      h('h1.page-title', '⚙️ Personnalisation'),
      h('div.card', h('div.settings-preview', preview, h('div', namePreview, h('div.small.muted', 'Connexion : @' + u.username), h('div', ...roleTags(u, { level: false })))),
        h('h3', 'Pseudo d\'affichage'),
        displayInput,
        h('small.muted.block-hint', `C'est le nom que voient les autres joueurs (en partie, dans le chat, au classement). Laissez vide pour utiliser votre pseudo de connexion « ${u.username} », qui reste privé et sert uniquement à vous connecter.`),
        h('h3', 'Pion'), pawnGrid, h('h3', 'Couleur'), colorGrid, h('h3', 'Bio'), bio),
      h('div.card', h('h3', 'Changer de mot de passe'), cur, next),
      !vip ? h('div.card.vip-promo', h('h3', '👑 Devenez VIP'), h('p', 'Pions et couleurs exclusifs, pseudo doré, badge VIP visible en partie. Contactez le staff pour en savoir plus.')) : null,
      h('button.btn.primary.lg', { onclick: save }, 'Enregistrer'),
      h('div.card.settings-logout', h('h3', 'Compte'), h('p.muted', 'Vous êtes connecté en tant que @' + u.username + '.'), h('button.btn.ghost', { onclick: logout }, '🚪 Se déconnecter'))
    )
  );
}

// ------------------------------------------------------------------- règles
function rulesPage() {
  const s = store.meta.defaults;
  const fmtK = (k) => fmt(k);
  const sections = [
    { id: 'tour', icon: '🎲', color: '#3fa7ff', title: 'Le tour de jeu', body: `
      <p>Lance les deux dés et avance ton pion. Le tirage est <b>100 % aléatoire</b>, effectué par le serveur : personne ne peut tricher.</p>
      <ul><li>Un <b>double</b> te fait rejouer.</li><li><b>3 doubles</b> d'affilée t'envoient sur l'Île déserte.</li><li>Chaque passage par le <b>Départ</b> rapporte ${fmtK(s.salary)}, le double si tu tombes pile dessus.</li></ul>`, tip: 'Appuie sur Espace pour lancer les dés.' },
    { id: 'villes', icon: '🏙️', color: '#ff8a3d', title: 'Villes & constructions', body: `
      <p>Sur une ville libre, achète le terrain et pose jusqu'à <b>3 maisons d'un coup</b>. Reviens dessus pour l'améliorer, jusqu'à l'<b>hôtel</b> (il faut déjà 3 maisons).</p>
      <ul><li>Au <b>premier tour</b>, 2 maisons maximum par ville.</li><li>Posséder <b>tout un pays</b> double les loyers.</li></ul>`, tip: 'Les hôtels sont intouchables : ni rachat, ni séisme, ni tornade.' },
    { id: 'rachat', icon: '🤝', color: '#a66bff', title: 'Le rachat', body: `
      <p>Tu tombes chez un adversaire ? Paie le loyer… puis <b>rachète-lui sa ville</b> pour ${s.takeoverMult} × sa valeur. Ses maisons deviennent les tiennes.</p>` },
    { id: 'speciales', icon: '✨', color: '#ff2fb3', title: 'Les cases spéciales', body: `
      <div class="rules-corners">
        <div><span>🏁</span><b>Départ</b><small>+${fmtK(s.salary)} à chaque passage</small></div>
        <div><span>🏝️</span><b>Île déserte</b><small>Double, amende de ${fmtK(s.jailFine)} ou 3 tours d'attente</small></div>
        <div><span>🎪</span><b>Festival</b><small>Loyer ×2 sur la propriété de ton choix (jusqu'à ×5)</small></div>
        <div><span>✈️</span><b>Aéroport</b><small>Au tour suivant, vole où tu veux (billet ${fmtK(s.travelFee)}, coins non desservis)</small></div>
        <div><span>❓</span><b>Chance</b><small>30 cartes : bonus, coups durs, téléporteur, tornade…</small></div>
        <div><span>🏖️</span><b>Stations balnéaires</b><small>Loyer 50K → 110K → 240K → 500K selon le nombre possédé</small></div>
        <div><span>💸</span><b>Impôts</b><small>${s.taxPercent} % de ta fortune totale</small></div>
      </div>` },
    { id: 'dettes', icon: '💸', color: '#ff4757', title: 'Dettes & faillite', body: `
      <p>Pas assez d'argent ? Seules tes propriétés restent allumées sur le plateau, avec leur <b>prix de revente</b> : clique celles à vendre (ou laisse le jeu te proposer la <b>sélection conseillée</b>), puis paie en un clic. Les biens se revendent à <b>${s.resalePercent ?? 75} % de leur prix</b> (réglable). Sur la fiche de chaque joueur, la pastille 🛟 indique ce qu'il peut vraiment payer en revendant tout.</p>
      <p>Si même en vendant tout tu ne peux pas payer : <b>faillite</b>, et tu es éliminé.</p>` },
    { id: 'chrono', icon: '⏱️', color: '#2ecc71', title: 'Chrono & absences', body: `
      <p>Chaque décision a un temps limite (réglable). S'il s'écoule, une action par défaut est jouée. Un joueur déconnecté est joué automatiquement jusqu'à son retour : la partie ne s'arrête jamais.</p>` },
  ];
  const wins = [
    ['💀', 'Faillite générale', 'Sois le dernier joueur encore en jeu.'],
    ['♟️', 'Triple monopole', 'Possède 3 pays complets.'],
    ['📏', 'Monopole de ligne', 'Possède toutes les propriétés d\'un côté du plateau.'],
    ['🏖️', 'Monopole balnéaire', 'Possède les 4 stations balnéaires.'],
  ];
  app.append(
    h('div.page.rules2',
      h('header.rl-hero',
        h('span.hp-kicker', '📖 Règles'),
        h('h1', 'Apprends à jouer en 2 minutes'),
        h('p', 'Six jeux, des règles simples. Tout ce qui est marqué « réglable » se change dans le salon de la partie.'),
        h('div.rl-games', [['tour', 'poly', 'MyPoly', 'Le jeu de plateau', '#ff8a3d'], ['carton', 'cartes', 'Carton !', 'Le jeu de cartes', '#ff5a5f'], ['chevaux', 'chevaux', 'Petits chevaux', 'Le jeu de course', '#2ecc71'], ['mois', 'mois', 'Fin de mois', 'Le jeu de gestion', '#3fa7ff'], ['poker', 'poker', 'Poker', 'Texas Hold\'em', '#16916c'], ['blackjack', 'blackjack', 'Blackjack', 'Le jeu de casino', '#2d5bd0']].map(([id, k, name, sub, c]) =>
          h('a.rl-game', { href: '#' + id, style: { '--c': c }, onclick: (e) => { e.preventDefault(); document.getElementById(id).scrollIntoView({ behavior: 'smooth', block: 'start' }); } },
            h('span.rl-game-art', { html: ART[k] }), h('b', name), h('small', sub), h('span.rl-go', 'Lire les règles ↓'))))
      ),
      h('h2.rl-part', h('span', '🎲'), 'MyPoly — le jeu de plateau'),
      h('nav.chips', ...sections.map((x) => h('a.chip', { href: '#' + x.id, onclick: (e) => { e.preventDefault(); document.getElementById(x.id).scrollIntoView({ behavior: 'smooth' }); } }, x.icon + ' ' + x.title))),
      h('section.win-grid',
        h('h2.section-title', '🏆 4 façons de gagner'),
        h('div.win-cards', wins.map(([i, t, d]) => h('div.win-card', h('div.win-icon', i), h('b', t), h('small', d))))
      ),
      ...sections.map((x) => h('section.rule-card#' + x.id, { style: { '--rc': x.color } },
        h('div.rule-head', h('span.rule-icon', x.icon), h('h2', x.title)),
        h('div.rule-body', { html: x.body }),
        x.tip ? h('div.rule-tip', '💡 ' + x.tip) : null
      )),
      h('h2.rl-part', h('span', '🃏'), 'Carton ! — le jeu de cartes'),
      h('section.rule-card.carton-rules#carton', { style: { '--rc': '#ff7ac6' } },
        h('div.rule-head', h('span.rule-icon', '🃏'), h('h2', 'Carton ! — le jeu de cartes')),
        h('div.rule-body',
          h('p', 'Choisis « Carton ! » sur l\'accueil pour une partie rapide de 2 à 6 joueurs. Pose une carte de la même ', h('b', 'couleur'), ' ou du même ', h('b', 'symbole'), ' que celle du dessus. Le premier qui vide sa main gagne !'),
          h('p', '🂠 Tu ne pioches ', h('b', 'que si tu ne peux rien poser'), ' : si une de tes cartes est jouable, tu dois jouer. Seule exception : face à un +2 ou un +4, tu peux choisir d\'encaisser la pioche au lieu de contrer.'),
          h('div.ct-rules-cards',
            ...[[{ c: 'r', v: 'skip' }, 'Stop', 'Le joueur suivant passe son tour'], [{ c: 'b', v: 'rev' }, 'Demi-tour', 'Le sens du jeu s\'inverse'], [{ c: 'g', v: '+2' }, '+2', 'Le suivant pioche 2 cartes et passe'], [{ c: 'w', v: 'wild' }, 'Joker', 'Tu choisis la couleur'], [{ c: 'w', v: '+4' }, 'Super Joker +4', 'Tu choisis la couleur, le suivant pioche 4']]
              .map(([c, t, d]) => h('div.ct-rule', cardEl({ id: 0, ...c }, '.tiny'), h('div', h('b', t), h('small', d))))
          ),
          h('p', '📣 Avec ta dernière carte en main, crie ', h('b', '« CARTON ! »'), ' (bouton ou touche C). Si tu oublies, n\'importe quel adversaire peut te prendre : tu pioches 2 cartes.'),
          h('p', '🚫 Ta dernière carte doit être un ', h('b', 'chiffre'), ' : impossible de finir sur un Stop, un Demi-tour, un +2 ou un Joker. Si c\'est tout ce qu\'il te reste, tu dois piocher.'),
          h('p.muted', 'Réglables : cartes au départ, chrono, cumul des +2/+4, fin sur un chiffre obligatoire, pioche jusqu\'à pouvoir jouer, règle du 7 (échange de main) et du 0 (les mains tournent), partie en une manche ou en points.')
        ),
        h('div.rule-tip', '💡 Garde tes Jokers pour la fin : ils se posent sur n\'importe quoi.')
      ),
      h('h2.rl-part', h('span', '🐴'), 'Petits chevaux — la course'),
      h('section.rule-card#chevaux', { style: { '--rc': '#2ecc71' } },
        h('div.rule-head', h('span.rule-icon', '🐴'), h('h2', 'Petits chevaux — la course')),
        h('div.rule-body',
          h('p', 'De 2 à 4 joueurs. Chacun a 4 chevaux dans son écurie. Le premier à ramener ses chevaux au centre gagne (2 par défaut, réglable de 1 à 4).'),
          h('ul',
            h('li', 'Fais un ', h('b', '6'), ' pour sortir un cheval sur ta case de départ (3 essais si aucun cheval n\'est en jeu). Un 6 fait rejouer.'),
            h('li', 'Avance d\'autant de cases que le dé, dans le sens de la flèche.'),
            h('li', '💥 Tomber pile sur un cheval adverse le ', h('b', 'renvoie à son écurie'), ' !'),
            h('li', 'Après un tour complet, monte ton échelle colorée (1 à 6) jusqu\'au centre, au nombre exact.')
          ),
          h('p.muted', 'Réglables : chevaux à ramener, 6 obligatoire pour sortir, échelle classique (1, 2, 3… 6 puis 6 pour le centre), interdiction de doubler, rejouer après une prise.')
        ),
        h('div.rule-tip', '💡 Ne laisse pas un cheval seul juste devant un adversaire : il risque de se faire renvoyer à l\'écurie.')
      ),
      h('h2.rl-part', h('span', '📅'), 'Fin de mois — le jeu de gestion'),
      h('section.rule-card#mois', { style: { '--rc': '#3fa7ff' } },
        h('div.rule-head', h('span.rule-icon', '📅'), h('h2', 'Fin de mois — tiendras-tu jusqu\'à la paye ?')),
        h('div.rule-body',
          h('p', 'De 2 à 6 joueurs. Chacun traverse un mois calendrier, du 1er au 31, en lançant le dé. La partie dure 3 mois (réglable de 1 à 12) : ', h('b', 'le plus riche à la fin (argent + épargne − emprunts) gagne.')),
          h('ul',
            h('li', '✉️ ', h('b', 'Courrier'), ' : factures à régler le jour de paye, amendes (pour la cagnotte), chèques, publicités…'),
            h('li', '🏷️ ', h('b', 'Affaire'), ' : achète un objet (vélo vintage, food truck…), puis revends-le plus cher sur une case 🛍️ ', h('b', 'Acheteur'), '.'),
            h('li', '💶 ', h('b', 'Le 31, c\'est la paye'), ' : tu touches ton salaire, puis tu règles tes factures et les intérêts de tes emprunts.'),
            h('li', '🏦 Plus d\'argent ? La banque te prête automatiquement par tranches de 1 000 €, à rembourser le jour de paye.'),
            h('li', '🐷 ', h('b', 'Épargne'), ' : avant de lancer le dé, dépose de l\'argent sur ton livret (jusqu\'au 20 du mois, ou le jour de paye). Il rapporte des intérêts à chaque paye. Tu peux retirer à tout moment, avec des frais (gratuit le jour de paye). Il te dépanne automatiquement avant tout emprunt.'),
            h('li', '💰 Fais un ', h('b', '6'), ' au dé pour rafler la cagnotte, alimentée par les amendes, coups durs et paris perdus.'),
            h('li', '⚽ Match du dimanche, 🎟️ tombola, 🎂 anniversaire, 🍻 tournée générale, 📦 vide-grenier, 📻 jeu radio : chaque jour réserve sa surprise.')
          ),
          h('p.muted', 'Réglables : durée en mois, argent de départ, salaire, taux des emprunts et de l\'épargne, date limite des dépôts, frais de retrait, cagnotte sur un 6, match du dimanche, tombola, valeur des affaires invendues.')
        ),
        h('div.rule-tip', '💡 Une affaire non revendue ne vaut rien à la fin : pense à garder un acheteur sous le coude pour ton dernier mois.')
      ),
      h('h2.rl-part', h('span', '♠'), 'Poker — Texas Hold\'em'),
      h('section.rule-card#poker', { style: { '--rc': '#16916c' } },
        h('div.rule-head', h('span.rule-icon', '♠'), h('h2', 'Poker — bluffe, relance, fais tapis')),
        h('div.rule-body',
          h('p', 'De 2 à 6 joueurs, chacun avec le même tas de jetons. Chaque joueur reçoit ', h('b', '2 cartes cachées'), ', puis 5 ', h('b', 'cartes communes'), ' sont retournées au milieu : 3 (le flop), puis 1 (le turn), puis 1 (la river). Ta main, ce sont les ', h('b', '5 meilleures cartes'), ' parmi tes 2 cartes et les 5 communes.'),
          h('ul',
            h('li', h('b', 'Les blindes'), ' : à chaque main, les deux joueurs à gauche du donneur (bouton D) misent obligatoirement une petite et une grosse blinde. Elles augmentent au fil de la partie.'),
            h('li', h('b', 'À ton tour'), ' : parler (ne rien miser si personne n\'a misé), suivre (égaler la mise), relancer (miser plus), ou te coucher (abandonner la main).'),
            h('li', h('b', 'Tapis'), ' : tu mises tous tes jetons. Si d\'autres misent plus que toi, un pot secondaire est créé : tu ne peux gagner que ce que tu as couvert.'),
            h('li', h('b', 'Fin de la main'), ' : si tout le monde se couche, le dernier joueur gagne le pot sans montrer ses cartes. Sinon, à l\'abattage, la meilleure main remporte le pot.'),
            h('li', h('b', 'Fin de la partie'), ' : un joueur sans jetons est éliminé. Le dernier en lice gagne (ou le plus gros tapis après le nombre de mains choisi).')
          ),
          h('p', h('b', 'Mode Débutant'), ' : un bouton dans la barre d\'outils de la table. Il affiche ta main, tes chances de gagner, le calcul de la cote du pot, un conseil à chaque décision et l\'explication de chaque étape. Chacun l\'active pour lui-même.'),
          h('h3', 'Classement des mains'),
          handChart(),
          h('p.muted', 'Réglables : jetons de départ, blindes, rythme de montée des blindes, temps par décision, nombre de mains.')
        ),
        h('div.rule-tip', 'Astuce : une relance raconte une histoire. Si tu relances, fais-le avec une vraie main… ou un bluff crédible !')
      ),
      h('h2.rl-part', h('span', '♣'), 'Blackjack — contre la banque'),
      h('section.rule-card#blackjack', { style: { '--rc': '#2d5bd0' } },
        h('div.rule-head', h('span.rule-icon', '♣'), h('h2', 'Blackjack — approche 21 sans le dépasser')),
        h('div.rule-body',
          h('p', 'De 1 à 5 joueurs, chacun contre la banque. Les cartes valent leur chiffre, les figures valent ', h('b', '10'), ', l\'As vaut ', h('b', '1 ou 11'), '. Le but : faire plus que la banque sans dépasser 21.'),
          h('ul',
            h('li', h('b', 'Mise'), ' : au début de chaque manche, choisis ta mise avec les jetons.'),
            h('li', h('b', 'Tirer'), ' : une carte de plus. ', h('b', 'Rester'), ' : tu gardes ta main. ', h('b', 'Doubler'), ' : tu doubles ta mise et reçois une seule carte. ', h('b', 'Séparer'), ' : une paire devient deux mains.'),
            h('li', h('b', 'La banque'), ' retourne sa carte cachée puis tire jusqu\'à 16 et reste à 17. Si elle dépasse 21, toutes les mains encore en jeu gagnent.'),
            h('li', h('b', 'Blackjack'), ' (As + figure ou 10 d\'entrée) : payé 3 pour 2. Gagné : 1 pour 1. Égalité : mise rendue.'),
            h('li', h('b', 'Fin de partie'), ' : après le nombre de manches choisi, le plus riche gagne. Seul, l\'objectif est de finir avec plus de jetons qu\'au départ.')
          ),
          h('p', h('b', 'Aide au calcul'), ' : une option à cocher dans la salle d\'attente (et dans la barre d\'outils). Elle affiche le total de chaque main et de la banque. Chacun l\'active pour lui-même.'),
          h('p.muted', 'Réglables : nombre de manches, jetons de départ, mises minimum et maximum, jeux dans le sabot, paiement du blackjack, la banque tire sur 17 souple.')
        ),
        h('div.rule-tip', 'Astuce : reste à partir de 12 quand la banque montre un 4, 5 ou 6 : c\'est elle qui risque de sauter !')
      ),
      h('section.cta-band',
        h('div', h('h2', 'C\'est parti ?'), h('p', 'Crée une salle et invite tes amis en un clic.')),
        h('a.btn.primary.xl', { href: '/', 'data-link': true }, '🎲 Jouer maintenant')
      ),
      siteFooter()
    )
  );
}

// --------------------------------------------------------------------- admin
async function adminPage() {
  if (!store.user || !store.user.staff) return navigate('/', true);
  const isAdmin = store.user.role === 'admin';
  const tabs = [
    ['overview', '📊', 'Vue d\'ensemble'],
    ['users', '👥', 'Joueurs'],
    ['rooms', '🎲', 'Salles en direct'],
    ['site', '⚙️', 'Paramètres du site'],
    ['announce', '📢', 'Annonce'],
    ['bans', '🔨', 'Bannis'],
    ['audit', '📝', 'Journal'],
  ];
  let tab = location.hash.slice(1) || 'overview';
  if (!tabs.some((t) => t[0] === tab)) tab = 'overview';
  const nav = h('nav.admin-nav');
  const content = h('div.admin-content');

  async function patch(id, body, msg, reload) {
    try {
      await api('/admin/users/' + id, { method: 'PATCH', body });
      toast(msg || 'Modifié ✔', 'success');
      reload && reload();
    } catch (e) {
      toast(e.message, 'error');
    }
  }
  const panel = (title, sub, ...children) => h('div.admin-panel', h('div.admin-panel-head', h('h2', title), sub ? h('p.muted', sub) : null), ...children);

  const views = {
    async overview() {
      const o = await api('/admin/overview');
      const site = await api('/admin/site');
      const st = await api('/stats').catch(() => null);
      const KIND = { poly: ['🎲', 'MyPoly', '#ff8a3d'], cartes: ['🃏', 'Carton !', '#ff5a5f'], chevaux: ['🐴', 'Petits chevaux', '#2ecc71'], mois: ['📅', 'Fin de mois', '#3fa7ff'], poker: ['♠', 'Poker', '#16916c'], blackjack: ['♣', 'Blackjack', '#2d5bd0'] };
      const total = st ? Math.max(1, st.games) : 1;
      return panel('📊 Vue d\'ensemble', 'L\'activité de MyPoly en un coup d\'œil.',
        h('div.kpi-grid',
          kpi('🟢', o.live.online, 'Connectés en ce moment', '#2ecc71'),
          kpi('🎲', `${o.live.playing} / ${o.live.rooms}`, 'Salles en jeu / ouvertes', '#3fa7ff'),
          kpi('👥', o.users, 'Comptes', '#a66bff'),
          kpi('🆕', o.new24, 'Inscrits (24 h)', '#ff8a3d'),
          kpi('🎮', o.games, 'Parties jouées', '#ff5a5f'),
          kpi('📅', o.games24, 'Parties (24 h)', '#ffd166'),
          kpi('👑', o.vips, 'VIP actifs', '#f7b733'),
          kpi('⛔', o.banned, 'Comptes bannis', '#e74c3c')
        ),
        h('div.admin-quick',
          h('div.quick-card' + (site.guestsAllowed ? '.ok' : '.warn'),
            h('b', site.guestsAllowed ? '🙋 Mode invité : activé' : '🔒 Mode invité : désactivé'),
            h('small.muted', site.guestsAllowed ? 'Les visiteurs peuvent jouer sans compte.' : 'Un compte est obligatoire pour jouer.'),
            h('button.btn.sm.ghost', { onclick: () => go('site') }, 'Modifier')
          ),
          h('div.quick-card', h('b', '📢 Prévenir les joueurs'), h('small.muted', 'Avant une mise à jour, par exemple.'), h('button.btn.sm.ghost', { onclick: () => go('announce') }, 'Écrire une annonce'))
        ),
        st ? h('div.adm-split',
          h('div.adm-box',
            h('h3', '🎮 Parties par jeu'),
            ...Object.entries(KIND).map(([k, [ico, name, c]]) => {
              const n = st.byKind[k] || 0;
              return h('div.adm-bar', { style: { '--c': c } }, h('span', ico + ' ' + name), h('div.adm-bar-track', h('i', { style: { width: (n / total) * 100 + '%' } })), h('b', String(n)));
            })
          ),
          h('div.adm-box',
            h('h3', '🔥 Dernières parties'),
            st.recent.length
              ? h('div.adm-recent', st.recent.slice(0, 8).map((g) => h('div', h('span', KIND[g.kind][0]), h('b', g.winner), h('span.muted', ` · ${g.players} joueurs · ${timeAgo(g.at)}`))))
              : h('div.muted', 'Aucune partie terminée pour l\'instant.')
          )
        ) : null
      );
    },
    async users() {
      const search = h('input.input.lg', { placeholder: '🔎 Rechercher un joueur (pseudo, pseudo d\'affichage, e-mail)…' });
      const list = h('div.user-list');
      async function load() {
        const { users } = await api('/admin/users?q=' + encodeURIComponent(search.value));
        list.innerHTML = '';
        if (!users.length) return list.append(h('div.empty', 'Aucun joueur trouvé.'));
        for (const u of users) {
          const roleSel = h('select.input.sm', { disabled: !isAdmin, title: isAdmin ? 'Rôle' : 'Seul un administrateur peut changer les rôles', onchange: (e) => patch(u.id, { role: e.target.value }, 'Rôle modifié', load) },
            [['user', 'Joueur'], ['staff', 'Staff'], ['admin', 'Admin']].map(([v, l]) => h('option', { value: v, selected: u.role === v }, l)));
          list.append(
            h('div.user-row' + (u.banned ? '.banned' : ''),
              h('div.user-id',
                h('a.user-name', { href: '/joueur/' + u.id, 'data-link': true }, u.display_name || u.username),
                h('div.user-sub', '@' + u.username, ' · ', u.email),
                h('div.user-tags',
                  u.role === 'admin' ? h('span.tag.tag-admin', '⚡ ADMIN') : u.role === 'staff' ? h('span.tag.tag-staff', '🛡️ STAFF') : null,
                  u.vip ? h('span.tag.tag-vip', u.vip_until === 0 ? '👑 VIP à vie' : '👑 VIP → ' + new Date(u.vip_until).toLocaleDateString('fr-FR')) : null,
                  u.banned ? h('span.tag.tag-ban', '⛔ BANNI') : null
                )
              ),
              h('div.user-stats', h('b', `${u.wins || 0} / ${u.games || 0}`), h('small.muted', 'victoires / parties'), h('small.muted', u.last_seen ? 'vu ' + timeAgo(u.last_seen) : 'jamais vu')),
              h('div.user-actions',
                roleSel,
                h('button.btn.sm.gold', { onclick: () => patch(u.id, { vip: 30 }, '+30 jours VIP', load) }, '+30 j VIP'),
                h('button.btn.sm.gold', { onclick: () => patch(u.id, { vip: 'lifetime' }, 'VIP à vie', load) }, 'VIP ♾️'),
                u.vip ? h('button.btn.sm.ghost', { onclick: () => patch(u.id, { vip: false }, 'VIP retiré', load) }, 'Retirer VIP') : null,
                u.banned
                  ? h('button.btn.sm.ghost', { onclick: () => patch(u.id, { banned: false }, 'Débanni', load) }, 'Débannir')
                  : h('button.btn.sm.danger', { onclick: async () => {
                      const reason = prompt('Raison du bannissement ?');
                      if (reason !== null) patch(u.id, { banned: true, reason }, 'Joueur banni', load);
                    } }, 'Bannir'),
                u.display_name ? h('button.btn.sm.ghost', { onclick: () => confirm(`Réinitialiser le pseudo d'affichage « ${u.display_name} » ?`) && patch(u.id, { resetDisplayName: true }, 'Pseudo réinitialisé', load) }, 'Réinit. pseudo') : null,
                isAdmin ? h('button.btn.sm.ghost', { onclick: () => confirm(`Réinitialiser les stats de ${u.username} ?`) && patch(u.id, { resetStats: true }, 'Stats réinitialisées', load) }, 'Reset stats') : null
              )
            )
          );
        }
      }
      let t;
      search.addEventListener('input', () => {
        clearTimeout(t);
        t = setTimeout(load, 300);
      });
      load();
      setTimeout(() => search.focus(), 50);
      return panel('👥 Joueurs', 'Rôles, VIP, bannissements et modération des pseudos.', search, list);
    },
    async rooms() {
      const list = h('div.admin-rooms2');
      async function load() {
        const { rooms } = await api('/admin/rooms');
        list.innerHTML = '';
        if (!rooms.length) return list.append(h('div.empty', '😴 Aucune salle active pour le moment.'));
        for (const r of rooms) {
          list.append(
            h('div.room-card' + (r.state === 'playing' ? '.live' : ''),
              h('div.room-card-top', h('div.room-card-name', r.name), h('span.room-card-state', r.state === 'playing' ? `🔴 En jeu · tour ${r.round}` : r.state === 'ended' ? '🏁 Terminée' : '🟢 Salon')),
              h('div.room-card-meta', h('span', '🔑 ' + r.code), h('span', r.isPublic ? '🌍 Publique' : '🔒 Privée'), h('span', '⏱️ ' + timeAgo(r.createdAt))),
              h('div.room-players', r.players.map((p) => h('span.chip' + (p.connected ? '' : '.off'), (p.isBot ? '🤖 ' : '') + p.name))),
              h('div.room-card-bottom',
                h('a.btn.ghost.sm', { href: '/r/' + r.code, 'data-link': true }, '👁 Observer'),
                h('button.btn.danger.sm', { onclick: async () => {
                  if (!confirm('Fermer la salle ' + r.code + ' ? Les joueurs seront renvoyés à l\'accueil.')) return;
                  await api('/admin/rooms/' + r.code, { method: 'DELETE' });
                  toast('Salle fermée', 'success');
                  load();
                } }, 'Fermer la salle')
              )
            )
          );
        }
      }
      load();
      return panel('🎲 Salles en direct', 'Observer une partie ou fermer une salle problématique.', h('button.btn.ghost.sm.refresh', { onclick: load }, '↻ Actualiser'), list);
    },
    async site() {
      const cfg = await api('/admin/site');
      const toggle = h('input', { type: 'checkbox', checked: cfg.guestsAllowed, disabled: !isAdmin });
      toggle.addEventListener('change', async () => {
        const want = toggle.checked;
        if (!want && !confirm('Désactiver le mode invité ?\n\nLes visiteurs sans compte ne pourront plus créer ni rejoindre de salle (les parties en cours continuent).')) {
          toggle.checked = true;
          return;
        }
        try {
          const next = await api('/admin/site', { method: 'PATCH', body: { guestsAllowed: want } });
          store.site = next;
          toast(next.guestsAllowed ? '🙋 Mode invité activé' : '🔒 Mode invité désactivé : un compte est désormais obligatoire', 'success');
          render();
        } catch (e) {
          toggle.checked = !want;
          toast(e.message, 'error');
        }
      });
      return panel('⚙️ Paramètres du site', isAdmin ? 'Ces réglages s\'appliquent à tout MyPoly.' : 'Seuls les administrateurs peuvent modifier ces réglages.',
        h('div.setting-card' + (cfg.guestsAllowed ? '' : '.off'),
          h('div.setting-icon', cfg.guestsAllowed ? '🙋' : '🔒'),
          h('div.setting-text',
            h('b', 'Mode invité'),
            h('p.muted', cfg.guestsAllowed
              ? 'Activé : n\'importe qui peut jouer avec un simple pseudo, sans créer de compte.'
              : 'Désactivé : les joueurs doivent s\'inscrire et se connecter pour créer ou rejoindre une salle.')
          ),
          h('label.switch.big', toggle, h('span.slider'))
        )
      );
    },
    async announce() {
      const txt = h('textarea.input', { rows: 3, maxlength: 300, placeholder: 'Ex. : « Mise à jour dans 5 minutes, terminez vos parties ! »' });
      const count = h('small.muted', '0 / 300');
      txt.addEventListener('input', () => (count.textContent = `${txt.value.length} / 300`));
      return panel('📢 Annonce globale', 'Le message s\'affiche immédiatement chez tous les joueurs connectés.',
        txt,
        h('div.announce-foot', count, h('button.btn.primary', { onclick: async () => {
          if (!txt.value.trim()) return toast('Écris un message.', 'warn');
          try {
            await api('/admin/announce', { body: { text: txt.value } });
            txt.value = '';
            count.textContent = '0 / 300';
            toast('📢 Annonce envoyée', 'success');
          } catch (e) {
            toast(e.message, 'error');
          }
        } }, '📢 Diffuser'))
      );
    },
    async bans() {
      const { bans } = await api('/admin/bans');
      // Un bannissement = une personne (compte et navigateurs bannis ensemble)
      const seen = new Set();
      const list = bans.filter((b) => {
        const k = b.created_at + '|' + b.name;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
      return panel('🔨 Joueurs bannis', 'Bannissements prononcés depuis une partie (comptes et invités). Les comptes bannis apparaissent aussi dans « Joueurs ».',
        list.length
          ? h('div.audit-list', list.map((b) => h('div.audit-item',
              h('span.audit-when', timeAgo(b.created_at)),
              h('span.audit-what', b.key.startsWith('u:') ? '👤 Compte' : '🙋 Invité'),
              h('span.audit-who', h('b', b.name || '?'), ` · ${b.until ? 'jusqu\'au ' + new Date(b.until).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : 'définitif'}`, b.reason ? ` · ${b.reason}` : '', b.by_name ? ` · par ${b.by_name}` : ''),
              isAdmin ? h('button.btn.sm.ghost', { onclick: async () => {
                try {
                  await api('/admin/bans/' + encodeURIComponent(b.key), { method: 'DELETE' });
                  toast(`✅ ${b.name} débanni(e)`, 'success');
                  render();
                } catch (e) {
                  toast(e.message, 'error');
                }
              } }, '✅ Débannir') : null
            )))
          : h('div.empty', 'Personne n\'est banni pour le moment.')
      );
    },
    async audit() {
      const { entries } = await api('/admin/audit');
      const labels = { role: '🎭 Rôle', vip: '👑 VIP', ban: '⛔ Bannissement', unban: '✅ Débannissement', reset_stats: '🧹 Reset stats', grant_badge: '🎖️ Badge', close_room: '🚪 Salle fermée', announce: '📢 Annonce', game_kick: '⛔ Expulsion en partie', game_ban: '🔨 Bannissement en partie', game_give: '🎁 Don en partie', game_revive: '✨ Résurrection', display_name: '✏️ Pseudo', reset_display_name: '✏️ Pseudo réinitialisé', site_settings: '⚙️ Paramètres du site' };
      return panel('📝 Journal d\'audit', 'Les 100 dernières actions du staff et changements sensibles.',
        entries.length
          ? h('div.audit-list', entries.map((e) => h('div.audit-item',
              h('span.audit-when', timeAgo(e.created_at)),
              h('span.audit-what', labels[e.action] || e.action),
              h('span.audit-who', h('b', e.actor || '?'), e.target ? ' → ' + e.target : ''),
              e.details ? h('code.audit-details', e.details) : null
            )))
          : h('div.empty', 'Rien pour le moment.')
      );
    },
  };

  function go(name) {
    tab = name;
    history.replaceState({}, '', '/admin#' + name);
    render();
  }
  async function render() {
    nav.innerHTML = '';
    nav.append(...tabs.map(([k, i, l]) => h('button.admin-tab' + (k === tab ? '.active' : ''), { onclick: () => go(k) }, h('span', i), l)));
    content.innerHTML = '';
    content.append(h('div.admin-loading', h('div.spinner')));
    try {
      const el = await views[tab]();
      content.innerHTML = '';
      content.append(el);
    } catch (e) {
      content.innerHTML = '';
      content.append(h('div.empty', '😵 ' + e.message));
    }
  }
  app.append(
    h('div.page.admin2',
      h('header.admin-head', h('div', h('span.eyebrow', isAdmin ? '⚡ Administrateur' : '🛡️ Staff'), h('h1', 'Administration')), h('a.btn.ghost', { href: '/', 'data-link': true }, '← Retour au jeu')),
      h('div.admin-layout', nav, content)
    )
  );
  render();
}
function kpi(icon, value, label, color) {
  return h('div.kpi', { style: { '--kc': color } }, h('span.kpi-icon', icon), h('div', h('b', String(value)), h('small', label)));
}

// ------------------------------------------------------------------ démarrage
async function boot() {
  try {
    const [meta, me, site] = await Promise.all([api('/meta'), api('/auth/me'), api('/site').catch(() => ({ guestsAllowed: true }))]);
    store.meta = meta;
    store.user = me.user;
    store.site = site;
  } catch (e) {
    app.innerHTML = '<div class="page center"><h1>😵</h1><p>Impossible de joindre le serveur. Réessayez dans un instant.</p></div>';
    return;
  }
  // Modération : quelqu'un a été expulsé (toute la salle) ou banni (tout le site)
  on('mod:notice', (d) => {
    Sound.play(d.ban ? 'crumble' : 'error');
    toast(d.text, 'warn', 9000);
  });
  // Je suis banni : message clair, et on cesse de se reconnecter
  on('banned', (d) => {
    try {
      store.socket && store.socket.io.opts && (store.socket.io.opts.reconnection = false);
      store.socket && store.socket.disconnect();
    } catch {}
    navigate('/');
    modal({ title: '🔨 Vous avez été banni(e)', dismissable: false, buttons: [],
      body: h('div', h('p', `Vous ne pouvez plus jouer sur MyPoly ${d.text || ''}${d.by ? ` (décision de ${d.by})` : ''}.`), d.reason ? h('p', h('b', 'Motif : '), d.reason) : null) });
  });
  on('announce', (d) => {
    Sound.play('turn');
    modal({ title: '📢 Annonce', body: h('p', d.text) });
  });
  const banner = $('#conn-banner');
  on('disconnect', () => (banner.hidden = false));
  on('connect', () => (banner.hidden = true));
  connectSocket();
  route();
}
boot();

export { esc, updateNav };
