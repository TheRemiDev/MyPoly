// =============================================================================
//  MyPoly — plateau 3D (WebGL / Three.js)
//  Plateau en volume, maisons et hôtels qui se construisent, pions animés,
//  dés 3D, pièces volantes, caméra orientable (glisser / molette / pincer).
// =============================================================================
import * as THREE from '/vendor/three/three.module.min.js';

const FONT = "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'Noto Color Emoji', 'Apple Color Emoji', 'Segoe UI Emoji', sans-serif";
const SIZES = [1.5, 1, 1, 1, 1, 1, 1, 1, 1.5]; // largeur des colonnes / lignes
const HALF = 5; // le plateau va de -5 à 5
const TILE_H = 0.14;
const BOARD_TOP = 0.2;
const TOP = BOARD_TOP + TILE_H; // surface des cases
const PX = 240; // résolution des textures (pixels par unité)

// ------------------------------------------------------------------ helpers
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
/** Rectangle d'une case dans le plan du plateau (x : gauche→droite, z : loin→près). */
function cellBox(i) {
  const [r, c] = gridPos(i);
  const [x0, x1] = span(c);
  const [z0, z1] = span(r);
  return { x0, x1, z0, z1, cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, w: x1 - x0, d: z1 - z0 };
}
/** Côté intérieur (vers le centre) où se trouve le bandeau de couleur. */
function bandSide(i) {
  if (i % 8 === 0) return null;
  return ['top', 'right', 'bottom', 'left'][Math.floor(i / 8)];
}
const ease = {
  out: (t) => 1 - Math.pow(1 - t, 3),
  inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  back: (t) => {
    const c1 = 1.70158, c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
  bounce: (t) => {
    const n1 = 7.5625, d1 = 2.75;
    if (t < 1 / d1) return n1 * t * t;
    if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
    if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
    return n1 * (t -= 2.625 / d1) * t + 0.984375;
  },
};
function shade(hex, amt) {
  const c = new THREE.Color(hex);
  const hsl = {};
  c.getHSL(hsl);
  c.setHSL(hsl.h, hsl.s, Math.max(0, Math.min(1, hsl.l + amt)));
  return '#' + c.getHexString();
}
function fmt(k) {
  const neg = k < 0;
  k = Math.abs(Math.round(k));
  const s = k >= 1000 ? (k / 1000).toFixed(2).replace(/\.?0+$/, '') + 'M' : k + 'K';
  return (neg ? '-' : '') + s;
}

// ------------------------------------------------------------ dessin 2D
function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}
/** Texte ajusté à une largeur, sur 1 ou 2 lignes. */
function fitText(ctx, text, cx, cy, maxW, size, weight = 900, color = '#1e1e33', maxLines = 2) {
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  let s = size;
  ctx.font = `${weight} ${s}px ${FONT}`;
  if (ctx.measureText(text).width <= maxW) return ctx.fillText(text, cx, cy);
  // Essai sur deux lignes
  if (maxLines > 1) {
    const parts = text.split(/[\s-]/);
    if (parts.length > 1) {
      const mid = Math.ceil(parts.length / 2);
      const l1 = parts.slice(0, mid).join(' ');
      const l2 = parts.slice(mid).join(' ');
      while (s > 8) {
        ctx.font = `${weight} ${s}px ${FONT}`;
        if (Math.max(ctx.measureText(l1).width, ctx.measureText(l2).width) <= maxW) break;
        s -= 1;
      }
      ctx.fillText(l1, cx, cy - s * 0.55);
      ctx.fillText(l2, cx, cy + s * 0.55);
      return;
    }
  }
  while (s > 8 && ctx.measureText(text).width > maxW) {
    s -= 1;
    ctx.font = `${weight} ${s}px ${FONT}`;
  }
  ctx.fillText(text, cx, cy);
}
function emoji(ctx, e, cx, cy, size) {
  ctx.font = `${size}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#000';
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,.25)';
  ctx.shadowBlur = size * 0.12;
  ctx.shadowOffsetY = size * 0.06;
  ctx.fillText(e, cx, cy);
  ctx.restore();
}
function pill(ctx, text, cx, cy, size, bg, fg = '#fff') {
  ctx.font = `900 ${size}px ${FONT}`;
  const w = ctx.measureText(text).width + size * 1.1;
  const h = size * 1.45;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,.3)';
  ctx.shadowOffsetY = size * 0.12;
  ctx.shadowBlur = size * 0.2;
  ctx.fillStyle = bg;
  rr(ctx, cx - w / 2, cy - h / 2, w, h, h / 2);
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = fg;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, cx, cy + size * 0.04);
}
function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.round(w);
  c.height = Math.round(h);
  return c;
}

// ================================================================== classe
export class Board3D {
  constructor(container, meta, cb = {}) {
    this.container = container;
    this.meta = meta;
    this.cb = cb;
    if (location.hostname === 'localhost') window.__b3 = this; // débogage local
    this.tweens = [];
    this.tiles = [];
    this.pawns = {};
    this.buildings = {};
    this.flags = {};
    this.clock = new THREE.Clock();
    this.hover = -1;
    this.shakeT = 0;
    this.view = { yaw: 0, pitch: 1.02, zoom: 1 };

    const r = (this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' }));
    this.mobile = matchMedia('(pointer: coarse)').matches || Math.min(screen.width, screen.height) < 700;
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.mobile ? 1.5 : 2));
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.toneMapping = THREE.NeutralToneMapping;
    r.toneMappingExposure = 1.05;
    r.domElement.className = 'board3d-canvas';
    container.append(r.domElement);
    this.maxAniso = r.capabilities.getMaxAnisotropy();

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(30, 1, 0.1, 300);
    this.target = new THREE.Vector3(0, 0, 0.25);

    this.buildLights();
    this.buildTable();
    this.buildTiles();
    this.buildCenter();
    this.buildDice();
    this.bindInput();

    this.resizeObs = new ResizeObserver(() => this.resize());
    this.resizeObs.observe(container);
    this.resize();
    this.loop = this.loop.bind(this);
    this.raf = requestAnimationFrame(this.loop);
  }

  // ---------------------------------------------------------------- scène
  buildLights() {
    const s = this.scene;
    s.add(new THREE.HemisphereLight(0xffffff, 0x2a3550, 1.15));
    const sun = (this.sun = new THREE.DirectionalLight(0xfff3dd, 2.1));
    sun.position.set(-5, 14, 7);
    sun.castShadow = true;
    sun.shadow.mapSize.set(this.mobile ? 1024 : 2048, this.mobile ? 1024 : 2048);
    const sc = sun.shadow.camera;
    sc.left = sc.bottom = -8;
    sc.right = sc.top = 8;
    sc.near = 1;
    sc.far = 40;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.02;
    s.add(sun);
    const rim = new THREE.DirectionalLight(0x9fd8ff, 0.55);
    rim.position.set(6, 6, -8);
    s.add(rim);
  }

  buildTable() {
    // Table sous le plateau
    const tc = makeCanvas(512, 512);
    const g = tc.getContext('2d');
    const grd = g.createRadialGradient(256, 256, 20, 256, 256, 256);
    grd.addColorStop(0, '#243055');
    grd.addColorStop(1, '#0d1226');
    g.fillStyle = grd;
    g.fillRect(0, 0, 512, 512);
    const tableTex = new THREE.CanvasTexture(tc);
    tableTex.colorSpace = THREE.SRGBColorSpace;
    const table = new THREE.Mesh(new THREE.CircleGeometry(26, 64), new THREE.MeshStandardMaterial({ map: tableTex, roughness: 0.95 }));
    table.rotation.x = -Math.PI / 2;
    table.position.y = -0.02;
    table.receiveShadow = true;
    this.scene.add(table);

    // Cadre bois + liseré doré
    const wood = new THREE.MeshStandardMaterial({ color: 0x6b4420, roughness: 0.55, metalness: 0.05 });
    const gold = new THREE.MeshStandardMaterial({ color: 0xe0b54f, roughness: 0.28, metalness: 0.85 });
    const base = new THREE.Mesh(new THREE.BoxGeometry(10.9, BOARD_TOP - 0.02, 10.9), wood);
    base.position.y = (BOARD_TOP - 0.02) / 2;
    base.castShadow = base.receiveShadow = true;
    this.scene.add(base);
    const rimGeo = new THREE.BoxGeometry(10.62, 0.04, 10.62);
    const rim = new THREE.Mesh(rimGeo, gold);
    rim.position.y = BOARD_TOP - 0.01;
    rim.receiveShadow = true;
    this.scene.add(rim);
    // Feutre
    const felt = new THREE.Mesh(new THREE.BoxGeometry(10.36, 0.04, 10.36), new THREE.MeshStandardMaterial({ color: 0x0f4a50, roughness: 0.9 }));
    felt.position.y = BOARD_TOP;
    felt.receiveShadow = true;
    this.scene.add(felt);
  }

  buildTiles() {
    const cells = this.meta.cells;
    const sideMat = new THREE.MeshStandardMaterial({ color: 0xe9dcbc, roughness: 0.7 });
    const gap = 0.05;
    for (const c of cells) {
      const i = c.index;
      const b = cellBox(i);
      const w = b.w - gap;
      const d = b.d - gap;
      const group = new THREE.Group();
      group.position.set(b.cx, BOARD_TOP, b.cz);
      const body = new THREE.Mesh(new THREE.BoxGeometry(w, TILE_H, d), sideMat);
      body.position.y = TILE_H / 2;
      body.castShadow = body.receiveShadow = true;
      group.add(body);
      const canvas = makeCanvas(b.w * PX, b.d * PX);
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = this.maxAniso;
      const faceMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55, emissive: 0xffffff, emissiveIntensity: 0 });
      const face = new THREE.Mesh(new THREE.PlaneGeometry(w, d), faceMat);
      face.rotation.x = -Math.PI / 2;
      face.position.y = TILE_H + 0.002;
      face.receiveShadow = true;
      face.userData.cell = i;
      body.userData.cell = i;
      group.add(face);
      this.scene.add(group);
      this.tiles[i] = { group, face, faceMat, canvas, tex, box: b, sig: '', lift: 0, liftTarget: 0, bump: 0, flash: null, flashT: 0 };
    }
    this.pickables = this.tiles.flatMap((t) => [t.face]);
  }

  buildCenter() {
    // Art du centre : océan, globe, boussole, logo
    const S = 1400;
    const cv = makeCanvas(S, S);
    const g = cv.getContext('2d');
    const bg = g.createRadialGradient(S * 0.5, S * 0.45, 50, S * 0.5, S * 0.5, S * 0.75);
    bg.addColorStop(0, '#2aa3b4');
    bg.addColorStop(0.55, '#147083');
    bg.addColorStop(1, '#0a3a4c');
    g.fillStyle = bg;
    g.fillRect(0, 0, S, S);
    g.strokeStyle = 'rgba(255,255,255,.05)';
    g.lineWidth = 6;
    for (let r = 60; r < S; r += 70) {
      g.beginPath();
      g.arc(S / 2, S * 1.15, r, 0, Math.PI * 2);
      g.stroke();
    }
    // Globe
    const R = S * 0.34;
    const cx = S / 2;
    const cy = S * 0.55;
    const gg = g.createRadialGradient(cx - R * 0.3, cy - R * 0.35, R * 0.1, cx, cy, R);
    gg.addColorStop(0, 'rgba(160,240,255,.45)');
    gg.addColorStop(1, 'rgba(10,80,110,.15)');
    g.fillStyle = gg;
    g.beginPath();
    g.arc(cx, cy, R, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = 'rgba(255,255,255,.22)';
    g.lineWidth = 4;
    g.stroke();
    g.save();
    g.beginPath();
    g.arc(cx, cy, R, 0, Math.PI * 2);
    g.clip();
    g.strokeStyle = 'rgba(255,255,255,.12)';
    g.lineWidth = 3;
    for (const k of [0.33, 0.66, 1]) {
      g.beginPath();
      g.ellipse(cx, cy, R * k, R, 0, 0, Math.PI * 2);
      g.stroke();
      g.beginPath();
      g.ellipse(cx, cy, R, R * k, 0, 0, Math.PI * 2);
      g.stroke();
    }
    // Continents stylisés
    g.fillStyle = 'rgba(190,255,200,.16)';
    const blob = (pts) => {
      g.beginPath();
      g.moveTo(cx + pts[0][0] * R, cy + pts[0][1] * R);
      for (let k = 1; k < pts.length; k++) {
        const [x, y] = pts[k];
        const [px, py] = pts[k - 1];
        g.quadraticCurveTo(cx + px * R, cy + py * R, cx + ((x + px) / 2) * R, cy + ((y + py) / 2) * R);
      }
      g.closePath();
      g.fill();
    };
    blob([[-0.75, -0.45], [-0.45, -0.7], [-0.15, -0.55], [-0.2, -0.25], [-0.45, -0.05], [-0.7, -0.15], [-0.8, -0.35]]);
    blob([[-0.4, 0.05], [-0.15, 0.1], [-0.2, 0.45], [-0.35, 0.75], [-0.45, 0.4], [-0.5, 0.15]]);
    blob([[0.05, -0.6], [0.45, -0.7], [0.75, -0.45], [0.6, -0.15], [0.3, -0.2], [0.1, -0.35]]);
    blob([[0.05, -0.15], [0.3, -0.05], [0.25, 0.35], [0.1, 0.55], [-0.02, 0.25]]);
    blob([[0.5, 0.35], [0.75, 0.3], [0.8, 0.5], [0.6, 0.6]]);
    g.restore();
    // Boussole
    const bx = S * 0.84;
    const by = S * 0.85;
    g.save();
    g.translate(bx, by);
    g.strokeStyle = 'rgba(255,215,120,.5)';
    g.lineWidth = 4;
    g.beginPath();
    g.arc(0, 0, 90, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = 'rgba(255,215,120,.55)';
    g.beginPath();
    g.moveTo(0, -85); g.lineTo(14, 0); g.lineTo(0, 85); g.lineTo(-14, 0); g.closePath();
    g.fill();
    g.fillStyle = 'rgba(255,90,95,.85)';
    g.beginPath();
    g.moveTo(0, -85); g.lineTo(14, 0); g.lineTo(-14, 0); g.closePath();
    g.fill();
    g.fillStyle = 'rgba(255,255,255,.3)';
    g.beginPath();
    g.moveTo(-85, 0); g.lineTo(0, 12); g.lineTo(85, 0); g.lineTo(0, -12); g.closePath();
    g.fill();
    g.restore();
    // Logo
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `900 210px ${FONT}`;
    g.lineJoin = 'round';
    g.lineWidth = 26;
    g.strokeStyle = '#0a3446';
    const wMy = g.measureText('My').width;
    const wPoly = g.measureText('Poly').width;
    const x0 = S / 2 - (wMy + wPoly) / 2;
    g.textAlign = 'left';
    g.strokeText('MyPoly', x0, S * 0.15);
    g.fillStyle = '#ffffff';
    g.fillText('My', x0, S * 0.15);
    const lg = g.createLinearGradient(x0 + wMy, 0, x0 + wMy + wPoly, 0);
    lg.addColorStop(0, '#ff5a5f');
    lg.addColorStop(0.5, '#ff8a3d');
    lg.addColorStop(1, '#ffd166');
    g.fillStyle = lg;
    g.fillText('Poly', x0 + wMy, S * 0.15);

    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = this.maxAniso;
    const size = 6.9;
    const center = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.35, metalness: 0.05 }));
    center.rotation.x = -Math.PI / 2;
    center.position.y = BOARD_TOP + 0.022;
    center.receiveShadow = true;
    this.scene.add(center);

    // Reflets d'eau animés
    const wc = makeCanvas(256, 256);
    const wg = wc.getContext('2d');
    wg.strokeStyle = 'rgba(255,255,255,.10)';
    wg.lineWidth = 3;
    for (let k = 0; k < 14; k++) {
      const x = Math.random() * 256;
      const y = Math.random() * 256;
      wg.beginPath();
      wg.arc(x, y, 10 + Math.random() * 20, Math.PI * 1.15, Math.PI * 1.85);
      wg.stroke();
    }
    const wt = (this.waterTex = new THREE.CanvasTexture(wc));
    wt.wrapS = wt.wrapT = THREE.RepeatWrapping;
    wt.repeat.set(5, 5);
    const water = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ map: wt, transparent: true, depthWrite: false }));
    water.rotation.x = -Math.PI / 2;
    water.position.y = BOARD_TOP + 0.026;
    this.scene.add(water);

    // Nuages
    const cc = makeCanvas(256, 128);
    const cg = cc.getContext('2d');
    for (const [x, y, r] of [[80, 70, 45], [130, 55, 55], [180, 72, 40], [120, 85, 50]]) {
      const rg = cg.createRadialGradient(x, y, 0, x, y, r);
      rg.addColorStop(0, 'rgba(255,255,255,.9)');
      rg.addColorStop(1, 'rgba(255,255,255,0)');
      cg.fillStyle = rg;
      cg.fillRect(0, 0, 256, 128);
    }
    const cloudTex = new THREE.CanvasTexture(cc);
    this.clouds = [];
    for (let k = 0; k < 3; k++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.3), new THREE.MeshBasicMaterial({ map: cloudTex, transparent: true, opacity: 0.22, depthWrite: false }));
      m.rotation.x = -Math.PI / 2;
      m.position.set(-4 + k * 3, 1.6 + k * 0.25, -2 + k * 1.6);
      m.userData.speed = 0.12 + k * 0.05;
      this.scene.add(m);
      this.clouds.push(m);
    }
    // Avion qui traverse le ciel
    this.planeSprite = this.emojiSprite('✈️', 0.7);
    this.planeSprite.position.set(-9, 2.6, 1);
    this.planeSprite.userData.t = 0;
    this.scene.add(this.planeSprite);
  }

  emojiSprite(e, scale, ring = null) {
    const c = makeCanvas(160, 160);
    const g = c.getContext('2d');
    if (ring) {
      g.fillStyle = '#ffffff';
      g.beginPath();
      g.arc(80, 80, 72, 0, Math.PI * 2);
      g.fill();
      g.lineWidth = 12;
      g.strokeStyle = ring;
      g.stroke();
    }
    emoji(g, e, 80, 86, ring ? 84 : 118);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false }));
    s.scale.set(scale, scale, 1);
    return s;
  }
  textSprite(text, { bg = '#ff00aa', fg = '#fff', size = 64, scale = 0.6 } = {}) {
    const c = makeCanvas(320, 120);
    const g = c.getContext('2d');
    pill(g, text, 160, 60, size, bg, fg);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false }));
    s.scale.set(scale * 2.67, scale, 1);
    return s;
  }

  // ------------------------------------------------------------------ dés
  buildDice() {
    const faceTex = (v) => {
      const c = makeCanvas(128, 128);
      const g = c.getContext('2d');
      const grd = g.createLinearGradient(0, 0, 128, 128);
      grd.addColorStop(0, '#ffffff');
      grd.addColorStop(1, '#e3e3ee');
      g.fillStyle = grd;
      rr(g, 0, 0, 128, 128, 22);
      g.fill();
      g.strokeStyle = 'rgba(0,0,0,.12)';
      g.lineWidth = 4;
      g.stroke();
      const P = { 1: [[64, 64]], 2: [[36, 36], [92, 92]], 3: [[34, 34], [64, 64], [94, 94]], 4: [[36, 36], [92, 36], [36, 92], [92, 92]], 5: [[34, 34], [94, 34], [64, 64], [34, 94], [94, 94]], 6: [[36, 32], [92, 32], [36, 64], [92, 64], [36, 96], [92, 96]] };
      for (const [x, y] of P[v]) {
        const rg = g.createRadialGradient(x - 3, y - 3, 1, x, y, 13);
        rg.addColorStop(0, v === 1 ? '#ff7b7b' : '#555');
        rg.addColorStop(1, v === 1 ? '#b3261e' : '#111');
        g.fillStyle = rg;
        g.beginPath();
        g.arc(x, y, v === 1 ? 17 : 12, 0, Math.PI * 2);
        g.fill();
      }
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = this.maxAniso;
      return new THREE.MeshStandardMaterial({ map: t, roughness: 0.3 });
    };
    // Ordre des faces Three.js : +x, -x, +y, -y, +z, -z  →  3, 4, 1, 6, 2, 5
    const mats = [3, 4, 1, 6, 2, 5].map(faceTex);
    const geo = new THREE.BoxGeometry(0.5, 0.5, 0.5);
    this.dice = [0, 1].map((k) => {
      const m = new THREE.Mesh(geo, mats);
      m.castShadow = true;
      m.position.set(k ? 0.45 : -0.45, TOP - TILE_H + 0.27, -0.75);
      this.scene.add(m);
      return m;
    });
    this.setDice([1, 1]);
  }
  faceQuat(v, yaw) {
    const e = { 1: [0, 0, 0], 6: [Math.PI, 0, 0], 3: [0, 0, Math.PI / 2], 4: [0, 0, -Math.PI / 2], 2: [-Math.PI / 2, 0, 0], 5: [Math.PI / 2, 0, 0] }[v];
    const qf = new THREE.Quaternion().setFromEuler(new THREE.Euler(e[0], e[1], e[2]));
    const qy = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    return qy.multiply(qf);
  }
  setDice(d) {
    this.dice.forEach((m, k) => {
      m.quaternion.copy(this.faceQuat(d[k], (k ? -0.25 : 0.2)));
      m.position.set(k ? 0.45 : -0.45, BOARD_TOP + 0.27, -0.75);
    });
  }
  rollDice(d) {
    const base = BOARD_TOP + 0.27;
    const proms = this.dice.map((m, k) => {
      const yaw = (Math.random() - 0.5) * 1.2;
      const qF = this.faceQuat(d[k], yaw);
      const axis = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.3, Math.random() - 0.5).normalize();
      const spins = (3 + Math.random() * 2) * Math.PI * 2;
      const from = new THREE.Vector3(k ? 1.6 : -1.6, 2.4, 2.4);
      const to = new THREE.Vector3((k ? 0.48 : -0.48) + (Math.random() - 0.5) * 0.25, base, -0.75 + (Math.random() - 0.5) * 0.3);
      return this.tween(1150 + k * 80, (t) => {
        const e = ease.out(t);
        m.position.x = from.x + (to.x - from.x) * e;
        m.position.z = from.z + (to.z - from.z) * e;
        // Rebonds
        const b = ease.bounce(Math.min(1, t * 1.15));
        m.position.y = from.y + (base - from.y) * b;
        const q = new THREE.Quaternion().setFromAxisAngle(axis, spins * (1 - ease.out(t)));
        m.quaternion.copy(qF).multiply(q);
      }).then(() => m.quaternion.copy(qF));
    });
    return Promise.all(proms);
  }

  // ------------------------------------------------------------ tuiles
  /**
   * Met à jour l'état visuel du plateau.
   * view = { props, cells, players (map id→joueur), festival, selectable:Set, dimmed:Set, settings }
   */
  update(view, animate = true) {
    this.viewState = view;
    this.animateBuilds = animate && this.ready;
    for (const c of this.meta.cells) {
      const i = c.index;
      const t = this.tiles[i];
      const pr = view.props[i];
      const owner = pr && pr.owner ? view.players[pr.owner] : null;
      const fest = view.festival && view.festival.cell === i ? view.festival.mult : 0;
      const mono = owner && c.type === 'city' && view.mono(owner.id, c.country);
      const sig = JSON.stringify([owner && owner.color, owner && owner.pawn, pr && pr.rent, fest, mono, view.settings.salary, view.settings.jailFine, view.settings.travelFee, view.settings.taxPercent, i === 16 ? view.festival : 0]);
      if (sig !== t.sig) {
        t.sig = sig;
        this.drawTile(i, { owner, pr, fest, mono, view });
        t.tex.needsUpdate = true;
      }
      t.selectable = view.selectable.has(i);
      t.dimmed = view.dimmed.has(i);
      this.syncBuildings(i, owner, pr ? pr.level : 0);
      this.syncFestival(i, fest);
    }
  }

  drawTile(i, { owner, pr, fest, mono, view }) {
    const c = this.meta.cells[i];
    const t = this.tiles[i];
    const cv = t.canvas;
    const g = cv.getContext('2d');
    const W = cv.width;
    const H = cv.height;
    g.clearRect(0, 0, W, H);
    const side = bandSide(i);
    const s = view.settings;
    const country = c.type === 'city' ? this.meta.countries.find((x) => x.id === c.country) : null;

    // Fond
    let grd;
    if (c.type === 'resort') {
      grd = g.createLinearGradient(0, 0, 0, H);
      grd.addColorStop(0, '#9ff0fb');
      grd.addColorStop(0.5, '#42c2dd');
      grd.addColorStop(0.52, '#f7e3ae');
      grd.addColorStop(1, '#ecd08b');
    } else if (c.type === 'chance') {
      grd = g.createLinearGradient(0, 0, W, H);
      grd.addColorStop(0, '#fff6dc');
      grd.addColorStop(1, '#ffd98c');
    } else if (c.type === 'tax') {
      grd = g.createLinearGradient(0, 0, W, H);
      grd.addColorStop(0, '#ffe8e8');
      grd.addColorStop(1, '#ffb0b0');
    } else if (c.type === 'city') {
      grd = g.createLinearGradient(0, 0, W, H);
      grd.addColorStop(0, '#fffdf6');
      grd.addColorStop(1, '#f1e7d0');
    } else {
      const cols = { start: ['#e2ffe9', '#3fcf85', '#1f9e5b'], jail: ['#fff4d1', '#ffbe55', '#2aa8cf'], festival: ['#ffe6f7', '#cf75ff', '#7d3bea'], travel: ['#e6f5ff', '#68bbff', '#2a7fdc'] }[c.type];
      grd = g.createRadialGradient(W / 2, H * 0.38, 10, W / 2, H / 2, W * 0.75);
      grd.addColorStop(0, cols[0]);
      grd.addColorStop(0.62, cols[1]);
      grd.addColorStop(1, cols[2]);
    }
    g.fillStyle = grd;
    rr(g, 0, 0, W, H, 26);
    g.fill();
    if (owner) {
      g.fillStyle = owner.color;
      g.globalAlpha = 0.36;
      rr(g, 0, 0, W, H, 26);
      g.fill();
      g.globalAlpha = 1;
    }

    // Bandeau du pays
    let body = { x: 0, y: 0, w: W, h: H };
    if (country && side) {
      const bw = Math.round(Math.min(W, H) * 0.3);
      let band;
      if (side === 'top') { band = { x: 0, y: 0, w: W, h: bw }; body = { x: 0, y: bw, w: W, h: H - bw }; }
      if (side === 'bottom') { band = { x: 0, y: H - bw, w: W, h: bw }; body = { x: 0, y: 0, w: W, h: H - bw }; }
      if (side === 'left') { band = { x: 0, y: 0, w: bw, h: H }; body = { x: bw, y: 0, w: W - bw, h: H }; }
      if (side === 'right') { band = { x: W - bw, y: 0, w: bw, h: H }; body = { x: 0, y: 0, w: W - bw, h: H }; }
      const bg2 = g.createLinearGradient(band.x, band.y, band.x + (band.w > band.h ? 0 : band.w), band.y + (band.w > band.h ? band.h : 0));
      bg2.addColorStop(0, shade(country.color, 0.12));
      bg2.addColorStop(1, shade(country.color, -0.08));
      g.save();
      rr(g, 0, 0, W, H, 26);
      g.clip();
      g.fillStyle = bg2;
      g.fillRect(band.x, band.y, band.w, band.h);
      if (mono) {
        g.fillStyle = 'rgba(255,240,170,.35)';
        g.fillRect(band.x, band.y, band.w, band.h);
      }
      g.restore();
      // Drapeau au début du bandeau (les maisons 3D occupent le reste)
      const fs = bw * 0.55;
      const horiz = band.w > band.h;
      emoji(g, country.flag, horiz ? band.x + fs * 0.75 : band.x + band.w / 2, horiz ? band.y + band.h / 2 : band.y + fs * 0.75, fs);
      if (mono) {
        const px = horiz ? band.x + band.w - fs * 0.85 : band.x + band.w / 2;
        const py = horiz ? band.y + band.h / 2 : band.y + band.h - fs * 0.7;
        pill(g, '×2', px, py, fs * 0.5, '#ffd166', '#4a3300');
      }
    }

    // Contenu
    const cx = body.x + body.w / 2;
    const m = Math.min(body.w, body.h);
    const priceTxt = owner && pr.rent ? fmt(pr.rent) : c.price ? fmt(c.price) : '';
    const priceBg = owner ? shade(owner.color, -0.22) : '#262640';
    if (c.type === 'city' || c.type === 'resort' || c.type === 'tax') {
      const icon = c.type === 'city' ? c.icon : c.type === 'resort' ? c.emoji : '💸';
      const iy = body.y + body.h * 0.27;
      emoji(g, icon, cx, iy, m * 0.36);
      fitText(g, c.type === 'tax' ? 'IMPÔTS' : c.name.toUpperCase(), cx, body.y + body.h * 0.56, body.w * 0.9, m * 0.15, 900, c.type === 'resort' ? '#3b2a05' : '#1e1e33');
      pill(g, c.type === 'tax' ? `${s.taxPercent} %` : priceTxt, cx, body.y + body.h * 0.8, m * 0.13, c.type === 'tax' ? '#c0392b' : priceBg);
    } else if (c.type === 'chance') {
      g.save();
      g.translate(cx, body.y + body.h * 0.4);
      g.rotate(-0.15);
      const cw = m * 0.42;
      const ch = m * 0.54;
      g.fillStyle = '#ffffff';
      rr(g, -cw / 2 + 8, -ch / 2 + 8, cw, ch, 14);
      g.fill();
      const cg2 = g.createLinearGradient(-cw / 2, -ch / 2, cw / 2, ch / 2);
      cg2.addColorStop(0, '#ff8a3d');
      cg2.addColorStop(1, '#ff4d6d');
      g.fillStyle = cg2;
      rr(g, -cw / 2, -ch / 2, cw, ch, 14);
      g.fill();
      g.strokeStyle = '#fff';
      g.lineWidth = 6;
      g.stroke();
      fitText(g, '?', 0, 4, cw, ch * 0.7, 900, '#fff');
      g.restore();
      fitText(g, 'CHANCE', cx, body.y + body.h * 0.82, body.w * 0.9, m * 0.15, 900, '#7a3d00');
    } else {
      // Coins
      const icons = { start: '🏁', jail: '🏝️', festival: '🎪', travel: '✈️' };
      const names = { start: 'DÉPART', jail: 'ÎLE DÉSERTE', festival: 'FESTIVAL', travel: 'AÉROPORT' };
      const subs = {
        start: `+${fmt(s.salary)} au passage`,
        jail: `Amende ${fmt(s.jailFine)}`,
        festival: view.festival && view.festival.cell != null ? `×${view.festival.mult} à ${this.meta.cells[view.festival.cell].name}` : 'Loyer ×2',
        travel: `Billet ${fmt(s.travelFee)}`,
      };
      const ribbon = { start: '#1e9e57', jail: '#e07b00', festival: '#8e44ff', travel: '#1f6fd1' }[c.type];
      const glow = g.createRadialGradient(W / 2, H * 0.38, 5, W / 2, H * 0.38, W * 0.3);
      glow.addColorStop(0, 'rgba(255,255,255,.85)');
      glow.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = glow;
      g.fillRect(0, 0, W, H);
      emoji(g, icons[c.type], W / 2, H * 0.38, W * 0.38);
      // Ruban
      g.font = `900 ${W * 0.1}px ${FONT}`;
      const rw = Math.min(W * 0.9, g.measureText(names[c.type]).width + W * 0.14);
      const rh = W * 0.15;
      g.save();
      g.shadowColor = 'rgba(0,0,0,.35)';
      g.shadowOffsetY = 6;
      g.shadowBlur = 8;
      g.fillStyle = ribbon;
      rr(g, W / 2 - rw / 2, H * 0.68 - rh / 2, rw, rh, 10);
      g.fill();
      g.restore();
      fitText(g, names[c.type], W / 2, H * 0.68 + 2, rw * 0.9, W * 0.1, 900, '#fff', 1);
      pill(g, subs[c.type], W / 2, H * 0.86, W * 0.06, 'rgba(255,255,255,.85)', '#333');
      if (c.type === 'start') {
        g.strokeStyle = 'rgba(255,255,255,.9)';
        g.lineWidth = 10;
        g.lineCap = 'round';
        g.beginPath();
        g.moveTo(W * 0.32, H * 0.12);
        g.lineTo(W * 0.12, H * 0.12);
        g.lineTo(W * 0.2, H * 0.06);
        g.moveTo(W * 0.12, H * 0.12);
        g.lineTo(W * 0.2, H * 0.18);
        g.stroke();
      }
    }

    // Bordure (propriétaire / festival)
    if (owner || fest) {
      g.lineWidth = Math.max(10, W * 0.045);
      g.strokeStyle = fest ? '#ff2fb3' : owner.color;
      rr(g, g.lineWidth / 2, g.lineWidth / 2, W - g.lineWidth, H - g.lineWidth, 22);
      g.stroke();
    }
    if (owner) {
      // Pastille du propriétaire dans un coin
      const r = Math.min(W, H) * 0.1;
      const ox = side === 'right' ? r * 1.4 : W - r * 1.4;
      const oy = side === 'top' || side === 'left' || side === 'right' ? H - r * 1.4 : side === 'bottom' ? r * 1.4 : H - r * 1.4;
      g.fillStyle = owner.color;
      g.beginPath();
      g.arc(ox, oy, r, 0, Math.PI * 2);
      g.fill();
      g.lineWidth = 5;
      g.strokeStyle = '#fff';
      g.stroke();
      emoji(g, owner.pawn, ox, oy + 2, r * 1.2);
    }
  }

  // ------------------------------------------------------- bâtiments 3D
  bandAnchor(i) {
    const b = cellBox(i);
    const side = bandSide(i);
    const bw = Math.min(b.w, b.d) * 0.3;
    // Retourne la ligne médiane du bandeau (de start à end) dans le plan du plateau
    if (side === 'top') return { a: new THREE.Vector3(b.x0 + bw * 0.95, 0, b.z0 + bw / 2), b: new THREE.Vector3(b.x1 - 0.12, 0, b.z0 + bw / 2), horiz: true };
    if (side === 'bottom') return { a: new THREE.Vector3(b.x0 + bw * 0.95, 0, b.z1 - bw / 2), b: new THREE.Vector3(b.x1 - 0.12, 0, b.z1 - bw / 2), horiz: true };
    if (side === 'left') return { a: new THREE.Vector3(b.x0 + bw / 2, 0, b.z0 + bw * 0.95), b: new THREE.Vector3(b.x0 + bw / 2, 0, b.z1 - 0.12), horiz: false };
    return { a: new THREE.Vector3(b.x1 - bw / 2, 0, b.z0 + bw * 0.95), b: new THREE.Vector3(b.x1 - bw / 2, 0, b.z1 - 0.12), horiz: false };
  }

  makeHouse(color) {
    const g = new THREE.Group();
    const wall = new THREE.MeshStandardMaterial({ color: new THREE.Color(shade(color, 0.08)), roughness: 0.5 });
    const roof = new THREE.MeshStandardMaterial({ color: new THREE.Color(shade(color, -0.25)), roughness: 0.45 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.17, 0.2), wall);
    body.position.y = 0.085;
    const top = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.13, 4), roof);
    top.position.y = 0.17 + 0.065;
    top.rotation.y = Math.PI / 4;
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.08, 0.01), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 }));
    door.position.set(0, 0.04, 0.101);
    g.add(body, top, door);
    g.traverse((o) => o.isMesh && (o.castShadow = o.receiveShadow = true));
    return g;
  }
  makeHotel(color) {
    const g = new THREE.Group();
    const winTex = (rows, cols) => {
      const c = makeCanvas(64, 16 * rows + 8);
      const x = c.getContext('2d');
      x.fillStyle = '#000';
      x.fillRect(0, 0, c.width, c.height);
      for (let r = 0; r < rows; r++) for (let k = 0; k < cols; k++) {
        x.fillStyle = Math.random() < 0.8 ? '#ffe9a8' : '#6b5a2a';
        x.fillRect(6 + k * (52 / cols), 6 + r * 16, 52 / cols - 6, 9);
      }
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      return t;
    };
    const wallCol = new THREE.Color(shade(color, 0.12));
    const lower = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.34, 0.32), new THREE.MeshStandardMaterial({ color: wallCol, roughness: 0.45, emissive: 0xffffff, emissiveMap: winTex(3, 4), emissiveIntensity: 0.9 }));
    lower.position.y = 0.17;
    const ledge = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.03, 0.36), new THREE.MeshStandardMaterial({ color: 0xf5f5f5, roughness: 0.5 }));
    ledge.position.y = 0.355;
    const upper = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.28, 0.24), new THREE.MeshStandardMaterial({ color: wallCol, roughness: 0.45, emissive: 0xffffff, emissiveMap: winTex(3, 3), emissiveIntensity: 0.9 }));
    upper.position.y = 0.37 + 0.14;
    const roof = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.04, 0.28), new THREE.MeshStandardMaterial({ color: new THREE.Color(shade(color, -0.3)), roughness: 0.4 }));
    roof.position.y = 0.67;
    const awning = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.02, 0.08), new THREE.MeshStandardMaterial({ color: 0xffd166, metalness: 0.6, roughness: 0.3 }));
    awning.position.set(0, 0.11, 0.19);
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.01), new THREE.MeshStandardMaterial({ color: 0x222233, emissive: 0xffc04d, emissiveIntensity: 0.4 }));
    door.position.set(0, 0.05, 0.162);
    const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.075), new THREE.MeshStandardMaterial({ color: 0xffd166, metalness: 0.9, roughness: 0.2, emissive: 0x8a6200, emissiveIntensity: 0.8 }));
    star.position.y = 0.8;
    star.userData.spin = true;
    g.add(lower, ledge, upper, roof, awning, door, star);
    g.traverse((o) => o.isMesh && (o.castShadow = o.receiveShadow = true));
    return g;
  }
  makeFlag(color) {
    const g = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.42, 8), new THREE.MeshStandardMaterial({ color: 0xdddddd, metalness: 0.8, roughness: 0.3 }));
    pole.position.y = 0.21;
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.lineTo(0.2, -0.06);
    shape.lineTo(0, -0.12);
    shape.closePath();
    const cloth = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshStandardMaterial({ color: new THREE.Color(color), side: THREE.DoubleSide, roughness: 0.6 }));
    cloth.position.set(0.012, 0.42, 0);
    cloth.userData.wave = true;
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.025, 10, 8), new THREE.MeshStandardMaterial({ color: 0xffd166, metalness: 0.9, roughness: 0.2 }));
    ball.position.y = 0.43;
    g.add(pole, cloth, ball);
    g.traverse((o) => o.isMesh && (o.castShadow = true));
    return g;
  }

  syncBuildings(i, owner, level) {
    const c = this.meta.cells[i];
    if (c.type !== 'city' && c.type !== 'resort') return;
    const cur = this.buildings[i] || { level: 0, color: null, objs: [] };
    const color = owner ? owner.color : null;
    const wantLevel = owner && c.type === 'city' ? level : 0;
    // Drapeau de propriété (terrain sans bâtiment ou station)
    const wantFlag = owner && wantLevel === 0;
    const fl = this.flags[i];
    if (wantFlag && (!fl || fl.color !== color)) {
      if (fl) this.removeObj(fl.obj);
      const obj = this.makeFlag(color);
      const b = cellBox(i);
      const anchor = c.type === 'city' ? this.bandAnchor(i) : null;
      const p = anchor ? anchor.a.clone().lerp(anchor.b, 0.55) : new THREE.Vector3(b.cx + b.w * 0.28, 0, b.cz - b.d * 0.25);
      obj.position.set(p.x, TOP, p.z);
      this.scene.add(obj);
      if (this.animateBuilds) {
        obj.scale.setScalar(0.01);
        this.tween(500, (t) => obj.scale.setScalar(Math.max(0.01, ease.back(t))));
      }
      this.flags[i] = { obj, color };
    } else if (!wantFlag && fl) {
      this.removeObj(fl.obj);
      delete this.flags[i];
    }
    if (cur.level === wantLevel && cur.color === color) return;
    // Couleur changée (rachat) : on reconstruit sans animation de chute
    const recolor = cur.color && color && cur.color !== color && cur.level === wantLevel;
    for (const o of cur.objs) recolor ? this.scene.remove(o) : this.removeObj(o);
    const objs = [];
    if (wantLevel > 0) {
      const a = this.bandAnchor(i);
      const positions = wantLevel === 4 ? [0.55] : wantLevel === 1 ? [0.55] : wantLevel === 2 ? [0.35, 0.75] : [0.2, 0.55, 0.9];
      positions.forEach((f, k) => {
        const obj = wantLevel === 4 ? this.makeHotel(color) : this.makeHouse(color);
        obj.userData.base = wantLevel === 4 ? 1.2 : 1.15;
        obj.scale.setScalar(obj.userData.base);
        const p = a.a.clone().lerp(a.b, f);
        obj.position.set(p.x, TOP, p.z);
        if (!a.horiz) obj.rotation.y = Math.PI / 2;
        this.scene.add(obj);
        objs.push(obj);
        const isNew = !recolor && (wantLevel === 4 || k >= cur.level || cur.color !== color);
        if (isNew && this.animateBuilds) this.animateBuild(obj, k * 140, wantLevel === 4);
      });
    }
    this.buildings[i] = { level: wantLevel, color, objs };
  }

  animateBuild(obj, delay, hotel) {
    obj.visible = false;
    const y0 = obj.position.y;
    const k = obj.userData.base || 1;
    if (hotel) {
      this.tween(900, (t) => {
        obj.visible = true;
        obj.scale.set(k, k * Math.max(0.01, ease.back(t)), k);
      }, delay).then(() => this.sparkle(obj.position, 0xffd166, 18));
      this.wait(delay).then(() => this.dust(obj.position));
    } else {
      this.tween(650, (t) => {
        obj.visible = true;
        obj.position.y = y0 + 1.6 * (1 - ease.bounce(t));
        const sq = t > 0.35 && t < 0.55 ? 1 - Math.sin(((t - 0.35) / 0.2) * Math.PI) * 0.2 : 1;
        obj.scale.set(k / Math.sqrt(sq), k * sq, k / Math.sqrt(sq));
      }, delay).then(() => {
        obj.position.y = y0;
        obj.scale.setScalar(k);
      });
      this.wait(delay + 260).then(() => this.dust(obj.position));
    }
  }

  removeObj(obj) {
    const k0 = obj.scale.x;
    this.tween(380, (t) => {
      const s = Math.max(0.01, (1 - ease.inOut(t)) * k0);
      obj.scale.set(s, s, s);
    }).then(() => this.scene.remove(obj));
    this.dust(obj.position, 0x999999);
  }

  // Particules
  dust(pos, color = 0xf5ecd8) {
    const geo = new THREE.SphereGeometry(0.035, 6, 5);
    for (let k = 0; k < 10; k++) {
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 }));
      const a = (k / 10) * Math.PI * 2;
      m.position.set(pos.x, TOP + 0.03, pos.z);
      this.scene.add(m);
      const dx = Math.cos(a) * 0.35;
      const dz = Math.sin(a) * 0.35;
      this.tween(600, (t) => {
        m.position.x = pos.x + dx * ease.out(t);
        m.position.z = pos.z + dz * ease.out(t);
        m.position.y = TOP + 0.03 + Math.sin(t * Math.PI) * 0.12;
        m.material.opacity = 0.9 * (1 - t);
        m.scale.setScalar(1 + t * 1.5);
      }).then(() => this.scene.remove(m));
    }
  }
  sparkle(pos, color = 0xffd166, n = 14) {
    const geo = new THREE.OctahedronGeometry(0.04);
    for (let k = 0; k < n; k++) {
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true }));
      m.position.set(pos.x, TOP + 0.5, pos.z);
      this.scene.add(m);
      const v = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.8 + 0.4, Math.random() - 0.5).multiplyScalar(1.4);
      this.tween(900, (t) => {
        m.position.set(pos.x + v.x * t, TOP + 0.5 + v.y * t - 1.2 * t * t, pos.z + v.z * t);
        m.rotation.y += 0.2;
        m.material.opacity = 1 - t;
      }).then(() => this.scene.remove(m));
    }
  }

  syncFestival(i, mult) {
    const t = this.tiles[i];
    if (mult && (!t.fest || t.fest.mult !== mult)) {
      if (t.fest) this.scene.remove(t.fest.obj);
      const obj = new THREE.Group();
      const sp = this.textSprite(`🎉 ×${mult}`, { bg: '#ff2fb3', scale: 0.42 });
      sp.position.y = 0.85;
      obj.add(sp);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.025, 8, 40), new THREE.MeshBasicMaterial({ color: 0xff2fb3, transparent: true, opacity: 0.8 }));
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.05;
      ring.userData.pulse = true;
      obj.add(ring);
      const confetti = [];
      for (let k = 0; k < 12; k++) {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 0.03), new THREE.MeshBasicMaterial({ color: new THREE.Color().setHSL(k / 12, 0.9, 0.6), side: THREE.DoubleSide }));
        m.userData.a = (k / 12) * Math.PI * 2;
        obj.add(m);
        confetti.push(m);
      }
      obj.userData.confetti = confetti;
      const b = t.box;
      obj.position.set(b.cx, TOP, b.cz);
      this.scene.add(obj);
      t.fest = { obj, mult };
      this.sparkle(obj.position, 0xff2fb3, 20);
    } else if (!mult && t.fest) {
      this.scene.remove(t.fest.obj);
      t.fest = null;
    }
  }

  // ------------------------------------------------------------- pions
  makePawn(p) {
    const g = new THREE.Group();
    const col = new THREE.Color(p.color);
    const mat = new THREE.MeshStandardMaterial({ color: col, roughness: 0.28, metalness: 0.15 });
    const pts = [
      [0, 0], [0.2, 0], [0.22, 0.03], [0.2, 0.07], [0.13, 0.1], [0.1, 0.16], [0.075, 0.3], [0.12, 0.33], [0.07, 0.36], [0, 0.36],
    ].map(([x, y]) => new THREE.Vector2(x, y));
    const body = new THREE.Mesh(new THREE.LatheGeometry(pts, 32), mat);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.11, 24, 16), mat);
    head.position.y = 0.44;
    g.add(body, head);
    if (p.vip) {
      const goldMat = new THREE.MeshStandardMaterial({ color: 0xffd166, metalness: 0.9, roughness: 0.2 });
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.205, 0.022, 10, 32), goldMat);
      band.rotation.x = Math.PI / 2;
      band.position.y = 0.035;
      g.add(band);
      const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.06, 0.06, 8, 1, true), goldMat);
      crown.position.y = 0.56;
      g.add(crown);
    }
    g.traverse((o) => o.isMesh && (o.castShadow = true));
    // Étiquette emoji au-dessus du pion
    const label = this.emojiSprite(p.pawn, 0.32, p.color);
    label.position.y = 0.84;
    label.renderOrder = 10;
    g.add(label);
    // Anneau du joueur actif
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.26, 0.34, 40), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.012;
    g.add(ring);
    g.userData = { ring, label, head, body };
    g.position.y = TOP;
    this.scene.add(g);
    return g;
  }

  pawnSlot(pos, k, n) {
    const b = cellBox(pos);
    if (n <= 1) return new THREE.Vector3(b.cx, TOP, b.cz);
    const r = Math.min(b.w, b.d) * 0.26;
    const a = (k / n) * Math.PI * 2 + Math.PI / 4;
    return new THREE.Vector3(b.cx + Math.cos(a) * r, TOP, b.cz + Math.sin(a) * r);
  }

  /** players : [{ id, pos, color, pawn, vip, bankrupt, current }] */
  placePawns(players, animate) {
    const groups = {};
    for (const p of players) if (!p.bankrupt) (groups[p.pos] ||= []).push(p);
    const seen = new Set();
    for (const [pos, list] of Object.entries(groups)) {
      list.forEach((p, k) => {
        seen.add(p.id);
        let pw = this.pawns[p.id];
        if (!pw) pw = this.pawns[p.id] = { obj: this.makePawn(p), pos: Number(pos) };
        pw.current = p.current;
        pw.pos = Number(pos);
        const to = this.pawnSlot(Number(pos), k, list.length);
        if (pw.moving) return;
        if (animate) {
          const from = pw.obj.position.clone();
          if (from.distanceTo(to) > 0.01) this.tween(220, (t) => pw.obj.position.lerpVectors(from, to, ease.out(t)));
        } else pw.obj.position.copy(to);
        pw.obj.visible = true;
      });
    }
    for (const [id, pw] of Object.entries(this.pawns)) if (!seen.has(id)) pw.obj.visible = false;
  }

  async animateMove(ev) {
    const pw = this.pawns[ev.pid];
    if (!pw) return;
    pw.moving = true;
    const obj = pw.obj;
    if (ev.teleport) {
      await this.tween(260, (t) => {
        obj.scale.setScalar(Math.max(0.01, 1 - t));
        obj.position.y = TOP + t * 0.6;
      });
      const to = this.pawnSlot(ev.to, 0, 1);
      obj.position.set(to.x, TOP + 2, to.z);
      await this.tween(420, (t) => {
        obj.scale.setScalar(Math.max(0.01, t));
        obj.position.y = TOP + 2 * (1 - ease.bounce(t));
      });
      obj.scale.setScalar(1);
      this.dust(obj.position, 0xffffff);
      pw.pos = ev.to;
      pw.moving = false;
      return;
    }
    const dir = ev.steps > 0 ? 1 : -1;
    let pos = ev.from;
    for (let s = 0; s < Math.abs(ev.steps); s++) {
      const next = (pos + dir + 32) % 32;
      const from = obj.position.clone();
      const to = this.pawnSlot(next, 0, 1);
      // Le pion se tourne vers sa destination
      obj.rotation.y = Math.atan2(to.x - from.x, to.z - from.z);
      await this.tween(165, (t) => {
        obj.position.lerpVectors(from, to, t);
        obj.position.y = TOP + Math.sin(t * Math.PI) * 0.38;
        const sq = 1 + Math.sin(t * Math.PI) * 0.08;
        obj.scale.set(1 / sq, sq, 1 / sq);
      });
      obj.scale.set(1, 1, 1);
      pos = next;
      pw.pos = pos;
      this.bumpTile(pos);
      if (this.cb.onStep) this.cb.onStep(pos);
    }
    obj.rotation.y = 0;
    pw.moving = false;
  }

  bumpTile(i) {
    const t = this.tiles[i];
    t.bump = 1;
  }

  // -------------------------------------------------------------- effets
  fx(i, kind, color) {
    const t = this.tiles[i];
    if (!t) return;
    if (kind === 'quake') {
      this.shake(0.8);
      this.dust(new THREE.Vector3(t.box.cx, 0, t.box.cz), 0x8d6e63);
    }
    t.flash = new THREE.Color(kind === 'rent' ? '#ff4757' : kind === 'festival' ? '#ff2fb3' : color || '#ffffff');
    t.flashT = 1;
    t.lift = 0.12;
    if (kind === 'takeover') this.sparkle(new THREE.Vector3(t.box.cx, 0, t.box.cz), new THREE.Color(color || '#fff').getHex(), 16);
  }
  shake(power = 0.6) {
    this.shakeT = power;
  }

  worldOf(spec) {
    if (!spec) return null;
    if (spec.bank) return new THREE.Vector3(0, BOARD_TOP + 0.2, 0.3);
    if (spec.cell != null) {
      const b = cellBox(spec.cell);
      return new THREE.Vector3(b.cx, TOP + 0.1, b.cz);
    }
    if (spec.pawn) {
      const pw = this.pawns[spec.pawn];
      return pw ? pw.obj.position.clone().add(new THREE.Vector3(0, 0.5, 0)) : null;
    }
    return null;
  }

  coins(fromSpec, toSpec, n = 6) {
    const a = this.worldOf(fromSpec);
    const b = this.worldOf(toSpec);
    if (!a || !b) return Promise.resolve();
    const geo = new THREE.CylinderGeometry(0.09, 0.09, 0.025, 20);
    const mat = new THREE.MeshStandardMaterial({ color: 0xffc94a, metalness: 0.9, roughness: 0.25, emissive: 0x5a3a00, emissiveIntensity: 0.35 });
    const proms = [];
    for (let k = 0; k < n; k++) {
      const c = new THREE.Mesh(geo, mat);
      c.castShadow = true;
      const j = new THREE.Vector3((Math.random() - 0.5) * 0.2, 0, (Math.random() - 0.5) * 0.2);
      c.position.copy(a).add(j);
      c.visible = false;
      this.scene.add(c);
      const h = 0.9 + a.distanceTo(b) * 0.12;
      proms.push(
        this.tween(560, (t) => {
          c.visible = true;
          c.position.lerpVectors(a, b, ease.inOut(t)).add(j);
          c.position.y += Math.sin(t * Math.PI) * h;
          c.rotation.x = t * Math.PI * 4;
        }, k * 60).then(() => this.scene.remove(c))
      );
    }
    return Promise.all(proms);
  }

  // --------------------------------------------------- projection écran
  toScreen(v) {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    const p = v.clone().project(this.camera);
    return { x: ((p.x + 1) / 2) * w, y: ((1 - p.y) / 2) * h };
  }
  pawnScreen(pid) {
    const pw = this.pawns[pid];
    if (!pw) return null;
    return this.toScreen(pw.obj.position.clone().add(new THREE.Vector3(0, 1.1, 0)));
  }
  cellRect(i) {
    const b = cellBox(i);
    const pts = [[b.x0, b.z0], [b.x1, b.z0], [b.x0, b.z1], [b.x1, b.z1]].map(([x, z]) => this.toScreen(new THREE.Vector3(x, TOP, z)));
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    return { left: Math.min(...xs), top: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
  }

  // ------------------------------------------------------------ caméra
  resize() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // Écran étroit (mobile portrait) : vue plus en surplomb pour remplir l'espace
    const base = w / h < 1.2 ? 1.2 : 1.02;
    if (this.basePitch !== base) {
      this.basePitch = base;
      this.view.pitch = base;
    }
    this.fitCamera();
  }
  /** Calcule la distance pour que tout le plateau tienne à l'écran. */
  fitCamera() {
    const { yaw, pitch, zoom } = this.view;
    const dir = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
    const corners = [];
    for (const x of [-5.45, 5.45]) for (const z of [-5.45, 5.45]) for (const y of [0, 0.5]) corners.push(new THREE.Vector3(x, y, z));
    let lo = 4;
    let hi = 60;
    for (let it = 0; it < 22; it++) {
      const d = (lo + hi) / 2;
      this.camera.position.copy(this.target).addScaledVector(dir, d);
      this.camera.lookAt(this.target);
      this.camera.updateMatrixWorld();
      this.camera.updateProjectionMatrix();
      let m = 0;
      for (const c of corners) {
        const p = c.clone().project(this.camera);
        m = Math.max(m, Math.abs(p.x), Math.abs(p.y));
      }
      if (m > 0.985) lo = d;
      else hi = d;
    }
    const d = hi / zoom;
    this.camera.position.copy(this.target).addScaledVector(dir, d);
    this.camera.lookAt(this.target);
    this.camera.updateProjectionMatrix();
  }
  resetView() {
    const from = { ...this.view };
    const to = { yaw: 0, pitch: this.basePitch || 1.02, zoom: 1 };
    this.tween(500, (t) => {
      const e = ease.inOut(t);
      this.view = { yaw: from.yaw + (to.yaw - from.yaw) * e, pitch: from.pitch + (to.pitch - from.pitch) * e, zoom: from.zoom + (to.zoom - from.zoom) * e };
      this.fitCamera();
    });
  }
  setPitch(p) {
    this.view.pitch = p;
    this.fitCamera();
  }

  bindInput() {
    const el = this.renderer.domElement;
    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const pick = (e) => {
      const r = el.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, this.camera);
      const hit = ray.intersectObjects(this.pickables, false)[0];
      return hit ? hit.object.userData.cell : -1;
    };
    const pointers = new Map();
    let drag = null;
    let pinch = null;
    el.addEventListener('pointerdown', (e) => {
      el.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 1) drag = { x: e.clientX, y: e.clientY, yaw: this.view.yaw, pitch: this.view.pitch, moved: 0 };
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), zoom: this.view.zoom };
        drag = null;
      }
    });
    el.addEventListener('pointermove', (e) => {
      if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch && pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        this.view.zoom = Math.min(2.2, Math.max(0.8, pinch.zoom * (d / pinch.d)));
        this.fitCamera();
        return;
      }
      if (drag) {
        const dx = e.clientX - drag.x;
        const dy = e.clientY - drag.y;
        drag.moved = Math.max(drag.moved, Math.abs(dx) + Math.abs(dy));
        if (drag.moved > 6) {
          this.view.yaw = Math.max(-1.1, Math.min(1.1, drag.yaw - dx * 0.006));
          this.view.pitch = Math.max(0.55, Math.min(1.45, drag.pitch + dy * 0.005));
          this.fitCamera();
          if (this.hover !== -1) this.setHover(-1);
        }
        return;
      }
      if (e.pointerType === 'mouse') this.setHover(pick(e));
    });
    const up = (e) => {
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinch = null;
      if (drag && drag.moved <= 6 && e.type === 'pointerup') {
        const i = pick(e);
        if (i >= 0 && this.cb.onClick) this.cb.onClick(i);
      }
      drag = null;
    };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('pointerleave', () => this.setHover(-1));
    el.addEventListener('dblclick', () => this.resetView());
    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.view.zoom = Math.min(2.2, Math.max(0.8, this.view.zoom * (e.deltaY < 0 ? 1.08 : 0.93)));
      this.fitCamera();
    }, { passive: false });
  }
  setHover(i) {
    if (this.hover === i) return;
    this.hover = i;
    this.renderer.domElement.style.cursor = i >= 0 ? 'pointer' : '';
    if (this.cb.onHover) this.cb.onHover(i);
  }

  // ------------------------------------------------------------ animation
  tween(ms, fn, delay = 0) {
    return new Promise((resolve) => this.tweens.push({ t0: performance.now() + delay, ms, fn, resolve }));
  }
  wait(ms) {
    return this.tween(ms, () => {});
  }

  loop(now) {
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(0.05, this.clock.getDelta());
    const time = this.clock.elapsedTime;
    // Interpolations
    for (let k = this.tweens.length - 1; k >= 0; k--) {
      const tw = this.tweens[k];
      if (now < tw.t0) continue;
      const t = Math.min(1, (now - tw.t0) / tw.ms);
      tw.fn(t);
      if (t >= 1) {
        this.tweens.splice(k, 1);
        tw.resolve();
      }
    }
    // Cases : survol, sélection, flash, rebond
    for (let i = 0; i < this.tiles.length; i++) {
      const t = this.tiles[i];
      const target = (this.hover === i ? 0.07 : 0) + (t.selectable ? 0.05 + Math.sin(time * 5) * 0.04 : 0);
      t.lift += (target - t.lift) * Math.min(1, dt * 12);
      t.bump = Math.max(0, t.bump - dt * 5);
      t.group.position.y = BOARD_TOP + t.lift - Math.sin(t.bump * Math.PI) * 0.05;
      const m = t.faceMat;
      if (t.flashT > 0) {
        t.flashT = Math.max(0, t.flashT - dt * 1.6);
        m.emissive.copy(t.flash);
        m.emissiveIntensity = t.flashT * 0.6;
      } else if (t.selectable) {
        m.emissive.set(0x7fdcff);
        m.emissiveIntensity = 0.06 + (Math.sin(time * 5) + 1) * 0.07;
      } else m.emissiveIntensity = 0;
      const dim = t.dimmed ? 0.35 : 1;
      m.color.setScalar(m.color.r + (dim - m.color.r) * Math.min(1, dt * 8));
      if (t.fest) {
        const o = t.fest.obj;
        o.position.y = TOP + t.lift;
        for (const c of o.userData.confetti) {
          const a = c.userData.a + time * 1.2;
          c.position.set(Math.cos(a) * 0.42, 0.35 + Math.sin(time * 3 + c.userData.a * 3) * 0.12, Math.sin(a) * 0.42);
          c.rotation.set(time * 3 + a, time * 2, 0);
        }
        o.children[0].position.y = 0.85 + Math.sin(time * 3) * 0.06;
      }
    }
    // Bâtiments : étoile des hôtels, drapeaux
    for (const b of Object.values(this.buildings)) {
      for (const o of b.objs) {
        o.traverse((c) => {
          if (c.userData.spin) c.rotation.y = time * 2;
        });
      }
    }
    for (const f of Object.values(this.flags)) {
      f.obj.children[1].rotation.y = Math.sin(time * 3 + f.obj.position.x) * 0.3;
    }
    // Pions : anneau du joueur actif, flottement de l'étiquette
    for (const pw of Object.values(this.pawns)) {
      const { ring, label } = pw.obj.userData;
      const k = (time * 0.9) % 1;
      ring.material.opacity = pw.current ? 0.85 * (1 - k) : 0;
      ring.scale.setScalar(pw.current ? 0.8 + k * 0.8 : 1);
      label.position.y = 0.84 + (pw.current ? Math.sin(time * 4) * 0.05 : 0);
    }
    // Décor
    this.waterTex.offset.x = (time * 0.02) % 1;
    this.waterTex.offset.y = (time * 0.012) % 1;
    for (const c of this.clouds) {
      c.position.x += c.userData.speed * dt;
      if (c.position.x > 6) c.position.x = -6;
    }
    const pl = this.planeSprite;
    pl.userData.t += dt;
    const cycle = pl.userData.t % 24;
    pl.visible = cycle < 9;
    if (pl.visible) pl.position.set(-8 + (cycle / 9) * 16, 2.6, 1.5 - (cycle / 9) * 3);
    // Tremblement
    let shakeOff = null;
    if (this.shakeT > 0) {
      this.shakeT = Math.max(0, this.shakeT - dt);
      shakeOff = new THREE.Vector3((Math.random() - 0.5) * 0.18, (Math.random() - 0.5) * 0.1, 0).multiplyScalar(this.shakeT * 2);
      this.camera.position.add(shakeOff);
    }
    this.renderer.render(this.scene, this.camera);
    if (shakeOff) this.camera.position.sub(shakeOff);
    this.ready = true;
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.resizeObs.disconnect();
    this.scene.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => {
        if (m.map) m.map.dispose();
        m.dispose();
      });
    });
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}

export function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGL2RenderingContext && c.getContext('webgl2'));
  } catch {
    return false;
  }
}
