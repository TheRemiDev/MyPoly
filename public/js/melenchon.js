// Option de partie « Mélenchon » (réservée aux administrateurs) : caricature dessinée
// en code (formes vectorielles, aucune photo), utilisée sur la case Impôts et son animation.
// Traits repris : cheveux gris foncé épais coiffés en arrière, lunettes rectangulaires
// à fine monture, sourcils épais (l'un relevé), regard sceptique, bouche pincée,
// veste noire à grand col, chemise blanche, cravate bordeaux, triangle rouge au revers.

function path(g, pts, close = true) {
  g.beginPath();
  g.moveTo(pts[0][0], pts[0][1]);
  for (let k = 1; k < pts.length; k++) {
    const p = pts[k];
    if (p.length === 4) g.quadraticCurveTo(p[0], p[1], p[2], p[3]);
    else if (p.length === 6) g.bezierCurveTo(p[0], p[1], p[2], p[3], p[4], p[5]);
    else g.lineTo(p[0], p[1]);
  }
  if (close) g.closePath();
}

/** Dessine la caricature centrée en (cx, cy), dans un carré de côté `size`. */
export function drawMelenchon(g, cx, cy, size) {
  const s = size / 200;
  g.save();
  g.translate(cx - 100 * s, cy - 100 * s);
  g.scale(s, s);
  g.lineJoin = 'round';
  g.lineCap = 'round';

  // ---------------------------------------------------------------- tenue
  // Veste noire, grand col relevé
  const jacket = g.createLinearGradient(0, 140, 0, 200);
  jacket.addColorStop(0, '#2a2b30');
  jacket.addColorStop(1, '#141418');
  g.fillStyle = jacket;
  path(g, [[8, 200], [12, 168, 44, 152], [70, 142], [100, 150], [130, 142], [156, 152], [188, 168, 192, 200]]);
  g.fill();
  // Chemise blanche
  g.fillStyle = '#f4f4f2';
  path(g, [[78, 140], [100, 172], [122, 140], [116, 136], [100, 150], [84, 136]]);
  g.fill();
  // Cravate bordeaux
  g.fillStyle = '#7e1f2b';
  path(g, [[94, 152], [106, 152], [109, 160], [104, 166], [110, 200], [90, 200], [96, 166], [91, 160]]);
  g.fill();
  g.fillStyle = 'rgba(255,255,255,.12)';
  path(g, [[96, 155], [104, 155], [102, 162], [98, 162]]);
  g.fill();
  // Revers du col (grand col de veste de travail)
  g.fillStyle = '#1d1e23';
  path(g, [[70, 138], [86, 176], [96, 196], [60, 200], [40, 160]]);
  g.fill();
  path(g, [[130, 138], [114, 176], [104, 196], [140, 200], [160, 160]]);
  g.fill();
  g.strokeStyle = '#3a3c44';
  g.lineWidth = 1.5;
  path(g, [[70, 138], [86, 176], [96, 196]], false);
  g.stroke();
  path(g, [[130, 138], [114, 176], [104, 196]], false);
  g.stroke();
  // Triangle rouge au revers
  g.fillStyle = '#e03a2f';
  path(g, [[140, 178], [147, 178], [143.5, 171]]);
  g.fill();

  // ---------------------------------------------------------------- cou
  g.fillStyle = '#d29c7c';
  path(g, [[80, 118], [120, 118], [124, 146], [100, 154], [76, 146]]);
  g.fill();
  g.fillStyle = 'rgba(120,60,40,.18)';
  path(g, [[80, 126], [120, 126], [118, 136], [100, 140], [82, 136]]);
  g.fill();

  // ---------------------------------------------------------------- oreilles
  g.fillStyle = '#cf9473';
  path(g, [[50, 88], [40, 82, 42, 100], [44, 114, 54, 112]]);
  g.fill();
  path(g, [[150, 88], [160, 82, 158, 100], [156, 114, 146, 112]]);
  g.fill();

  // ---------------------------------------------------------------- visage
  // Visage large, mâchoire marquée
  const skin = g.createRadialGradient(94, 86, 12, 100, 96, 66);
  skin.addColorStop(0, '#f0bf9c');
  skin.addColorStop(0.7, '#dda27f');
  skin.addColorStop(1, '#c4876a');
  g.fillStyle = skin;
  path(g, [[52, 70], [50, 40, 100, 34], [150, 40, 148, 70], [150, 104], [146, 126, 120, 138], [100, 146, 80, 138], [54, 126, 50, 104]]);
  g.fill();
  // Rides du front
  g.strokeStyle = 'rgba(140,80,55,.35)';
  g.lineWidth = 1.6;
  for (const y of [52, 58]) {
    path(g, [[78, y], [100, y - 4, 124, y]], false);
    g.stroke();
  }
  // Plis nasogéniens et joues tombantes
  g.strokeStyle = 'rgba(140,75,50,.45)';
  g.lineWidth = 2;
  path(g, [[84, 100], [76, 112, 80, 124]], false);
  g.stroke();
  path(g, [[116, 100], [125, 112, 121, 124]], false);
  g.stroke();
  // Ombre de la mâchoire
  g.fillStyle = 'rgba(120,65,45,.16)';
  path(g, [[60, 112], [70, 134, 100, 140], [130, 134, 140, 112], [130, 128, 100, 132], [70, 128, 60, 112]]);
  g.fill();

  // ---------------------------------------------------------------- cheveux
  // Masse gris foncé, épaisse, coiffée en arrière avec du volume
  const hair = g.createLinearGradient(60, 10, 140, 70);
  hair.addColorStop(0, '#6d6f74');
  hair.addColorStop(0.5, '#4a4c52');
  hair.addColorStop(1, '#2f3035');
  g.fillStyle = hair;
  path(g, [[48, 78], [40, 46, 58, 26], [76, 6, 108, 8], [140, 8, 154, 30], [164, 48, 152, 80], [148, 60, 140, 52], [126, 40, 104, 40], [80, 40, 64, 50], [54, 58, 50, 80]]);
  g.fill();
  // Mèches claires (reflets gris)
  g.strokeStyle = 'rgba(175,178,186,.32)';
  g.lineWidth = 1.8;
  for (const [x1, y1, xc, yc, x2, y2] of [[60, 42, 80, 18, 110, 14], [70, 44, 92, 24, 124, 20], [84, 40, 106, 28, 140, 30], [56, 58, 60, 36, 82, 24], [140, 50, 150, 34, 140, 22]]) {
    path(g, [[x1, y1], [xc, yc, x2, y2]], false);
    g.stroke();
  }
  // Tempes et pattes plus claires
  g.fillStyle = '#7b7d83';
  path(g, [[50, 80], [48, 66, 56, 58], [58, 72, 56, 86]]);
  g.fill();
  path(g, [[150, 80], [152, 66, 144, 58], [142, 72, 144, 86]]);
  g.fill();

  // ---------------------------------------------------------------- sourcils
  // Épais, gris foncé ; le gauche (à droite sur l'image) relevé : air sceptique
  g.fillStyle = '#3c3d42';
  path(g, [[66, 70], [76, 62, 94, 66], [94, 71], [78, 68, 66, 74]]);
  g.fill();
  path(g, [[106, 64], [122, 54, 138, 62], [138, 67], [122, 60, 106, 69]]);
  g.fill();

  // ---------------------------------------------------------------- yeux
  // Regard plissé, tourné vers la droite
  g.fillStyle = '#ffffff';
  path(g, [[72, 80], [82, 74, 92, 80], [82, 84, 72, 80]]);
  g.fill();
  path(g, [[108, 78], [119, 72, 130, 78], [119, 83, 108, 78]]);
  g.fill();
  g.fillStyle = '#4a3a2c';
  g.beginPath();
  g.arc(85, 79.2, 3.6, 0, Math.PI * 2);
  g.arc(122, 77.4, 3.6, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#111';
  g.beginPath();
  g.arc(85.4, 79.2, 1.8, 0, Math.PI * 2);
  g.arc(122.4, 77.4, 1.8, 0, Math.PI * 2);
  g.fill();
  // Paupières lourdes
  g.strokeStyle = 'rgba(110,60,40,.6)';
  g.lineWidth = 1.6;
  path(g, [[71, 79], [82, 72, 93, 79]], false);
  g.stroke();
  path(g, [[107, 77], [119, 70, 131, 77]], false);
  g.stroke();
  // Poches sous les yeux
  g.strokeStyle = 'rgba(140,80,55,.35)';
  g.lineWidth = 1.4;
  path(g, [[74, 87], [83, 91, 92, 86]], false);
  g.stroke();
  path(g, [[110, 85], [120, 89, 129, 84]], false);
  g.stroke();

  // ---------------------------------------------------------------- lunettes
  // Rectangulaires, fine monture sombre
  g.strokeStyle = '#1f1d1d';
  g.lineWidth = 3;
  g.fillStyle = 'rgba(200,220,235,.12)';
  g.beginPath();
  g.roundRect(64, 70, 34, 21, 4);
  g.fill();
  g.stroke();
  g.beginPath();
  g.roundRect(103, 68, 34, 21, 4);
  g.fill();
  g.stroke();
  // Pont et branches
  g.lineWidth = 2.5;
  path(g, [[98, 78], [100.5, 75, 103, 77]], false);
  g.stroke();
  path(g, [[64, 76], [52, 76]], false);
  g.stroke();
  path(g, [[137, 74], [149, 74]], false);
  g.stroke();
  // Reflet sur les verres
  g.strokeStyle = 'rgba(255,255,255,.45)';
  g.lineWidth = 1.5;
  path(g, [[68, 74], [74, 72]], false);
  g.stroke();
  path(g, [[107, 72], [113, 70]], false);
  g.stroke();

  // ---------------------------------------------------------------- nez
  g.strokeStyle = 'rgba(140,75,50,.65)';
  g.lineWidth = 2;
  path(g, [[100, 84], [101, 96, 106, 104]], false);
  g.stroke();
  g.fillStyle = 'rgba(140,75,50,.28)';
  g.beginPath();
  g.ellipse(94, 107, 4, 2.5, 0, 0, Math.PI * 2);
  g.ellipse(108, 107, 4, 2.5, 0, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = 'rgba(140,75,50,.5)';
  path(g, [[90, 106], [100, 112, 112, 106]], false);
  g.stroke();

  // ---------------------------------------------------------------- bouche
  // Lèvres pincées, demi-sourire narquois relevé d'un côté
  g.strokeStyle = '#7a3a30';
  g.lineWidth = 2.6;
  path(g, [[89, 123], [97, 121, 104, 121.5], [110, 121, 113, 119]], false);
  g.stroke();
  g.strokeStyle = 'rgba(120,55,40,.35)';
  g.lineWidth = 1.5;
  path(g, [[93, 128], [100, 130, 107, 127.5]], false);
  g.stroke();
  // Commissure gauche légèrement tombante, droite à peine relevée
  path(g, [[89, 123], [87, 125, 87, 127]], false);
  g.stroke();
  path(g, [[113, 119], [115, 119, 116, 121]], false);
  g.stroke();
  // Ride du lion entre les sourcils
  g.strokeStyle = 'rgba(130,70,50,.4)';
  g.lineWidth = 1.4;
  path(g, [[98, 66], [99, 72, 98, 76]], false);
  g.stroke();
  path(g, [[103, 65], [104, 70, 103, 74]], false);
  g.stroke();

  g.restore();
}

let cached = null;
/** Image (URL data:) de la caricature, pour l'interface HTML. */
export function melenchonURL() {
  if (cached) return cached;
  const c = document.createElement('canvas');
  c.width = c.height = 320;
  drawMelenchon(c.getContext('2d'), 160, 160, 320);
  cached = c.toDataURL('image/png');
  return cached;
}
