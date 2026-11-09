// ============================================================================
//  MyPoly — Carton ! : table 3D (WebGL / Three.js)
//  Même rendu que le plateau MyPoly (cadre bois, liseré doré, feutre, lumières),
//  cartes en 3D qui volent, se retournent et s'empilent.
// ============================================================================
import * as THREE from '/vendor/three/three.module.min.js';

const FONT = "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";
const BOARD_TOP = 0.2;
const FELT = BOARD_TOP + 0.02;
const CW = 1.1; // largeur d'une carte (monde)
const CH = CW * 1.46;
const CT = 0.012; // épaisseur
const COLORS = { r: ['#ff5a5f', '#c9283a'], b: ['#3fa7ff', '#1b5fd0'], g: ['#2ecc71', '#138a4a'], y: ['#ffb020', '#d9750a'], w: ['#3a2c78', '#160f38'] };
const ease = {
  out: (t) => 1 - Math.pow(1 - t, 3),
  inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
};

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}
function rr(g, x, y, w, h, r) {
  g.beginPath();
  g.roundRect(x, y, w, h, r);
}

/** Dessine le symbole d'une carte (chiffre, Stop, Demi-tour, +2, Jokers). */
function drawSymbol(g, card, cx, cy, size, color) {
  g.save();
  g.translate(cx, cy);
  g.fillStyle = color;
  g.strokeStyle = color;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  const v = card.v;
  if (v === 'skip') {
    g.lineWidth = size * 0.16;
    g.beginPath();
    g.arc(0, 0, size * 0.36, 0, Math.PI * 2);
    g.stroke();
    g.beginPath();
    g.moveTo(-size * 0.25, size * 0.25);
    g.lineTo(size * 0.25, -size * 0.25);
    g.stroke();
  } else if (v === 'rev') {
    g.lineWidth = size * 0.13;
    g.beginPath();
    g.moveTo(-size * 0.38, -size * 0.12);
    g.lineTo(size * 0.3, -size * 0.12);
    g.moveTo(size * 0.12, -size * 0.3);
    g.lineTo(size * 0.32, -size * 0.12);
    g.lineTo(size * 0.12, size * 0.06);
    g.moveTo(size * 0.38, size * 0.16);
    g.lineTo(-size * 0.3, size * 0.16);
    g.moveTo(-size * 0.12, -size * 0.02);
    g.lineTo(-size * 0.32, size * 0.16);
    g.lineTo(-size * 0.12, size * 0.34);
    g.stroke();
  } else if (v === 'wild' || v === '+4') {
    const r = size * (v === '+4' ? 0.3 : 0.4);
    const cols = ['#ff5a5f', '#3fa7ff', '#2ecc71', '#ffb020'];
    cols.forEach((c, k) => {
      g.fillStyle = c;
      g.beginPath();
      g.moveTo(0, 0);
      g.arc(0, 0, r, -Math.PI / 2 + (k * Math.PI) / 2, (k * Math.PI) / 2);
      g.closePath();
      g.fill();
    });
    g.lineWidth = size * 0.05;
    g.strokeStyle = '#fff';
    g.beginPath();
    g.arc(0, 0, r, 0, Math.PI * 2);
    g.stroke();
    if (v === '+4') {
      g.font = `900 ${size * 0.42}px ${FONT}`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.lineWidth = size * 0.08;
      g.strokeStyle = '#120c2a';
      g.strokeText('+4', 0, size * 0.04);
      g.fillStyle = '#fff';
      g.fillText('+4', 0, size * 0.04);
    }
  } else {
    g.font = `900 ${size * (v === '+2' ? 0.58 : 0.8)}px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(v, 0, size * 0.05);
    if (v === '6' || v === '9') g.fillRect(-size * 0.18, size * 0.36, size * 0.36, size * 0.06);
  }
  g.restore();
}

/** Face d'une carte (même dessin que les cartes HTML de la main). */
export function drawCardFace(card, W = 256) {
  const H = Math.round(W * 1.46);
  const c = makeCanvas(W, H);
  const g = c.getContext('2d');
  const [c1, c2] = COLORS[card.c];
  g.fillStyle = '#fff';
  rr(g, 0, 0, W, H, W * 0.12);
  g.fill();
  const p = W * 0.055;
  g.save();
  rr(g, p, p, W - 2 * p, H - 2 * p, W * 0.08);
  g.clip();
  const grd = g.createLinearGradient(0, 0, W, H);
  grd.addColorStop(0, c1);
  grd.addColorStop(1, c2);
  g.fillStyle = grd;
  g.fillRect(0, 0, W, H);
  if (card.c === 'w') {
    const cols = ['rgba(255,90,95,.3)', 'rgba(63,167,255,.3)', 'rgba(46,204,113,.3)', 'rgba(255,176,32,.3)'];
    cols.forEach((col, k) => {
      g.fillStyle = col;
      g.beginPath();
      g.moveTo(W / 2, H / 2);
      g.arc(W / 2, H / 2, H, (k * Math.PI) / 2 - Math.PI / 4, ((k + 1) * Math.PI) / 2 - Math.PI / 4);
      g.closePath();
      g.fill();
    });
  }
  g.strokeStyle = 'rgba(255,255,255,.06)';
  g.lineWidth = W * 0.05;
  for (let k = -H; k < W + H; k += W * 0.24) {
    g.beginPath();
    g.moveTo(k, 0);
    g.lineTo(k + H, H);
    g.stroke();
  }
  const sh = g.createLinearGradient(0, 0, 0, H * 0.4);
  sh.addColorStop(0, 'rgba(255,255,255,.25)');
  sh.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = sh;
  g.fillRect(0, 0, W, H * 0.4);
  // Losange central
  g.save();
  g.translate(W / 2, H / 2);
  g.rotate(Math.PI / 4);
  const gem = W * 0.42;
  g.shadowColor = 'rgba(0,0,0,.25)';
  g.shadowOffsetY = W * 0.02;
  if (card.c === 'w') {
    const gg = g.createLinearGradient(-gem, -gem, gem, gem);
    gg.addColorStop(0, '#2b2257');
    gg.addColorStop(1, '#120c2a');
    g.fillStyle = gg;
  } else g.fillStyle = '#fff';
  rr(g, -gem, -gem, gem * 2, gem * 2, W * 0.12);
  g.fill();
  if (card.c === 'w') {
    g.shadowColor = 'transparent';
    g.lineWidth = W * 0.02;
    g.strokeStyle = 'rgba(255,209,102,.8)';
    g.stroke();
  }
  g.restore();
  drawSymbol(g, card, W / 2, H / 2, W * 0.62, card.c === 'w' ? '#fff' : c2);
  // Coins
  const corner = (x, y, rot) => {
    g.save();
    g.translate(x, y);
    g.rotate(rot);
    drawSymbol(g, card, 0, 0, W * 0.24, '#fff');
    g.restore();
  };
  corner(W * 0.17, H * 0.11, 0);
  corner(W * 0.83, H * 0.89, Math.PI);
  g.restore();
  return c;
}

/** Dos des cartes. */
export function drawCardBack(W = 256) {
  const H = Math.round(W * 1.46);
  const c = makeCanvas(W, H);
  const g = c.getContext('2d');
  const gold = g.createLinearGradient(0, 0, W, H);
  gold.addColorStop(0, '#fff7c9');
  gold.addColorStop(0.6, '#f0a522');
  gold.addColorStop(1, '#a8650b');
  g.fillStyle = gold;
  rr(g, 0, 0, W, H, W * 0.12);
  g.fill();
  const p = W * 0.05;
  g.save();
  rr(g, p, p, W - 2 * p, H - 2 * p, W * 0.08);
  g.clip();
  const bg = g.createRadialGradient(W / 2, H * 0.4, 10, W / 2, H / 2, H * 0.7);
  bg.addColorStop(0, '#2a3aa0');
  bg.addColorStop(0.7, '#141a52');
  bg.addColorStop(1, '#0b0f33');
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);
  g.strokeStyle = 'rgba(255,255,255,.05)';
  g.lineWidth = W * 0.05;
  for (let k = -H; k < W + H; k += W * 0.2) {
    g.beginPath();
    g.moveTo(k, 0);
    g.lineTo(k + H, H);
    g.stroke();
  }
  g.setLineDash([W * 0.06, W * 0.05]);
  g.strokeStyle = 'rgba(255,209,102,.55)';
  g.lineWidth = W * 0.02;
  g.beginPath();
  g.arc(W / 2, H / 2, W * 0.38, 0, Math.PI * 2);
  g.stroke();
  g.setLineDash([]);
  g.translate(W / 2, H / 2);
  g.rotate(-0.32);
  g.font = `italic 900 ${W * 0.25}px ${FONT}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineJoin = 'round';
  g.lineWidth = W * 0.035;
  g.strokeStyle = '#1b1030';
  g.strokeText('Carton!', 0, 0);
  const tg = g.createLinearGradient(0, -W * 0.12, 0, W * 0.12);
  tg.addColorStop(0, '#fff3a6');
  tg.addColorStop(0.5, '#ffb340');
  tg.addColorStop(1, '#ff4b5c');
  g.fillStyle = tg;
  g.fillText('Carton!', 0, 0);
  g.restore();
  return c;
}

export class Card3D {
  constructor(container, cb = {}) {
    this.container = container;
    this.cb = cb;
    if (location.hostname === 'localhost') window.__c3 = this;
    this.tweens = [];
    this.clock = new THREE.Clock();
    this.view = { yaw: 0, pitch: 1.05, zoom: 1 };
    this.faceCache = {};
    this.stacks = {}; // cartes adverses posées devant chaque joueur
    this.pile = []; // défausse
    this.seatPos = {};
    this.dir = 1;

    const r = (this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' }));
    this.mobile = document.documentElement.classList.contains('touch') || Math.min(screen.width, screen.height) < 700;
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.toneMapping = THREE.NeutralToneMapping;
    r.toneMappingExposure = 1.05;
    r.domElement.className = 'board3d-canvas';
    container.append(r.domElement);
    this.maxAniso = r.capabilities.getMaxAnisotropy();

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(30, 1, 0.1, 300);
    this.target = new THREE.Vector3(0, 0, 0.3);
    this.homeTarget = this.target.clone();

    this.backTex = this.tex(drawCardBack());
    this.buildCardGeometry();
    this.edgeMat = new THREE.MeshStandardMaterial({ color: 0xf3ead5, roughness: 0.6 });
    this.backMat = new THREE.MeshStandardMaterial({ map: this.backTex, roughness: 0.45 });

    this.buildLights();
    this.buildTable();
    this.buildCenter();
    this.bindInput();

    this.resizeObs = new ResizeObserver(() => this.resize());
    this.resizeObs.observe(container);
    this.resize();
    this.loop = this.loop.bind(this);
    this.raf = requestAnimationFrame(this.loop);
  }

  tex(canvas) {
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = this.maxAniso;
    return t;
  }
  faceMat(card) {
    const key = card.c + card.v;
    if (!this.faceCache[key]) this.faceCache[key] = new THREE.MeshStandardMaterial({ map: this.tex(drawCardFace(card)), roughness: 0.45 });
    return this.faceCache[key];
  }
  /** Carte 3D : face visible vers le haut (ou le dos si card = null). */
  /**
   * Géométrie d'une carte aux coins arrondis (comme le dessin des faces) :
   * tranche extrudée + face et dos plats, UV calées sur toute la carte.
   */
  buildCardGeometry() {
    const r = CW * 0.12;
    const shape = new THREE.Shape();
    shape.moveTo(-CW / 2 + r, -CH / 2);
    shape.lineTo(CW / 2 - r, -CH / 2);
    shape.quadraticCurveTo(CW / 2, -CH / 2, CW / 2, -CH / 2 + r);
    shape.lineTo(CW / 2, CH / 2 - r);
    shape.quadraticCurveTo(CW / 2, CH / 2, CW / 2 - r, CH / 2);
    shape.lineTo(-CW / 2 + r, CH / 2);
    shape.quadraticCurveTo(-CW / 2, CH / 2, -CW / 2, CH / 2 - r);
    shape.lineTo(-CW / 2, -CH / 2 + r);
    shape.quadraticCurveTo(-CW / 2, -CH / 2, -CW / 2 + r, -CH / 2);
    const face = new THREE.ShapeGeometry(shape, 8);
    const uv = face.attributes.uv;
    const pos = face.attributes.position;
    for (let k = 0; k < uv.count; k++) uv.setXY(k, (pos.getX(k) + CW / 2) / CW, (pos.getY(k) + CH / 2) / CH);
    // Face visible vers le haut (le haut du dessin vers le fond de la table)
    this.faceGeo = face.clone().rotateX(-Math.PI / 2).translate(0, CT / 2 + 0.0005, 0);
    this.backGeo = face.clone().rotateX(Math.PI / 2).translate(0, -CT / 2 - 0.0005, 0);
    this.sideGeo = new THREE.ExtrudeGeometry(shape, { depth: CT, bevelEnabled: false, curveSegments: 8 }).rotateX(-Math.PI / 2).translate(0, -CT / 2, 0);
  }
  makeCard(card) {
    const g = new THREE.Group();
    const side = new THREE.Mesh(this.sideGeo, this.edgeMat);
    const top = new THREE.Mesh(this.faceGeo, card ? this.faceMat(card) : this.backMat);
    const bottom = new THREE.Mesh(this.backGeo, this.backMat);
    for (const m of [side, top, bottom]) {
      m.castShadow = true;
      m.receiveShadow = true;
      g.add(m);
    }
    return g;
  }

  // ------------------------------------------------------------------ scène
  buildLights() {
    const s = this.scene;
    s.add(new THREE.HemisphereLight(0xffffff, 0x2a3550, 1.15));
    const sun = new THREE.DirectionalLight(0xfff3dd, 2.0);
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
    const catcher = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.ShadowMaterial({ opacity: 0.32 }));
    catcher.rotation.x = -Math.PI / 2;
    catcher.position.y = -0.01;
    catcher.receiveShadow = true;
    this.scene.add(catcher);
    const hc = makeCanvas(256, 256);
    const hg = hc.getContext('2d');
    const halo = hg.createRadialGradient(128, 128, 40, 128, 128, 128);
    halo.addColorStop(0, 'rgba(0,0,0,.55)');
    halo.addColorStop(0.6, 'rgba(0,0,0,.25)');
    halo.addColorStop(1, 'rgba(0,0,0,0)');
    hg.fillStyle = halo;
    hg.fillRect(0, 0, 256, 256);
    const haloMesh = new THREE.Mesh(new THREE.PlaneGeometry(17, 17), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(hc), transparent: true, depthWrite: false }));
    haloMesh.rotation.x = -Math.PI / 2;
    haloMesh.position.y = -0.02;
    this.scene.add(haloMesh);
    const wood = new THREE.MeshStandardMaterial({ color: 0x6b4420, roughness: 0.55, metalness: 0.05 });
    const gold = new THREE.MeshStandardMaterial({ color: 0xe0b54f, roughness: 0.28, metalness: 0.85 });
    const base = new THREE.Mesh(new THREE.BoxGeometry(10.9, BOARD_TOP - 0.02, 10.9), wood);
    base.position.y = (BOARD_TOP - 0.02) / 2;
    base.castShadow = base.receiveShadow = true;
    this.scene.add(base);
    const rim = new THREE.Mesh(new THREE.BoxGeometry(10.62, 0.04, 10.62), gold);
    rim.position.y = BOARD_TOP - 0.01;
    this.scene.add(rim);
    // Feutre : océan dégradé, motif et logo imprimé, comme le centre du plateau MyPoly
    const S = 2048;
    const fc = makeCanvas(S, S);
    const fg = fc.getContext('2d');
    const bg = fg.createRadialGradient(S * 0.5, S * 0.48, 60, S * 0.5, S * 0.5, S * 0.75);
    bg.addColorStop(0, '#2aa3b4');
    bg.addColorStop(0.55, '#147083');
    bg.addColorStop(1, '#0a3a4c');
    fg.fillStyle = bg;
    fg.fillRect(0, 0, S, S);
    fg.strokeStyle = 'rgba(255,255,255,.05)';
    fg.lineWidth = 6;
    for (let rr2 = 60; rr2 < S; rr2 += 70) {
      fg.beginPath();
      fg.arc(S / 2, S * 1.15, rr2, 0, Math.PI * 2);
      fg.stroke();
    }
    // Liseré doré intérieur
    fg.strokeStyle = 'rgba(255,209,102,.35)';
    fg.lineWidth = 10;
    rr(fg, 70, 70, S - 140, S - 140, 90);
    fg.stroke();

    const ft = this.tex(fc);
    const felt = new THREE.Mesh(new THREE.BoxGeometry(10.36, 0.04, 10.36), [wood, wood, new THREE.MeshStandardMaterial({ map: ft, roughness: 0.85 }), wood, wood, wood]);
    felt.position.y = BOARD_TOP;
    felt.receiveShadow = true;
    this.scene.add(felt);
  }

  /** Centre : pioche, défausse, anneau de couleur, flèches du sens du jeu. */
  buildCenter() {
    this.deckPos = new THREE.Vector3(-1.0, FELT, 0.55);
    this.pilePos = new THREE.Vector3(1.0, FELT, 0.55);
    this.deck = new THREE.Group();
    this.deck.position.copy(this.deckPos);
    this.scene.add(this.deck);
    // Anneau lumineux de la couleur en cours
    const ring = new THREE.Mesh(new THREE.TorusGeometry(2.4, 0.05, 16, 120), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.9, roughness: 0.3 }));
    ring.rotation.x = Math.PI / 2;
    ring.position.set(0, FELT + 0.03, 0.55);
    this.scene.add(ring);
    this.colorRing = ring;
    const gc = makeCanvas(256, 256);
    const gg = gc.getContext('2d');
    const rgrad = gg.createRadialGradient(128, 128, 30, 128, 128, 128);
    rgrad.addColorStop(0, 'rgba(255,255,255,.55)');
    rgrad.addColorStop(0.7, 'rgba(255,255,255,.12)');
    rgrad.addColorStop(1, 'rgba(255,255,255,0)');
    gg.fillStyle = rgrad;
    gg.fillRect(0, 0, 256, 256);
    this.glow = new THREE.Mesh(new THREE.PlaneGeometry(5.6, 5.6), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(gc), color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.55 }));
    this.glow.rotation.x = -Math.PI / 2;
    this.glow.position.set(0, FELT + 0.022, 0.55);
    this.scene.add(this.glow);
    // Trois flèches courbes qui tournent dans le sens du jeu
    this.arrows = new THREE.Group();
    this.arrows.position.set(0, FELT + 0.04, 0.55);
    const amat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.35, roughness: 0.4 });
    for (let k = 0; k < 3; k++) {
      const a0 = (k / 3) * Math.PI * 2 + 0.35;
      const arc = new THREE.Mesh(new THREE.TorusGeometry(2.75, 0.045, 10, 40, Math.PI / 3), amat);
      arc.rotation.x = Math.PI / 2;
      arc.rotation.z = a0;
      // Pointe au bout de l'arc, orientée selon la tangente (sens de rotation)
      const head = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.36, 16), amat);
      const ah = a0 + Math.PI / 3;
      head.position.set(Math.cos(ah) * 2.75, 0, Math.sin(ah) * 2.75);
      head.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(-Math.sin(ah), 0, Math.cos(ah)));
      this.arrows.add(arc, head);
    }
    this.arrows.traverse((o) => o.isMesh && (o.castShadow = true));
    this.scene.add(this.arrows);
    // Anneau du joueur actif
    this.turnRing = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.68, 48), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
    this.turnRing.rotation.x = -Math.PI / 2;
    this.scene.add(this.turnRing);
  }

  setColor(hex) {
    const c = new THREE.Color(hex);
    this.colorRing.material.color.copy(c);
    this.colorRing.material.emissive.copy(c);
    this.glow.material.color.copy(c);
  }
  setDirection(dir) {
    this.dir = dir;
    this.arrows.scale.x = dir < 0 ? -1 : 1;
  }
  /** Taille de la pioche (pile de dos de cartes). */
  setDeck(n) {
    const layers = Math.max(1, Math.min(14, Math.ceil(n / 7)));
    if (this.deckLayers === layers) return;
    this.deckLayers = layers;
    while (this.deck.children.length) this.deck.remove(this.deck.children[0]);
    for (let k = 0; k < layers; k++) {
      const m = this.makeCard(null);
      m.position.y = CT / 2 + k * CT * 1.6;
      m.rotation.y = (Math.random() - 0.5) * 0.06;
      this.deck.add(m);
    }
  }
  deckTop() {
    return this.deckPos.clone().setY(FELT + this.deckLayers * CT * 1.6 + 0.02);
  }
  /** Défausse : les dernières cartes posées restent visibles en vrac. */
  setPile(cards) {
    const want = cards.slice(-6);
    const same = want.length === this.pile.length && want.every((c, k) => this.pile[k] && this.pile[k].card.id === c.id);
    if (same) return;
    for (const p of this.pile) this.scene.remove(p.mesh);
    this.pile = want.map((card, k) => {
      const mesh = this.makeCard(card);
      const pose = this.pilePose(card, k);
      mesh.position.copy(pose.pos);
      mesh.rotation.y = pose.rot;
      this.scene.add(mesh);
      return { card, mesh };
    });
  }
  pilePose(card, k) {
    const r = (((card.id * 47) % 34) - 17) * 0.02;
    const dx = (((card.id * 13) % 18) - 9) * 0.012;
    const dz = (((card.id * 29) % 14) - 7) * 0.012;
    return { pos: new THREE.Vector3(this.pilePos.x + dx, FELT + CT / 2 + k * CT * 1.2, this.pilePos.z + dz), rot: r };
  }

  /** Emplacements des joueurs autour de la table (slot → position du tas de cartes). */
  setSeats(map) {
    this.seatPos = {};
    const P = { me: [0, 4.2], ml: [-4.1, 0.6], tl: [-3.55, -3.7], tm: [0, -4.2], tr: [3.55, -3.7], mr: [4.1, 0.6] };
    for (const [pid, slot] of Object.entries(map)) this.seatPos[pid] = { slot, v: new THREE.Vector3(P[slot][0], FELT, P[slot][1]) };
  }
  /** Éventail de dos de cartes devant chaque adversaire. */
  setHands(counts) {
    for (const [pid, n] of Object.entries(counts)) {
      const seat = this.seatPos[pid];
      if (!seat || seat.slot === 'me') continue;
      const shown = Math.min(n, 14);
      let st = this.stacks[pid];
      if (st && st.n === shown) continue;
      if (st) this.scene.remove(st.group);
      const g = new THREE.Group();
      g.position.copy(seat.v);
      // Orientation : l'éventail regarde le centre de la table
      g.rotation.y = Math.atan2(seat.v.x, seat.v.z);
      for (let k = 0; k < shown; k++) {
        const m = this.makeCard(null);
        const t = shown > 1 ? k / (shown - 1) - 0.5 : 0;
        const ang = t * Math.min(1.3, 0.16 * shown);
        m.position.set(Math.sin(ang) * 0.9, CT / 2 + k * 0.004, Math.cos(ang) * 0.9 - 0.9);
        m.rotation.y = -ang;
        m.scale.setScalar(0.62);
        g.add(m);
      }
      this.scene.add(g);
      this.stacks[pid] = { group: g, n: shown };
    }
  }
  setTurn(pid, color) {
    const seat = pid && this.seatPos[pid];
    if (!seat) {
      this.turnRing.material.opacity = 0;
      this.turnPid = null;
      return;
    }
    this.turnPid = pid;
    this.turnRing.position.copy(seat.v).setY(FELT + 0.025);
    this.turnRing.material.color.set(color || '#ffffff');
  }

  // --------------------------------------------------------------- animations
  /** Fait voler une carte (face ou dos) d'un point à un autre, en arc, en se retournant si besoin. */
  flyCard(card, from, to, { ms = 520, flip = false, rotTo = 0, keep = false, scaleFrom = 1, scaleTo = 1 } = {}) {
    const m = this.makeCard(card);
    m.position.copy(from);
    m.scale.setScalar(scaleFrom);
    this.scene.add(m);
    const rotFrom = (Math.random() - 0.5) * 0.6;
    const peak = 1.1 + from.distanceTo(to) * 0.12;
    return this.tween(ms, (t) => {
      const e = ease.out(t);
      m.position.lerpVectors(from, to, e);
      m.position.y = from.y + (to.y - from.y) * e + Math.sin(Math.PI * t) * peak;
      m.rotation.y = rotFrom + (rotTo - rotFrom) * e;
      // Retournement : la carte arrive face visible
      m.rotation.z = flip ? Math.PI * (1 - e) : 0;
      m.scale.setScalar(scaleFrom + (scaleTo - scaleFrom) * e);
    }).then(() => {
      if (!keep) this.scene.remove(m);
      return m;
    });
  }
  seatPoint(pid) {
    const s = this.seatPos[pid];
    return s ? s.v.clone().setY(FELT + 0.15) : new THREE.Vector3(0, FELT + 0.2, 4.4);
  }
  /** Une carte jouée rejoint la défausse. */
  async playCard(pid, card, isMe) {
    const k = Math.min(this.pile.length, 5);
    const pose = this.pilePose(card, k);
    const from = isMe ? new THREE.Vector3(0, FELT + 1.6, 5.2) : this.seatPoint(pid);
    await this.flyCard(card, from, pose.pos, { ms: 480, flip: !isMe, rotTo: pose.rot, scaleFrom: isMe ? 1.1 : 0.62 });
    this.setPile([...this.pile.map((p) => p.card), card]);
    this.thud(pose.pos);
  }
  /** Cartes piochées : elles volent de la pioche vers le joueur. */
  async drawCards(pid, n, isMe) {
    const to = isMe ? new THREE.Vector3(0, FELT + 1.2, 5.4) : this.seatPoint(pid);
    const proms = [];
    for (let k = 0; k < Math.min(n, 8); k++) {
      proms.push(this.flyCard(null, this.deckTop(), to, { ms: 420, scaleTo: isMe ? 1.05 : 0.62 }));
      await this.wait(90);
    }
    await Promise.all(proms);
  }
  thud(pos) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.4, 0.5, 40), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.copy(pos).setY(FELT + 0.03);
    this.scene.add(ring);
    this.tween(420, (t) => {
      ring.scale.setScalar(1 + t * 1.6);
      ring.material.opacity = 0.8 * (1 - t);
    }).then(() => this.scene.remove(ring));
  }
  burst(pos, color, n = 24) {
    const col = new THREE.Color(color);
    const geo = new THREE.SphereGeometry(0.05, 6, 5);
    for (let k = 0; k < n; k++) {
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: k % 3 ? col : new THREE.Color(0xffd166), transparent: true }));
      const a = (k / n) * Math.PI * 2;
      const sp = 0.8 + Math.random() * 1;
      const vy = 1.6 + Math.random() * 1.2;
      m.position.copy(pos);
      this.scene.add(m);
      this.tween(850, (t) => {
        m.position.set(pos.x + Math.cos(a) * sp * t, pos.y + vy * t - 2.8 * t * t, pos.z + Math.sin(a) * sp * t);
        m.material.opacity = 1 - t;
      }).then(() => this.scene.remove(m));
    }
  }
  spinArrows() {
    this.arrowBoost = 1;
  }
  shake(p = 0.5) {
    this.shakeT = p;
  }
  /** Position à l'écran d'un point de la table. */
  screenOf(v) {
    const p = v.clone().project(this.camera);
    const r = this.renderer.domElement.getBoundingClientRect();
    return { x: r.left + ((p.x + 1) / 2) * r.width, y: r.top + ((1 - p.y) / 2) * r.height };
  }
  pileScreen() {
    return this.screenOf(this.pilePos.clone().setY(FELT + 0.3));
  }
  deckScreen() {
    return this.screenOf(this.deckPos.clone().setY(FELT + 0.3));
  }

  // ------------------------------------------------------------------ caméra
  resize() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (!w || !h) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (this.renderer.getPixelRatio() !== dpr) this.renderer.setPixelRatio(dpr);
    const cs = getComputedStyle(this.container);
    const v = (n) => {
      const x = parseFloat(cs.getPropertyValue(n));
      return Number.isFinite(x) ? x : 0;
    };
    this.sa = { top: v('--safe-top'), bottom: v('--safe-y'), left: v('--safe-x'), right: v('--safe-x') };
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    const base = (w - this.sa.left - this.sa.right) / Math.max(1, h - this.sa.top - this.sa.bottom) < 1.2 ? 1.2 : 1.05;
    if (this.basePitch !== base) {
      this.basePitch = base;
      this.view.pitch = base;
    }
    this.fitCamera();
  }
  fitCamera() {
    const { yaw, pitch, zoom } = this.view;
    const W = this.container.clientWidth || 1;
    const H = this.container.clientHeight || 1;
    const sa = this.sa || { top: 0, bottom: 0, left: 0, right: 0 };
    const sw = Math.max(80, W - sa.left - sa.right);
    const sh = Math.max(80, H - sa.top - sa.bottom);
    this.camera.setViewOffset(W, H, W / 2 - (sa.left + sw / 2), H / 2 - (sa.top + sh / 2), W, H);
    const xL = -1 + (2 * sa.left) / W + 0.015;
    const xR = 1 - (2 * sa.right) / W - 0.015;
    const yT = 1 - (2 * sa.top) / H - 0.015;
    const yB = -1 + (2 * sa.bottom) / H + 0.015;
    const dir = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
    const corners = [];
    for (const x of [-5.45, 5.45]) for (const z of [-5.45, 5.45]) for (const y of [0, 0.4]) corners.push(new THREE.Vector3(x, y, z));
    let lo = 4;
    let hi = 60;
    for (let it = 0; it < 22; it++) {
      const d = (lo + hi) / 2;
      this.camera.position.copy(this.homeTarget).addScaledVector(dir, d);
      this.camera.lookAt(this.homeTarget);
      this.camera.updateMatrixWorld();
      this.camera.updateProjectionMatrix();
      let fits = true;
      for (const c of corners) {
        const p = c.clone().project(this.camera);
        if (p.x < xL || p.x > xR || p.y < yB || p.y > yT) {
          fits = false;
          break;
        }
      }
      if (!fits) lo = d;
      else hi = d;
    }
    this.camera.position.copy(this.target).addScaledVector(dir, hi / zoom);
    this.camera.lookAt(this.target);
    this.camera.updateProjectionMatrix();
  }
  resetView() {
    const from = { ...this.view };
    const to = { yaw: 0, pitch: this.basePitch || 1.05, zoom: 1 };
    this.tween(450, (t) => {
      const e = ease.inOut(t);
      this.view = { yaw: from.yaw + (to.yaw - from.yaw) * e, pitch: from.pitch + (to.pitch - from.pitch) * e, zoom: from.zoom + (to.zoom - from.zoom) * e };
      this.fitCamera();
    });
  }
  bindInput() {
    const el = this.renderer.domElement;
    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    let drag = null;
    el.addEventListener('pointerdown', (e) => {
      el.setPointerCapture(e.pointerId);
      drag = { x: e.clientX, y: e.clientY, yaw: this.view.yaw, pitch: this.view.pitch, moved: 0 };
    });
    el.addEventListener('pointermove', (e) => {
      if (drag) {
        const dx = e.clientX - drag.x;
        const dy = e.clientY - drag.y;
        drag.moved = Math.max(drag.moved, Math.abs(dx) + Math.abs(dy));
        if (drag.moved > 6) {
          this.view.yaw = Math.max(-0.9, Math.min(0.9, drag.yaw - dx * 0.005));
          this.view.pitch = Math.max(0.6, Math.min(1.45, drag.pitch + dy * 0.004));
          this.fitCamera();
        }
        return;
      }
      // Survol de la pioche : curseur cliquable quand on peut piocher
      const r = el.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, this.camera);
      const hit = ray.intersectObjects(this.deck.children, true).length > 0;
      el.style.cursor = hit && this.deckActive ? 'pointer' : '';
    });
    const up = (e) => {
      if (drag && drag.moved <= 6 && e.type === 'pointerup') {
        const r = el.getBoundingClientRect();
        ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
        ray.setFromCamera(ndc, this.camera);
        if (ray.intersectObjects(this.deck.children, true).length && this.cb.onDeck) this.cb.onDeck();
      }
      drag = null;
    };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('dblclick', () => this.resetView());
    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.view.zoom = Math.min(2, Math.max(0.85, this.view.zoom * (e.deltaY < 0 ? 1.08 : 0.93)));
      this.fitCamera();
    }, { passive: false });
  }

  // ------------------------------------------------------------ boucle
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
    // Sens du jeu : les flèches tournent (plus vite juste après un Demi-tour)
    this.arrowBoost = Math.max(0, (this.arrowBoost || 0) - dt * 0.8);
    this.arrows.rotation.y -= this.dir * dt * (0.35 + this.arrowBoost * 5);
    this.colorRing.material.emissiveIntensity = 0.75 + Math.sin(time * 3) * 0.2;
    // Joueur actif : anneau qui pulse devant ses cartes
    if (this.turnPid) {
      const k = (time * 1.1) % 1;
      this.turnRing.scale.setScalar(1 + k * 0.7);
      this.turnRing.material.opacity = 0.85 * (1 - k);
    }
    // Pioche : légère respiration quand on peut piocher
    this.deck.position.y = this.deckPos.y + (this.deckActive ? Math.abs(Math.sin(time * 4)) * 0.06 : 0);
    let off = null;
    if (this.shakeT > 0) {
      this.shakeT = Math.max(0, this.shakeT - dt);
      off = new THREE.Vector3((Math.random() - 0.5) * 0.16, (Math.random() - 0.5) * 0.08, 0).multiplyScalar(this.shakeT * 2);
      this.camera.position.add(off);
    }
    this.renderer.render(this.scene, this.camera);
    if (off) this.camera.position.sub(off);
  }
  destroy() {
    cancelAnimationFrame(this.raf);
    this.resizeObs.disconnect();
    this.scene.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
    });
    for (const m of Object.values(this.faceCache)) {
      m.map.dispose();
      m.dispose();
    }
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
