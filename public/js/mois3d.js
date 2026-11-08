// ============================================================================
//  MyPoly — Fin de mois : plateau 3D (WebGL / Three.js)
//  Même plateau que MyPoly : anneau de 32 cases en relief (le mois, du départ
//  au jour de paye), cadre bois et liseré doré, et au centre de vrais objets
//  3D : boîte aux lettres, éphéméride, paquet d'affaires, banque et bocal de
//  la cagnotte. Pions, dé et pièces animés.
// ============================================================================
import * as THREE from '/vendor/three/three.module.min.js';
import { Horse3D, BOARD_TOP } from './horses3d.js';
import { drawLogo } from './logo.js';

const FONT = "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'Noto Color Emoji', 'Apple Color Emoji', 'Segoe UI Emoji', sans-serif";
const S17 = 10 / 17; // pas de la grille de référence de Horse3D
const SIZES = [1.5, 1, 1, 1, 1, 1, 1, 1, 1.5];
const HALF = 5;
const TILE_H = 0.14;
const TOP = BOARD_TOP + TILE_H;
const PX = Math.round(Math.min(512, Math.max(300, (Math.min(screen.width, screen.height) * Math.min(window.devicePixelRatio || 1, 3)) / 3.6)));
// Objets du centre
const MAILBOX = [-2.25, -0.35];
const CALENDAR = [0, -0.05];
const DECK = [2.3, -0.3];
const BANK = [-2.15, 1.85];
const JAR = [0.05, 1.95];
const DIE = [2.2, 2.15];
const PIGGY = [-1.0, 2.5];

/** Apparence et description des cases (partagées avec le plateau 2D). */
export const SPACES = {
  start: { icon: '🚩', label: 'DÉPART', color: '#22b45e', name: 'Départ', desc: 'Le premier jour du mois. Bonne chance !' },
  mail: { icon: '✉️', label: 'COURRIER', color: '#3fa7ff', name: 'Courrier', desc: 'Ouvrez votre courrier : factures, amendes, chèques, publicités…' },
  deal: { icon: '🏷️', label: 'AFFAIRE', color: '#f59e0b', name: 'Affaire', desc: 'Une affaire à acheter… pour la revendre plus cher à un acheteur.' },
  buyer: { icon: '🛍️', label: 'ACHETEUR', color: '#22b866', name: 'Acheteur', desc: 'Revendez une de vos affaires à son prix de revente.' },
  bet: { icon: '⚽', label: 'MATCH', color: '#ef4b5a', name: 'Match du dimanche', desc: 'Pariez 500 € : 4, 5 ou 6 au dé pour gagner 500 €.' },
  birthday: { icon: '🎂', label: 'ANNIVERSAIRE', color: '#ec4899', name: 'Anniversaire', desc: 'C\'est votre fête : chaque joueur vous offre 100 €.' },
  tombola: { icon: '🎟️', label: 'TOMBOLA', color: '#8b5cf6', name: 'Tombola', desc: 'Chacun achète un ticket de 100 €, le dé désigne le gagnant.' },
  bonus: { icon: '⏱️', label: 'HEURES SUP', color: '#14b8a6', name: 'Heures sup', desc: 'Des heures supplémentaires : +500 €.' },
  garage: { icon: '📦', label: 'VIDE-GRENIER', color: '#d97706', name: 'Vide-grenier', desc: 'Une affaire au hasard pour 100 à 600 € (selon le dé).' },
  contest: { icon: '📻', label: 'JEU RADIO', color: '#0ea5e9', name: 'Jeu radio', desc: 'Faites 5 ou 6 au dé pour gagner 1 000 €.' },
  round: { icon: '🍻', label: 'TOURNÉE', color: '#f97316', name: 'Tournée générale', desc: 'Vous offrez 100 € à chaque joueur.' },
  tough: { icon: '💥', label: 'COUP DUR', color: '#dc2626', name: 'Coup dur', desc: 'Dégât des eaux : 100 à 600 € pour la cagnotte.' },
  payday: { icon: '💶', label: 'PAYE', color: '#16a34a', name: 'Jour de paye', desc: 'Salaire, puis factures et intérêts des emprunts.' },
};
export const WEEKDAYS = ['LUN', 'MAR', 'MER', 'JEU', 'VEN', 'SAM', 'DIM'];
const WEEKDAY_FULL = ['LUNDI', 'MARDI', 'MERCREDI', 'JEUDI', 'VENDREDI', 'SAMEDI', 'DIMANCHE'];
/** Jour de la semaine d'une case (le 1er est un mardi : la case départ est le lundi). */
export const weekday = (d) => d % 7;

const ease = {
  out: (t) => 1 - Math.pow(1 - t, 3),
  inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  back: (t) => 1 + 2.70158 * Math.pow(t - 1, 3) + 1.70158 * Math.pow(t - 1, 2),
  bounce: (t) => {
    const n1 = 7.5625, d1 = 2.75;
    if (t < 1 / d1) return n1 * t * t;
    if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
    if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
    return n1 * (t -= 2.625 / d1) * t + 0.984375;
  },
};

// ------------------------------------------------------------------ géométrie
function gridPos(i) {
  if (i === 0) return [9, 9];
  if (i < 8) return [9, 9 - i];
  if (i === 8) return [9, 1];
  if (i < 16) return [9 - (i - 8), 1];
  if (i === 16) return [1, 1];
  if (i < 24) return [1, i - 16 + 1];
  if (i === 24) return [1, 9];
  return [i - 24 + 1, 9];
}
function span(k) {
  let a = -HALF;
  for (let j = 1; j < k; j++) a += SIZES[j - 1];
  return [a, a + SIZES[k - 1]];
}
/** Rectangle d'une case (x : gauche→droite, z : loin→près). */
export function cellBox(i) {
  const [r, c] = gridPos(i);
  const [x0, x1] = span(c);
  const [z0, z1] = span(r);
  return { x0, x1, z0, z1, cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, w: x1 - x0, d: z1 - z0 };
}
/** Côté intérieur de la case (bandeau du jour). */
function bandSide(i) {
  if (i % 8 === 0) return null;
  return ['top', 'right', 'bottom', 'left'][Math.floor(i / 8)];
}
/** Conversion vers la grille de référence de Horse3D (ligne, colonne fractionnaires). */
function rcAt(x, z) {
  return [(z + 5) / S17 - 0.5, (x + 5) / S17 - 0.5];
}

