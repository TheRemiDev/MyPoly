// ============================================================================
//  MyPoly — Poker : table 3D (Three.js)
//  Table ovale capitonnée, tapis brodé, cartes, dos et jetons dessinés par nous
//  (canvas), fauteuils, animations de distribution, de mises et de gains.
// ============================================================================
import * as THREE from '/vendor/three/three.module.min.js';
import { makeCanvas, rr, drawSuit, drawCardFace, drawCardBack, drawChipTop, drawChipSide, chipLabel, chipBreakdown, CHIPS } from './poker-art.js';

const FONT = "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";
const TOP = 0.62; // hauteur du tapis
const SL = 2.6; // demi-longueur de la partie droite du tapis
const RAD = 3.3; // rayon des bouts arrondis du tapis
const RAIL = 0.78; // largeur du rebord capitonné
const CW = 0.92; // carte (monde)
const CH = CW * 1.4;
const CT = 0.01;
const CHIP_R = 0.17;
const ME_SCALE = 1.25; // mes cartes, plus grandes pour bien les lire
const CHIP_H = 0.042;
const ease = {
  out: (t) => 1 - (1 - t) ** 3,
  inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
};

/** Forme « hippodrome » (table ovale) centrée, de demi-longueur droite w et de rayon r. */
/** Générateur pseudo-aléatoire déterministe (mulberry32). */
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** Découpage varié d'un montant : une part en grosses valeurs, le reste en petites (≤ 34 jetons). */
function variedBreakdown(amount, rnd) {
  const values = CHIPS.map((c) => c[0]).filter((v) => v <= amount).sort((a, b) => b - a);
  if (!values.length) return [];
  const out = [];
  let left = amount;
  values.forEach((v, i) => {
    const smallest = i === values.length - 1;
    let k = Math.floor(left / v);
    // On garde de quoi mettre des jetons plus petits (sauf pour la plus petite valeur)
    if (!smallest && k > 0) k = Math.max(v * 2 <= amount ? 1 : 0, Math.floor(k * (0.45 + rnd() * 0.35)));
    for (let j = 0; j < k && out.length < 34; j++) out.push(v);
    left -= k * v;
  });
  // Trop de jetons ou reste non couvert : découpage glouton classique
  if (left > 0 || out.length >= 34) return chipBreakdown(amount, 30, Math.max(1, amount / 5));
  return out;
}

function racetrack(w, r, shape = new THREE.Shape()) {
  shape.moveTo(-w, -r);
  shape.lineTo(w, -r);
  shape.absarc(w, 0, r, -Math.PI / 2, Math.PI / 2, false);
  shape.lineTo(-w, r);
  shape.absarc(-w, 0, r, Math.PI / 2, (3 * Math.PI) / 2, false);
  return shape;
}

// ============================================================================
export { TOP, CW, CH, CT, makeCanvas, rr, drawSuit, THREE };

