// ============================================================================
//  MyPoly — Poker : dessins maison (cartes, dos, jetons) sur canvas.
//  Aucun émoji ni image externe : tout est tracé ici.
// ============================================================================
import './poker-eval.js';
import { h } from './util.js';

const E = globalThis.PokerEval;
const FONT = "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";
const SERIF = "Georgia, 'Times New Roman', 'Palatino Linotype', serif";

export const SUIT_COLORS = ['#1b1f2e', '#d42a3c', '#d42a3c', '#1b1f2e'];
/** Couleurs des jetons par valeur. */
export const CHIPS = [
  [100000, '#c93a83', '#a0225f'],
  [25000, '#0f8aa0', '#0b6878'],
  [5000, '#e2620e', '#b84a05'],
  [1000, '#e8a917', '#8a5a00'],
  [500, '#5b2a9e', '#4a1f86'],
  [100, '#1b1d26', '#1b1d26'],
  [25, '#138a4a', '#0e6b39'],
  [5, '#c8202f', '#a5151f'],
  [1, '#f4f4f0', '#1f4fd1'],
];

export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}
export function rr(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

/** Symbole de couleur (pique, cœur, carreau, trèfle) centré en (cx, cy), hauteur s. */
export function drawSuit(g, suit, cx, cy, s, color) {
  g.save();
  g.translate(cx, cy);
  g.scale(s / 2, s / 2);
  g.fillStyle = color;
  g.beginPath();
  if (suit === 1) {
    // cœur
    g.moveTo(0, 0.95);
    g.bezierCurveTo(-0.15, 0.78, -1, 0.25, -1, -0.32);
    g.bezierCurveTo(-1, -0.78, -0.62, -1, -0.38, -1);
    g.bezierCurveTo(-0.16, -1, -0.04, -0.86, 0, -0.68);
    g.bezierCurveTo(0.04, -0.86, 0.16, -1, 0.38, -1);
    g.bezierCurveTo(0.62, -1, 1, -0.78, 1, -0.32);
    g.bezierCurveTo(1, 0.25, 0.15, 0.78, 0, 0.95);
    g.fill();
  } else if (suit === 2) {
    // carreau
    g.moveTo(0, -1);
    g.quadraticCurveTo(0.32, -0.42, 0.76, 0);
    g.quadraticCurveTo(0.32, 0.42, 0, 1);
    g.quadraticCurveTo(-0.32, 0.42, -0.76, 0);
    g.quadraticCurveTo(-0.32, -0.42, 0, -1);
    g.fill();
  } else if (suit === 0) {
    // pique : cœur renversé + pied
    g.moveTo(0, -1);
    g.bezierCurveTo(0.15, -0.78, 0.98, -0.3, 0.98, 0.2);
    g.bezierCurveTo(0.98, 0.62, 0.62, 0.8, 0.38, 0.8);
    g.bezierCurveTo(0.2, 0.8, 0.08, 0.7, 0.04, 0.58);
    g.lineTo(-0.04, 0.58);
    g.bezierCurveTo(-0.08, 0.7, -0.2, 0.8, -0.38, 0.8);
    g.bezierCurveTo(-0.62, 0.8, -0.98, 0.62, -0.98, 0.2);
    g.bezierCurveTo(-0.98, -0.3, -0.15, -0.78, 0, -1);
    g.fill();
    g.beginPath();
    g.moveTo(0, 0.4);
    g.quadraticCurveTo(0.08, 0.86, 0.36, 1);
    g.lineTo(-0.36, 1);
    g.quadraticCurveTo(-0.08, 0.86, 0, 0.4);
    g.fill();
  } else {
    // trèfle : trois feuilles + pied
    for (const [x, y] of [[0, -0.5], [-0.5, 0.12], [0.5, 0.12]]) {
      g.beginPath();
      g.arc(x, y, 0.42, 0, Math.PI * 2);
      g.fill();
    }
    g.beginPath();
    g.moveTo(-0.14, 0.05);
    g.lineTo(0.14, 0.05);
    g.lineTo(0.12, 0.3);
    g.lineTo(-0.12, 0.3);
    g.fill();
    g.beginPath();
    g.moveTo(0, 0.1);
    g.quadraticCurveTo(0.08, 0.84, 0.36, 1);
    g.lineTo(-0.36, 1);
    g.quadraticCurveTo(-0.08, 0.84, 0, 0.1);
    g.fill();
  }
  g.restore();
}

/** Positions des symboles sur les cartes chiffrées (repère 0..1). */
const PIPS = {
  2: [[0.5, 0.18], [0.5, 0.82]],
  3: [[0.5, 0.18], [0.5, 0.5], [0.5, 0.82]],
  4: [[0.3, 0.18], [0.7, 0.18], [0.3, 0.82], [0.7, 0.82]],
  5: [[0.3, 0.18], [0.7, 0.18], [0.5, 0.5], [0.3, 0.82], [0.7, 0.82]],
  6: [[0.3, 0.18], [0.7, 0.18], [0.3, 0.5], [0.7, 0.5], [0.3, 0.82], [0.7, 0.82]],
  7: [[0.3, 0.18], [0.7, 0.18], [0.5, 0.34], [0.3, 0.5], [0.7, 0.5], [0.3, 0.82], [0.7, 0.82]],
  8: [[0.3, 0.18], [0.7, 0.18], [0.5, 0.34], [0.3, 0.5], [0.7, 0.5], [0.5, 0.66], [0.3, 0.82], [0.7, 0.82]],
  9: [[0.3, 0.17], [0.7, 0.17], [0.3, 0.39], [0.7, 0.39], [0.5, 0.5], [0.3, 0.61], [0.7, 0.61], [0.3, 0.83], [0.7, 0.83]],
  10: [[0.3, 0.17], [0.7, 0.17], [0.5, 0.28], [0.3, 0.39], [0.7, 0.39], [0.3, 0.61], [0.7, 0.61], [0.5, 0.72], [0.3, 0.83], [0.7, 0.83]],
};

/** Emblème des figures : couronne (Roi), diadème (Dame), toque à plume (Valet). */
function drawCourtEmblem(g, rank, cx, cy, s, dark, gold) {
  g.save();
  g.translate(cx, cy);
  g.lineJoin = 'round';
  g.fillStyle = gold;
  g.strokeStyle = dark;
  g.lineWidth = s * 0.05;
  g.beginPath();
  if (rank === 13) {
    // couronne à 5 pointes
    g.moveTo(-s * 0.5, s * 0.25);
    g.lineTo(-s * 0.56, -s * 0.28);
    g.lineTo(-s * 0.28, -s * 0.02);
    g.lineTo(-s * 0.14, -s * 0.4);
    g.lineTo(0, -s * 0.06);
    g.lineTo(s * 0.14, -s * 0.4);
    g.lineTo(s * 0.28, -s * 0.02);
    g.lineTo(s * 0.56, -s * 0.28);
    g.lineTo(s * 0.5, s * 0.25);
    g.closePath();
    g.fill();
    g.stroke();
    g.fillStyle = dark;
    g.fillRect(-s * 0.5, s * 0.16, s, s * 0.09);
    for (const x of [-0.56, -0.14, 0.14, 0.56]) {
      g.beginPath();
      g.arc(x * s, (x === -0.56 || x === 0.56 ? -0.28 : -0.4) * s, s * 0.06, 0, Math.PI * 2);
      g.fill();
    }
  } else if (rank === 12) {
    // diadème : arc et pierres
    g.moveTo(-s * 0.5, s * 0.2);
    g.quadraticCurveTo(0, -s * 0.62, s * 0.5, s * 0.2);
    g.quadraticCurveTo(0, -s * 0.12, -s * 0.5, s * 0.2);
    g.fill();
    g.stroke();
    g.fillStyle = dark;
    for (const [x, y, r] of [[0, -0.28, 0.09], [-0.25, -0.14, 0.06], [0.25, -0.14, 0.06]]) {
      g.beginPath();
      g.arc(x * s, y * s, r * s, 0, Math.PI * 2);
      g.fill();
    }
  } else {
    // toque à plume
    g.ellipse(0, s * 0.08, s * 0.46, s * 0.16, 0, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    g.beginPath();
    g.moveTo(-s * 0.3, s * 0.02);
    g.quadraticCurveTo(-s * 0.2, -s * 0.34, s * 0.1, -s * 0.3);
    g.quadraticCurveTo(s * 0.32, -s * 0.24, s * 0.3, s * 0.02);
    g.closePath();
    g.fill();
    g.stroke();
    g.fillStyle = dark;
    g.beginPath();
    g.moveTo(s * 0.18, -s * 0.24);
    g.quadraticCurveTo(s * 0.62, -s * 0.66, s * 0.36, -s * 0.06);
    g.quadraticCurveTo(s * 0.4, -s * 0.36, s * 0.18, -s * 0.24);
    g.fill();
  }
  g.restore();
}

/** Face d'une carte (0..51). */
export function drawCardFace(c, W = 256) {
  const H = Math.round(W * 1.4);
  const cv = makeCanvas(W, H);
  const g = cv.getContext('2d');
  const r = E.rankOf(c);
  const s = E.suitOf(c);
  const col = SUIT_COLORS[s];
  const red = s === 1 || s === 2;
  const bg = g.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#ffffff');
  bg.addColorStop(1, '#f1ece0');
  g.fillStyle = bg;
  rr(g, 0, 0, W, H, W * 0.09);
  g.fill();
  g.strokeStyle = 'rgba(30,30,60,.18)';
  g.lineWidth = W * 0.012;
  rr(g, W * 0.035, W * 0.035, W - W * 0.07, H - W * 0.07, W * 0.065);
  g.stroke();
  // Index (haut gauche et bas droit)
  const idx = (flip) => {
    g.save();
    if (flip) {
      g.translate(W, H);
      g.rotate(Math.PI);
    }
    g.fillStyle = col;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const label = E.RANK_SHORT[r];
    g.font = `900 ${W * (label.length > 1 ? 0.17 : 0.2)}px ${FONT}`;
    g.fillText(label, W * 0.14, W * 0.16);
    drawSuit(g, s, W * 0.14, W * 0.34, W * 0.13, col);
    g.restore();
  };
  idx(false);
  idx(true);
  // Centre
  const x0 = W * 0.22;
  const y0 = H * 0.14;
  const w = W - 2 * x0;
  const h = H - 2 * y0;
  if (r <= 10) {
    const ps = W * (r <= 3 ? 0.2 : r >= 9 ? 0.145 : 0.165);
    for (const [px, py] of PIPS[r]) {
      g.save();
      const X = x0 + px * w;
      const Y = y0 + py * h;
      if (py > 0.55) {
        g.translate(X, Y);
        g.rotate(Math.PI);
        drawSuit(g, s, 0, 0, ps, col);
      } else drawSuit(g, s, X, Y, ps, col);
      g.restore();
    }
  } else if (r === 14) {
    // As : grand symbole dans un médaillon guilloché
    const cx = W / 2;
    const cy = H / 2;
    g.strokeStyle = red ? 'rgba(212,42,60,.35)' : 'rgba(27,31,46,.3)';
    g.lineWidth = W * 0.012;
    for (let k = 0; k < 3; k++) {
      g.beginPath();
      g.arc(cx, cy, W * (0.3 + k * 0.035), 0, Math.PI * 2);
      g.stroke();
    }
    g.save();
    g.translate(cx, cy);
    for (let k = 0; k < 16; k++) {
      g.rotate(Math.PI / 8);
      g.fillStyle = red ? 'rgba(212,42,60,.25)' : 'rgba(27,31,46,.22)';
      g.beginPath();
      g.arc(0, -W * 0.37, W * 0.018, 0, Math.PI * 2);
      g.fill();
    }
    g.restore();
    drawSuit(g, s, cx, cy, W * (s === 0 ? 0.42 : 0.38), col);
    if (s === 0) {
      g.fillStyle = '#ffd166';
      g.font = `900 ${W * 0.06}px ${FONT}`;
      g.textAlign = 'center';
      g.fillText('MYPOLY', cx, cy + W * 0.33);
    }
  } else {
    // Figures : panneau encadré, emblème, grande lettre
    const dark = red ? '#7a1020' : '#141a52';
    const mid = red ? '#c22a3d' : '#2b3a9a';
    const gold = '#f5c451';
    const fx = W * 0.2;
    const fy = H * 0.12;
    const fw = W - 2 * fx;
    const fh = H - 2 * fy;
    const pg = g.createLinearGradient(0, fy, 0, fy + fh);
    pg.addColorStop(0, mid);
    pg.addColorStop(1, dark);
    g.fillStyle = pg;
    rr(g, fx, fy, fw, fh, W * 0.04);
    g.fill();
    g.strokeStyle = gold;
    g.lineWidth = W * 0.018;
    rr(g, fx + W * 0.02, fy + W * 0.02, fw - W * 0.04, fh - W * 0.04, W * 0.03);
    g.stroke();
    // Motif losangé
    g.save();
    rr(g, fx, fy, fw, fh, W * 0.04);
    g.clip();
    g.strokeStyle = 'rgba(255,255,255,.07)';
    g.lineWidth = W * 0.01;
    for (let k = -fh; k < fw + fh; k += W * 0.08) {
      g.beginPath();
      g.moveTo(fx + k, fy);
      g.lineTo(fx + k + fh, fy + fh);
      g.moveTo(fx + k + fh, fy);
      g.lineTo(fx + k, fy + fh);
      g.stroke();
    }
    g.restore();
    drawCourtEmblem(g, r, W / 2, fy + fh * 0.3, W * 0.42, dark, gold);
    g.fillStyle = gold;
    g.font = `700 ${W * 0.36}px ${SERIF}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(E.RANK_SHORT[r], W / 2, fy + fh * 0.64);
    drawSuit(g, s, W / 2, fy + fh * 0.86, W * 0.1, '#fff');
  }
  return cv;
}

/** Dos de carte : bordeaux, treillis doré et médaillon MyPoly. */
export function drawCardBack(W = 256) {
  const H = Math.round(W * 1.4);
  const cv = makeCanvas(W, H);
  const g = cv.getContext('2d');
  g.fillStyle = '#f4e7c8';
  rr(g, 0, 0, W, H, W * 0.09);
  g.fill();
  const p = W * 0.06;
  g.save();
  rr(g, p, p, W - 2 * p, H - 2 * p, W * 0.06);
  g.clip();
  const bg = g.createRadialGradient(W / 2, H / 2, 10, W / 2, H / 2, H * 0.7);
  bg.addColorStop(0, '#a01a3a');
  bg.addColorStop(0.65, '#6a0d26');
  bg.addColorStop(1, '#3a0514');
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);
  g.strokeStyle = 'rgba(255,209,102,.22)';
  g.lineWidth = W * 0.012;
  for (let k = -H; k < W + H; k += W * 0.11) {
    g.beginPath();
    g.moveTo(k, 0);
    g.lineTo(k + H, H);
    g.moveTo(k + H, 0);
    g.lineTo(k, H);
    g.stroke();
  }
  g.restore();
  g.strokeStyle = '#f5c451';
  g.lineWidth = W * 0.016;
  rr(g, p + W * 0.03, p + W * 0.03, W - 2 * p - W * 0.06, H - 2 * p - W * 0.06, W * 0.045);
  g.stroke();
  // Médaillon
  const cx = W / 2;
  const cy = H / 2;
  g.fillStyle = '#3a0514';
  g.beginPath();
  g.arc(cx, cy, W * 0.24, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = '#f5c451';
  g.lineWidth = W * 0.02;
  g.stroke();
  g.lineWidth = W * 0.008;
  g.beginPath();
  g.arc(cx, cy, W * 0.2, 0, Math.PI * 2);
  g.stroke();
  for (let k = 0; k < 4; k++) drawSuit(g, k, cx + Math.cos((k * Math.PI) / 2 - Math.PI / 4) * W * 0.11, cy + Math.sin((k * Math.PI) / 2 - Math.PI / 4) * W * 0.11, W * 0.085, '#f5c451');
  g.fillStyle = '#ffe9a8';
  g.font = `900 ${W * 0.09}px ${FONT}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('MP', cx, cy);
  return cv;
}

/**
 * Jeton de casino vu de dessus (haute définition) : bord coloré avec six encoches
 * bicolores, filet doré, rond central imprimé (comme un vrai jeton à « inlay »)
 * portant la valeur, petits symboles de cartes.
 */
export function drawChipTop(color, ink, label, S = 512) {
  const cv = makeCanvas(S, S);
  const g = cv.getContext('2d');
  const c = S / 2;
  const R = c - 1;
  // Fond : dégradé (lumière en haut à gauche)
  const base = g.createRadialGradient(c * 0.7, c * 0.62, S * 0.05, c, c, R);
  base.addColorStop(0, shade(color, 0.22));
  base.addColorStop(0.7, color);
  base.addColorStop(1, shade(color, -0.28));
  g.fillStyle = base;
  g.beginPath();
  g.arc(c, c, R, 0, Math.PI * 2);
  g.fill();
  // Six encoches sur le bord : bloc clair + filet de couleur
  const light = color.toLowerCase() === '#f4f4f0' ? '#1f4fd1' : '#fbf8ef';
  for (let k = 0; k < 6; k++) {
    g.save();
    g.translate(c, c);
    g.rotate((k * Math.PI) / 3);
    g.fillStyle = light;
    rr(g, -S * 0.075, -R, S * 0.15, S * 0.17, S * 0.025);
    g.fill();
    g.fillStyle = color;
    g.fillRect(-S * 0.012, -R + S * 0.02, S * 0.024, S * 0.13);
    g.restore();
  }
  // Fines rayures entre les encoches
  g.strokeStyle = 'rgba(255,255,255,.35)';
  g.lineWidth = S * 0.006;
  for (let k = 0; k < 6; k++) {
    for (const d of [-0.16, 0.16]) {
      const a = (k * Math.PI) / 3 + Math.PI / 6 + d;
      g.beginPath();
      g.moveTo(c + Math.sin(a) * R * 0.86, c - Math.cos(a) * R * 0.86);
      g.lineTo(c + Math.sin(a) * R * 0.98, c - Math.cos(a) * R * 0.98);
      g.stroke();
    }
  }
  // Liseré sombre du bord (relief)
  g.strokeStyle = 'rgba(0,0,0,.35)';
  g.lineWidth = S * 0.012;
  g.beginPath();
  g.arc(c, c, R - S * 0.006, 0, Math.PI * 2);
  g.stroke();
  // Anneau doré + pointillés clairs
  g.strokeStyle = '#f2c95c';
  g.lineWidth = S * 0.012;
  g.beginPath();
  g.arc(c, c, S * 0.36, 0, Math.PI * 2);
  g.stroke();
  g.strokeStyle = 'rgba(255,255,255,.75)';
  g.lineWidth = S * 0.01;
  g.setLineDash([S * 0.018, S * 0.022]);
  g.beginPath();
  g.arc(c, c, S * 0.395, 0, Math.PI * 2);
  g.stroke();
  g.setLineDash([]);
  // Rond central imprimé
  const inlay = g.createRadialGradient(c * 0.85, c * 0.8, S * 0.02, c, c, S * 0.33);
  inlay.addColorStop(0, '#ffffff');
  inlay.addColorStop(1, '#ece6d6');
  g.fillStyle = inlay;
  g.beginPath();
  g.arc(c, c, S * 0.33, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = color;
  g.lineWidth = S * 0.014;
  g.beginPath();
  g.arc(c, c, S * 0.3, 0, Math.PI * 2);
  g.stroke();
  // Symboles de cartes autour de la valeur
  for (let k = 0; k < 4; k++) {
    const a = (k * Math.PI) / 2 + Math.PI / 4;
    drawSuit(g, k, c + Math.cos(a) * S * 0.205, c + Math.sin(a) * S * 0.205, S * 0.06, shade(ink, 0.15));
  }
  if (label) {
    g.fillStyle = ink;
    g.font = `900 ${S * (label.length > 3 ? 0.16 : label.length > 2 ? 0.19 : 0.23)}px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(label, c, c + S * 0.012);
  } else {
    // Jeton décoratif : petit losange doré
    g.fillStyle = '#e0a52c';
    g.beginPath();
    g.moveTo(c, c - S * 0.1);
    g.lineTo(c + S * 0.07, c);
    g.lineTo(c, c + S * 0.1);
    g.lineTo(c - S * 0.07, c);
    g.closePath();
    g.fill();
  }
  return cv;
}
/** Tranche d'un jeton : bandes claires alignées sur les encoches, bords ombrés. */
export function drawChipSide(color) {
  const cv = makeCanvas(512, 32);
  const g = cv.getContext('2d');
  g.fillStyle = color;
  g.fillRect(0, 0, 512, 32);
  g.fillStyle = color.toLowerCase() === '#f4f4f0' ? '#1f4fd1' : '#fbf8ef';
  for (let k = 0; k < 6; k++) g.fillRect(k * (512 / 6) + 20, 0, 42, 32);
  const sh = g.createLinearGradient(0, 0, 0, 32);
  sh.addColorStop(0, 'rgba(0,0,0,.35)');
  sh.addColorStop(0.2, 'rgba(0,0,0,0)');
  sh.addColorStop(0.8, 'rgba(0,0,0,0)');
  sh.addColorStop(1, 'rgba(0,0,0,.35)');
  g.fillStyle = sh;
  g.fillRect(0, 0, 512, 32);
  return cv;
}
/** Éclaircit (+) ou assombrit (−) une couleur hexadécimale. */
function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const f = (x) => Math.max(0, Math.min(255, Math.round(amt >= 0 ? x + (255 - x) * amt : x * (1 + amt))));
  return '#' + [f(n >> 16), f((n >> 8) & 255), f(n & 255)].map((x) => x.toString(16).padStart(2, '0')).join('');
}
export const chipLabel = (v) => (v >= 1000 ? v / 1000 + 'K' : String(v));

/** Découpe un montant en jetons (du plus gros au plus petit). */
export function chipBreakdown(amount, max = 30, maxChip = Infinity) {
  const out = [];
  let left = Math.max(0, Math.round(amount));
  for (const [v] of CHIPS) {
    if (v > maxChip && v > 1) continue;
    while (left >= v && out.length < max) {
      out.push(v);
      left -= v;
    }
  }
  return out;
}

/** Image d'une carte (pour l'interface HTML), dessinée une fois puis mise en cache. */
const urlCache = {};
export function cardURL(c) {
  const key = c == null ? 'back' : c;
  if (!urlCache[key]) urlCache[key] = (c == null ? drawCardBack(200) : drawCardFace(c, 200)).toDataURL('image/png');
  return urlCache[key];
}
/** Petite image de jeton (interface HTML). */
const chipUrl = {};
export function chipURL(v = 100) {
  if (!chipUrl[v]) {
    // v = 0 : jeton décoratif doré, sans valeur inscrite (icône de tapis)
    const def = CHIPS.find((x) => x[0] === v) || CHIPS[3];
    chipUrl[v] = drawChipTop(def[1], def[2], v ? chipLabel(def[0]) : '', 192).toDataURL('image/png');
  }
  return chipUrl[v];
}

/** Petit symbole de couleur (image), pour l'interface. */
const suitCache = {};
export function suitURL(s, color = null) {
  const key = s + (color || '');
  if (!suitCache[key]) {
    const cv = makeCanvas(64, 64);
    drawSuit(cv.getContext('2d'), s, 32, 32, 56, color || SUIT_COLORS[s]);
    suitCache[key] = cv.toDataURL('image/png');
  }
  return suitCache[key];
}
export function cardImg(c, cls = '') {
  return h('img.pk-card' + cls, { src: cardURL(c), alt: c == null ? 'Carte cachée' : E.cardName(c), draggable: false });
}
export function chipImg(v = 100, cls = '') {
  return h('img.pk-chip' + cls, { src: chipURL(v), alt: '', draggable: false });
}

const C = (r, s) => (r - 2) * 4 + s;
/** Classement des mains, de la plus forte à la plus faible (avec un exemple). */
export const HAND_RANKS = [
  { cat: 9, name: 'Quinte flush royale', desc: 'As, Roi, Dame, Valet, 10 de la même couleur. La main parfaite.', cards: [C(14, 1), C(13, 1), C(12, 1), C(11, 1), C(10, 1)] },
  { cat: 8, name: 'Quinte flush', desc: 'Cinq cartes qui se suivent, de la même couleur.', cards: [C(9, 0), C(8, 0), C(7, 0), C(6, 0), C(5, 0)] },
  { cat: 7, name: 'Carré', desc: 'Quatre cartes de même hauteur.', cards: [C(12, 0), C(12, 1), C(12, 2), C(12, 3), C(4, 1)] },
  { cat: 6, name: 'Full', desc: 'Un brelan et une paire.', cards: [C(13, 0), C(13, 2), C(13, 3), C(7, 1), C(7, 3)] },
  { cat: 5, name: 'Couleur', desc: 'Cinq cartes de la même couleur, dans n\'importe quel ordre.', cards: [C(14, 2), C(11, 2), C(8, 2), C(6, 2), C(3, 2)] },
  { cat: 4, name: 'Quinte', desc: 'Cinq cartes qui se suivent, de couleurs différentes.', cards: [C(10, 3), C(9, 1), C(8, 0), C(7, 2), C(6, 1)] },
  { cat: 3, name: 'Brelan', desc: 'Trois cartes de même hauteur.', cards: [C(7, 0), C(7, 1), C(7, 3), C(13, 2), C(2, 0)] },
  { cat: 2, name: 'Double paire', desc: 'Deux paires différentes.', cards: [C(11, 0), C(11, 2), C(4, 1), C(4, 3), C(14, 0)] },
  { cat: 1, name: 'Paire', desc: 'Deux cartes de même hauteur.', cards: [C(10, 1), C(10, 2), C(13, 0), C(8, 3), C(3, 1)] },
  { cat: 0, name: 'Hauteur', desc: 'Rien de tout ça : c\'est la plus haute carte qui compte.', cards: [C(14, 3), C(11, 1), C(9, 0), C(6, 2), C(2, 1)] },
];
/** Catégorie d'affichage (la quinte flush royale a sa propre ligne). */
export function displayCat(ev) {
  return ev.cat === 8 && ev.ranks[0] === 14 ? 9 : ev.cat;
}
/** Tableau du classement des mains (règles, mode Débutant). `mine` : catégorie à surligner. */
export function handChart(mine = -1) {
  return h('div.pk-chart', HAND_RANKS.map((r, k) => h('div.pk-chart-row' + (r.cat === mine ? '.mine' : ''),
    h('span.pk-chart-rank', String(k + 1)),
    h('div.pk-chart-cards', r.cards.map((c) => cardImg(c, '.mini'))),
    h('div.pk-chart-text', h('b', r.name), h('small', r.desc)),
    r.cat === mine ? h('span.pk-chart-you', 'Ta main') : null
  )));
}

/** Réactions dessinées (pas d'émojis) : icône SVG et texte. */
export const REACTIONS = {
  'pk:nice': { label: 'Bien joué', color: '#2ecc71', svg: '<circle cx="12" cy="12" r="10" fill="#2ecc71"/><path d="m7 12.5 3.2 3.2L17 9" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>' },
  'pk:lol': { label: 'Haha', color: '#ffc83d', svg: '<circle cx="12" cy="12" r="10" fill="#ffc83d"/><path d="M7.5 9.5q1.2-1.6 2.4 0M14.1 9.5q1.2-1.6 2.4 0" fill="none" stroke="#5a3a00" stroke-width="1.8" stroke-linecap="round"/><path d="M6.8 13h10.4q-.6 4.6-5.2 4.6T6.8 13Z" fill="#5a3a00"/>' },
  'pk:wow': { label: 'Waouh', color: '#3fa7ff', svg: '<circle cx="12" cy="12" r="10" fill="#3fa7ff"/><circle cx="8.6" cy="9.6" r="1.4" fill="#fff"/><circle cx="15.4" cy="9.6" r="1.4" fill="#fff"/><ellipse cx="12" cy="15.4" rx="2.4" ry="3" fill="#0c2a5a"/>' },
  'pk:angry': { label: 'Grr', color: '#ff5a5f', svg: '<circle cx="12" cy="12" r="10" fill="#ff5a5f"/><path d="m6.8 8.2 3.6 1.8M17.2 8.2l-3.6 1.8" stroke="#4a0610" stroke-width="2" stroke-linecap="round"/><path d="M8 16.6q4-3 8 0" fill="none" stroke="#4a0610" stroke-width="2" stroke-linecap="round"/>' },
  'pk:hot': { label: 'En feu', color: '#ff8a3d', svg: '<path d="M12 2.5c1 3.6 5.8 5.6 5.8 11a5.8 5.8 0 0 1-11.6 0c0-3 1.6-4.6 2.8-5.8.2 2 1 3 2 3.4-.6-3.4.2-6.2 1-8.6Z" fill="#ff8a3d"/><path d="M12 12.4c.6 1.6 2.8 2.6 2.8 4.6a2.8 2.8 0 0 1-5.6 0c0-1.6 1.2-2.6 2.8-4.6Z" fill="#ffe08a"/>' },
  'pk:gg': { label: 'GG', color: '#ffd166', svg: '<path d="M3.5 17.5 2.6 7.6l5 3.8L12 4.6l4.4 6.8 5-3.8-.9 9.9Z" fill="#ffd166" stroke="#a8740b" stroke-width="1.2" stroke-linejoin="round"/><rect x="3.5" y="17.5" width="17" height="2.6" rx="1" fill="#a8740b"/>' },
  'pk:bluff': { label: 'Bluff ?', color: '#a66bff', svg: '<path d="M12 2 22 12 12 22 2 12Z" fill="#a66bff"/><path d="M9.6 9.4a2.5 2.5 0 1 1 3.4 2.3c-.7.3-1 .8-1 1.5v.6" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="16.6" r="1.2" fill="#fff"/>' },
  'pk:luck': { label: 'Chanceux', color: '#2ecc71', svg: '<g fill="#2ecc71"><circle cx="12" cy="7.4" r="3.6"/><circle cx="7.6" cy="12" r="3.6"/><circle cx="16.4" cy="12" r="3.6"/><circle cx="12" cy="16.2" r="3.6"/></g><path d="M12 13.6q.6 5 3.4 7.6" fill="none" stroke="#138a4a" stroke-width="1.8" stroke-linecap="round"/>' },
};
export function reactionEl(key, cls = '') {
  const r = REACTIONS[key];
  if (!r) return h('span', key);
  return h('span.pk-react' + cls, { style: { '--rc': r.color } }, h('span.pk-react-ico', { html: `<svg viewBox="0 0 24 24" aria-hidden="true">${r.svg}</svg>` }), h('b', r.label));
}

/** Avatar dessiné : initiales sur la couleur du joueur (pas d'émoji). */
export function initials(name) {
  const clean = String(name || '?').replace(/\s*\(invité\)$/i, '').trim();
  const parts = clean.split(/[\s_.-]+/).filter(Boolean);
  const a = parts[0] ? [...parts[0]][0] : '?';
  const b = parts[1] ? [...parts[1]][0] : [...(parts[0] || '')][1] || '';
  return (a + b).toUpperCase();
}
