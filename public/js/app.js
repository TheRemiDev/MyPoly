// Point d'entrée : routeur, navigation et pages hors partie
import { $, h, api, toast, modal, roleTags, nameClass, fmt, timeAgo, duration, storage, esc } from './util.js';
import { store, connectSocket, on, emit, guestName, savedSettings } from './store.js';
import * as Sound from './sound.js';
import { renderRoom } from './game.js';

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

// --------------------------------------------------------------- navigation
function updateNav() {
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
  async function create(bots) {
    if (!saveGuest()) return;
    await new Promise((r) => (store.socket.connected ? r() : store.socket.once('connect', r)));
    // Les règles enregistrées par le joueur sont appliquées à chaque nouvelle salle
    const res = await emit('room:create', { settings: savedSettings() || {}, bots });
    if (res.needAccount) return navigate('/register');
    if (res.error) return toast(res.error, 'error');
    navigate('/r/' + res.code);
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
      roomsBox.append(h('div.rooms-empty', h('div', '🌙'), h('b', 'Aucune salle publique pour le moment'), h('span.muted', 'Crée la tienne et rends-la publique dans les règles !')));
    }
    for (const r of res.rooms) {
      const full = r.players >= r.max;
      const dots = Array.from({ length: r.max }, (_, k) => h('i' + (k < r.players ? '.on' : '')));
      roomsBox.append(
        h('div.room-card' + (r.state !== 'lobby' ? '.live' : ''),
          h('div.room-card-top',
            h('div.room-card-name', r.name, r.hostVip ? h('span.tag.tag-vip', '👑 VIP') : null),
            h('span.room-card-state', r.state === 'lobby' ? '🟢 En attente' : '🔴 En jeu')
          ),
          h('div.room-card-meta',
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
  const who = u
    ? h('div.player-chip',
        h('span.avatar.lg', { style: { '--c': u.color } }, u.pawn),
        h('div.player-chip-info',
          h('div.player-chip-name', 'Salut ', h('b.' + (nameClass(u) || 'plain'), u.name), ' 👋', ...roleTags(u, { level: false })),
          h('div.player-chip-xp', h('span', `Niveau ${u.level}`), h('div.xp-bar', h('div', { style: { width: Math.min(100, ((u.xp - xpCur) / (xpNext - xpCur)) * 100) + '%' } }))),
          h('a.small', { href: '/joueur/' + u.id, 'data-link': true }, 'Voir mon profil →')
        )
      )
    : needAccount
      ? h('div.account-needed',
          h('div', h('b', '🔒 Un compte est nécessaire pour jouer'), h('p.muted', 'C\'est gratuit et ça prend 20 secondes. Tes victoires, badges et statistiques seront enregistrés.')),
          h('div.btn-row', h('a.btn.primary', { href: '/register', 'data-link': true }, 'Créer un compte'), h('a.btn.ghost', { href: '/login', 'data-link': true }, 'Se connecter'))
        )
      : h('div.guest-box',
          h('label', 'Choisis ton pseudo'),
          nameInput,
          h('small.muted', 'Tu joues en invité. ', h('a', { href: '/register', 'data-link': true }, 'Crée un compte'), ' pour garder tes victoires, badges et statistiques.')
        );

  const playSection = h('section.play2#jouer',
    h('div.play-main.card',
      who,
      h('div.play-tiles',
        h('button.play-tile.t-create', { onclick: () => create(0), disabled: needAccount },
          h('span.play-tile-icon', '✨'), h('b', 'Salle privée'), h('small', 'Invite tes amis avec un code ou un lien')),
        h('button.play-tile.t-bots', { onclick: () => create(3), disabled: needAccount },
          h('span.play-tile-icon', '🤖'), h('b', 'Partie rapide'), h('small', 'Contre 3 bots, tout de suite')),
        h('div.play-tile.t-join',
          h('span.play-tile-icon', '🔑'), h('b', 'Rejoindre une salle'),
          h('div.join-inline', codeInput, h('button.btn.accent', { onclick: () => join(), disabled: needAccount }, 'Go'))
        )
      )
    ),
    h('div.rooms2.card',
      h('div.card-head', h('h2', '🌍 Salles publiques'), h('button.icon-btn', { onclick: refresh, title: 'Actualiser' }, '↻')),
      roomsBox
    )
  );

  app.append(
    h('div.page.home2',
      h('section.hero2',
        h('div.hero2-text',
          h('span.eyebrow', '🎲 Jeu de plateau multijoueur · 100 % gratuit'),
          h('h1.hero2-title', 'Achète le monde.', h('br'), h('span', 'Ruine tes amis.')),
          h('p.hero2-sub', 'Villes du monde entier, maisons qui poussent en 3D, rachats sans pitié et monopoles explosifs. Crée une salle, envoie le code à tes potes, c\'est parti !'),
          h('div.hero2-cta',
            h('button.btn.primary.xl', { onclick: () => playSection.scrollIntoView({ behavior: 'smooth', block: 'start' }) }, '▶ Jouer maintenant'),
            h('a.btn.ghost.xl', { href: '/rules', 'data-link': true }, '📖 Comment jouer')
          ),
          h('div.hero2-live',
            h('span.live-chip', h('i.live-dot'), onlineEl, ' en ligne'),
            h('span.live-chip', '🎲 ', playingEl, ' partie(s) publique(s) en cours'),
            h('span.live-chip', '👥 2 à 4 joueurs')
          )
        ),
        heroBoard()
      ),
      playSection,
      h('section.steps',
        h('h2.section-title', 'Comment ça marche ?'),
        h('div.steps-grid',
          step('1', '✨', 'Crée ta salle', 'Un clic, et tu obtiens un code à partager. Choisis les règles : argent, chrono, monopoles…'),
          step('2', '👥', 'Invite tes amis', 'Envoie le lien. Complète avec des bots si vous n\'êtes pas assez nombreux.'),
          step('3', '🏆', 'Deviens magnat', 'Achète, construis, rachète… et ruine tout le monde ou décroche un monopole !')
        )
      ),
      h('section.features2',
        h('h2.section-title', 'Pourquoi tu vas adorer'),
        h('div.features2-grid',
          feature('🏗️', 'Construis en 3D', 'Les maisons tombent du ciel, les hôtels sortent de terre, tout s\'anime sous tes yeux.', '#ff8a3d'),
          feature('🤝', 'Rachète tout', 'Tu tombes chez un adversaire ? Paie… puis rachète-lui sa ville.', '#a66bff'),
          feature('👑', '4 façons de gagner', 'Faillite, triple monopole, monopole de ligne ou balnéaire.', '#ffd166'),
          feature('✈️', 'Voyage en avion', 'Depuis l\'Aéroport, saute en parachute sur la case de ton choix.', '#3fa7ff'),
          feature('⚙️', 'Tes règles', 'Argent, chrono, rachat, monopoles… et enregistre tes réglages préférés.', '#2ecc71'),
          feature('🎲', '100 % aléatoire', 'Dés et cartes tirés côté serveur. Rien n\'est truqué, rien n\'est scripté.', '#ff5a5f')
        )
      ),
      h('section.cta-band',
        h('div', h('h2', 'Prêt à devenir le plus grand magnat ?'), h('p', 'Une partie dure 15 à 30 minutes. Sans téléchargement, sur ordinateur comme sur mobile.')),
        h('button.btn.primary.xl', { onclick: () => playSection.scrollIntoView({ behavior: 'smooth', block: 'start' }) }, '🚀 Lancer une partie')
      ),
      siteFooter()
    )
  );
  return () => {
    clearInterval(timer);
    off();
  };
}
function step(n, icon, title, text) {
  return h('div.step', h('div.step-num', n), h('div.step-icon', icon), h('h3', title), h('p', text));
}
function feature(icon, title, text, color = '#3fa7ff') {
  return h('div.feature2', { style: { '--fc': color } }, h('div.feature2-icon', icon), h('h3', title), h('p', text));
}
function siteFooter() {
  return h('footer.site-footer',
    h('div.logo', 'My', h('span', 'Poly')),
    h('nav', h('a', { href: '/rules', 'data-link': true }, 'Règles'), h('a', { href: '/leaderboard', 'data-link': true }, 'Classement'), store.user ? h('a', { href: '/settings', 'data-link': true }, 'Mon compte') : h('a', { href: '/register', 'data-link': true }, 'Créer un compte')),
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
  const tabs = [['rating', 'Classement'], ['wins', 'Victoires'], ['winrate', '% victoires'], ['games', 'Parties'], ['best', 'Record fortune'], ['xp', 'Expérience']];
  let sort = 'rating';
  const table = h('div.lb-table');
  const tabBox = h('div.tabs');
  async function load() {
    tabBox.innerHTML = '';
    for (const [k, l] of tabs) tabBox.append(h('button.tab' + (k === sort ? '.active' : ''), { onclick: () => ((sort = k), load()) }, l));
    table.innerHTML = '<div class="muted">Chargement…</div>';
    const { players } = await api('/leaderboard?sort=' + sort);
    table.innerHTML = '';
    if (!players.length) return table.append(h('div.empty', 'Aucun joueur classé pour le moment. Soyez le premier !'));
    players.forEach((p, i) => {
      const val = { rating: p.rating + ' pts', wins: p.wins + ' victoires', winrate: p.winrate + ' %', games: p.games + ' parties', best: fmt(p.best_networth), xp: p.xp + ' XP' }[sort];
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
  app.append(h('div.page', h('h1.page-title', '🏆 Classement'), tabBox, table));
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
  const { user: u, stats: s, badges, history } = data;
  const mine = store.user && store.user.id === u.id;
  const owned = new Map(badges.map((b) => [b.badge, b.earned_at]));
  const xpCur = (u.level - 1) ** 2 * 100;
  const xpNext = u.level ** 2 * 100;
  const pct = Math.min(100, ((u.xp - xpCur) / (xpNext - xpCur)) * 100);
  const winrate = s.games ? Math.round((100 * s.wins) / s.games) : 0;
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
    h('div.stat-grid',
      stat('🏅', s.rating ?? 1000, 'Points de classement'),
      stat('🎮', s.games || 0, 'Parties jouées'),
      stat('🏆', s.wins || 0, 'Victoires'),
      stat('📈', winrate + ' %', 'Taux de victoire'),
      stat('🔥', s.best_streak || 0, 'Meilleure série'),
      stat('💎', fmt(s.best_networth || 0), 'Record de fortune'),
      stat('🥊', s.knockouts || 0, 'Faillites provoquées'),
      stat('🏠', s.properties_bought || 0, 'Propriétés achetées'),
      stat('🏗️', s.houses_built || 0, 'Bâtiments construits'),
      stat('🦈', s.takeovers || 0, 'Rachats'),
      stat('💰', fmt(s.rent_earned || 0), 'Loyers encaissés'),
      stat('⏱️', duration(s.play_seconds || 0), 'Temps de jeu')
    ),
    h('div.card', h('h2', `🎖️ Badges (${badges.length}/${store.meta.badges.length})`),
      h('div.badge-grid', store.meta.badges.map((b) => {
        const at = owned.get(b.id);
        return h('div.badge.tier-' + b.tier + (at ? '' : '.locked'), { title: b.desc + (at ? ` — obtenu ${timeAgo(at)}` : '') }, h('div.badge-icon', b.icon), h('div.badge-name', b.name), h('div.badge-desc', b.desc));
      }))
    ),
    h('div.card', h('h2', '📜 Dernières parties'),
      history.length
        ? h('div.history', history.map((g) =>
            h('div.history-row.' + (g.rank === 1 ? 'won' : 'lost'),
              h('div.history-rank', g.rank === 1 ? '🏆' : '#' + g.rank),
              h('div.history-main', h('div', g.players.map((p) => p.name).join(' · ')), h('small.muted', `${timeAgo(g.ended_at)} · ${duration(g.duration)} · ${g.rounds} tours · ${winLabel(g.win_type)}`)),
              h('div.history-delta.' + (g.rating_delta >= 0 ? 'pos' : 'neg'), (g.rating_delta >= 0 ? '+' : '') + g.rating_delta)
            )))
        : h('div.empty', 'Aucune partie jouée pour l\'instant.')
    )
  );
}
function stat(icon, value, label) {
  return h('div.stat', h('div.stat-icon', icon), h('div.stat-value', String(value)), h('div.stat-label', label));
}
export function winLabel(t) {
  return { last: 'Faillite des adversaires', triple: 'Triple monopole', line: 'Monopole de ligne', resort: 'Monopole balnéaire', time: 'Temps écoulé', rounds: 'Tours écoulés' }[t] || t || '—';
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
      h('button.btn.primary.lg', { onclick: save }, 'Enregistrer')
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
      <p>Pas assez d'argent ? Le jeu te propose <b>automatiquement la meilleure vente</b> pour payer en perdant le moins possible. Tu peux modifier la sélection, puis tout payer en un clic.</p>
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
      h('header.page-hero',
        h('span.eyebrow', '📖 Règles du jeu'),
        h('h1', 'Deviens le magnat le plus riche'),
        h('p.muted', 'Tout ce qu\'il faut savoir en 2 minutes. Les règles marquées « réglables » se modifient dans le salon de la partie.'),
        h('nav.chips', ...sections.map((x) => h('a.chip', { href: '#' + x.id, onclick: (e) => { e.preventDefault(); document.getElementById(x.id).scrollIntoView({ behavior: 'smooth' }); } }, x.icon + ' ' + x.title)))
      ),
      h('section.win-grid',
        h('h2.section-title', '🏆 4 façons de gagner'),
        h('div.win-cards', wins.map(([i, t, d]) => h('div.win-card', h('div.win-icon', i), h('b', t), h('small', d))))
      ),
      ...sections.map((x) => h('section.rule-card#' + x.id, { style: { '--rc': x.color } },
        h('div.rule-head', h('span.rule-icon', x.icon), h('h2', x.title)),
        h('div.rule-body', { html: x.body }),
        x.tip ? h('div.rule-tip', '💡 ' + x.tip) : null
      )),
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
        )
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
    async audit() {
      const { entries } = await api('/admin/audit');
      const labels = { role: '🎭 Rôle', vip: '👑 VIP', ban: '⛔ Bannissement', unban: '✅ Débannissement', reset_stats: '🧹 Reset stats', grant_badge: '🎖️ Badge', close_room: '🚪 Salle fermée', announce: '📢 Annonce', display_name: '✏️ Pseudo', reset_display_name: '✏️ Pseudo réinitialisé', site_settings: '⚙️ Paramètres du site' };
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
