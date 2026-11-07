// Option de partie « Mélenchon » (réservée aux administrateurs) : caricature dessinée
// à la main (formes simples, aucune photo), utilisée sur la case Impôts et son animation.

/** Dessine la caricature centrée en (cx, cy), dans un carré de côté `size`. */
export function drawMelenchon(g, cx, cy, size) {
  const s = size / 200;
  g.save();
  g.translate(cx - 100 * s, cy - 100 * s);
  g.scale(s, s);
  g.lineJoin = 'round';
  g.lineCap = 'round';
  // Épaules : veste sombre, chemise blanche, cravate rouge
  g.fillStyle = '#2b2f3a';
  g.beginPath();
  g.moveTo(22, 200);
  g.quadraticCurveTo(30, 150, 100, 146);
  g.quadraticCurveTo(170, 150, 178, 200);
  g.closePath();
  g.fill();
  g.fillStyle = '#ffffff';
  g.beginPath();
  g.moveTo(80, 148);
  g.lineTo(100, 182);
  g.lineTo(120, 148);
  g.closePath();
  g.fill();
  g.fillStyle = '#d62828';
  g.beginPath();
  g.moveTo(94, 152);
  g.lineTo(106, 152);
  g.lineTo(110, 192);
  g.lineTo(100, 200);
  g.lineTo(90, 192);
  g.closePath();
  g.fill();
  // Cou
  g.fillStyle = '#e8b896';
  g.fillRect(84, 128, 32, 24);
  // Oreilles
  g.fillStyle = '#e3ae8b';
  for (const x of [46, 154]) {
    g.beginPath();
    g.ellipse(x, 92, 10, 16, 0, 0, Math.PI * 2);
    g.fill();
  }
  // Visage
  const skin = g.createRadialGradient(92, 78, 10, 100, 92, 62);
  skin.addColorStop(0, '#f6cfb0');
  skin.addColorStop(1, '#e2a985');
  g.fillStyle = skin;
  g.beginPath();
  g.ellipse(100, 90, 54, 62, 0, 0, Math.PI * 2);
  g.fill();
  // Cheveux blancs sur les côtés, front dégarni
  g.fillStyle = '#f1f1f4';
  g.strokeStyle = '#c9cbd3';
  g.lineWidth = 2;
  for (const side of [-1, 1]) {
    g.beginPath();
    g.moveTo(100 + side * 30, 30);
    g.quadraticCurveTo(100 + side * 62, 32, 100 + side * 58, 84);
    g.quadraticCurveTo(100 + side * 50, 70, 100 + side * 46, 58);
    g.quadraticCurveTo(100 + side * 40, 44, 100 + side * 26, 40);
    g.closePath();
    g.fill();
    g.stroke();
  }
  g.beginPath();
  g.moveTo(74, 34);
  g.quadraticCurveTo(100, 22, 126, 34);
  g.quadraticCurveTo(100, 30, 74, 38);
  g.closePath();
  g.fill();
  // Sourcils blancs épais, un peu froncés
  g.strokeStyle = '#e9e9ee';
  g.lineWidth = 7;
  g.beginPath();
  g.moveTo(68, 70);
  g.quadraticCurveTo(80, 62, 92, 70);
  g.moveTo(108, 70);
  g.quadraticCurveTo(120, 62, 132, 70);
  g.stroke();
  // Yeux malicieux
  g.fillStyle = '#2a1d16';
  for (const x of [81, 119]) {
    g.beginPath();
    g.ellipse(x, 82, 5, 4, 0, 0, Math.PI * 2);
    g.fill();
  }
  // Nez
  g.strokeStyle = '#c4886a';
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(100, 86);
  g.quadraticCurveTo(108, 104, 96, 108);
  g.stroke();
  // Grand sourire
  g.fillStyle = '#7a2420';
  g.beginPath();
  g.moveTo(74, 118);
  g.quadraticCurveTo(100, 146, 126, 118);
  g.quadraticCurveTo(100, 126, 74, 118);
  g.closePath();
  g.fill();
  g.fillStyle = '#ffffff';
  g.beginPath();
  g.moveTo(80, 120);
  g.quadraticCurveTo(100, 128, 120, 120);
  g.lineTo(118, 126);
  g.quadraticCurveTo(100, 131, 82, 126);
  g.closePath();
  g.fill();
  // Joues rosées
  g.fillStyle = 'rgba(230, 110, 100, .28)';
  for (const x of [70, 130]) {
    g.beginPath();
    g.arc(x, 104, 10, 0, Math.PI * 2);
    g.fill();
  }
  g.restore();
}

let cached = null;
/** Image (URL data:) de la caricature, pour l'interface HTML. */
export function melenchonURL() {
  if (cached) return cached;
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  drawMelenchon(c.getContext('2d'), 128, 128, 256);
  cached = c.toDataURL('image/png');
  return cached;
}
