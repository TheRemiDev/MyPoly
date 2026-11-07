// Utilitaires partagés de l'interface

// Protection globale : append()/prepend()/replaceChildren() natifs convertissent null,
// undefined et false en texte (« null » affiché à l'écran). Ici, ces valeurs sont
// simplement ignorées, comme le fait déjà h(). Ce module est chargé avant tous les autres.
for (const proto of [Element.prototype, DocumentFragment.prototype]) {
  for (const method of ['append', 'prepend', 'replaceChildren']) {
    const native = proto[method];
    if (!native || native.__mpSafe) continue;
    const safe = function (...nodes) {
      return native.apply(this, nodes.filter((n) => n !== null && n !== undefined && n !== false));
    };
    safe.__mpSafe = true;
    proto[method] = safe;
  }
}
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/** Création d'éléments : h('div.card#id', {attrs}, ...enfants) */
export function h(tag, attrs, ...children) {
  const m = tag.match(/^([a-z0-9-]+)?((?:[.#][\w-]+)*)$/i);
  const el = document.createElement((m && m[1]) || 'div');
  if (m && m[2]) {
    for (const part of m[2].match(/[.#][\w-]+/g)) {
      if (part[0] === '.') el.classList.add(part.slice(1));
      else el.id = part.slice(1);
    }
  }
  if (attrs && (typeof attrs !== 'object' || attrs instanceof Node || Array.isArray(attrs))) {
    children.unshift(attrs);
    attrs = null;
  }
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'style' && typeof v === 'object') {
        for (const [sk, sv] of Object.entries(v)) {
          if (sk.startsWith('--')) el.style.setProperty(sk, sv);
          else el.style[sk] = sv;
        }
      }
      else if (k === 'class') el.className += ' ' + v;
      else if (k === 'html') el.innerHTML = v;
      else if (k in el && typeof v !== 'string') el[k] = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
  }
  append(el, children);
  return el;
}
function append(el, children) {
  for (const c of children) {
    if (c == null || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

/** Formatage monétaire : les montants sont en milliers (K). */
export function fmt(k) {
  const neg = k < 0;
  k = Math.abs(Math.round(k));
  let s;
  if (k >= 1000) s = (k / 1000).toFixed(k >= 100000 ? 0 : 2).replace(/\.?0+$/, '') + 'M';
  else s = k + 'K';
  return (neg ? '-' : '') + s;
}

export function timeAgo(ts) {
  const d = (Date.now() - ts) / 1000;
  if (d < 60) return 'à l\'instant';
  if (d < 3600) return `il y a ${Math.floor(d / 60)} min`;
  if (d < 86400) return `il y a ${Math.floor(d / 3600)} h`;
  if (d < 86400 * 30) return `il y a ${Math.floor(d / 86400)} j`;
  return new Date(ts).toLocaleDateString('fr-FR');
}
export function duration(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m >= 60 ? `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}` : `${m}min ${String(s).padStart(2, '0')}s`;
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ------------------------------------------------------------------ toasts
export function toast(msg, type = 'info', ms = 3500) {
  let box = $('#toasts');
  const t = h('div.toast.' + type, msg);
  box.append(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => {
    t.classList.remove('show');
    setTimeout(() => t.remove(), 400);
  }, ms);
}

// ------------------------------------------------------------------ modals
/**
 * Ouvre une fenêtre modale. buttons: [{label, class, value, onClick}]
 * Retourne une promesse résolue avec la valeur du bouton cliqué (ou null).
 */
export function modal({ title, body, buttons = [{ label: 'OK', value: true, class: 'primary' }], dismissable = true, className = '' }) {
  return new Promise((resolve) => {
    const root = $('#modals');
    const close = (v) => {
      overlay.classList.remove('show');
      setTimeout(() => overlay.remove(), 250);
      document.removeEventListener('keydown', onKey);
      resolve(v);
    };
    const onKey = (e) => e.key === 'Escape' && dismissable && close(null);
    const overlay = h(
      'div.modal-overlay',
      { onclick: (e) => e.target === overlay && dismissable && close(null) },
      h(
        'div.modal.' + (className || 'default'),
        title && h('div.modal-title', title),
        h('div.modal-body', body),
        buttons.length &&
          h(
            'div.modal-actions',
            buttons.map((b) =>
              h('button.btn.' + (b.class || 'ghost'), {
                onclick: async () => {
                  if (b.onClick) {
                    const r = await b.onClick();
                    if (r === false) return;
                  }
                  close(b.value);
                },
              }, b.label)
            )
          )
      )
    );
    overlay._close = close;
    root.append(overlay);
    document.addEventListener('keydown', onKey);
    requestAnimationFrame(() => overlay.classList.add('show'));
  });
}
export function closeModals() {
  for (const o of $$('#modals .modal-overlay')) o._close && o._close(null);
}

// ------------------------------------------------------------------ badges
/** Étiquettes affichées à côté d'un pseudo (VIP, STAFF, ADMIN, BOT, niveau). */
export function roleTags(p, { level = true } = {}) {
  const tags = [];
  if (p.role === 'admin') tags.push(h('span.tag.tag-admin', { title: 'Administrateur' }, '⚡ ADMIN'));
  else if (p.role === 'staff') tags.push(h('span.tag.tag-staff', { title: 'Membre du staff' }, '🛡️ STAFF'));
  if (p.vip) tags.push(h('span.tag.tag-vip', { title: 'Membre VIP' }, '👑 VIP'));
  if (p.isBot || p.role === 'bot') tags.push(h('span.tag.tag-bot', 'BOT'));
  if (p.role === 'guest') tags.push(h('span.tag.tag-guest', 'INVITÉ'));
  if (level && p.level) tags.push(h('span.tag.tag-level', { title: 'Niveau' }, 'Nv ' + p.level));
  return tags;
}
export function nameClass(p) {
  return p.vip ? 'name-vip' : p.role === 'admin' || p.role === 'staff' ? 'name-staff' : '';
}

// ------------------------------------------------------------------ API
export async function api(path, opts = {}) {
  const res = await fetch('/api' + path, {
    method: opts.method || (opts.body ? 'POST' : 'GET'),
    headers: opts.body ? { 'Content-Type': 'application/json' } : {},
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    credentials: 'same-origin',
  });
  let data = {};
  try {
    data = await res.json();
  } catch {}
  if (!res.ok) throw new Error(data.error || 'Erreur ' + res.status);
  return data;
}

export function storage(key, value) {
  try {
    if (value === undefined) return localStorage.getItem('mp_' + key);
    if (value === null) localStorage.removeItem('mp_' + key);
    else localStorage.setItem('mp_' + key, value);
  } catch {
    return null;
  }
}

// ------------------------------------------------------------------ confettis
export function confetti(duration = 3500) {
  const c = h('canvas.confetti');
  document.body.append(c);
  const ctx = c.getContext('2d');
  const resize = () => ((c.width = innerWidth), (c.height = innerHeight));
  resize();
  const colors = ['#ffd700', '#ff5a5f', '#3fa7ff', '#2ecc71', '#a66bff', '#ff7ac6'];
  const parts = Array.from({ length: 180 }, () => ({
    x: Math.random() * c.width,
    y: -20 - Math.random() * c.height * 0.5,
    vx: (Math.random() - 0.5) * 4,
    vy: 2 + Math.random() * 4,
    r: 4 + Math.random() * 6,
    a: Math.random() * Math.PI,
    va: (Math.random() - 0.5) * 0.3,
    color: colors[(Math.random() * colors.length) | 0],
  }));
  const start = performance.now();
  (function frame(now) {
    ctx.clearRect(0, 0, c.width, c.height);
    for (const p of parts) {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.05;
      p.a += p.va;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.a);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.r / 2, -p.r / 4, p.r, p.r / 2);
      ctx.restore();
    }
    if (now - start < duration) requestAnimationFrame(frame);
    else c.remove();
  })(start);
}
