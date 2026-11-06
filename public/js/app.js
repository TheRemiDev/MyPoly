// Point d'entrée : routeur, navigation et pages hors partie
import { $, h, api, toast, modal, roleTags, nameClass, fmt, timeAgo, duration, storage, esc } from './util.js';
import { store, connectSocket, on, emit, guestName } from './store.js';
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
      h('a.nav-profile', { href: '/profile/' + encodeURIComponent(u.username), 'data-link': true },
        h('span.avatar.sm', { style: { '--c': u.color } }, u.pawn),
        h('span.' + (nameClass({ ...u, role: u.role }) || 'plain'), u.username),
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
async function homePage() {
  const roomsBox = h('div.room-list', h('div.muted', 'Chargement…'));
  const online = h('span.online-count', '…');
  const nameInput = h('input.input', { placeholder: 'Votre pseudo', maxlength: 16, value: guestName() });
  const codeInput = h('input.input.code-input', { placeholder: 'CODE', maxlength: 6, autocomplete: 'off' });

  function saveGuest() {
    if (store.user) return true;
    const n = nameInput.value.trim();
    if (n.length < 2) {
      toast('Choisissez un pseudo (2 caractères minimum) ou connectez-vous.', 'warn');
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
    const res = await emit('room:create', { settings: {}, bots });
    if (res.error) return toast(res.error, 'error');
    navigate('/r/' + res.code);
  }
  async function join(code) {
    code = (code || codeInput.value).trim().toUpperCase();
    if (code.length !== 6) return toast('Le code de salle contient 6 caractères.', 'warn');
    if (!saveGuest()) return;
    navigate('/r/' + code);
  }
  codeInput.addEventListener('keydown', (e) => e.key === 'Enter' && join());
  codeInput.addEventListener('input', () => (codeInput.value = codeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, '')));

  async function refresh() {
    const res = await emit('rooms:list');
    if (res.error) return;
    online.textContent = `${res.online} joueur${res.online > 1 ? 's' : ''} en ligne`;
    roomsBox.innerHTML = '';
    if (!res.rooms.length) roomsBox.append(h('div.empty', '🌙 Aucune salle publique pour le moment. Créez la vôtre !'));
    for (const r of res.rooms) {
      roomsBox.append(
        h('div.room-item',
          h('div.room-item-main',
            h('div.room-item-name', r.name, r.hostVip ? h('span.tag.tag-vip', '👑 VIP') : null),
            h('div.room-item-meta', `${fmt(r.settings.startMoney)} · ${r.settings.turnTime ? r.settings.turnTime + 's/tour' : 'sans chrono'} · ${r.settings.takeover ? 'rachat' : 'sans rachat'}`)
          ),
          h('div.room-item-players', `${r.players}/${r.max}`),
          r.state === 'lobby'
            ? h('button.btn.primary.sm', { onclick: () => join(r.code), disabled: r.players >= r.max }, r.players >= r.max ? 'Pleine' : 'Rejoindre')
            : h('button.btn.ghost.sm', { onclick: () => join(r.code) }, '👁 Regarder')
        )
      );
    }
  }
  const timer = setInterval(refresh, 5000);
  const off = on('connect', refresh);
  if (store.socket?.connected) refresh();

  app.append(
    h('div.page.home',
      h('section.hero',
        h('div.hero-text',
          h('div.hero-badge', '🎲 100% gratuit · sans téléchargement'),
          h('h1.logo-big', 'My', h('span', 'Poly')),
          h('p.hero-sub', 'Le jeu de plateau de magnats, en ligne et entre amis. Achetez des villes du monde entier, construisez des hôtels, rachetez les propriétés de vos adversaires et visez le triple monopole !'),
          h('div.hero-stats', online)
        ),
        h('div.hero-art', h('div.hero-dice', h('div.die-face', '⚄'), h('div.die-face.b', '⚂')), h('div.hero-board', ...Array.from({ length: 12 }, (_, i) => h('i', { style: { '--i': i } }))))
      ),
      h('section.play-grid',
        h('div.card.play-card',
          h('h2', '🎮 Jouer maintenant'),
          store.user
            ? h('p.muted', 'Connecté en tant que ', h('b', store.user.username), '. Vos victoires et badges sont enregistrés !')
            : h('div.field', h('label', 'Pseudo invité'), nameInput, h('small.muted', 'Créez un compte pour enregistrer vos statistiques et badges.')),
          h('div.btn-row',
            h('button.btn.primary.lg', { onclick: () => create(0) }, '✨ Créer une salle privée'),
            h('button.btn.secondary.lg', { onclick: () => create(3) }, '🤖 Partie rapide vs bots')
          ),
          h('div.join-row', codeInput, h('button.btn.accent', { onclick: () => join() }, 'Rejoindre'))
        ),
        h('div.card.rooms-card', h('div.card-head', h('h2', '🌍 Salles publiques'), h('button.btn.ghost.sm', { onclick: refresh }, '↻')), roomsBox)
      ),
      h('section.features',
        feature('🏗️', 'Construisez vite', 'Achetez un terrain et posez jusqu\'à 3 maisons d\'un coup, puis un hôtel imprenable.'),
        feature('🤝', 'Rachetez tout', 'Tombez chez un adversaire, payez le loyer… puis rachetez-lui sa ville !'),
        feature('🎉', 'Festival', 'Organisez le Festival sur votre propriété pour multiplier son loyer.'),
        feature('🏆', '4 façons de gagner', 'Faillite des adversaires, triple monopole, monopole de ligne ou monopole balnéaire.'),
        feature('⚙️', 'Vos règles', 'Argent de départ, chrono, rachat, monopoles… tout est configurable.'),
        feature('🎲', '100% aléatoire', 'Dés et cartes tirés côté serveur par un générateur cryptographique. Rien n\'est scripté.')
      )
    )
  );
  return () => {
    clearInterval(timer);
    off();
  };
}
function feature(icon, title, text) {
  return h('div.feature', h('div.feature-icon', icon), h('h3', title), h('p', text));
}

// ------------------------------------------------------------ authentification
function authPage(mode) {
  if (store.user) return navigate('/', true);
  const isLogin = mode === 'login';
  const err = h('div.form-error');
  const fields = isLogin
    ? [['login', 'Pseudo ou e-mail', 'text', 'username'], ['password', 'Mot de passe', 'password', 'current-password']]
    : [['username', 'Pseudo', 'text', 'username'], ['email', 'E-mail', 'email', 'email'], ['password', 'Mot de passe (8 caractères min.)', 'password', 'new-password']];
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
        toast(isLogin ? `Bon retour, ${res.user.username} !` : `Bienvenue sur MyPoly, ${res.user.username} ! 🎉`, 'success');
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
        h('a.lb-row' + (i < 3 ? '.top' + (i + 1) : ''), { href: '/profile/' + encodeURIComponent(p.username), 'data-link': true },
          h('div.lb-rank', i < 3 ? ['🥇', '🥈', '🥉'][i] : '#' + (i + 1)),
          h('span.avatar', { style: { '--c': p.color } }, p.pawn),
          h('div.lb-name', h('span.' + (nameClass(p) || 'plain'), p.username), ...roleTags(p)),
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
async function profilePage(username) {
  const box = h('div.page.profile', h('div.muted', 'Chargement…'));
  app.append(box);
  let data;
  try {
    data = await api('/profile/' + encodeURIComponent(username));
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
        h('h1', h('span.' + (nameClass(u) || 'plain'), u.username), ...roleTags(u, { level: false })),
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
  const cur = h('input.input', { type: 'password', autocomplete: 'current-password', placeholder: 'Mot de passe actuel' });
  const next = h('input.input', { type: 'password', autocomplete: 'new-password', placeholder: 'Nouveau mot de passe' });
  async function save() {
    try {
      const body = { pawn, color, bio: bio.value };
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
      h('div.card', h('div.settings-preview', preview, h('div', h('b', u.username), h('div', ...roleTags(u, { level: false })))),
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
  app.append(
    h('div.page.narrow.rules',
      h('h1.page-title', '📖 Règles de MyPoly'),
      h('div.card', { html: `
        <h3>🎯 Objectif</h3>
        <p>Devenez le magnat le plus puissant ! Vous gagnez si tous vos adversaires font faillite, ou instantanément grâce à un monopole (si activé) :</p>
        <ul>
          <li><b>Triple monopole</b> : posséder 3 pays complets.</li>
          <li><b>Monopole de ligne</b> : posséder toutes les propriétés d'un même côté du plateau.</li>
          <li><b>Monopole balnéaire</b> : posséder les 4 stations balnéaires.</li>
        </ul>
        <h3>🎲 Le tour de jeu</h3>
        <p>Lancez les deux dés (tirage 100 % aléatoire effectué par le serveur). Un double vous fait rejouer, mais 3 doubles d'affilée vous envoient sur l'Île déserte.</p>
        <h3>🏙️ Villes & constructions</h3>
        <p>Sur une ville libre, achetez le terrain et construisez jusqu'à 3 maisons immédiatement. Revenez sur votre ville pour l'améliorer : l'hôtel (niveau 4) ne peut être construit que sur une ville ayant déjà 3 maisons. Posséder un pays entier double les loyers.</p>
        <h3>🤝 Rachat</h3>
        <p>Après avoir payé le loyer chez un adversaire, vous pouvez lui racheter sa ville (prix = ${s.takeoverMult} × sa valeur). Les hôtels ne peuvent pas être rachetés.</p>
        <h3>🏖️ Stations balnéaires</h3>
        <p>Leur loyer augmente avec le nombre de stations que vous possédez (50K, 110K, 240K, 500K).</p>
        <h3>🎉 Festival</h3>
        <p>Choisissez une de vos propriétés : son loyer est doublé. Y organiser à nouveau le Festival augmente le multiplicateur (jusqu'à ×5).</p>
        <h3>✈️ Aéroport</h3>
        <p>Au tour suivant, envolez-vous vers la case de votre choix (moyennant un billet), ou lancez les dés normalement.</p>
        <h3>🏝️ Île déserte</h3>
        <p>Pour partir : faites un double, payez l'amende, utilisez un gilet de sauvetage… ou attendez 3 tours.</p>
        <h3>💸 Dettes & faillite</h3>
        <p>Si vous ne pouvez pas payer, vendez des propriétés (50 % de leur valeur). Sans ressources suffisantes, c'est la faillite !</p>
        <h3>⏱️ Chrono</h3>
        <p>Si le temps de réflexion est écoulé, une action par défaut est jouée. Un joueur déconnecté est joué automatiquement jusqu'à son retour.</p>` })
    )
  );
}

// --------------------------------------------------------------------- admin
async function adminPage() {
  if (!store.user || !store.user.staff) return navigate('/', true);
  const isAdmin = store.user.role === 'admin';
  const overview = h('div.stat-grid');
  const usersBox = h('div.admin-users');
  const roomsBox = h('div.admin-rooms');
  const auditBox = h('div.admin-audit');
  const search = h('input.input', { placeholder: 'Rechercher un joueur (pseudo, e-mail)…' });
  const annText = h('input.input', { placeholder: 'Message à diffuser à tous les joueurs connectés…', maxlength: 300 });

  async function loadOverview() {
    const o = await api('/admin/overview');
    overview.innerHTML = '';
    overview.append(stat('👥', o.users, 'Comptes'), stat('🆕', o.new24, 'Inscrits (24h)'), stat('👑', o.vips, 'VIP actifs'), stat('⛔', o.banned, 'Bannis'), stat('🎮', o.games, 'Parties jouées'), stat('📅', o.games24, 'Parties (24h)'), stat('🟢', o.live.online, 'Connexions'), stat('🎲', `${o.live.playing}/${o.live.rooms}`, 'Salles en jeu'));
  }
  async function patch(id, body, msg) {
    try {
      await api('/admin/users/' + id, { method: 'PATCH', body });
      toast(msg || 'Modifié ✔', 'success');
      loadUsers();
    } catch (e) {
      toast(e.message, 'error');
    }
  }
  async function loadUsers() {
    const { users } = await api('/admin/users?q=' + encodeURIComponent(search.value));
    usersBox.innerHTML = '';
    const table = h('table.table', h('thead', h('tr', ['Joueur', 'E-mail', 'Rôle', 'VIP', 'Parties', 'Vu', 'Actions'].map((t) => h('th', t)))));
    const body = h('tbody');
    for (const u of users) {
      const roleSel = h('select.input.sm', { disabled: !isAdmin, onchange: (e) => patch(u.id, { role: e.target.value }, 'Rôle modifié') }, ['user', 'staff', 'admin'].map((r) => h('option', { value: r, selected: u.role === r }, r)));
      body.append(
        h('tr' + (u.banned ? '.banned' : ''),
          h('td', h('a', { href: '/profile/' + encodeURIComponent(u.username), 'data-link': true }, u.username), u.banned ? h('span.tag.tag-ban', 'BANNI') : null),
          h('td.muted', u.email),
          h('td', roleSel),
          h('td', u.vip ? (u.vip_until === 0 ? '♾️ À vie' : new Date(u.vip_until).toLocaleDateString('fr-FR')) : '—'),
          h('td', `${u.wins || 0}/${u.games || 0}`),
          h('td.muted', u.last_seen ? timeAgo(u.last_seen) : '—'),
          h('td.actions',
            h('button.btn.sm.gold', { onclick: () => patch(u.id, { vip: 30 }, '+30 jours VIP') }, '+30j VIP'),
            h('button.btn.sm.gold', { onclick: () => patch(u.id, { vip: 'lifetime' }, 'VIP à vie') }, 'VIP ♾️'),
            u.vip ? h('button.btn.sm.ghost', { onclick: () => patch(u.id, { vip: false }, 'VIP retiré') }, 'Retirer VIP') : null,
            u.banned
              ? h('button.btn.sm.ghost', { onclick: () => patch(u.id, { banned: false }, 'Débanni') }, 'Débannir')
              : h('button.btn.sm.danger', { onclick: async () => {
                  const reason = prompt('Raison du bannissement ?');
                  if (reason !== null) patch(u.id, { banned: true, reason }, 'Joueur banni');
                } }, 'Bannir'),
            isAdmin ? h('button.btn.sm.ghost', { onclick: () => confirm(`Réinitialiser les stats de ${u.username} ?`) && patch(u.id, { resetStats: true }, 'Stats réinitialisées') }, 'Reset stats') : null
          )
        )
      );
    }
    table.append(body);
    usersBox.append(h('div.table-wrap', table));
  }
  async function loadRooms() {
    const { rooms } = await api('/admin/rooms');
    roomsBox.innerHTML = '';
    if (!rooms.length) return roomsBox.append(h('div.empty', 'Aucune salle active.'));
    for (const r of rooms)
      roomsBox.append(
        h('div.room-item',
          h('div.room-item-main', h('div.room-item-name', `${r.code} · ${r.name}`), h('div.room-item-meta', `${r.state}${r.round ? ' · tour ' + r.round : ''} · ${r.players.map((p) => p.name + (p.connected ? '' : ' (hors ligne)')).join(', ')}`)),
          h('a.btn.ghost.sm', { href: '/r/' + r.code, 'data-link': true }, '👁'),
          h('button.btn.danger.sm', { onclick: async () => { if (confirm('Fermer la salle ' + r.code + ' ?')) { await api('/admin/rooms/' + r.code, { method: 'DELETE' }); loadRooms(); } } }, 'Fermer')
        )
      );
  }
  async function loadAudit() {
    const { entries } = await api('/admin/audit');
    auditBox.innerHTML = '';
    for (const e of entries) auditBox.append(h('div.audit-row', h('span.muted', timeAgo(e.created_at)), ` ${e.actor || '?'} → ${e.action} ${e.target || ''} `, h('span.muted', e.details || '')));
  }
  let t;
  search.addEventListener('input', () => {
    clearTimeout(t);
    t = setTimeout(loadUsers, 300);
  });
  app.append(
    h('div.page.admin',
      h('h1.page-title', '🛡️ Panneau d\'administration'),
      overview,
      h('div.card', h('h2', '📢 Annonce globale'), h('div.join-row', annText, h('button.btn.primary', { onclick: async () => { try { await api('/admin/announce', { body: { text: annText.value } }); annText.value = ''; toast('Annonce envoyée', 'success'); } catch (e) { toast(e.message, 'error'); } } }, 'Diffuser'))),
      h('div.card', h('h2', '👥 Joueurs'), search, usersBox),
      h('div.card', h('div.card-head', h('h2', '🎲 Salles actives'), h('button.btn.ghost.sm', { onclick: loadRooms }, '↻')), roomsBox),
      h('div.card', h('h2', '📝 Journal d\'audit'), auditBox)
    )
  );
  loadOverview();
  loadUsers();
  loadRooms();
  loadAudit();
}

// ------------------------------------------------------------------ démarrage
async function boot() {
  try {
    const [meta, me] = await Promise.all([api('/meta'), api('/auth/me')]);
    store.meta = meta;
    store.user = me.user;
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