// ------------------------------------------------------------------ dessin 2D
function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.round(w);
  c.height = Math.round(h);
  return c;
}
function rr(g, x, y, w, h, r) {
  g.beginPath();
  g.roundRect(x, y, w, h, r);
}
function shade(hex, amt) {
  const c = new THREE.Color(hex);
  const hsl = {};
  c.getHSL(hsl);
  c.setHSL(hsl.h, hsl.s, Math.max(0, Math.min(1, hsl.l + amt)));
  return '#' + c.getHexString();
}
function emoji(g, e, cx, cy, size) {
  g.save();
  g.font = `${size}px ${FONT}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.shadowColor = 'rgba(0,0,0,.25)';
  g.shadowBlur = size * 0.12;
  g.shadowOffsetY = size * 0.06;
  g.fillText(e, cx, cy);
  g.restore();
}
/** Texte centré qui rétrécit pour tenir dans la largeur donnée. */
function fitText(g, text, cx, cy, maxW, size, color, weight = 900) {
  let s = size;
  g.font = `${weight} ${s}px ${FONT}`;
  while (g.measureText(text).width > maxW && s > 8) {
    s -= 1;
    g.font = `${weight} ${s}px ${FONT}`;
  }
  g.fillStyle = color;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, cx, cy);
  return s;
}
function pill(g, text, cx, cy, size, bg, fg = '#fff') {
  g.font = `900 ${size}px ${FONT}`;
  const w = g.measureText(text).width + size * 1.1;
  const h = size * 1.45;
  g.save();
  g.shadowColor = 'rgba(0,0,0,.3)';
  g.shadowOffsetY = size * 0.12;
  g.shadowBlur = size * 0.2;
  g.fillStyle = bg;
  rr(g, cx - w / 2, cy - h / 2, w, h, h / 2);
  g.fill();
  g.restore();
  g.fillStyle = fg;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, cx, cy + size * 0.04);
}
const money = (n) => Math.round(n).toLocaleString('fr-FR').replace(/ | /g, ' ') + ' €';

/** Titre et icône propres à chaque jour : aucune case ne se ressemble. */
export const DAY_ART = {
  1: { title: 'Facteur\ndu matin', icon: '✉️' },
  2: { title: 'Petite\nannonce', icon: '📰' },
  3: { title: 'Double\ncourrier', icon: '📬' },
  4: { title: 'Joyeux\nanniversaire', icon: '🎂' },
  5: { title: 'Bon plan', icon: '💡' },
  6: { title: 'Le derby', icon: '⚽' },
  7: { title: 'Le collec-\ntionneur', icon: '🧐' },
  9: { title: 'Lettre\nrecommandée', icon: '📨' },
  10: { title: 'Brocante', icon: '🏺' },
  11: { title: 'Heures\nsup', icon: '⏱️' },
  12: { title: 'Boîte\npleine !', icon: '📮' },
  13: { title: 'Match\namical', icon: '🏟️' },
  14: { title: 'L\'antiquaire', icon: '🕰️' },
  15: { title: 'Avis de\npassage', icon: '📪' },
  17: { title: 'Vente aux\nenchères', icon: '🔨' },
  18: { title: 'Jeu radio', icon: '📻' },
  19: { title: 'Carte\npostale', icon: '💌' },
  20: { title: 'La coupe', icon: '🏆' },
  21: { title: 'Client\npressé', icon: '🏃' },
  22: { title: 'Lettre du\nnotaire', icon: '📜' },
  23: { title: 'Soldes', icon: '🛒' },
  25: { title: 'Dégât\ndes eaux', icon: '🚿' },
  26: { title: 'Grosse\nenveloppe', icon: '📩' },
  27: { title: 'Grande\nfinale', icon: '🥅' },
  28: { title: 'Le\nrevendeur', icon: '🤝' },
  29: { title: 'Marché\naux puces', icon: '🧺' },
  30: { title: 'Dernier\ncourrier', icon: '📭' },
  31: { title: 'Jour de\npaye', icon: '💶' },
};
const TAGS = { deal: 'À SAISIR', buyer: 'REVENTE', bet: 'PARI 500 €', birthday: '+100 € / JOUEUR', bonus: '+500 €', contest: '5 OU 6 : 1 000 €', tough: '−100 À 600 €' };

/** Petit générateur pseudo-aléatoire déterministe (motifs identiques à chaque chargement). */
function seeded(n) {
  let x = (n * 9301 + 49297) % 233280;
  return () => (x = (x * 9301 + 49297) % 233280) / 233280;
}
/** Fond illustré selon le thème de la case. */
function paintTheme(g, W, H, k, color, day) {
  const rnd = seeded(day + 7);
  g.save();
  rr(g, 0, 0, W, H, 26);
  g.clip();
  const base = g.createLinearGradient(0, 0, W * 0.4, H);
  base.addColorStop(0, shade(color, 0.02));
  base.addColorStop(1, shade(color, -0.2));
  g.fillStyle = base;
  g.fillRect(0, 0, W, H);
  const m = Math.min(W, H);
  if (k === 'mail') {
    // Bordure « par avion » et enveloppes en filigrane
    const t = m * 0.06;
    g.save();
    g.beginPath();
    g.rect(0, 0, W, H);
    g.rect(t, t, W - 2 * t, H - 2 * t);
    g.clip('evenodd');
    for (let x = -H, n = 0; x < W + H; x += t * 1.2, n++) {
      g.fillStyle = ['#e23b4b', '#ffffff', '#2f6fd6', '#ffffff'][n % 4];
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x + t * 1.2, 0);
      g.lineTo(x + t * 1.2 + H, H);
      g.lineTo(x + H, H);
      g.closePath();
      g.fill();
    }
    g.restore();
    g.strokeStyle = 'rgba(255,255,255,.1)';
    g.lineWidth = m * 0.015;
    for (let k2 = 0; k2 < 4; k2++) {
      const ex = rnd() * W;
      const ey = rnd() * H;
      const ew = m * 0.3;
      g.strokeRect(ex, ey, ew, ew * 0.62);
      g.beginPath();
      g.moveTo(ex, ey);
      g.lineTo(ex + ew / 2, ey + ew * 0.35);
      g.lineTo(ex + ew, ey);
      g.stroke();
    }
  } else if (k === 'deal') {
    // Rayons de soleil (« bonne affaire »)
    g.translate(W / 2, H * 0.42);
    for (let a = 0; a < 16; a++) {
      g.fillStyle = a % 2 ? 'rgba(255,255,255,.1)' : 'rgba(255,230,150,.08)';
      g.beginPath();
      g.moveTo(0, 0);
      g.arc(0, 0, Math.max(W, H), (a / 16) * Math.PI * 2, ((a + 1) / 16) * Math.PI * 2);
      g.closePath();
      g.fill();
    }
    g.setTransform(1, 0, 0, 1, 0, 0);
  } else if (k === 'buyer') {
    // Losanges façon vitrine de boutique
    g.strokeStyle = 'rgba(255,255,255,.08)';
    g.lineWidth = 3;
    const st = m * 0.18;
    for (let x = -H; x < W + H; x += st) {
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x + H, H);
      g.moveTo(x, H);
      g.lineTo(x + H, 0);
      g.stroke();
    }
    g.fillStyle = 'rgba(255,255,255,.12)';
    g.fillRect(0, 0, W, m * 0.05);
  } else if (k === 'bet') {
    // Pelouse de stade
    g.fillStyle = '#2e9e4f';
    g.fillRect(0, 0, W, H);
    const horiz = W > H;
    const n = 6;
    for (let s2 = 0; s2 < n; s2++) {
      g.fillStyle = s2 % 2 ? 'rgba(255,255,255,.07)' : 'rgba(0,0,0,.06)';
      if (horiz) g.fillRect((W / n) * s2, 0, W / n, H);
      else g.fillRect(0, (H / n) * s2, W, H / n);
    }
    g.strokeStyle = 'rgba(255,255,255,.45)';
    g.lineWidth = m * 0.02;
    g.strokeRect(m * 0.06, m * 0.06, W - m * 0.12, H - m * 0.12);
    g.beginPath();
    if (horiz) {
      g.moveTo(W / 2, m * 0.06);
      g.lineTo(W / 2, H - m * 0.06);
    } else {
      g.moveTo(m * 0.06, H / 2);
      g.lineTo(W - m * 0.06, H / 2);
    }
    g.stroke();
    g.beginPath();
    g.arc(W / 2, H / 2, m * 0.2, 0, Math.PI * 2);
    g.stroke();
  } else if (k === 'birthday') {
    // Confettis
    const cols = ['#ffd166', '#7ef0ac', '#6cc0ff', '#ffffff', '#ff9ad5'];
    for (let c = 0; c < 40; c++) {
      g.save();
      g.translate(rnd() * W, rnd() * H);
      g.rotate(rnd() * Math.PI);
      g.fillStyle = cols[c % cols.length];
      g.globalAlpha = 0.55;
      g.fillRect(-m * 0.02, -m * 0.008, m * 0.04, m * 0.016);
      g.restore();
    }
  } else if (k === 'bonus') {
    // Graduations d'horloge
    g.strokeStyle = 'rgba(255,255,255,.14)';
    g.lineWidth = m * 0.02;
    for (let a = 0; a < 12; a++) {
      const ang = (a / 12) * Math.PI * 2;
      g.beginPath();
      g.moveTo(W / 2 + Math.cos(ang) * m * 0.42, H * 0.42 + Math.sin(ang) * m * 0.42);
      g.lineTo(W / 2 + Math.cos(ang) * m * 0.5, H * 0.42 + Math.sin(ang) * m * 0.5);
      g.stroke();
    }
  } else if (k === 'contest') {
    // Ondes radio
    g.strokeStyle = 'rgba(255,255,255,.13)';
    g.lineWidth = m * 0.025;
    for (let r = 1; r <= 6; r++) {
      g.beginPath();
      g.arc(W / 2, H * 0.4, r * m * 0.12, Math.PI * 1.15, Math.PI * 1.85);
      g.stroke();
      g.beginPath();
      g.arc(W / 2, H * 0.4, r * m * 0.12, Math.PI * 0.15, Math.PI * 0.85);
      g.stroke();
    }
  } else if (k === 'tough') {
    // Gouttes d'eau et fissure
    g.fillStyle = 'rgba(160,210,255,.22)';
    for (let d = 0; d < 14; d++) {
      const x = rnd() * W;
      const y = rnd() * H;
      const r = m * (0.02 + rnd() * 0.03);
      g.beginPath();
      g.moveTo(x, y - r * 2);
      g.quadraticCurveTo(x + r, y, x, y + r);
      g.quadraticCurveTo(x - r, y, x, y - r * 2);
      g.fill();
    }
    g.strokeStyle = 'rgba(0,0,0,.25)';
    g.lineWidth = m * 0.015;
    g.beginPath();
    let x = W * 0.1;
    let y = H * 0.15;
    g.moveTo(x, y);
    for (let s2 = 0; s2 < 7; s2++) {
      x += W * 0.12;
      y += (rnd() - 0.3) * H * 0.16;
      g.lineTo(x, y);
    }
    g.stroke();
  } else if (k === 'payday') {
    // Billets de banque en motif
    for (let b = 0; b < 7; b++) {
      g.save();
      g.translate(rnd() * W, rnd() * H);
      g.rotate((rnd() - 0.5) * 1.2);
      g.fillStyle = 'rgba(190,255,200,.16)';
      rr(g, -m * 0.2, -m * 0.1, m * 0.4, m * 0.2, m * 0.02);
      g.fill();
      g.strokeStyle = 'rgba(255,255,255,.2)';
      g.lineWidth = 3;
      g.beginPath();
      g.arc(0, 0, m * 0.055, 0, Math.PI * 2);
      g.stroke();
      g.restore();
    }
    const gl = g.createLinearGradient(0, 0, W, H);
    gl.addColorStop(0, 'rgba(255,215,100,.25)');
    gl.addColorStop(1, 'rgba(255,215,100,0)');
    g.fillStyle = gl;
    g.fillRect(0, 0, W, H);
  }
  // Vignettage doux et liseré intérieur
  const vg = g.createRadialGradient(W / 2, H / 2, m * 0.3, W / 2, H / 2, Math.max(W, H) * 0.75);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,.25)');
  g.fillStyle = vg;
  g.fillRect(0, 0, W, H);
  g.restore();
  g.strokeStyle = 'rgba(255,255,255,.28)';
  g.lineWidth = 5;
  rr(g, 5, 5, W - 10, H - 10, 22);
  g.stroke();
}
/** Médaillon rond (fond clair, anneau coloré) avec l'icône. */
function medallion(g, icon, cx, cy, r, color) {
  g.save();
  g.shadowColor = 'rgba(0,0,0,.35)';
  g.shadowBlur = r * 0.25;
  g.shadowOffsetY = r * 0.1;
  const rg = g.createRadialGradient(cx - r * 0.3, cy - r * 0.35, r * 0.1, cx, cy, r);
  rg.addColorStop(0, '#ffffff');
  rg.addColorStop(1, '#efe6d2');
  g.fillStyle = rg;
  g.beginPath();
  g.arc(cx, cy, r, 0, Math.PI * 2);
  g.fill();
  g.restore();
  g.lineWidth = r * 0.12;
  g.strokeStyle = shade(color, -0.15);
  g.beginPath();
  g.arc(cx, cy, r * 0.94, 0, Math.PI * 2);
  g.stroke();
  emoji(g, icon, cx, cy + r * 0.04, r * 1.12);
}
/** Titre sur une ou deux lignes, blanc avec ombre portée. */
function titleBlock(g, lines, cx, cy, maxW, size) {
  g.save();
  g.shadowColor = 'rgba(0,0,0,.45)';
  g.shadowBlur = size * 0.2;
  g.shadowOffsetY = size * 0.08;
  const lh = size * 1.08;
  const y0 = cy - ((lines.length - 1) * lh) / 2;
  lines.forEach((t, k) => fitText(g, t.toUpperCase(), cx, y0 + k * lh, maxW, size, '#fff'));
  g.restore();
}

export class Month3D extends Horse3D {
  constructor(container, cb = {}) {
    super(container, cb);
    if (location.hostname === 'localhost') window.__m3 = this;
    this.tiles = {};
    this.props = [];
    this.coinGeo = new THREE.CylinderGeometry(0.09, 0.09, 0.025, 20);
    this.coinMat = new THREE.MeshStandardMaterial({ color: 0xffc94a, metalness: 0.9, roughness: 0.25, emissive: 0x5a3a00, emissiveIntensity: 0.35 });
    this.buildFrame();
  }

  /** Le plateau MyPoly a un feutre uni sous l'art du centre. */
  buildTable() {
    super.buildTable();
  }

  // ============================================================== plateau
  /** days = [{k, n}…] (32 cases) */
  buildBoard(days) {
    const g = this.boardGroup;
    while (g.children.length) g.remove(g.children[0]);
    this.tiles = {};
    this.props = [];
    this.days = days;
    this.buildCenter();
    days.forEach((sp, i) => this.buildTile(sp, i));
    this.buildCornerProps();
    this.buildMailbox();
    this.buildCalendar();
    this.buildDeck();
    this.buildBank();
    this.buildJar();
    this.buildPiggy();
  }

  // --------------------------------------------------------------- cases
  buildTile(sp, i) {
    const b = cellBox(i);
    const gap = 0.05;
    const w = b.w - gap;
    const d = b.d - gap;
    const grp = new THREE.Group();
    grp.position.set(b.cx, BOARD_TOP, b.cz);
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, TILE_H, d), new THREE.MeshStandardMaterial({ color: shade((SPACES[sp.k] || SPACES.start).color, -0.3), roughness: 0.6 }));
    body.position.y = TILE_H / 2;
    body.castShadow = body.receiveShadow = true;
    const canvas = makeCanvas(b.w * PX, b.d * PX);
    this.drawFace(canvas.getContext('2d'), canvas.width, canvas.height, i, sp);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = this.maxAniso;
    const face = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55, emissive: 0xffffff, emissiveIntensity: 0 }));
    face.rotation.x = -Math.PI / 2;
    face.position.y = TILE_H + 0.002;
    face.receiveShadow = true;
    face.userData.horse = 'cell:' + i;
    grp.add(body, face);
    this.boardGroup.add(grp);
    this.tiles[i] = { group: grp, face, box: b };
  }

  /** Face d'une case, dans le style des cases de MyPoly. */
  drawFace(g, W, H, i, sp) {
    const st = SPACES[sp.k] || SPACES.start;
    const side = bandSide(i);
    const wd = weekday(i);
    const special = sp.k === 'payday';
    // Angles : grand dégradé lumineux
    if (i % 8 === 0) {
      const grd = g.createRadialGradient(W / 2, H * 0.36, 10, W / 2, H / 2, Math.max(W, H) * 0.75);
      grd.addColorStop(0, shade(st.color, 0.25));
      grd.addColorStop(0.6, shade(st.color, -0.02));
      grd.addColorStop(1, shade(st.color, -0.22));
      g.fillStyle = grd;
      rr(g, 0, 0, W, H, 26);
      g.fill();
    }

    // Angles : grande illustration
    if (i % 8 === 0) {
      const m = Math.min(W, H);
      g.save();
      g.globalAlpha = 0.18;
      g.strokeStyle = '#fff';
      g.lineWidth = m * 0.02;
      for (let k = 1; k <= 3; k++) {
        g.beginPath();
        g.arc(W / 2, H * 0.33, m * 0.1 * k, 0, Math.PI * 2);
        g.stroke();
      }
      g.restore();
      // L'illustration de l'angle est un objet 3D posé au-dessus (voir buildCornerProps)
      // Ruban du titre
      const rh = m * 0.14;
      const ry = H * 0.64;
      g.save();
      g.shadowColor = 'rgba(0,0,0,.3)';
      g.shadowOffsetY = rh * 0.12;
      g.fillStyle = shade(st.color, -0.22);
      rr(g, W * 0.08, ry - rh / 2, W * 0.84, rh, rh * 0.3);
      g.fill();
      g.restore();
      fitText(g, st.label, W / 2, ry + rh * 0.04, W * 0.76, rh * 0.62, '#fff');
      const sub = { start: '1er LUNDI DU MOIS', tombola: '100 € LE TICKET', garage: 'BONNES TROUVAILLES', round: 'C\'EST VOUS QUI RÉGALEZ' }[sp.k] || '';
      g.globalAlpha = 0.9;
      fitText(g, sub, W / 2, H * 0.75, W * 0.8, m * 0.058, '#fff', 800);
      g.globalAlpha = 1;
      // Numéro du jour en pastille
      if (i) pill(g, `${WEEKDAYS[wd]} ${i}`, W * 0.2, H * 0.1, m * 0.055, 'rgba(0,0,0,.35)');
      return;
    }

    // Fond illustré propre au thème de la case
    paintTheme(g, W, H, sp.k, st.color, i);
    const art = DAY_ART[i] || { title: st.label, icon: st.icon };
    // Bandeau du jour (côté intérieur)
    const bw = Math.round(Math.min(W, H) * 0.28);
    let band;
    let body;
    if (side === 'top') { band = { x: 0, y: 0, w: W, h: bw }; body = { x: 0, y: bw, w: W, h: H - bw }; }
    if (side === 'bottom') { band = { x: 0, y: H - bw, w: W, h: bw }; body = { x: 0, y: 0, w: W, h: H - bw }; }
    if (side === 'left') { band = { x: 0, y: 0, w: bw, h: H }; body = { x: bw, y: 0, w: W - bw, h: H }; }
    if (side === 'right') { band = { x: W - bw, y: 0, w: bw, h: H }; body = { x: 0, y: 0, w: W - bw, h: H }; }
    g.save();
    rr(g, 0, 0, W, H, 26);
    g.clip();
    const bg2 = g.createLinearGradient(band.x, band.y, band.x + band.w, band.y + band.h);
    bg2.addColorStop(0, shade(st.color, -0.3));
    bg2.addColorStop(1, shade(st.color, -0.38));
    g.fillStyle = bg2;
    g.fillRect(band.x, band.y, band.w, band.h);
    g.fillStyle = 'rgba(255,255,255,.18)';
    if (side === 'top') g.fillRect(0, bw - 3, W, 3);
    if (side === 'bottom') g.fillRect(0, H - bw, W, 3);
    if (side === 'left') g.fillRect(bw - 3, 0, 3, H);
    if (side === 'right') g.fillRect(W - bw, 0, 3, H);
    g.restore();
    const sunday = wd === 6;
    const horiz = band.w > band.h;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    if (horiz) {
      g.font = `900 ${bw * 0.6}px ${FONT}`;
      g.fillStyle = '#fff';
      g.fillText(String(i), band.x + band.w * 0.7, band.y + band.h * 0.54);
      g.font = `900 ${bw * 0.3}px ${FONT}`;
      g.fillStyle = sunday ? '#ffd166' : 'rgba(255,255,255,.75)';
      g.fillText(WEEKDAYS[wd], band.x + band.w * 0.32, band.y + band.h * 0.54);
    } else {
      g.fillStyle = '#fff';
      g.font = `900 ${bw * 0.55}px ${FONT}`;
      g.fillText(String(i), band.x + band.w / 2, band.y + band.h * 0.62);
      g.font = `900 ${bw * 0.27}px ${FONT}`;
      g.fillStyle = sunday ? '#ffd166' : 'rgba(255,255,255,.75)';
      g.fillText(WEEKDAYS[wd], band.x + band.w / 2, band.y + band.h * 0.3);
    }
    // Contenu : médaillon, titre propre au jour, pastille d'effet
    const m = Math.min(body.w, body.h);
    const tag = special ? 'SALAIRE' : sp.k === 'mail' ? `${sp.n} LETTRE${sp.n > 1 ? 'S' : ''}` : TAGS[sp.k] || '';
    const titleLines = art.title.split('\n');
    if (body.w > body.h * 1.12) {
      const outerRight = side === 'left';
      const mx = outerRight ? body.x + body.w * 0.78 : body.x + body.w * 0.22;
      if (!special) medallion(g, art.icon, mx, body.y + body.h * 0.47, Math.min(body.h * 0.3, body.w * 0.19), st.color);
      const tx = outerRight ? body.x + body.w * 0.04 : body.x + body.w * 0.41;
      const tw = body.w * 0.55;
      titleBlock(g, titleLines, tx + tw / 2, body.y + body.h * 0.4, tw, m * 0.17);
      if (tag) pill(g, tag, tx + tw / 2, body.y + body.h * 0.76, m * 0.1, 'rgba(0,0,0,.38)', '#fff');
    } else {
      medallion(g, art.icon, body.x + body.w / 2, body.y + body.h * 0.3, Math.min(body.h * 0.19, body.w * 0.3), st.color);
      titleBlock(g, titleLines, body.x + body.w / 2, body.y + body.h * 0.64, body.w * 0.88, m * 0.15);
      if (tag) pill(g, tag, body.x + body.w / 2, body.y + body.h * 0.88, m * 0.085, 'rgba(0,0,0,.38)', '#fff');
    }
  }

  /** Objets 3D posés sur les angles et sur le jour de paye. */
  buildCornerProps() {
    const add = (obj, i, fx, fz) => {
      const b = cellBox(i);
      obj.position.set(b.x0 + b.w * fx, TOP, b.z0 + b.d * fz);
      obj.traverse((o) => o.isMesh && (o.castShadow = true));
      this.boardGroup.add(obj);
      return obj;
    };
    // Départ : drapeau à damier qui flotte
    {
      const g = new THREE.Group();
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.025, 0.72, 10), new THREE.MeshStandardMaterial({ color: 0xf2f2f2, metalness: 0.6, roughness: 0.3 }));
      pole.position.y = 0.36;
      const knob = new THREE.Mesh(new THREE.SphereGeometry(0.04, 12, 10), new THREE.MeshStandardMaterial({ color: 0xffc94a, metalness: 0.9, roughness: 0.25 }));
      knob.position.y = 0.74;
      const fc = makeCanvas(128, 80);
      const fg = fc.getContext('2d');
      for (let x = 0; x < 8; x++) for (let y = 0; y < 5; y++) {
        fg.fillStyle = (x + y) % 2 ? '#111' : '#fff';
        fg.fillRect(x * 16, y * 16, 16, 16);
      }
      const ft = new THREE.CanvasTexture(fc);
      ft.colorSpace = THREE.SRGBColorSpace;
      const geo = new THREE.PlaneGeometry(0.34, 0.21, 12, 1);
      geo.translate(0.17, 0, 0);
      const flag = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: ft, side: THREE.DoubleSide, roughness: 0.7 }));
      flag.position.y = 0.6;
      g.add(pole, knob, flag);
      this.flag = { mesh: flag, base: geo.attributes.position.array.slice() };
      g.scale.setScalar(1.15);
      add(g, 0, 0.44, 0.36);
    }
    // Tombola : roue de loterie qui tourne
    {
      const g = new THREE.Group();
      const wc = makeCanvas(256, 256);
      const wg = wc.getContext('2d');
      const cols = ['#ff5a5f', '#ffd166', '#2ecc71', '#3fa7ff', '#a66bff', '#ff8a3d', '#ff7ac6', '#14b8a6'];
      cols.forEach((c, k) => {
        wg.fillStyle = c;
        wg.beginPath();
        wg.moveTo(128, 128);
        wg.arc(128, 128, 124, (k / 8) * Math.PI * 2, ((k + 1) / 8) * Math.PI * 2);
        wg.closePath();
        wg.fill();
      });
      wg.fillStyle = '#fff';
      wg.font = `900 30px ${FONT}`;
      wg.textAlign = 'center';
      wg.textBaseline = 'middle';
      for (let k = 0; k < 8; k++) {
        const a = ((k + 0.5) / 8) * Math.PI * 2;
        wg.fillText(String((k % 6) + 1), 128 + Math.cos(a) * 88, 128 + Math.sin(a) * 88);
      }
      const wt = new THREE.CanvasTexture(wc);
      wt.colorSpace = THREE.SRGBColorSpace;
      const wheel = new THREE.Group();
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.05, 40), [new THREE.MeshStandardMaterial({ color: 0xffffff }), new THREE.MeshStandardMaterial({ map: wt, roughness: 0.45 }), new THREE.MeshStandardMaterial({ map: wt, roughness: 0.45 })]);
      disc.rotation.x = Math.PI / 2;
      const rimT = new THREE.Mesh(new THREE.TorusGeometry(0.31, 0.025, 10, 40), new THREE.MeshStandardMaterial({ color: 0xffc94a, metalness: 0.85, roughness: 0.25 }));
      wheel.add(disc, rimT);
      wheel.position.y = 0.48;
      const stand = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.48, 0.06), new THREE.MeshStandardMaterial({ color: 0x6b4420 }));
      stand.position.y = 0.24;
      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.05, 0.16), new THREE.MeshStandardMaterial({ color: 0x6b4420 }));
      foot.position.y = 0.025;
      const pointer = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.1, 4), new THREE.MeshStandardMaterial({ color: 0xffffff }));
      pointer.rotation.z = Math.PI;
      pointer.position.set(0, 0.84, 0.04);
      g.add(stand, foot, wheel, pointer);
      wheel.rotation.x = -0.55;
      pointer.position.z = 0.2;
      this.wheel = wheel;
      add(g, 8, 0.5, 0.33);
    }
    // Vide-grenier : carton ouvert
    {
      const g = new THREE.Group();
      const card = new THREE.MeshStandardMaterial({ color: 0xc8955a, roughness: 0.85 });
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.3, 0.34), card);
      box.position.y = 0.15;
      const tape = new THREE.Mesh(new THREE.BoxGeometry(0.43, 0.04, 0.08), new THREE.MeshStandardMaterial({ color: 0xe8d3a2 }));
      tape.position.set(0, 0.18, 0.14);
      g.add(box, tape);
      for (const [x, z, rx, rz] of [[0, 0.17, 0.9, 0], [0, -0.17, -0.9, 0], [0.21, 0, 0, -0.9], [-0.21, 0, 0, 0.9]]) {
        const flap = new THREE.Mesh(new THREE.BoxGeometry(x ? 0.012 : 0.42, 0.16, x ? 0.34 : 0.012), card);
        flap.position.set(x + (x ? Math.sign(x) * 0.06 : 0), 0.36, z + (z ? Math.sign(z) * 0.06 : 0));
        flap.rotation.set(rx * 0.6, 0, rz * 0.6);
        g.add(flap);
      }
      // Objets qui dépassent
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.07, 16, 12), new THREE.MeshStandardMaterial({ color: 0xff5a5f, roughness: 0.4 }));
      ball.position.set(-0.08, 0.33, 0.02);
      const lamp = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.14, 16, 1, true), new THREE.MeshStandardMaterial({ color: 0x3fa7ff, side: THREE.DoubleSide }));
      lamp.position.set(0.1, 0.38, -0.04);
      g.add(ball, lamp);
      g.rotation.y = 0.35;
      add(g, 16, 0.5, 0.33);
    }
    // Tournée générale : deux chopes
    {
      const g = new THREE.Group();
      const glass = new THREE.MeshStandardMaterial({ color: 0xffb020, transparent: true, opacity: 0.85, roughness: 0.15 });
      const foam = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 });
      for (const [x, rz] of [[-0.12, 0.18], [0.12, -0.18]]) {
        const mug = new THREE.Group();
        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.08, 0.26, 20), glass);
        body.position.y = 0.13;
        const top = new THREE.Mesh(new THREE.SphereGeometry(0.095, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), foam);
        top.position.y = 0.26;
        const handle = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.016, 8, 16, Math.PI), glass);
        handle.rotation.z = -Math.PI / 2;
        handle.position.set(Math.sign(x) * 0.09, 0.14, 0);
        mug.add(body, top, handle);
        mug.position.x = x;
        mug.rotation.z = rz;
        g.add(mug);
      }
      add(g, 24, 0.5, 0.33);
    }
    // Jour de paye : piles de pièces
    {
      const g = new THREE.Group();
      [[0, 0, 7], [0.13, 0.06, 5], [-0.1, 0.09, 4]].forEach(([x, z, n]) => {
        for (let k = 0; k < n; k++) {
          const c = new THREE.Mesh(this.coinGeo, this.coinMat);
          c.position.set(x + (Math.random() - 0.5) * 0.01, 0.013 + k * 0.026, z);
          g.add(c);
        }
      });
      add(g, 31, 0.84, 0.5);
    }
  }

  // --------------------------------------------------------------- centre
  buildCenter() {
    const S = 2048;
    const cv = makeCanvas(S, S);
    const g = cv.getContext('2d');
    const bg = g.createRadialGradient(S * 0.5, S * 0.42, 60, S * 0.5, S * 0.5, S * 0.78);
    bg.addColorStop(0, '#4a4fb8');
    bg.addColorStop(0.55, '#2b2f7a');
    bg.addColorStop(1, '#161a48');
    g.fillStyle = bg;
    g.fillRect(0, 0, S, S);
    // Motif : quadrillage d'agenda et symboles €
    g.strokeStyle = 'rgba(255,255,255,.05)';
    g.lineWidth = 4;
    for (let k = 0; k <= S; k += 128) {
      g.beginPath();
      g.moveTo(k, 0);
      g.lineTo(k, S);
      g.moveTo(0, k);
      g.lineTo(S, k);
      g.stroke();
    }
    g.fillStyle = 'rgba(255,255,255,.05)';
    g.font = `900 90px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    for (let k = 0; k < 26; k++) g.fillText('€', ((k * 397) % S) + 40, ((k * 811) % S) + 40);
    // Emplacements des objets (ombres douces et étiquettes)
    const toPx = (x) => ((x + 3.45) / 6.9) * S;
    const spot = (pos, r, label, color) => {
      const x = toPx(pos[0]);
      const y = toPx(pos[1]);
      const rg = g.createRadialGradient(x, y, r * 0.2, x, y, r);
      rg.addColorStop(0, color + '55');
      rg.addColorStop(1, color + '00');
      g.fillStyle = rg;
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
      if (label) pill(g, label, x, y + r * 0.78, 34, 'rgba(10,12,40,.75)', color);
    };
    spot(MAILBOX, 230, '✉️ COURRIER', '#6cc0ff');
    spot(DECK, 230, '🏷️ AFFAIRES', '#ffc14d');
    spot(BANK, 230, '🏦 BANQUE', '#c7cdfa');
    spot(JAR, 240, '💰 CAGNOTTE', '#ffd166');
    spot(DIE, 170, '', '#ffffff');
    spot(PIGGY, 150, '🐷 ÉPARGNE', '#ff9ad5');
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = this.maxAniso;
    const size = 6.9;
    const center = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.4, metalness: 0.05 }));
    center.rotation.x = -Math.PI / 2;
    center.position.y = BOARD_TOP + 0.022;
    center.receiveShadow = true;
    this.boardGroup.add(center);
    // Logo « Fin de mois » (même style que MyPoly), avec reflet animé
    const logo = drawLogo({ first: 'Fin de ', second: 'mois', tagline: 'TIENDRAS-TU JUSQU\'À LA PAYE ?', crown: false });
    const ltex = new THREE.CanvasTexture(logo.canvas);
    ltex.colorSpace = THREE.SRGBColorSpace;
    ltex.anisotropy = this.maxAniso;
    const lw = 4.1;
    const lh = lw / logo.aspect;
    const logoMesh = new THREE.Mesh(new THREE.PlaneGeometry(lw, lh), new THREE.MeshBasicMaterial({ map: ltex, transparent: true, depthWrite: false }));
    logoMesh.rotation.x = -Math.PI / 2;
    logoMesh.position.set(0, BOARD_TOP + 0.03, -size / 2 + lh / 2 + 0.1);
    logoMesh.renderOrder = 2;
    this.boardGroup.add(logoMesh);
    const sc = makeCanvas(512, 64);
    const sg = sc.getContext('2d');
    const band = sg.createLinearGradient(0, 0, 512, 0);
    band.addColorStop(0.42, 'rgba(255,255,255,0)');
    band.addColorStop(0.5, 'rgba(255,255,255,.95)');
    band.addColorStop(0.58, 'rgba(255,255,255,0)');
    sg.fillStyle = band;
    sg.fillRect(0, 0, 512, 64);
    const stex = new THREE.CanvasTexture(sc);
    stex.repeat.set(0.35, 1);
    const shine = new THREE.Mesh(new THREE.PlaneGeometry(lw, lh), new THREE.MeshBasicMaterial({ map: stex, alphaMap: new THREE.CanvasTexture(logo.mask), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.55 }));
    shine.rotation.x = -Math.PI / 2;
    shine.position.copy(logoMesh.position);
    shine.position.y += 0.002;
    shine.renderOrder = 3;
    this.boardGroup.add(shine);
    this.logoShine = stex;
  }

  /** Boîte aux lettres sur pied (façade illustrée, toit arrondi, drapeau rouge). */
  buildMailbox() {
    const g = new THREE.Group();
    const blue = new THREE.MeshStandardMaterial({ color: 0x2f6fd6, roughness: 0.35, metalness: 0.2 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x1a2a4a, roughness: 0.6 });
    const front = this.faceTex('mailfront', (c, w, h) => {
      const grd = c.createLinearGradient(0, 0, 0, h);
      grd.addColorStop(0, '#4b8ef0');
      grd.addColorStop(1, '#2a62c4');
      c.fillStyle = grd;
      c.fillRect(0, 0, w, h);
      c.strokeStyle = 'rgba(255,255,255,.55)';
      c.lineWidth = 8;
      rr(c, 16, 16, w - 32, h - 32, 18);
      c.stroke();
      // Fente
      c.fillStyle = '#10203f';
      rr(c, w * 0.18, h * 0.16, w * 0.64, h * 0.07, 8);
      c.fill();
      emoji(c, '✉️', w / 2, h * 0.5, w * 0.36);
      fitText(c, 'COURRIER', w / 2, h * 0.8, w * 0.8, w * 0.12, '#fff');
    }, 256, 320);
    const W = 0.62;
    const H = 0.78;
    const D = 0.44;
    const body = new THREE.Mesh(new THREE.BoxGeometry(W, H, D), [blue, blue, blue, blue, new THREE.MeshStandardMaterial({ map: front, roughness: 0.4 }), blue]);
    body.position.y = H / 2 + 0.08;
    const roof = new THREE.Mesh(new THREE.CylinderGeometry(W / 2, W / 2, D + 0.04, 28, 1, false, -Math.PI / 2, Math.PI), blue);
    roof.rotation.x = Math.PI / 2;
    roof.position.y = H + 0.08;
    const base = new THREE.Mesh(new THREE.BoxGeometry(W + 0.12, 0.08, D + 0.12), dark);
    base.position.y = 0.04;
    const flag = new THREE.Group();
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.36, 0.03), new THREE.MeshStandardMaterial({ color: 0xe23b4b, roughness: 0.4 }));
    arm.position.y = 0.18;
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.13, 0.17), arm.material);
    plate.position.set(0, 0.3, 0.075);
    flag.add(arm, plate);
    flag.position.set(W / 2 + 0.02, 0.5, -0.08);
    flag.rotation.x = Math.PI / 2;
    g.add(body, roof, base, flag);
    g.traverse((o) => o.isMesh && (o.castShadow = o.receiveShadow = true));
    g.position.set(MAILBOX[0], BOARD_TOP + 0.02, MAILBOX[1]);
    g.rotation.y = 0.22;
    this.mailbox = { group: g, flag };
    this.boardGroup.add(g);
  }

  /** Éphéméride : affiche le jour du joueur dont c'est le tour. */
  buildCalendar() {
    const g = new THREE.Group();
    const c = makeCanvas(400, 440);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = this.maxAniso;
    const W = 1.25;
    const H = 1.35;
    const side = new THREE.MeshStandardMaterial({ color: 0xf0e6d0, roughness: 0.8 });
    const block = new THREE.Mesh(new THREE.BoxGeometry(W, H, 0.28), [side, side, side, side, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 }), side]);
    // Posée sur un chevalet, inclinée vers les joueurs
    block.rotation.x = -0.75;
    block.position.set(0, Math.cos(0.75) * H / 2 + 0.08, -Math.sin(0.75) * H / 2 + 0.25);
    const leg = new THREE.Mesh(new THREE.BoxGeometry(W * 0.7, 0.05, 0.9), new THREE.MeshStandardMaterial({ color: 0x6b4420, roughness: 0.5 }));
    leg.rotation.x = 0.85;
    leg.position.set(0, 0.36, -0.55);
    g.add(leg);
    const base = new THREE.Mesh(new THREE.BoxGeometry(W + 0.16, 0.08, 0.36), new THREE.MeshStandardMaterial({ color: 0x6b4420, roughness: 0.5 }));
    base.position.set(0, 0.04, 0.3);
    g.add(block, base);
    // Anneaux en haut
    const steel = new THREE.MeshStandardMaterial({ color: 0xd8dde6, metalness: 0.95, roughness: 0.2 });
    for (const x of [-0.3, 0, 0.3]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.016, 8, 20), steel);
      ring.rotation.y = Math.PI / 2;
      ring.position.set(x, H / 2, 0.02);
      block.add(ring);
    }
    g.traverse((o) => o.isMesh && (o.castShadow = o.receiveShadow = true));
    g.position.set(CALENDAR[0], BOARD_TOP + 0.02, CALENDAR[1]);
    this.calendar = { group: g, block, canvas: c, tex, key: '' };
    this.boardGroup.add(g);
    this.setCalendar(this.calState || { day: 0, month: 1, months: 3, color: '#ff5a5f' });
  }
  /** Met à jour l'éphéméride : jour, mois et couleur du joueur. */
  setCalendar(st) {
    this.calState = st;
    const cal = this.calendar;
    if (!cal) return;
    const key = JSON.stringify(st);
    if (cal.key === key) return;
    const flip = cal.key && JSON.parse(cal.key).day !== st.day;
    cal.key = key;
    const { canvas: c, tex } = cal;
    const g = c.getContext('2d');
    const W = c.width;
    const H = c.height;
    g.clearRect(0, 0, W, H);
    g.fillStyle = '#fffdf6';
    rr(g, 0, 0, W, H, 18);
    g.fill();
    const head = g.createLinearGradient(0, 0, W, 0);
    head.addColorStop(0, shade(st.color, 0.08));
    head.addColorStop(1, shade(st.color, -0.12));
    g.fillStyle = head;
    rr(g, 0, 0, W, 110, [18, 18, 0, 0]);
    g.fill();
    fitText(g, st.name ? st.name.toUpperCase() : 'FIN DE MOIS', W / 2, 42, W - 40, 36, '#fff');
    fitText(g, `MOIS ${st.month} / ${st.months}`, W / 2, 86, W - 40, 28, 'rgba(255,255,255,.9)', 800);
    const pay = st.day === 31;
    const wd = WEEKDAY_FULL[weekday(st.day)];
    if (st.day === 0) {
      fitText(g, '🚩', W / 2, 230, W, 130, '#000');
      fitText(g, 'DÉPART', W / 2, 360, W - 40, 56, '#22b45e');
    } else {
      fitText(g, String(st.day), W / 2, 240, W - 40, 190, pay ? '#16a34a' : weekday(st.day) === 6 ? '#e23b4b' : '#23202b');
      fitText(g, pay ? 'JOUR DE PAYE !' : wd, W / 2, 380, W - 40, 46, pay ? '#16a34a' : '#6d6177');
    }
    g.strokeStyle = 'rgba(0,0,0,.08)';
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(30, 410);
    g.lineTo(W - 30, 410);
    g.stroke();
    tex.needsUpdate = true;
    if (flip) {
      // Petite page qui s'envole
      const page = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 1.0), new THREE.MeshStandardMaterial({ color: 0xfffdf6, side: THREE.DoubleSide, transparent: true }));
      const anchor = new THREE.Vector3();
      cal.block.getWorldPosition(anchor);
      page.position.copy(anchor).add(new THREE.Vector3(0, 0.05, 0.16));
      this.scene.add(page);
      const from = page.position.clone();
      this.tween(520, (t) => {
        page.position.set(from.x + t * 0.6, from.y + Math.sin(t * Math.PI) * 0.6 + t * 0.3, from.z + t * 0.4);
        page.rotation.set(-t * 1.6, t * 0.8, t * 0.6);
        page.material.opacity = 1 - t;
      }).then(() => {
        this.scene.remove(page);
        page.geometry.dispose();
        page.material.dispose();
      });
    }
  }

  /** Paquet de cartes « affaire ». */
  buildDeck() {
    const tex = this.faceTex('dealback', (c, w, h) => {
      const grd = c.createLinearGradient(0, 0, w, h);
      grd.addColorStop(0, '#ffcf5a');
      grd.addColorStop(1, '#f08a00');
      c.fillStyle = grd;
      c.fillRect(0, 0, w, h);
      c.strokeStyle = 'rgba(255,255,255,.85)';
      c.lineWidth = 8;
      rr(c, 14, 14, w - 28, h - 28, 20);
      c.stroke();
      emoji(c, '🏷️', w / 2, h * 0.42, 110);
      fitText(c, 'AFFAIRE', w / 2, h * 0.76, w - 50, 36, '#fff');
    }, 220, 300);
    const g = new THREE.Group();
    const side = new THREE.MeshStandardMaterial({ color: 0xfff3d6 });
    const top = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55 });
    for (let k = 0; k < 9; k++) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.74, 0.028, 1.0), [side, side, top, side, side, side]);
      m.position.y = 0.014 + k * 0.03;
      m.rotation.y = (Math.random() - 0.5) * 0.14;
      m.castShadow = m.receiveShadow = true;
      g.add(m);
    }
    g.position.set(DECK[0], BOARD_TOP + 0.02, DECK[1]);
    g.rotation.y = -0.2;
    this.deck = g;
    this.boardGroup.add(g);
  }

  /** Banque (même bâtiment que sur MyPoly), toujours présente au centre. */
  buildBank() {
    const g = new THREE.Group();
    const marble = new THREE.MeshStandardMaterial({ color: 0xf4efe4, roughness: 0.45 });
    const gold = new THREE.MeshStandardMaterial({ color: 0xffc94a, metalness: 0.85, roughness: 0.25, emissive: 0x5a3a00, emissiveIntensity: 0.3 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x2a3a6a, roughness: 0.6 });
    const add = (geo, mat, x, y, z) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.castShadow = m.receiveShadow = true;
      g.add(m);
      return m;
    };
    add(new THREE.BoxGeometry(1.5, 0.08, 1.0), marble, 0, 0.04, 0);
    add(new THREE.BoxGeometry(1.35, 0.06, 0.88), marble, 0, 0.11, 0);
    add(new THREE.BoxGeometry(1.0, 0.6, 0.5), dark, 0, 0.44, -0.08);
    for (let k = 0; k < 5; k++) add(new THREE.CylinderGeometry(0.055, 0.065, 0.62, 14), marble, -0.52 + k * 0.26, 0.45, 0.28);
    add(new THREE.BoxGeometry(1.4, 0.08, 0.9), marble, 0, 0.8, 0);
    const tri = new THREE.Shape();
    tri.moveTo(-0.72, 0);
    tri.lineTo(0.72, 0);
    tri.lineTo(0, 0.32);
    tri.closePath();
    const roofGeo = new THREE.ExtrudeGeometry(tri, { depth: 0.9, bevelEnabled: false });
    roofGeo.translate(0, 0, -0.45);
    add(roofGeo, marble, 0, 0.84, 0);
    const medal = add(new THREE.CylinderGeometry(0.12, 0.12, 0.04, 28), gold, 0, 0.96, 0.46);
    medal.rotation.x = Math.PI / 2;
    // Enseigne dorée
    const sc = makeCanvas(256, 72);
    const sg = sc.getContext('2d');
    sg.fillStyle = '#ffc94a';
    rr(sg, 4, 4, 248, 64, 32);
    sg.fill();
    sg.lineWidth = 5;
    sg.strokeStyle = '#fff';
    sg.stroke();
    fitText(sg, '🏦 BANQUE', 128, 38, 220, 36, '#4a2c00');
    const st = new THREE.CanvasTexture(sc);
    st.colorSpace = THREE.SRGBColorSpace;
    const sign = new THREE.Sprite(new THREE.SpriteMaterial({ map: st, transparent: true, depthWrite: false }));
    sign.scale.set(0.9, 0.25, 1);
    sign.position.y = 1.5;
    sign.renderOrder = 12;
    g.add(sign);
    g.scale.setScalar(0.72);
    g.position.set(BANK[0], BOARD_TOP + 0.02, BANK[1]);
    g.rotation.y = 0.3;
    this.bank = g;
    this.boardGroup.add(g);
  }
  bankBump() {
    const b = this.bank;
    if (!b) return;
    this.tween(160, (t) => b.scale.set(0.72 * (1 + Math.sin(t * Math.PI) * 0.08), 0.72 * (1 - Math.sin(t * Math.PI) * 0.06), 0.72 * (1 + Math.sin(t * Math.PI) * 0.08)));
  }

  /** Tirelire cochon (épargne des joueurs). */
  buildPiggy() {
    const g = new THREE.Group();
    const pink = new THREE.MeshStandardMaterial({ color: 0xff8fc4, roughness: 0.32, metalness: 0.05 });
    const dark = new THREE.MeshStandardMaterial({ color: 0xd9568f, roughness: 0.4 });
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.3, 28, 20), pink);
    body.scale.set(1.25, 0.95, 1);
    body.position.y = 0.36;
    const snout = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.11, 0.1, 20), pink);
    snout.rotation.z = Math.PI / 2;
    snout.position.set(0.39, 0.36, 0);
    const nose = new THREE.Mesh(new THREE.CircleGeometry(0.09, 20), dark);
    nose.rotation.y = Math.PI / 2;
    nose.position.set(0.442, 0.36, 0);
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.3 });
    for (const z of [-0.12, 0.12]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 8), eyeMat);
      eye.position.set(0.3, 0.48, z);
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.13, 4), pink);
      ear.position.set(0.18, 0.62, z * 1.3);
      ear.rotation.set(z > 0 ? 0.3 : -0.3, 0, -0.3);
      g.add(eye, ear);
    }
    for (const [x, z] of [[0.2, 0.15], [0.2, -0.15], [-0.2, 0.15], [-0.2, -0.15]]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.06, 0.14, 12), pink);
      leg.position.set(x, 0.07, z);
      g.add(leg);
    }
    const tail = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.015, 8, 16, Math.PI * 1.6), dark);
    tail.position.set(-0.38, 0.42, 0);
    tail.rotation.y = Math.PI / 2;
    const slot = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.02, 0.04), new THREE.MeshStandardMaterial({ color: 0x5a1f3d }));
    slot.position.set(0, 0.645, 0);
    g.add(body, snout, nose, tail, slot);
    g.traverse((o) => o.isMesh && (o.castShadow = o.receiveShadow = true));
    g.position.set(PIGGY[0], BOARD_TOP + 0.02, PIGGY[1]);
    g.rotation.y = -0.5;
    g.scale.setScalar(0.95);
    this.piggy = g;
    this.boardGroup.add(g);
  }
  /** La tirelire sautille (dépôt ou intérêts). */
  piggyShine() {
    const g = this.piggy;
    if (!g) return;
    this.tween(520, (t) => {
      g.position.y = BOARD_TOP + 0.02 + Math.abs(Math.sin(t * Math.PI * 2)) * 0.18 * (1 - t);
      g.rotation.y = -0.5 + Math.sin(t * Math.PI * 2) * 0.2;
    });
    this.burst(rcAt(PIGGY[0], PIGGY[1]), '#ff9ad5', 16, BOARD_TOP + 0.4);
  }
  piggyScreen() {
    return this.worldScreen(PIGGY[0], BOARD_TOP + 0.9, PIGGY[1]);
  }

  /** Bocal en verre de la cagnotte, avec ses pièces et son montant. */
  buildJar() {
    const grp = new THREE.Group();
    grp.position.set(JAR[0], BOARD_TOP + 0.02, JAR[1]);
    const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.38, 0.85, 40, 1, true), new THREE.MeshStandardMaterial({ color: 0xe6f6ff, transparent: true, opacity: 0.22, roughness: 0.05, emissive: 0x9fd8ff, emissiveIntensity: 0.15, side: THREE.DoubleSide, depthWrite: false }));
    glass.position.y = 0.425;
    const bottom = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.03, 40), new THREE.MeshStandardMaterial({ color: 0xcfeaff, transparent: true, opacity: 0.55 }));
    bottom.position.y = 0.015;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.035, 10, 40), new THREE.MeshStandardMaterial({ color: 0xe0b54f, metalness: 0.85, roughness: 0.28 }));
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.85;
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.425, 0.415, 0.12, 40, 1, true), new THREE.MeshStandardMaterial({ color: 0xe23b4b, roughness: 0.7, side: THREE.DoubleSide }));
    band.position.y = 0.66;
    grp.add(glass, bottom, rim, band);
    rim.castShadow = band.castShadow = true;
    this.jarCoins = [];
    for (let k = 0; k < 40; k++) {
      const coin = new THREE.Mesh(this.coinGeo, this.coinMat);
      const layer = Math.floor(k / 6);
      const a = (k % 6) * 1.047 + layer * 0.55;
      const rad = k % 6 === 5 ? 0.03 : 0.22;
      coin.position.set(Math.cos(a) * rad, 0.045 + layer * 0.055, Math.sin(a) * rad);
      coin.rotation.set((Math.random() - 0.5) * 0.6, 0, (Math.random() - 0.5) * 0.6);
      coin.visible = false;
      grp.add(coin);
      this.jarCoins.push(coin);
    }
    const lc = makeCanvas(512, 160);
    const lt = new THREE.CanvasTexture(lc);
    lt.colorSpace = THREE.SRGBColorSpace;
    const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: lt, transparent: true, depthWrite: false, depthTest: false }));
    label.scale.set(1.35, 0.42, 1);
    label.position.y = 1.32;
    label.renderOrder = 12;
    grp.add(label);
    this.jarLabel = { canvas: lc, tex: lt, sprite: label };
    this.jar = grp;
    this.boardGroup.add(grp);
    this.setPot(this.potAmount || 0);
  }
  setPot(amount) {
    const prev = this.potAmount;
    this.potAmount = amount;
    if (!this.jar) return;
    const n = amount > 0 ? Math.min(this.jarCoins.length, 2 + Math.floor(amount / 120)) : 0;
    this.jarCoins.forEach((c, k) => (c.visible = k < n));
    const { canvas: c, tex } = this.jarLabel;
    const g = c.getContext('2d');
    g.clearRect(0, 0, c.width, c.height);
    const txt = money(amount);
    g.font = `900 64px ${FONT}`;
    const tw = Math.min(490, g.measureText(txt).width + 120);
    const grd = g.createLinearGradient(0, 0, 0, 140);
    grd.addColorStop(0, '#ffd45a');
    grd.addColorStop(1, '#f59e0b');
    g.fillStyle = grd;
    rr(g, (c.width - tw) / 2, 14, tw, 116, 58);
    g.fill();
    g.lineWidth = 8;
    g.strokeStyle = '#fff';
    g.stroke();
    g.fillStyle = '#4a2c00';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(txt, c.width / 2, 76);
    tex.needsUpdate = true;
    if (prev !== undefined && amount !== prev) {
      const s = this.jarLabel.sprite;
      this.tween(300, (t) => s.scale.set(1.35 * (1 + Math.sin(t * Math.PI) * 0.18), 0.42 * (1 + Math.sin(t * Math.PI) * 0.18), 1));
    }
  }

  // ------------------------------------------------- cadre du joueur actif
  buildFrame() {
    const c = makeCanvas(256, 256);
    const g = c.getContext('2d');
    g.strokeStyle = '#fff';
    g.lineWidth = 14;
    g.shadowColor = '#fff';
    g.shadowBlur = 12;
    rr(g, 12, 12, 232, 232, 30);
    g.stroke();
    const t = new THREE.CanvasTexture(c);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    m.rotation.x = -Math.PI / 2;
    m.visible = false;
    m.renderOrder = 5;
    this.frame = m;
    this.scene.add(m);
  }
  setCurrent(day, color) {
    if (day === null || day === undefined) {
      this.frame.visible = false;
      return;
    }
    const b = cellBox(day);
    this.frame.scale.set(b.w + 0.04, b.d + 0.04, 1);
    this.frame.position.set(b.cx, TOP + 0.006, b.cz);
    this.frame.material.color.set(color || '#ffffff');
    this.frame.visible = true;
  }
  bumpTile(day) {
    const t = this.tiles[day];
    if (!t) return;
    this.tween(380, (k) => (t.group.position.y = BOARD_TOP + Math.sin(k * Math.PI) * 0.1 * (1 - k)));
  }
  /** Survol d'une case : léger éclairage. */
  lightTile(day) {
    for (const [k, t] of Object.entries(this.tiles)) t.face.material.emissiveIntensity = Number(k) === day ? 0.12 : 0;
  }

  // ------------------------------------------------------------------ pions
  makePawnFor(it) {
    const g = new THREE.Group();
    const inner = new THREE.Group();
    const col = new THREE.Color(it.color);
    const mat = new THREE.MeshStandardMaterial({ color: col, roughness: 0.28, metalness: 0.15 });
    const pts = [[0, 0], [0.2, 0], [0.22, 0.03], [0.2, 0.07], [0.13, 0.1], [0.1, 0.16], [0.075, 0.3], [0.12, 0.33], [0.07, 0.36], [0, 0.36]].map(([x, y]) => new THREE.Vector2(x, y));
    const body = new THREE.Mesh(new THREE.LatheGeometry(pts, 32), mat);
    const top = new THREE.Group();
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.11, 24, 16), mat);
    head.position.y = 0.44;
    top.add(head);
    if (it.vip) {
      const goldMat = new THREE.MeshStandardMaterial({ color: 0xffd166, metalness: 0.9, roughness: 0.2 });
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.205, 0.022, 10, 32), goldMat);
      band.rotation.x = Math.PI / 2;
      band.position.y = 0.035;
      inner.add(band);
      const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.06, 0.06, 8, 1, true), goldMat);
      crown.position.y = 0.56;
      top.add(crown);
    }
    const c = makeCanvas(256, 256);
    const cg = c.getContext('2d');
    cg.fillStyle = '#fff';
    cg.beginPath();
    cg.arc(128, 128, 115, 0, Math.PI * 2);
    cg.fill();
    cg.lineWidth = 19;
    cg.strokeStyle = it.color;
    cg.stroke();
    emoji(cg, it.pawn || '●', 128, 138, 134);
    const lt = new THREE.CanvasTexture(c);
    lt.colorSpace = THREE.SRGBColorSpace;
    const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: lt, transparent: true, depthWrite: false }));
    label.scale.set(0.3, 0.3, 1);
    label.position.y = 0.8;
    label.renderOrder = 10;
    top.add(label);
    inner.add(body, top);
    inner.traverse((o) => o.isMesh && (o.castShadow = true));
    inner.scale.setScalar(0.74 / 1.35);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.26, 40), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.012;
    g.add(inner, ring);
    g.userData = { ring, neck: top, mat };
    this.scene.add(g);
    return g;
  }

  /** Emplacement d'un pion sur sa case (plusieurs joueurs sur le même jour). */
  slot(day, k, n) {
    const b = cellBox(day);
    const side = bandSide(day);
    // Centre de la zone « contenu » (hors bandeau du jour)
    let cx = b.cx;
    let cz = b.cz;
    if (day % 8 === 0) cz = b.z0 + b.d * 0.88; // angles : sous le ruban
    if (side === 'top') cz += b.d * 0.12;
    if (side === 'bottom') cz -= b.d * 0.12;
    if (side === 'left') cx += b.w * 0.12;
    if (side === 'right') cx -= b.w * 0.12;
    if (n === 1) return [cx, cz];
    const cols = Math.min(3, n);
    const rows = Math.ceil(n / cols);
    const r = Math.floor(k / cols);
    const c = k % cols;
    const inRow = r === rows - 1 ? n - cols * (rows - 1) : cols;
    const sx = Math.min(day % 8 === 0 ? 0.34 : 0.3, (b.w - 0.3) / Math.max(1, cols - 1 || 1));
    const sz = day % 8 === 0 ? 0.16 : 0.3;
    return [cx + (c - (inRow - 1) / 2) * sx, cz + (r - (rows - 1) / 2) * sz];
  }

  /** Place les pions. list = [{ key, color, pawn, vip, day, can }] */
  placePawns(list, animate = true) {
    const byDay = {};
    for (const it of list) (byDay[it.day] ||= []).push(it.key);
    const items = list.map((it) => {
      if (!this.horses[it.key]) {
        const obj = this.makePawnFor(it);
        obj.traverse((o) => o.isMesh && (o.userData.horse = it.key));
        this.horses[it.key] = { obj, pos: null };
      }
      const same = byDay[it.day];
      const [x, z] = this.slot(it.day, same.indexOf(it.key), same.length);
      return { key: it.key, color: it.color, rc: rcAt(x, z), top: TOP, can: it.can, mine: it.mine, flight: it.flight };
    });
    this.sync(items, animate, 170);
  }
  sync(list, animate, hopMs) {
    super.sync(list, animate, hopMs);
    // Les pions restent à l'échelle des pions MyPoly (Horse3D.sync les agrandit)
    for (const hz of Object.values(this.horses)) hz.obj.scale.setScalar(1.35);
    // Survol des cases (description)
    for (const t of Object.values(this.tiles)) this.pickables.push(t.face);
  }
  setHover(k) {
    if (this.hover === k) return;
    this.hover = k;
    const cell = k && String(k).startsWith('cell:') ? Number(String(k).slice(5)) : null;
    this.lightTile(cell);
    if (this.cb.onHover) this.cb.onHover(cell);
  }
  pawnWorld(key) {
    const hz = this.horses[key];
    return hz ? hz.obj.position.clone() : new THREE.Vector3(0, TOP, 0);
  }
  worldScreen(x, y, z) {
    const v = new THREE.Vector3(x, y, z).project(this.camera);
    const r = this.renderer.domElement.getBoundingClientRect();
    return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
  }
  pawnScreen(key) {
    const p = this.pawnWorld(key);
    return this.worldScreen(p.x, p.y + 0.55, p.z);
  }
  jarScreen() {
    return this.worldScreen(JAR[0], BOARD_TOP + 1.3, JAR[1]);
  }
  deckScreen(kind) {
    return kind === 'mail' ? this.worldScreen(MAILBOX[0], BOARD_TOP + 0.9, MAILBOX[1]) : this.worldScreen(DECK[0], BOARD_TOP + 0.3, DECK[1]);
  }
  daySparkle(day, color, n = 18) {
    const b = cellBox(day);
    this.burst(rcAt(b.cx, b.cz), color, n, TOP);
  }

  // ------------------------------------------------------------------ argent
  pointOf(who) {
    if (who === 'pot') return new THREE.Vector3(JAR[0], BOARD_TOP + 0.95, JAR[1]);
    if (who === 'piggy') return new THREE.Vector3(PIGGY[0], BOARD_TOP + 0.68, PIGGY[1]);
    if (who === 'bank' || !who) return new THREE.Vector3(BANK[0], BOARD_TOP + 0.55, BANK[1] + 0.2);
    return this.pawnWorld(who).add(new THREE.Vector3(0, 0.3, 0));
  }
  /** Pièces d'or qui volent d'un point à un autre (joueur, banque ou cagnotte). */
  coins(from, to, n = 6) {
    const a = this.pointOf(from);
    const b = this.pointOf(to);
    const jobs = [];
    for (let k = 0; k < n; k++) {
      const m = new THREE.Mesh(this.coinGeo, this.coinMat);
      m.castShadow = true;
      m.position.copy(a);
      m.visible = false;
      this.scene.add(m);
      const jitter = new THREE.Vector3((Math.random() - 0.5) * 0.3, 0, (Math.random() - 0.5) * 0.3);
      const hgt = 0.9 + a.distanceTo(b) * 0.14;
      jobs.push(this.tween(600, (t) => {
        m.visible = true;
        m.position.lerpVectors(a, b, ease.inOut(t)).add(jitter.clone().multiplyScalar(Math.sin(t * Math.PI)));
        m.position.y += Math.sin(t * Math.PI) * hgt;
        m.rotation.x = t * Math.PI * 4;
      }, k * 60).then(() => {
        this.scene.remove(m);
        if (to === 'bank') this.bankBump();
        if (to === 'piggy' && k === n - 1) this.piggyShine();
      }));
      if (from === 'bank' && k === 0) this.bankBump();
    }
    return Promise.all(jobs);
  }

  // ------------------------------------------------------------------ cartes
  /** Une enveloppe sort de la boîte aux lettres, ou une carte du paquet d'affaires. */
  drawFrom(kind) {
    let m;
    let from;
    if (kind === 'mail' && this.mailbox) {
      const env = this.faceTex('envelope', (c, w, h) => {
        c.fillStyle = '#fbf3e1';
        c.fillRect(0, 0, w, h);
        c.strokeStyle = 'rgba(150,120,70,.5)';
        c.lineWidth = 5;
        c.beginPath();
        c.moveTo(0, 0); c.lineTo(w / 2, h * 0.55); c.lineTo(w, 0);
        c.stroke();
        c.fillStyle = '#e23b4b';
        rr(c, w - 74, 16, 56, 64, 6);
        c.fill();
        c.beginPath();
        c.arc(w / 2, h * 0.55, 18, 0, Math.PI * 2);
        c.fill();
      }, 300, 200);
      const mat = new THREE.MeshStandardMaterial({ map: env, transparent: true, side: THREE.DoubleSide });
      m = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.33), mat);
      from = new THREE.Vector3(MAILBOX[0], BOARD_TOP + 0.9, MAILBOX[1] + 0.3);
      // Le drapeau se lève
      const f = this.mailbox.flag;
      this.tween(300, (t) => (f.rotation.x = (Math.PI / 2) * (1 - ease.back(t))));
      this.tween(300, (t) => (f.rotation.x = (Math.PI / 2) * ease.inOut(t)), 1400);
    } else {
      if (!this.deck) return Promise.resolve();
      const topCard = this.deck.children[this.deck.children.length - 1];
      m = topCard.clone();
      m.material = topCard.material.map((mt) => Object.assign(mt.clone(), { transparent: true }));
      from = new THREE.Vector3();
      topCard.getWorldPosition(from);
    }
    m.position.copy(from);
    this.scene.add(m);
    const to = this.camera.position.clone().lerp(from, 0.6);
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    return this.tween(560, (t) => {
      const e = ease.inOut(t);
      m.position.lerpVectors(from, to, e);
      m.position.y += Math.sin(t * Math.PI) * 0.5;
      m.rotation.x = kind === 'mail' ? -0.3 - e * 0.5 : -e * 1.1;
      m.rotation.z = e * 0.5;
      for (const mt of mats) mt.opacity = t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3;
    }).then(() => {
      this.scene.remove(m);
      mats.forEach((mt) => mt.dispose());
    });
  }

  // ------------------------------------------------------------------ dé
  buildDie() {
    super.buildDie();
    this.dieRest.set(DIE[0], BOARD_TOP + 0.27, DIE[1]);
    this.die.position.copy(this.dieRest);
  }
  setDie(v) {
    this.die.quaternion.copy(this.faceQuat(v || 6, 0.3));
    if (this.dieRest) this.die.position.copy(this.dieRest);
  }
  rollDie(v, color = '#ffffff') {
    const m = this.die;
    const yaw = (Math.random() - 0.5) * 1.2;
    const qF = this.faceQuat(v, yaw);
    const axis = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.3, Math.random() - 0.5).normalize();
    const spins = (3 + Math.random() * 2) * Math.PI * 2;
    const from = new THREE.Vector3(DIE[0] - 2.2, 3.2, DIE[1] - 2);
    const to = new THREE.Vector3(DIE[0] + (Math.random() - 0.5) * 0.3, BOARD_TOP + 0.27, DIE[1] + (Math.random() - 0.5) * 0.25);
    this.dieGlow = new THREE.Color(color);
    return this.tween(1050, (t) => {
      const e = ease.out(t);
      m.position.x = from.x + (to.x - from.x) * e;
      m.position.z = from.z + (to.z - from.z) * e;
      m.position.y = from.y + (to.y - from.y) * ease.bounce(Math.min(1, t * 1.15));
      m.quaternion.copy(qF).multiply(new THREE.Quaternion().setFromAxisAngle(axis, spins * (1 - e)));
    }).then(() => {
      m.quaternion.copy(qF);
      this.dieRest.copy(to);
    });
  }

  // ------------------------------------------------------------ caméra
  /** Caméra un peu plus rasante que la vue de dessus : on voit le relief des objets. */
  resize() {
    super.resize();
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (!w || !h) return;
    const sa = this.sa;
    const base = (w - sa.left - sa.right) / Math.max(1, h - sa.top - sa.bottom) < 1.2 ? 1.05 : 0.9;
    if (this.basePitch !== base) {
      this.basePitch = base;
      this.view.pitch = base;
      this.fitCamera();
    }
  }

  // ------------------------------------------------------------ animation
  loop(now) {
    const t = now / 1000;
    if (this.frame && this.frame.visible) this.frame.material.opacity = 0.55 + Math.sin(now / 260) * 0.35;
    if (this.jarLabel) this.jarLabel.sprite.position.y = 1.32 + Math.sin(t * 1.7) * 0.03;
    if (this.wheel) this.wheel.rotation.z = t * 0.8;
    if (this.logoShine) this.logoShine.offset.x = ((t * 0.18) % 1.6) - 0.6;
    if (this.flag) {
      const pos = this.flag.mesh.geometry.attributes.position;
      const base = this.flag.base;
      for (let k = 0; k < pos.count; k++) {
        const x = base[k * 3];
        pos.array[k * 3 + 2] = Math.sin(x * 14 - t * 5) * 0.035 * (x / 0.34);
      }
      pos.needsUpdate = true;
    }
    super.loop(now);
  }
}

export { TOP as TILE_TOP };