export class Poker3D {
  constructor(container, cb = {}) {
    this.container = container;
    this.cb = cb;
    if (location.hostname === 'localhost') window.__p3 = this;
    this.tweens = [];
    this.clock = new THREE.Clock();
    this.view = { yaw: 0, pitch: 1.0, zoom: 1 };
    this.faceCache = {};
    this.seatPos = {};
    this.seats = {}; // pid -> { cards: [], stack, bet, chair, amount, betAmount }
    this.boardMeshes = [];
    this.glows = [];

    const r = (this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' }));
    this.mobile = document.documentElement.classList.contains('touch') || Math.min(screen.width, screen.height) < 700;
    // Graphismes légers (ordinateurs peu puissants) : localStorage mp_gfx = low
    try {
      this.lowGfx = localStorage.getItem('mp_gfx') === 'low';
    } catch {
      this.lowGfx = false;
    }
    if (this.lowGfx) this.mobile = true;
    r.setPixelRatio(this.pixelRatio());
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.toneMapping = THREE.NeutralToneMapping;
    r.toneMappingExposure = 1.08;
    r.domElement.className = 'board3d-canvas';
    container.append(r.domElement);
    this.maxAniso = r.capabilities.getMaxAnisotropy();

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(32, 1, 0.1, 300);
    this.target = new THREE.Vector3(0, TOP, 0.25);
    this.homeTarget = this.target.clone();

    // Cartes en haute définition, satinées (pas de reflet blanc qui « brûle » le dessin)
    this.backMat = new THREE.MeshStandardMaterial({ map: this.tex(drawCardBack(512)), roughness: 0.7, metalness: 0, envMapIntensity: 0.55 });
    this.edgeMat = new THREE.MeshStandardMaterial({ color: 0xf4eedf, roughness: 0.6 });
    this.buildEnvironment();
    this.buildCardGeometry();
    this.buildChipKit();
    // Tout ce qui est sur la table vit dans « world », que l'on pivote d'un quart de tour en portrait
    this.world = new THREE.Group();
    this.scene.add(this.world);
    this.portrait = false;
    this.buildLights();
    this.buildRoom();
    this.buildTable();
    this.buildProps();
    this.bindInput();

    this.resizeObs = new ResizeObserver(() => this.resize());
    this.resizeObs.observe(container);
    this.resize();
    this.loop = this.loop.bind(this);
    this.raf = requestAnimationFrame(this.loop);
  }

  /** Image nette : au moins 1,5× la définition de l'écran sur ordinateur (anti-flou), 2× au plus sur téléphone. */
  pixelRatio() {
    const d = window.devicePixelRatio || 1;
    if (this.lowGfx) return 1;
    return this.mobile ? Math.min(d, 2) : Math.min(Math.max(d, 1.5), 2.5);
  }
  /**
   * Petit studio photo virtuel (panneaux lumineux) transformé en carte d'environnement :
   * l'or, le cuir, les jetons et le bois prennent de vrais reflets doux.
   */
  buildEnvironment() {
    const env = new THREE.Scene();
    const room = new THREE.Mesh(new THREE.BoxGeometry(30, 14, 30), new THREE.MeshBasicMaterial({ color: 0x1a1230, side: THREE.BackSide }));
    env.add(room);
    const panel = (w, hgt, color, x, y, z, rx = 0, ry = 0) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, hgt), new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }));
      m.position.set(x, y, z);
      m.rotation.set(rx, ry, 0);
      env.add(m);
    };
    panel(12, 12, 0xfff1d6, 0, 6.9, 0, Math.PI / 2); // la lampe au-dessus de la table
    panel(10, 4, 0x6a5cff, -14.9, 4, 0, 0, Math.PI / 2);
    panel(10, 4, 0xff6a9a, 14.9, 4, 0, 0, -Math.PI / 2);
    panel(16, 3, 0xffd9a0, 0, 3, -14.9);
    const pm = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pm.fromScene(env, 0.035).texture;
    this.scene.environmentIntensity = 0.55;
    pm.dispose();
  }
  tex(canvas) {
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = this.maxAniso;
    return t;
  }
  faceMat(c) {
    if (!this.faceCache[c]) this.faceCache[c] = new THREE.MeshStandardMaterial({ map: this.tex(drawCardFace(c, 512)), roughness: 0.7, metalness: 0, envMapIntensity: 0.55 });
    return this.faceCache[c];
  }

  // ------------------------------------------------------------- géométries
  buildCardGeometry() {
    const r = CW * 0.09;
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
    this.faceGeo = face.clone().rotateX(-Math.PI / 2).translate(0, CT / 2 + 0.0005, 0);
    this.backGeo = face.clone().rotateX(Math.PI / 2).translate(0, -CT / 2 - 0.0005, 0);
    this.sideGeo = new THREE.ExtrudeGeometry(shape, { depth: CT, bevelEnabled: false, curveSegments: 8 }).rotateX(-Math.PI / 2).translate(0, -CT / 2, 0);
    // Halo doré sous une carte mise en valeur
    const gc = makeCanvas(128, 160);
    const gg = gc.getContext('2d');
    const grd = gg.createRadialGradient(64, 80, 10, 64, 80, 80);
    grd.addColorStop(0, 'rgba(255,214,102,.95)');
    grd.addColorStop(0.55, 'rgba(255,190,60,.45)');
    grd.addColorStop(1, 'rgba(255,190,60,0)');
    gg.fillStyle = grd;
    gg.fillRect(0, 0, 128, 160);
    this.glowMat = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(gc), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    this.glowGeo = new THREE.PlaneGeometry(CW * 1.7, CH * 1.6).rotateX(-Math.PI / 2);
  }
  /** Carte 3D : face visible vers le haut (c = numéro de carte) ou dos (c = null). */
  makeCard(c) {
    const g = new THREE.Group();
    const side = new THREE.Mesh(this.sideGeo, this.edgeMat);
    const top = new THREE.Mesh(this.faceGeo, c == null ? this.backMat : this.faceMat(c));
    const bottom = new THREE.Mesh(this.backGeo, this.backMat);
    for (const m of [side, top, bottom]) {
      m.castShadow = true;
      m.receiveShadow = true;
      g.add(m);
    }
    g.userData.card = c;
    return g;
  }
  /** Retourne une carte posée face cachée : le dessus devient la face. */
  setCardFace(g, c) {
    g.children[1].material = c == null ? this.backMat : this.faceMat(c);
    g.userData.card = c;
  }

  buildChipKit() {
    this.chipGeo = new THREE.CylinderGeometry(CHIP_R, CHIP_R, CHIP_H, 56);
    this.chipMats = {};
    for (const [v, color, ink] of CHIPS) {
      // Vernis brillant (clearcoat) : reflets nets comme sur de vrais jetons
      const top = new THREE.MeshPhysicalMaterial({ map: this.tex(drawChipTop(color, ink, chipLabel(v), this.mobile ? 256 : 512)), roughness: 0.42, metalness: 0, clearcoat: 0.7, clearcoatRoughness: 0.25, envMapIntensity: 0.8 });
      const sideT = this.tex(drawChipSide(color));
      sideT.wrapS = THREE.RepeatWrapping;
      const side = new THREE.MeshPhysicalMaterial({ map: sideT, roughness: 0.45, clearcoat: 0.5, clearcoatRoughness: 0.3 });
      this.chipMats[v] = [side, top, top];
    }
  }
  /** Pile de jetons pour un montant (en colonnes de 10). */
  /**
   * Pile de jetons pour un montant, composée comme sur une vraie table : plusieurs
   * valeurs mélangées, colonnes de hauteurs différentes, empilement un peu irrégulier,
   * parfois un jeton posé à plat à côté. La composition dépend du montant (stable).
   */
  makeChips(amount) {
    const g = new THREE.Group();
    const rnd = seeded(Math.round(amount) * 7919 + 17);
    const list = variedBreakdown(Math.round(amount), rnd);
    // Emplacements des colonnes (en grappe serrée)
    const COL = [[0, 0], [CHIP_R * 2.04, 0.02], [CHIP_R * 1.02, -CHIP_R * 1.78], [-CHIP_R * 1.0, -CHIP_R * 1.8], [-CHIP_R * 2.04, 0.03], [CHIP_R * 1.03, CHIP_R * 1.78], [-CHIP_R * 1.02, CHIP_R * 1.77], [CHIP_R * 3.06, -CHIP_R * 1.76]];
    const groups = [];
    for (const v of list) {
      const last = groups[groups.length - 1];
      if (last && last.v === v && last.n < 9) last.n++;
      else groups.push({ v, n: 1 });
    }
    // Petites piles de couleurs différentes réparties autour de la plus grosse
    groups.sort((a, b) => b.n - a.n);
    const spill = groups.length >= 3 && rnd() < 0.45 ? groups[groups.length - 1] : null;
    groups.slice(0, COL.length).forEach((grp, k) => {
      const lean = (rnd() - 0.5) * 0.012; // la colonne penche légèrement
      const n = grp === spill && grp.n > 1 ? grp.n - 1 : grp.n;
      for (let i = 0; i < n; i++) {
        const m = new THREE.Mesh(this.chipGeo, this.chipMats[grp.v]);
        m.position.set(COL[k][0] + (rnd() - 0.5) * 0.02 + lean * i, CHIP_H / 2 + i * CHIP_H, COL[k][1] + (rnd() - 0.5) * 0.02 + lean * i * 0.6);
        m.rotation.set((rnd() - 0.5) * 0.03, rnd() * Math.PI * 2, (rnd() - 0.5) * 0.03);
        m.castShadow = true;
        g.add(m);
      }
    });
    // Un jeton « échappé » posé à plat à côté de la pile
    if (spill) {
      const m = new THREE.Mesh(this.chipGeo, this.chipMats[spill.v]);
      const a = rnd() * Math.PI * 2;
      m.position.set(Math.cos(a) * CHIP_R * 3.1, CHIP_H / 2, Math.sin(a) * CHIP_R * 3.1);
      m.rotation.y = rnd() * Math.PI;
      m.castShadow = true;
      g.add(m);
    }
    g.userData.amount = amount;
    return g;
  }

  // ------------------------------------------------------------------ scène
  buildLights() {
    const s = this.scene;
    s.add(new THREE.HemisphereLight(0xfff4e6, 0x1a1530, 0.9));
    // Lampe au-dessus de la table : lumière chaude et ombres douces
    const spot = new THREE.SpotLight(0xffe2b8, 220, 30, 0.75, 0.55, 1.6);
    spot.position.set(0, 11, 2.2);
    spot.target.position.set(0, TOP, 0);
    spot.castShadow = true;
    spot.shadow.mapSize.set(this.mobile ? 1024 : 2048, this.mobile ? 1024 : 2048);
    spot.shadow.bias = -0.0004;
    spot.shadow.normalBias = 0.02;
    spot.shadow.camera.near = 4;
    spot.shadow.camera.far = 20;
    s.add(spot, spot.target);
    const fill = new THREE.DirectionalLight(0xb9d4ff, 0.45);
    fill.position.set(-6, 7, 8);
    s.add(fill);
    const rim = new THREE.DirectionalLight(0xff9fc1, 0.35);
    rim.position.set(7, 5, -8);
    s.add(rim);
  }

  buildRoom() {
    // Sol : moquette sombre avec motif, éclairée par la lampe
    const S = 1024;
    const fc = makeCanvas(S, S);
    const g = fc.getContext('2d');
    const bg = g.createRadialGradient(S / 2, S / 2, 40, S / 2, S / 2, S * 0.62);
    bg.addColorStop(0, '#3b2152');
    bg.addColorStop(0.5, '#1f1335');
    bg.addColorStop(1, '#0c0818');
    g.fillStyle = bg;
    g.fillRect(0, 0, S, S);
    g.strokeStyle = 'rgba(255,209,102,.06)';
    g.lineWidth = 3;
    for (let k = 0; k < S; k += 64) {
      for (let j = 0; j < S; j += 64) {
        g.beginPath();
        g.moveTo(k + 32, j + 8);
        g.lineTo(k + 56, j + 32);
        g.lineTo(k + 32, j + 56);
        g.lineTo(k + 8, j + 32);
        g.closePath();
        g.stroke();
      }
    }
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshStandardMaterial({ map: this.tex(fc), roughness: 0.95 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);
  }

  buildTable() {
    const OUT_W = SL;
    const OUT_R = RAD + RAIL;
    // Pied central et socle
    const wood = new THREE.MeshStandardMaterial({ color: 0x4a2a14, roughness: 0.5, metalness: 0.08 });
    const darkWood = new THREE.MeshStandardMaterial({ color: 0x2a170b, roughness: 0.55 });
    const gold = new THREE.MeshStandardMaterial({ color: 0xe0b54f, roughness: 0.25, metalness: 0.9 });
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.3, TOP - 0.18, 32), darkWood);
    pillar.position.y = (TOP - 0.18) / 2;
    pillar.castShadow = true;
    this.world.add(pillar);
    // Plateau en bois (bord extérieur)
    const deck = new THREE.Mesh(new THREE.ExtrudeGeometry(racetrack(OUT_W, OUT_R + 0.06), { depth: 0.16, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelSegments: 3, curveSegments: 48 }), wood);
    deck.rotation.x = -Math.PI / 2;
    deck.position.y = TOP - 0.3; // dessus du plateau sous le feutre (pas de scintillement)
    deck.castShadow = deck.receiveShadow = true;
    this.world.add(deck);
    // Rebord capitonné (cuir) : anneau extrudé arrondi
    const ring = racetrack(OUT_W, OUT_R);
    ring.holes.push(new THREE.Path(racetrack(SL, RAD + 0.02).getPoints(96).reverse()));
    const lc = makeCanvas(512, 64);
    const lg = lc.getContext('2d');
    const lgr = lg.createLinearGradient(0, 0, 0, 64);
    lgr.addColorStop(0, '#2a1622');
    lgr.addColorStop(1, '#170b12');
    lg.fillStyle = lgr;
    lg.fillRect(0, 0, 512, 64);
    lg.fillStyle = 'rgba(255,255,255,.05)';
    for (let k = 0; k < 512; k += 32) lg.fillRect(k, 0, 2, 64);
    const leatherTex = this.tex(lc);
    leatherTex.wrapS = leatherTex.wrapT = THREE.RepeatWrapping;
    leatherTex.repeat.set(0.4, 0.4);
    const leather = new THREE.MeshStandardMaterial({ color: 0x3a1d2c, map: leatherTex, roughness: 0.48, metalness: 0.05 });
    const rail = new THREE.Mesh(new THREE.ExtrudeGeometry(ring, { depth: 0.1, bevelEnabled: true, bevelThickness: 0.12, bevelSize: 0.16, bevelSegments: 6, curveSegments: 64 }), leather);
    rail.rotation.x = -Math.PI / 2;
    rail.position.y = TOP - 0.02;
    rail.castShadow = rail.receiveShadow = true;
    this.world.add(rail);
    // Liseré doré entre le rebord et le tapis
    const trimShape = racetrack(SL, RAD + 0.05);
    trimShape.holes.push(new THREE.Path(racetrack(SL, RAD - 0.01).getPoints(96).reverse()));
    const trim = new THREE.Mesh(new THREE.ExtrudeGeometry(trimShape, { depth: 0.03, bevelEnabled: false, curveSegments: 64 }), gold);
    trim.rotation.x = -Math.PI / 2;
    trim.position.y = TOP - 0.005;
    this.world.add(trim);
    // Tapis (feutre) avec motifs imprimés
    const felt = new THREE.Mesh(new THREE.ShapeGeometry(racetrack(SL, RAD), 48), new THREE.MeshStandardMaterial({ map: this.tex(this.paintFelt()), roughness: 0.92 }));
    const uv = felt.geometry.attributes.uv;
    const pos = felt.geometry.attributes.position;
    const WX = SL + RAD;
    for (let k = 0; k < uv.count; k++) uv.setXY(k, (pos.getX(k) + WX) / (2 * WX), (pos.getY(k) + RAD) / (2 * RAD));
    felt.rotation.x = -Math.PI / 2;
    felt.position.y = TOP;
    felt.receiveShadow = true;
    this.feltMesh = felt;
    this.world.add(felt);
  }

  /** Feutre : vert émeraude, fibres, ligne de mise dorée, logo et emplacements du tableau. */
  paintFelt() {
    const WX = SL + RAD;
    const W = this.mobile ? 2048 : 4096;
    const u = W / 2048; // échelle des traits
    const H = Math.round((W * RAD) / WX);
    const fc = makeCanvas(W, H);
    const g = fc.getContext('2d');
    const k = W / (2 * WX); // pixels par unité monde
    const X = (x) => (x + WX) * k;
    const Z = (z) => (z + RAD) * k; // +y du canvas = +z local (vers moi en paysage)
    const bg = g.createRadialGradient(W / 2, H / 2, 40, W / 2, H / 2, W * 0.55);
    bg.addColorStop(0, '#16916c');
    bg.addColorStop(0.55, '#0d6a50');
    bg.addColorStop(1, '#063a2c');
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);
    // Fibres
    for (let i = 0; i < 9000 * u * u; i++) {
      g.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,.025)' : 'rgba(0,0,0,.05)';
      g.fillRect(Math.random() * W, Math.random() * H, 2 * u, 2 * u);
    }
    // Ligne de mise (hippodrome intérieur), dorée
    const line = (w, r, width, color, dash) => {
      g.save();
      g.strokeStyle = color;
      g.lineWidth = width * u;
      if (dash) g.setLineDash(dash);
      g.beginPath();
      g.moveTo(X(-w), Z(-r));
      g.lineTo(X(w), Z(-r));
      g.arc(X(w), Z(0), r * k, -Math.PI / 2, Math.PI / 2, true);
      g.lineTo(X(-w), Z(r));
      g.arc(X(-w), Z(0), r * k, Math.PI / 2, (3 * Math.PI) / 2, true);
      g.stroke();
      g.restore();
    };
    line(SL, RAD - 0.22, 5, 'rgba(255,209,102,.5)');
    line(SL, RAD - 1.15, 4, 'rgba(255,209,102,.38)', [18, 12]);
    // Emplacements des 5 cartes communes
    g.strokeStyle = 'rgba(255,255,255,.16)';
    g.lineWidth = 4 * u;
    for (let i = 0; i < 5; i++) {
      const c = this.boardPos(i);
      const w = (this.portrait ? CH : CW) + 0.08;
      const hh = (this.portrait ? CW : CH) + 0.08;
      rr(g, X(c.x) - (w / 2) * k, Z(c.z) - (hh / 2) * k, w * k, hh * k, 0.1 * k);
      g.stroke();
    }
    // Logo au centre (sous les cartes, visible avant le flop)
    g.save();
    const lc = this.L(0, this.boardZ);
    g.translate(X(lc.x), Z(lc.z));
    if (this.portrait) g.rotate(-Math.PI / 2);
    g.globalAlpha = 0.24;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `italic 900 ${0.95 * k}px ${FONT}`;
    g.fillStyle = '#ffd166';
    g.fillText('MyPoly', 0, -0.1 * k);
    g.font = `800 ${0.32 * k}px ${FONT}`;
    g.fillText('P  O  K  E  R', 0, 0.6 * k);
    g.restore();
    // Emblèmes des couleurs aux deux bouts de la table
    for (const [x, rot] of this.portrait ? [] : [[-(SL + RAD * 0.55), -Math.PI / 2], [SL + RAD * 0.55, Math.PI / 2]]) {
      g.save();
      g.translate(X(x), Z(0));
      g.rotate(rot);
      g.globalAlpha = 0.2;
      g.strokeStyle = '#ffd166';
      g.lineWidth = 5 * u;
      g.beginPath();
      g.arc(0, 0, 0.85 * k, 0, Math.PI * 2);
      g.stroke();
      for (let s = 0; s < 4; s++) drawSuit(g, s, Math.cos((s * Math.PI) / 2) * 0.42 * k, Math.sin((s * Math.PI) / 2) * 0.42 * k, 0.36 * k, '#ffd166');
      g.restore();
    }
    // Emplacement du pot
    g.strokeStyle = 'rgba(255,209,102,.28)';
    g.lineWidth = 4 * u;
    g.beginPath();
    g.arc(X(this.potPos.x), Z(this.potPos.z), 0.55 * k, 0, Math.PI * 2);
    g.stroke();
    return fc;
  }

  get boardZ() {
    return 0.25;
  }
  /** Position locale (sur la table) d'un point voulu en (x, z) « à l'écran » (le portrait pivote la table). */
  L(x, z, y = TOP) {
    return this.portrait ? new THREE.Vector3(z, y, -x) : new THREE.Vector3(x, y, z);
  }
  /** Rotation à ajouter pour qu'une carte face visible reste lisible malgré le pivot de la table. */
  get upRot() {
    return this.portrait ? Math.PI / 2 : 0;
  }
  get potPos() {
    return this.L(0, this.portrait ? -1.5 : -1.12);
  }
  boardXs() {
    return [-2.2, -1.1, 0, 1.1, 2.2];
  }
  boardPos(k) {
    return this.L(this.boardXs()[k], this.boardZ, TOP + CT / 2 + 0.002);
  }

  buildProps() {
    // Sabot du donneur (là d'où partent les cartes)
    this.shoePos = this.L(-1.6, -1.4, TOP + 0.05);
    // Bouton du donneur
    const dc = makeCanvas(256, 256);
    const dg = dc.getContext('2d');
    dg.fillStyle = '#fbf7ee';
    dg.beginPath();
    dg.arc(128, 128, 128, 0, Math.PI * 2);
    dg.fill();
    dg.strokeStyle = '#1b1f2e';
    dg.lineWidth = 10;
    dg.beginPath();
    dg.arc(128, 128, 104, 0, Math.PI * 2);
    dg.stroke();
    dg.fillStyle = '#1b1f2e';
    dg.font = `900 120px ${FONT}`;
    dg.textAlign = 'center';
    dg.textBaseline = 'middle';
    dg.fillText('D', 128, 134);
    const topM = new THREE.MeshStandardMaterial({ map: this.tex(dc), roughness: 0.3 });
    const sideM = new THREE.MeshStandardMaterial({ color: 0xe9e2d0, roughness: 0.4 });
    this.dealerBtn = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.07, 40), [sideM, topM, topM]);
    this.dealerBtn.castShadow = true;
    this.dealerBtn.visible = false;
    this.world.add(this.dealerBtn);
    // Anneau du joueur actif
    this.turnRing = new THREE.Mesh(new THREE.RingGeometry(0.85, 1.0, 64), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
    this.turnRing.rotation.x = -Math.PI / 2;
    this.world.add(this.turnRing);
    // Pot
    this.potGroup = new THREE.Group();
    this.potGroup.position.copy(this.potPos).setY(TOP + 0.002);
    this.world.add(this.potGroup);
  }

  // ------------------------------------------------------------ places
  /** Emplacements autour de la table : 'me' en bas, puis dans le sens des aiguilles d'une montre. */
  static slotsFor(n) {
    return { 1: ['tm'], 2: ['tl', 'tr'], 3: ['tl', 'tm', 'tr'], 4: ['bl', 'tl', 'tr', 'br'], 5: ['bl', 'tl', 'tm', 'tr', 'br'] }[n] || [];
  }
  setSeats(map) {
    this.lastMap = map;
    const P = this.portrait
      ? { me: [0, 4.25], bl: [-2.25, 2.35], tl: [-2.25, -2.35], tm: [0, -4.25], tr: [2.25, -2.35], br: [2.25, 2.35] }
      : { me: [0, 2.35], bl: [-3.7, 1.55], tl: [-3.7, -1.55], tm: [0, -2.35], tr: [3.7, -1.55], br: [3.7, 1.55] };
    for (const [pid, s] of Object.entries(this.seats)) if (!map[pid]) this.removeSeat(pid, s);
    this.seatPos = {};
    for (const [pid, slot] of Object.entries(map)) {
      const [x, z] = P[slot];
      const v = this.L(x, z);
      const lx = v.x;
      const lz = v.z;
      const dir = new THREE.Vector3(lx, 0, lz).normalize();
      const perp = new THREE.Vector3(-dir.z, 0, dir.x); // à la droite du joueur, vu de sa place
      this.seatPos[pid] = { slot, v, dir, perp, rot: Math.atan2(dir.x, dir.z) };
      if (!this.seats[pid]) this.seats[pid] = { cards: [], stack: null, bet: null, chair: null, amount: -1, betAmount: -1 };
      const st = this.seats[pid];
      if (st.slot !== slot) {
        if (st.chair) this.world.remove(st.chair);
        st.chair = slot === 'me' ? null : this.makeChair(v, dir);
        if (st.chair) this.world.add(st.chair);
        st.slot = slot;
        st.amount = -1;
        st.betAmount = -1;
      }
    }
  }
  removeSeat(pid, s) {
    for (const m of s.cards) this.world.remove(m);
    if (s.stack) this.world.remove(s.stack);
    if (s.bet) this.world.remove(s.bet);
    if (s.chair) this.world.remove(s.chair);
    delete this.seats[pid];
  }
  makeChair(v, dir) {
    const g = new THREE.Group();
    const leather = new THREE.MeshStandardMaterial({ color: 0x2b1a3a, roughness: 0.55 });
    const frame = new THREE.MeshStandardMaterial({ color: 0x1c110a, roughness: 0.5 });
    const seat = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.24, 1.0), leather);
    seat.position.y = 0.42;
    const back = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 1.0, 6, 16), leather);
    back.rotation.z = Math.PI / 2;
    back.position.set(0, 1.12, 0.45);
    const backPanel = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.7, 0.18), leather);
    backPanel.position.set(0, 0.82, 0.48);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.32, 0.3, 16), frame);
    base.position.y = 0.15;
    for (const m of [seat, back, backPanel, base]) {
      m.castShadow = true;
      m.receiveShadow = true;
      g.add(m);
    }
    const out = v.clone().addScaledVector(dir, 2.15);
    g.position.set(out.x, 0, out.z);
    g.rotation.y = Math.atan2(dir.x, dir.z);
    return g;
  }
  holePos(pid, k) {
    const s = this.seatPos[pid];
    const me = s.slot === 'me';
    const off = (k - 0.5) * (CW * (me ? 1.32 : 0.62));
    return s.v.clone().addScaledVector(s.perp, -off).setY(TOP + CT / 2 + 0.002 + k * 0.004);
  }
  stackPos(pid) {
    const s = this.seatPos[pid];
    return s.v.clone().addScaledVector(s.perp, s.slot === 'me' ? 1.55 : 1.15).addScaledVector(s.dir, 0.15).setY(TOP + 0.001);
  }
  betPos(pid) {
    const s = this.seatPos[pid];
    // Assez loin du centre pour ne jamais recouvrir les cartes communes
    return s.v.clone().multiplyScalar(0.72).setY(TOP + 0.001);
  }
  buttonPos(pid) {
    const s = this.seatPos[pid];
    return s.v.clone().multiplyScalar(0.72).addScaledVector(s.perp, -0.95).setY(TOP + 0.035);
  }

  // ------------------------------------------------------------ état statique
  /**
   * Met la table dans l'état donné, sans animation.
   * players : [{ id, stack, bet, hasCards, folded, cards (montrées) }], hole : mes cartes.
   */
  sync({ players, board, pot, dealer, current, hole, me, highlight }) {
    for (const p of players) {
      const s = this.seats[p.id];
      if (!s || !this.seatPos[p.id]) continue;
      this.setStack(p.id, p.stack);
      this.setBet(p.id, p.bet);
      const mine = p.id === me;
      const shown = p.cards || (mine ? hole : null);
      const want = p.hasCards || (p.cards && p.cards.length) ? 2 : 0;
      if (s.cards.length !== want) {
        for (const m of s.cards) this.world.remove(m);
        s.cards = [];
        for (let k = 0; k < want; k++) {
          const m = this.makeCard(shown ? shown[k] : null);
          this.placeHole(p.id, m, k, !!shown);
          this.world.add(m);
          s.cards.push(m);
        }
      } else {
        s.cards.forEach((m, k) => {
          const c = shown ? shown[k] : null;
          if (m.userData.card !== c) this.setCardFace(m, c);
          this.placeHole(p.id, m, k, !!shown);
        });
      }
      for (const m of s.cards) m.traverse((o) => o.material && (o.material.transparent = false));
      s.folded = p.folded;
    }
    this.setBoard(board || []);
    this.setPot(pot || 0);
    this.setDealer(dealer, false);
    this.setTurn(current);
    this.setHighlight(highlight || []);
  }
  placeHole(pid, m, k, faceUp) {
    const s = this.seatPos[pid];
    m.position.copy(this.holePos(pid, k));
    const me = s.slot === 'me';
    // Mes cartes et les cartes montrées sont tournées vers moi (lisibles)
    m.rotation.set(0, faceUp ? this.upRot + (k - 0.5) * -0.12 : s.rot + (k - 0.5) * 0.18, 0);
    if (me) m.scale.setScalar(ME_SCALE);
    else m.scale.setScalar(faceUp ? 0.82 : 0.7);
  }
  setStack(pid, amount) {
    const s = this.seats[pid];
    if (!s || s.amount === amount) return;
    if (s.stack) this.world.remove(s.stack);
    s.stack = amount > 0 ? this.makeChips(amount) : null;
    if (s.stack) {
      s.stack.position.copy(this.stackPos(pid));
      this.world.add(s.stack);
    }
    s.amount = amount;
  }
  setBet(pid, amount) {
    const s = this.seats[pid];
    if (!s || s.betAmount === amount) return;
    if (s.bet) this.world.remove(s.bet);
    s.bet = amount > 0 ? this.makeChips(amount) : null;
    if (s.bet) {
      s.bet.position.copy(this.betPos(pid));
      this.world.add(s.bet);
    }
    s.betAmount = amount;
  }
  setPot(amount) {
    if (this.potGroup.userData.amount === amount) return;
    this.potGroup.clear();
    if (amount > 0) {
      const g = this.makeChips(amount);
      this.potGroup.add(g);
    }
    this.potGroup.userData.amount = amount;
  }
  setBoard(board) {
    while (this.boardMeshes.length > board.length) this.world.remove(this.boardMeshes.pop());
    board.forEach((c, k) => {
      let m = this.boardMeshes[k];
      if (!m) {
        m = this.makeCard(c);
        this.world.add(m);
        this.boardMeshes[k] = m;
      } else if (m.userData.card !== c) this.setCardFace(m, c);
      m.position.copy(this.boardPos(k));
      m.rotation.set(0, this.upRot, 0);
      m.scale.setScalar(1);
    });
  }
  setDealer(pid, animate = true) {
    if (!pid || !this.seatPos[pid]) {
      this.dealerBtn.visible = false;
      this.dealerPid = null;
      return;
    }
    const to = this.buttonPos(pid);
    if (this.dealerPid === pid && this.dealerBtn.visible) return;
    if (!animate || !this.dealerBtn.visible) {
      this.dealerBtn.rotation.y = Math.PI / 2 + this.upRot;
      this.dealerBtn.position.copy(to);
      this.dealerBtn.visible = true;
      this.dealerPid = pid;
      return;
    }
    const from = this.dealerBtn.position.clone();
    this.dealerPid = pid;
    return this.tween(650, (t) => {
      const e = ease.inOut(t);
      this.dealerBtn.position.lerpVectors(from, to, e);
      this.dealerBtn.position.y = to.y + Math.sin(Math.PI * t) * 0.6;
      this.dealerBtn.rotation.y = Math.PI / 2 + this.upRot + e * Math.PI * 2;
    });
  }
  setTurn(pid) {
    const s = pid && this.seatPos[pid];
    this.turnPid = s ? pid : null;
    if (!s) {
      this.turnRing.material.opacity = 0;
      return;
    }
    this.turnRing.position.copy(s.v).setY(TOP + 0.012);
  }
  setTurnColor(hex) {
    this.turnRing.material.color.set(hex || '#ffffff');
  }
  /** Met en valeur (soulève et auréole) les cartes de la main gagnante / de ma meilleure main. */
  setHighlight(cards) {
    for (const g of this.glows) this.world.remove(g);
    this.glows = [];
    const set = new Set(cards);
    const all = [...this.boardMeshes, ...Object.values(this.seats).flatMap((s) => s.cards)];
    for (const m of all) {
      const on = m.userData.card != null && set.has(m.userData.card);
      m.position.y = TOP + CT / 2 + 0.002 + (on ? 0.07 : 0);
      if (on) {
        const glow = new THREE.Mesh(this.glowGeo, this.glowMat);
        glow.position.copy(m.position).setY(TOP + 0.004);
        glow.rotation.y = m.rotation.y;
        glow.scale.setScalar(m.scale.x);
        this.world.add(glow);
        this.glows.push(glow);
      }
    }
  }

  // ------------------------------------------------------------ animations
  /** Vol d'un objet (carte ou pile de jetons) en arc, avec rotation finale. */
  fly(obj, from, to, { ms = 500, arc = 0.6, rotFrom = null, rotTo = null, flip = false, scaleFrom = null, scaleTo = null } = {}) {
    obj.position.copy(from);
    if (!obj.parent) this.world.add(obj);
    const r0 = rotFrom ?? obj.rotation.y;
    const r1 = rotTo ?? r0;
    const s0 = scaleFrom ?? obj.scale.x;
    const s1 = scaleTo ?? s0;
    return this.tween(ms, (t) => {
      const e = ease.out(t);
      obj.position.lerpVectors(from, to, e);
      obj.position.y += Math.sin(Math.PI * t) * arc;
      obj.rotation.y = r0 + (r1 - r0) * e;
      obj.rotation.z = flip ? Math.PI * (1 - e) : 0;
      obj.scale.setScalar(s0 + (s1 - s0) * e);
    });
  }
  /** Distribution : deux tours de cartes, à partir du sabot. */
  async dealHole(order, myId, myCards) {
    for (const pid of order) {
      const s = this.seats[pid];
      if (!s) continue;
      for (const m of s.cards) this.world.remove(m);
      s.cards = [];
    }
    const proms = [];
    for (let k = 0; k < 2; k++) {
      for (const pid of order) {
        const s = this.seats[pid];
        if (!s || !this.seatPos[pid]) continue;
        const m = this.makeCard(null);
        s.cards.push(m);
        const sp = this.seatPos[pid];
        const to = this.holePos(pid, k);
        const me = pid === myId;
        proms.push(this.fly(m, this.shoePos, to, { ms: 380, arc: 0.35, rotFrom: Math.random() * 2, rotTo: me ? this.upRot + (k - 0.5) * -0.12 : sp.rot + (k - 0.5) * 0.18, scaleFrom: 0.7, scaleTo: me ? ME_SCALE : 0.7 }));
        this.cb.onDeal && this.cb.onDeal();
        await this.wait(150);
      }
    }
    await Promise.all(proms);
    // Mes cartes se retournent
    const mine = this.seats[myId];
    if (mine && myCards) {
      await Promise.all(mine.cards.map((m, k) => this.flipUp(m, myCards[k], 260 + k * 90)));
    }
  }
  /** Retourne une carte (face cachée → face visible), sur place. */
  flipUp(m, c, ms = 360, toRot = null) {
    const r0 = m.rotation.y;
    const r1 = toRot ?? r0;
    const y0 = m.position.y;
    let swapped = false;
    return this.tween(ms, (t) => {
      const e = ease.inOut(t);
      m.rotation.z = Math.PI * e;
      m.rotation.y = r0 + (r1 - r0) * e;
      m.position.y = y0 + Math.sin(Math.PI * t) * 0.35;
      if (!swapped && e >= 0.5) {
        swapped = true;
        this.setCardFace(m, c);
      }
      // Après la moitié, la face neuve est au-dessus : on compense la rotation
      if (e >= 0.5) m.rotation.z = Math.PI * e - Math.PI;
    }).then(() => {
      m.rotation.z = 0;
      m.position.y = y0;
    });
  }
  /** Mise : des jetons partent de la pile du joueur vers sa zone de mise. */
  async bet(pid, put, newBet, newStack) {
    if (!this.seatPos[pid] || put <= 0) {
      this.setBet(pid, newBet);
      this.setStack(pid, newStack);
      return;
    }
    const chips = this.makeChips(put);
    this.setStack(pid, newStack);
    this.cb.onChip && this.cb.onChip();
    await this.fly(chips, this.stackPos(pid), this.betPos(pid), { ms: 420, arc: 0.45 });
    this.world.remove(chips);
    this.setBet(pid, newBet);
  }
  /** Fin d'un tour d'enchères : toutes les mises rejoignent le pot. */
  async collect(pot) {
    const proms = [];
    for (const [pid, s] of Object.entries(this.seats)) {
      if (!s.bet) continue;
      const g = s.bet;
      s.bet = null;
      s.betAmount = 0;
      proms.push(this.fly(g, g.position.clone(), this.potPos.clone().setY(TOP + 0.002), { ms: 480, arc: 0.3 }).then(() => this.world.remove(g)));
    }
    if (proms.length) this.cb.onChips && this.cb.onChips();
    await Promise.all(proms);
    this.setPot(pot);
  }
  /** Le pot (ou une partie) rejoint la pile d'un gagnant. */
  async payout(pid, amount, potLeft) {
    if (!this.seatPos[pid]) return;
    const g = this.makeChips(amount);
    this.setPot(potLeft);
    this.cb.onChips && this.cb.onChips();
    await this.fly(g, this.potPos.clone().setY(TOP + 0.002), this.stackPos(pid), { ms: 650, arc: 0.7 });
    this.world.remove(g);
  }
  /** Cartes communes : brûle une carte, puis retourne les nouvelles dans leurs emplacements. */
  async dealBoard(cards, board) {
    const start = board.length - cards.length;
    const proms = [];
    for (let k = 0; k < cards.length; k++) {
      const idx = start + k;
      const m = this.makeCard(null);
      this.boardMeshes[idx] = m;
      const to = this.boardPos(idx);
      this.cb.onDeal && this.cb.onDeal();
      await this.fly(m, this.shoePos, to, { ms: 320, arc: 0.3, rotFrom: this.upRot + 0.8, rotTo: this.upRot });
      proms.push(this.flipUp(m, cards[k], 380));
      await this.wait(cards.length > 1 ? 140 : 0);
    }
    await Promise.all(proms);
  }
  /** Le joueur se couche : ses cartes glissent vers le centre et disparaissent. */
  async fold(pid) {
    const s = this.seats[pid];
    if (!s || !s.cards.length) return;
    const cards = s.cards;
    s.cards = [];
    await Promise.all(cards.map((m, k) => {
      const to = this.potPos.clone().add(new THREE.Vector3(-0.9 + k * 0.1, 0.02, -0.25));
      return this.fly(m, m.position.clone(), to, { ms: 420, arc: 0.25, rotTo: m.rotation.y + 0.8 }).then(() => {
        m.traverse((o) => {
          if (o.material) {
            o.material = o.material.clone();
            o.material.transparent = true;
          }
        });
        return this.tween(260, (t) => m.traverse((o) => o.material && (o.material.opacity = 1 - t))).then(() => this.world.remove(m));
      });
    }));
  }
  /** Abattage : les cartes d'un joueur se retournent, face vers moi. */
  async reveal(pid, cards) {
    const s = this.seats[pid];
    if (!s) return;
    if (!s.cards.length) {
      for (let k = 0; k < 2; k++) {
        const m = this.makeCard(null);
        this.placeHole(pid, m, k, false);
        this.world.add(m);
        s.cards.push(m);
      }
    }
    await Promise.all(s.cards.map((m, k) => {
      if (m.userData.card === cards[k]) return null;
      return this.flipUp(m, cards[k], 420, this.upRot + (k - 0.5) * -0.12).then(() => this.placeHole(pid, m, k, true));
    }));
  }

  // ------------------------------------------------------------ écran
  screenOf(v) {
    this.world.updateMatrixWorld();
    const p = v.clone().applyMatrix4(this.world.matrixWorld).project(this.camera);
    const r = this.renderer.domElement.getBoundingClientRect();
    return { x: r.left + ((p.x + 1) / 2) * r.width, y: r.top + ((1 - p.y) / 2) * r.height };
  }
  /** Point de l'écran au bord de la table, derrière les cartes d'un joueur (pour sa fiche). */
  seatAnchor(pid) {
    const s = this.seatPos[pid];
    if (!s) return null;
    const out = s.v.clone().addScaledVector(s.dir, 1.25).setY(TOP + 0.2);
    return { slot: s.slot, ...this.screenOf(out) };
  }
  betScreen(pid) {
    return this.seatPos[pid] ? this.screenOf(this.betPos(pid).setY(TOP + 0.05)) : null;
  }
  stackScreen(pid) {
    return this.seatPos[pid] ? this.screenOf(this.stackPos(pid).setY(TOP + 0.05)) : null;
  }
  potScreen() {
    return this.screenOf(this.potPos.clone().setY(TOP + 0.05));
  }
  seatScreen(pid) {
    return this.seatPos[pid] ? this.screenOf(this.seatPos[pid].v.clone().setY(TOP + 0.3)) : null;
  }
  boardScreen() {
    return this.screenOf(this.L(0, this.boardZ, TOP + 0.05));
  }

  // ------------------------------------------------------------ caméra
  resize() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (!w || !h) return;
    const dpr = this.pixelRatio();
    if (this.renderer.getPixelRatio() !== dpr) this.renderer.setPixelRatio(dpr);
    const cs = getComputedStyle(this.container);
    const v = (n) => {
      const x = parseFloat(cs.getPropertyValue(n));
      return Number.isFinite(x) ? x : 0;
    };
    // --safe-r : place réservée à droite (panneau du mode Débutant sur grand écran)
    this.sa = { top: v('--safe-top'), bottom: v('--safe-y'), left: v('--safe-x'), right: Math.max(v('--safe-x'), v('--safe-r')) };
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    const ratio = (w - this.sa.left - this.sa.right) / Math.max(1, h - this.sa.top - this.sa.bottom);
    // Orientation d'après la forme réelle de l'écran (pas celle de la zone libre)
    this.setLayout(w / h < 0.85);
    const base = this.portrait ? this.portraitPitch || 1.12 : ratio < 1.1 ? 1.2 : 0.95;
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
    const xL = -1 + (2 * sa.left) / W + 0.01;
    const xR = 1 - (2 * sa.right) / W - 0.01;
    const yT = 1 - (2 * sa.top) / H - 0.01;
    const yB = -1 + (2 * sa.bottom) / H + 0.01;
    const dir = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
    this.world.updateMatrixWorld();
    const corners = this.tableCorners().map((v) => v.applyMatrix4(this.world.matrixWorld));
    let lo = 3;
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
    this.cb.onCamera && this.cb.onCamera();
  }
  /** Points du contour de la table que la caméra doit toujours cadrer (repère local). */
  tableCorners() {
    const OX = SL + RAD + RAIL;
    const OZ = RAD + RAIL;
    const out = [];
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 8) out.push(new THREE.Vector3(Math.cos(a) * OX, TOP + 0.2, Math.sin(a) * OZ));
    return out;
  }
  /** Portrait : la table pivote pour occuper la hauteur de l'écran (et tout est replacé). */
  setLayout(portrait) {
    if (portrait === this.portrait && this.layoutDone) return;
    this.layoutDone = true;
    this.portrait = portrait;
    this.world.rotation.y = portrait ? -Math.PI / 2 : 0;
    this.world.updateMatrixWorld();
    if (this.feltMesh) {
      const old = this.feltMesh.material.map;
      this.feltMesh.material.map = this.tex(this.paintFelt());
      this.feltMesh.material.needsUpdate = true;
      old.dispose();
    }
    this.shoePos = this.L(-1.6, -1.4, TOP + 0.05);
    this.potGroup.position.copy(this.potPos).setY(TOP + 0.002);
    if (this.lastMap) {
      for (const st of Object.values(this.seats)) st.slot = null;
      this.setSeats(this.lastMap);
    }
    if (this.dealerPid) {
      const pid = this.dealerPid;
      this.dealerPid = null;
      this.dealerBtn.visible = false;
      this.setDealer(pid, false);
    }
    this.cb.onLayout && this.cb.onLayout();
  }
  resetView() {
    const from = { ...this.view, tx: this.target.x, tz: this.target.z };
    const to = { yaw: 0, pitch: this.basePitch || 1, zoom: 1 };
    this.tween(450, (t) => {
      const e = ease.inOut(t);
      this.view = { yaw: from.yaw + (to.yaw - from.yaw) * e, pitch: from.pitch + (to.pitch - from.pitch) * e, zoom: from.zoom + (to.zoom - from.zoom) * e };
      this.target.x = from.tx + (this.homeTarget.x - from.tx) * e;
      this.target.z = from.tz + (this.homeTarget.z - from.tz) * e;
      this.fitCamera();
    });
  }
  bindInput() {
    const el = this.renderer.domElement;
    const pts = new Map();
    let drag = null;
    let pinch = null;
    let lastTap = 0;
    el.style.touchAction = 'none';
    el.addEventListener('pointerdown', (e) => {
      el.setPointerCapture(e.pointerId);
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), zoom: this.view.zoom };
        drag = null;
      } else drag = { x: e.clientX, y: e.clientY, yaw: this.view.yaw, pitch: this.view.pitch, moved: 0 };
    });
    el.addEventListener('pointermove', (e) => {
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch && pts.size === 2) {
        const [a, b] = [...pts.values()];
        this.view.zoom = Math.min(2.6, Math.max(0.85, pinch.zoom * (Math.hypot(a.x - b.x, a.y - b.y) / pinch.d)));
        this.fitCamera();
        return;
      }
      if (!drag) return;
      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      drag.moved = Math.max(drag.moved, Math.abs(dx) + Math.abs(dy));
      if (drag.moved > 6) {
        this.view.yaw = Math.max(-0.8, Math.min(0.8, drag.yaw - dx * 0.005));
        this.view.pitch = Math.max(0.55, Math.min(1.45, drag.pitch + dy * 0.004));
        this.fitCamera();
      }
    });
    const up = (e) => {
      pts.delete(e.pointerId);
      if (pts.size < 2) pinch = null;
      if (drag && drag.moved <= 6 && e.type === 'pointerup' && e.pointerType === 'touch') {
        const now = performance.now();
        if (now - lastTap < 320) this.resetView();
        lastTap = now;
      }
      if (!pts.size) drag = null;
    };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('dblclick', () => this.resetView());
    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.view.zoom = Math.min(2.2, Math.max(0.85, this.view.zoom * (e.deltaY < 0 ? 1.08 : 0.93)));
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
    const time = this.clock.getElapsedTime();
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
    if (this.turnPid) {
      const k = (time * 0.9) % 1;
      this.turnRing.scale.setScalar(0.9 + k * 0.35);
      this.turnRing.material.opacity = 0.75 * (1 - k);
    }
    for (const g of this.glows) g.material.opacity = 0.75 + Math.sin(time * 4) * 0.25;
    this.renderer.render(this.scene, this.camera);
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

