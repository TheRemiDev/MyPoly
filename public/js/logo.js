// ============================================================================
//  MyPoly — logo du plateau (dessiné sur toile, partagé entre les vues 3D et 2D)
// ============================================================================

const FONT = "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/** Étoile scintillante à 4 branches. */
function sparkle(g, x, y, r, color = '#ffffff') {
  g.save();
  g.translate(x, y);
  g.fillStyle = color;
  g.shadowColor = color;
  g.shadowBlur = r * 0.8;
  g.beginPath();
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2 - Math.PI / 2;
    const d = k % 2 ? r * 0.22 : r;
    g.lineTo(Math.cos(a) * d, Math.sin(a) * d);
  }
  g.closePath();
  g.fill();
  g.restore();
}

/** Petite couronne dorée posée sur le « M ». */
function crown(g, x, y, s) {
  g.save();
  g.translate(x, y);
  g.rotate(-0.28);
  g.lineJoin = 'round';
  const path = () => {
    g.beginPath();
    g.moveTo(-s, s * 0.45);
    g.lineTo(-s * 1.08, -s * 0.55);
    g.lineTo(-s * 0.5, -s * 0.05);
    g.lineTo(0, -s * 0.8);
    g.lineTo(s * 0.5, -s * 0.05);
    g.lineTo(s * 1.08, -s * 0.55);
    g.lineTo(s, s * 0.45);
    g.closePath();
  };
  path();
  g.lineWidth = s * 0.34;
  g.strokeStyle = '#1b1030';
  g.stroke();
  const gr = g.createLinearGradient(0, -s * 0.8, 0, s * 0.45);
  gr.addColorStop(0, '#fff6c2');
  gr.addColorStop(0.45, '#ffd34d');
  gr.addColorStop(1, '#d48a12');
  g.fillStyle = gr;
  path();
  g.fill();
  // Bandeau et pierres
  g.fillStyle = '#c47a0c';
  g.fillRect(-s, s * 0.18, s * 2, s * 0.27);
  for (const [px, py, c] of [[-s * 1.08, -s * 0.55, '#ff5a5f'], [0, -s * 0.8, '#3fa7ff'], [s * 1.08, -s * 0.55, '#2ecc71']]) {
    g.beginPath();
    g.arc(px, py, s * 0.17, 0, Math.PI * 2);
    g.fillStyle = c;
    g.fill();
    g.lineWidth = s * 0.08;
    g.strokeStyle = '#1b1030';
    g.stroke();
  }
  g.restore();
}

/**
 * Dessine le logo « MyPoly » : lettres en relief avec contour doré, reflet
 * brillant, couronne, étincelles et ruban portant le slogan.
 * Renvoie { canvas, mask } — le masque (blanc sur transparent) sert au reflet animé.
 */
export function drawLogo({ tagline = 'LE MONDE EST À VENDRE', scale = 1 } = {}) {
  const W = Math.round(1800 * scale);
  const H = Math.round(820 * scale);
  const k = scale;
  const out = canvas(W, H);
  const g = out.getContext('2d');
  const fs = 300 * k;
  const skew = -0.14;
  const baseY = 360 * k;
  const font = `900 ${fs}px ${FONT}`;

  const m = canvas(8, 8).getContext('2d');
  m.font = font;
  const wMy = m.measureText('My').width;
  const wPoly = m.measureText('Poly').width;
  const total = wMy + wPoly;
  const x0 = (W - total) / 2 + 20 * k;

  // Dessine le texte (deux couleurs) avec l'inclinaison et un décalage donnés
  const text = (draw, dx = 0, dy = 0) => {
    g.save();
    g.setTransform(1, 0, skew, 1, -skew * baseY + dx, dy);
    g.font = font;
    g.textBaseline = 'alphabetic';
    g.textAlign = 'left';
    draw(g, x0, baseY);
    g.restore();
  };

  // 1. Ombre portée douce
  g.save();
  g.filter = `blur(${18 * k}px)`;
  g.globalAlpha = 0.55;
  text((c, x, y) => {
    c.fillStyle = '#000';
    c.lineWidth = 60 * k;
    c.lineJoin = 'round';
    c.strokeStyle = '#000';
    c.strokeText('MyPoly', x, y + 40 * k);
    c.fillText('MyPoly', x, y + 40 * k);
  });
  g.restore();

  // 2. Relief (extrusion) sous les lettres
  const depth = Math.round(26 * k);
  for (let d = depth; d > 0; d--) {
    const t = d / depth;
    text((c, x, y) => {
      c.lineJoin = 'round';
      c.lineWidth = 46 * k;
      c.strokeStyle = t > 0.5 ? '#3b1e05' : '#6b3a08';
      c.strokeText('MyPoly', x, y);
    }, d * 0.35, d);
  }

  // 3. Contour doré épais, puis liseré sombre
  const gold = g.createLinearGradient(0, baseY - fs * 0.85, 0, baseY + 20 * k);
  gold.addColorStop(0, '#fff7c9');
  gold.addColorStop(0.35, '#ffd34d');
  gold.addColorStop(0.7, '#f0a522');
  gold.addColorStop(1, '#a8650b');
  text((c, x, y) => {
    c.lineJoin = 'round';
    c.lineWidth = 46 * k;
    c.strokeStyle = gold;
    c.strokeText('MyPoly', x, y);
    c.lineWidth = 20 * k;
    c.strokeStyle = '#1b1030';
    c.strokeText('MyPoly', x, y);
  });

  // 4. Faces des lettres (toile séparée pour appliquer le reflet uniquement dessus)
  const face = canvas(W, H);
  const fg = face.getContext('2d');
  const top = baseY - fs * 0.78;
  const gMy = fg.createLinearGradient(0, top, 0, baseY);
  gMy.addColorStop(0, '#ffffff');
  gMy.addColorStop(0.55, '#d9efff');
  gMy.addColorStop(1, '#6fb8ff');
  const gPoly = fg.createLinearGradient(0, top, 0, baseY);
  gPoly.addColorStop(0, '#fff3a6');
  gPoly.addColorStop(0.45, '#ffb340');
  gPoly.addColorStop(1, '#ff4b5c');
  const faces = (c, fillMy, fillPoly) => {
    c.save();
    c.setTransform(1, 0, skew, 1, -skew * baseY, 0);
    c.font = font;
    c.textBaseline = 'alphabetic';
    c.fillStyle = fillMy;
    c.fillText('My', x0, baseY);
    c.fillStyle = fillPoly;
    c.fillText('Poly', x0 + wMy, baseY);
    c.restore();
  };
  faces(fg, gMy, gPoly);
  // Reflet brillant sur la moitié haute
  fg.globalCompositeOperation = 'source-atop';
  const gl = fg.createLinearGradient(0, top - 10 * k, 0, baseY);
  gl.addColorStop(0, 'rgba(255,255,255,.75)');
  gl.addColorStop(0.42, 'rgba(255,255,255,.18)');
  gl.addColorStop(0.43, 'rgba(255,255,255,0)');
  gl.addColorStop(1, 'rgba(0,0,0,.12)');
  fg.fillStyle = gl;
  fg.fillRect(0, 0, W, H);
  fg.globalCompositeOperation = 'source-over';
  g.drawImage(face, 0, 0);

  // Masque pour le reflet animé
  const mask = canvas(W, H);
  faces(mask.getContext('2d'), '#ffffff', '#ffffff');

  // 5. Couronne sur le « M »
  crown(g, x0 + 80 * k, baseY - fs * 0.84, 62 * k);

  // 6. Ruban avec le slogan
  const rb = { y: baseY + 150 * k, h: 104 * k };
  g.font = `900 ${60 * k}px ${FONT}`;
  const label = `★ ${tagline} ★`;
  const tw = g.measureText(label).width;
  const rw = Math.max(tw + 140 * k, 900 * k);
  const rx = W / 2 - rw / 2;
  const tail = 90 * k;
  // Queues repliées
  for (const side of [-1, 1]) {
    const ex = side < 0 ? rx + 30 * k : rx + rw - 30 * k;
    const y = rb.y + 34 * k;
    g.beginPath();
    g.moveTo(ex, y);
    g.lineTo(ex + side * tail * 1.6, y);
    g.lineTo(ex + side * tail * 1.15, y + rb.h / 2);
    g.lineTo(ex + side * tail * 1.6, y + rb.h);
    g.lineTo(ex, y + rb.h);
    g.closePath();
    g.fillStyle = '#9b1430';
    g.fill();
    g.lineWidth = 8 * k;
    g.strokeStyle = '#1b1030';
    g.lineJoin = 'round';
    g.stroke();
    g.beginPath();
    g.moveTo(ex, y + rb.h);
    g.lineTo(ex - side * 34 * k, y + rb.h - 34 * k + 34 * k);
    g.lineTo(ex - side * 34 * k, rb.y + rb.h);
    g.closePath();
    g.fillStyle = '#5c0a1c';
    g.fill();
  }
  // Bande principale, légèrement cintrée
  const band = () => {
    g.beginPath();
    g.moveTo(rx, rb.y);
    g.quadraticCurveTo(W / 2, rb.y - 26 * k, rx + rw, rb.y);
    g.lineTo(rx + rw, rb.y + rb.h);
    g.quadraticCurveTo(W / 2, rb.y + rb.h - 26 * k, rx, rb.y + rb.h);
    g.closePath();
  };
  const red = g.createLinearGradient(0, rb.y - 26 * k, 0, rb.y + rb.h);
  red.addColorStop(0, '#ff6b7a');
  red.addColorStop(0.5, '#e8264a');
  red.addColorStop(1, '#b0153a');
  band();
  g.fillStyle = red;
  g.fill();
  g.lineWidth = 9 * k;
  g.strokeStyle = '#1b1030';
  g.stroke();
  // Liseré doré intérieur
  g.save();
  band();
  g.clip();
  g.strokeStyle = 'rgba(255,214,102,.85)';
  g.lineWidth = 4 * k;
  g.setLineDash([14 * k, 10 * k]);
  g.beginPath();
  g.moveTo(rx, rb.y + 14 * k);
  g.quadraticCurveTo(W / 2, rb.y - 12 * k, rx + rw, rb.y + 14 * k);
  g.moveTo(rx, rb.y + rb.h - 14 * k);
  g.quadraticCurveTo(W / 2, rb.y + rb.h - 40 * k, rx + rw, rb.y + rb.h - 14 * k);
  g.stroke();
  g.restore();
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineJoin = 'round';
  g.lineWidth = 12 * k;
  g.strokeStyle = '#5c0a1c';
  const ty = rb.y + rb.h / 2 - 10 * k;
  g.strokeText(label, W / 2, ty);
  g.fillStyle = '#ffffff';
  g.fillText(label, W / 2, ty);

  // 7. Étincelles
  sparkle(g, x0 + total + 40 * k, baseY - fs * 0.62, 46 * k);
  sparkle(g, x0 + total + 95 * k, baseY - fs * 0.32, 22 * k, '#ffe08a');
  sparkle(g, x0 - 55 * k, baseY - 20 * k, 30 * k, '#ffe08a');
  sparkle(g, x0 + wMy + 30 * k, baseY - fs * 0.92, 26 * k);

  return { canvas: out, mask, aspect: W / H };
}
