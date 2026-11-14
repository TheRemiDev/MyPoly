// ============================================================================
//  MyPoly — « Lettres d'Or » : plateau 3D (Three.js)
//  Plateau laqué bleu nuit, cadre doré, cases bonus et lettres en résine ivoire,
//  tous dessinés par nous. Reprend la scène, les lumières et la caméra du poker.
// ============================================================================
import { Poker3D, TOP, makeCanvas, rr, THREE } from './poker3d.js';

const FONT = "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";
const SERIF = "Georgia, 'Times New Roman', 'Palatino Linotype', serif";
export const N = 15;
const S = 0.6; // taille d'une case
const HALF = (N * S) / 2;
const FRAME = 0.55;
const BT = TOP + 0.16; // dessus du plateau
const TW = S * 0.9; // largeur d'une lettre
const TH = 0.13; // épaisseur d'une lettre
const ease = { out: (t) => 1 - (1 - t) ** 3 };

/** Couleurs et libellés des cases bonus. */
export const BONUS_STYLE = {
  L2: { fill: '#1d9aa8', ink: '#e6fbff', a: 'LETTRE', b: '×2' },
  L3: { fill: '#2457c9', ink: '#e8f0ff', a: 'LETTRE', b: '×3' },
  M2: { fill: '#d4487a', ink: '#ffe9f2', a: 'MOT', b: '×2' },
  M3: { fill: '#e85d2c', ink: '#fff1e6', a: 'MOT', b: '×3' },
  ST: { fill: '#e0a52c', ink: '#3b2a00', a: '', b: '' },
};

/** Étoile à 5 branches. */
function star(g, cx, cy, R, r) {
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rad = i % 2 ? r : R;
    g.lineTo(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad);
  }
  g.closePath();
}

/** Face d'une lettre (ivoire) : grande lettre, valeur en bas à droite. */
export function drawTileFace(letter, value, joker = false, W = 256) {
  const cv = makeCanvas(W, W);
  const g = cv.getContext('2d');
  const bg = g.createLinearGradient(0, 0, W, W);
  bg.addColorStop(0, '#fffaf0');
  bg.addColorStop(1, '#efe3c8');
  g.fillStyle = bg;
  g.fillRect(0, 0, W, W);
  // Grain de résine
  for (let i = 0; i < 260; i++) {
    g.fillStyle = `rgba(160,120,60,${Math.random() * 0.05})`;
    g.fillRect(Math.random() * W, Math.random() * W, 2, 2);
  }
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  if (joker && !letter) {
    g.fillStyle = '#e0a52c';
    star(g, W / 2, W / 2, W * 0.28, W * 0.12);
    g.fill();
    return cv;
  }
  g.font = `${joker ? 'italic 800' : '900'} ${W * 0.6}px ${joker ? SERIF : FONT}`;
  g.fillStyle = joker ? '#c48a12' : '#1b1f3a';
  g.fillText(letter, W * 0.47, W * 0.5);
  if (!joker) {
    g.font = `800 ${W * 0.2}px ${FONT}`;
    g.fillStyle = '#1b1f3a';
    g.textAlign = 'right';
    g.fillText(String(value), W * 0.9, W * 0.82);
  } else {
    g.fillStyle = '#e0a52c';
    star(g, W * 0.82, W * 0.8, W * 0.08, W * 0.035);
    g.fill();
  }
  return cv;
}

export class Letters3D extends Poker3D {
  constructor(container, cb) {
    super(container, cb);
    this.introFly();
  }
  L(x, z, y = TOP) {
    return new THREE.Vector3(x, y, z);
  }
  get upRot() {
    return 0;
  }
  cellPos(r, c, y = BT) {
    return new THREE.Vector3((c - (N - 1) / 2) * S, y, (r - (N - 1) / 2) * S);
  }
  introFly() {
    const to = { ...this.view };
    const from = { yaw: -0.5, pitch: Math.min(1.45, to.pitch + 0.25), zoom: 0.55 };
    this.view = { ...from };
    this.fitCamera();
    this.tween(1800, (t) => {
      const e = ease.out(t);
      this.view = { yaw: from.yaw + (to.yaw - from.yaw) * e, pitch: from.pitch + ((this.basePitch || to.pitch) - from.pitch) * e, zoom: from.zoom + (to.zoom - from.zoom) * e };
      this.fitCamera();
    });
  }

  // ------------------------------------------------------------------ décor
  buildTable() {
    this.lt = { tiles: {}, pending: [], glows: [], bonus: null };
    const wood = new THREE.MeshStandardMaterial({ color: 0x5a3418, roughness: 0.42, metalness: 0.06 });
    const darkWood = new THREE.MeshStandardMaterial({ color: 0x2a170b, roughness: 0.55 });
    const gold = new THREE.MeshStandardMaterial({ color: 0xe0b54f, roughness: 0.22, metalness: 0.92 });
    // Table ronde en bois et son pied
    const top = new THREE.Mesh(new THREE.CylinderGeometry(9.2, 9.2, 0.22, 96), wood);
    top.position.y = TOP - 0.11;
    top.receiveShadow = true;
    top.castShadow = true;
    this.world.add(top);
    const inlay = new THREE.Mesh(new THREE.CylinderGeometry(8.6, 8.6, 0.02, 96), new THREE.MeshStandardMaterial({ map: this.tex(this.paintCloth()), roughness: 0.9 }));
    inlay.position.y = TOP + 0.002;
    inlay.receiveShadow = true;
    this.world.add(inlay);
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 2.2, TOP - 0.2, 40), darkWood);
    leg.position.y = (TOP - 0.2) / 2;
    this.world.add(leg);
    // Plateau laqué avec cadre doré
    const B = N * S + FRAME * 2;
    const base = new THREE.Mesh(new THREE.BoxGeometry(B, BT - TOP, B), new THREE.MeshPhysicalMaterial({ color: 0x0d1238, roughness: 0.25, clearcoat: 0.8, clearcoatRoughness: 0.2 }));
    base.position.y = TOP + (BT - TOP) / 2;
    base.castShadow = base.receiveShadow = true;
    this.world.add(base);
    const rim = new THREE.Mesh(new THREE.BoxGeometry(B + 0.08, 0.05, B + 0.08), gold);
    rim.position.y = TOP + 0.02;
    this.world.add(rim);
    // Dessus : cases, grille dorée, logo (canvas)
    const face = new THREE.Mesh(new THREE.PlaneGeometry(B, B), new THREE.MeshPhysicalMaterial({ map: this.tex(this.paintBoard()), roughness: 0.6, clearcoat: 0.35, clearcoatRoughness: 0.55 }));
    face.rotation.x = -Math.PI / 2;
    face.position.y = BT + 0.001;
    face.receiveShadow = true;
    this.world.add(face);
    this.boardFace = face;
    // Lettres : géométrie biseautée (dessus + côtés)
    const r = TW * 0.14;
    const shape = new THREE.Shape();
    shape.moveTo(-TW / 2 + r, -TW / 2);
    shape.lineTo(TW / 2 - r, -TW / 2);
    shape.quadraticCurveTo(TW / 2, -TW / 2, TW / 2, -TW / 2 + r);
    shape.lineTo(TW / 2, TW / 2 - r);
    shape.quadraticCurveTo(TW / 2, TW / 2, TW / 2 - r, TW / 2);
    shape.lineTo(-TW / 2 + r, TW / 2);
    shape.quadraticCurveTo(-TW / 2, TW / 2, -TW / 2, TW / 2 - r);
    shape.lineTo(-TW / 2, -TW / 2 + r);
    shape.quadraticCurveTo(-TW / 2, -TW / 2, -TW / 2 + r, -TW / 2);
    this.tileGeo = new THREE.ExtrudeGeometry(shape, { depth: TH - 0.03, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.02, bevelSegments: 3, curveSegments: 6 }).rotateX(-Math.PI / 2).translate(0, 0.015, 0); // posée sur le plateau, dessus à TH
    this.tileFaceGeo = new THREE.PlaneGeometry(TW - 0.03, TW - 0.03).rotateX(-Math.PI / 2);
    this.tileSide = new THREE.MeshPhysicalMaterial({ color: 0xf1e6cc, roughness: 0.38, clearcoat: 0.5, clearcoatRoughness: 0.3 });
    this.tileFaces = {};
    // Survol d'une case
    this.hover = new THREE.Mesh(new THREE.PlaneGeometry(S * 0.96, S * 0.96).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0, depthWrite: false }));
    this.hover.position.y = BT + 0.004;
    this.world.add(this.hover);
    this.bindCells();
  }
  paintCloth() {
    const W = 1024;
    const cv = makeCanvas(W, W);
    const g = cv.getContext('2d');
    const bg = g.createRadialGradient(W / 2, W / 2, 40, W / 2, W / 2, W / 2);
    bg.addColorStop(0, '#2a2f6e');
    bg.addColorStop(1, '#141640');
    g.fillStyle = bg;
    g.fillRect(0, 0, W, W);
    g.strokeStyle = 'rgba(255,209,102,.08)';
    g.lineWidth = 3;
    for (let k = 0; k < W; k += 48) {
      g.beginPath();
      g.arc(W / 2, W / 2, k, 0, Math.PI * 2);
      g.stroke();
    }
    return cv;
  }
  /** Dessus du plateau : cases bonus, grille dorée, étoile centrale, logo sur le cadre. */
  paintBoard(bonus = this.lt && this.lt.bonus) {
    const W = this.mobile ? 2048 : 3072;
    const cv = makeCanvas(W, W);
    const g = cv.getContext('2d');
    const B = N * S + FRAME * 2;
    const k = W / B;
    const off = FRAME * k;
    const cs = S * k;
    // Laque bleu nuit
    const bg = g.createLinearGradient(0, 0, W, W);
    bg.addColorStop(0, '#151b4d');
    bg.addColorStop(1, '#0b0f30');
    g.fillStyle = bg;
    g.fillRect(0, 0, W, W);
    // Cadre : filets dorés et nom du jeu
    g.strokeStyle = '#e0b54f';
    g.lineWidth = W * 0.004;
    rr(g, W * 0.012, W * 0.012, W * 0.976, W * 0.976, W * 0.02);
    g.stroke();
    g.lineWidth = W * 0.0015;
    rr(g, off * 0.9, off * 0.9, W - off * 1.8, W - off * 1.8, W * 0.01);
    g.stroke();
    g.fillStyle = 'rgba(255,209,102,.85)';
    g.font = `italic 700 ${off * 0.32}px ${SERIF}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('Lettres d\'Or', W / 2, off * 0.6);
    g.save();
    g.translate(W / 2, W - off * 0.6);
    g.fillText('MyPoly · jeu de mots', 0, 0);
    g.restore();
    // Cases
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        const x = off + c * cs;
        const y = off + r * cs;
        const b = bonus && bonus[r][c];
        const st = b && BONUS_STYLE[b];
        const pad = cs * 0.045;
        if (st) {
          const gr = g.createLinearGradient(x, y, x + cs, y + cs);
          gr.addColorStop(0, st.fill);
          gr.addColorStop(1, shade(st.fill, -0.25));
          g.fillStyle = gr;
        } else g.fillStyle = 'rgba(255,255,255,.055)';
        rr(g, x + pad, y + pad, cs - pad * 2, cs - pad * 2, cs * 0.12);
        g.fill();
        if (st && b !== 'ST') {
          g.fillStyle = st.ink;
          g.font = `900 ${cs * 0.34}px ${FONT}`;
          g.fillText(st.b, x + cs / 2, y + cs * 0.6);
          g.font = `800 ${cs * 0.15}px ${FONT}`;
          g.fillText(st.a, x + cs / 2, y + cs * 0.28);
        }
        if (b === 'ST') {
          g.fillStyle = '#ffd166';
          star(g, x + cs / 2, y + cs / 2, cs * 0.38, cs * 0.16);
          g.fill();
          g.strokeStyle = '#fff3c4';
          g.lineWidth = cs * 0.03;
          g.stroke();
        }
      }
    }
    // Grille dorée fine
    g.strokeStyle = 'rgba(224,181,79,.35)';
    g.lineWidth = W * 0.0008;
    for (let i = 0; i <= N; i++) {
      g.beginPath();
      g.moveTo(off + i * cs, off);
      g.lineTo(off + i * cs, off + N * cs);
      g.moveTo(off, off + i * cs);
      g.lineTo(off + N * cs, off + i * cs);
      g.stroke();
    }
    return cv;
  }
  /** Les cases bonus viennent du serveur : on redessine le plateau une fois. */
  setBonus(bonus) {
    if (this.lt.bonus) return;
    this.lt.bonus = bonus;
    const old = this.boardFace.material.map;
    this.boardFace.material.map = this.tex(this.paintBoard(bonus));
    this.boardFace.material.needsUpdate = true;
    old.dispose();
  }
  /** Lumière plus douce et plus large que la table de poker : tout le plateau reste lisible, sans reflet. */
  buildLights() {
    super.buildLights();
    this.scene.traverse((o) => {
      if (o.isSpotLight) {
        o.intensity = 150;
        o.angle = 0.9;
        o.penumbra = 0.8;
        o.position.set(0, 12, -1.5);
      } else if (o.isHemisphereLight) o.intensity = 1.25;
    });
  }
  buildProps() {
    this.portraitPitch = 1.42;
    this.turnRing = new THREE.Mesh(new THREE.RingGeometry(0.1, 0.12, 8), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0 }));
    this.world.add(this.turnRing);
    this.potGroup = new THREE.Group();
    this.dealerBtn = new THREE.Group();
    this.shoePos = new THREE.Vector3(0, BT + 2, HALF + 3);
  }
  setLayout(portrait) {
    if (portrait === this.portrait && this.layoutDone) return;
    this.layoutDone = true;
    this.portrait = portrait;
    this.cb.onLayout && this.cb.onLayout();
  }
  tableCorners() {
    const e = HALF + FRAME * 0.6;
    return [[-e, -e], [e, -e], [-e, e], [e, e]].map(([x, z]) => new THREE.Vector3(x, BT, z));
  }
  setSeats() {}

  // ------------------------------------------------------------------ lettres
  tileFace(letter, value, joker) {
    const key = `${letter}|${value}|${joker ? 1 : 0}`;
    if (!this.tileFaces[key]) this.tileFaces[key] = new THREE.MeshPhysicalMaterial({ map: this.tex(drawTileFace(letter, value, joker, this.mobile ? 192 : 256)), roughness: 0.55, clearcoat: 0.3, clearcoatRoughness: 0.5 });
    return this.tileFaces[key];
  }
  makeTile(letter, value, joker) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(this.tileGeo, this.tileSide);
    body.castShadow = true;
    body.receiveShadow = true;
    const face = new THREE.Mesh(this.tileFaceGeo, this.tileFace(letter, value, joker));
    face.position.y = TH + 0.0015;
    g.add(body, face);
    return g;
  }
  /** Plateau : une lettre par case occupée (créée une seule fois). */
  setBoard(board) {
    const want = new Set();
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        const x = board[r][c];
        if (!x) continue;
        const key = `${r},${c}`;
        want.add(key);
        if (this.lt.tiles[key]) continue;
        const m = this.makeTile(x.l, x.v, x.j);
        m.position.copy(this.cellPos(r, c));
        m.rotation.y = (Math.random() - 0.5) * 0.04;
        this.world.add(m);
        this.lt.tiles[key] = m;
      }
    }
    for (const [key, m] of Object.entries(this.lt.tiles)) {
      if (!want.has(key)) {
        this.world.remove(m);
        delete this.lt.tiles[key];
      }
    }
  }
  /** Lettres en cours de placement (les miennes, pas encore jouées) : surélevées, liseré doré. */
  setPending(list) {
    for (const m of this.lt.pending) this.world.remove(m);
    this.lt.pending = list.map((t) => {
      const m = this.makeTile(t.l, t.v, t.joker);
      // Face légèrement dorée (ou rougie si le mot n'est pas valable) pour distinguer mes lettres
      const key = `${t.l}|${t.v}|${t.joker ? 1 : 0}|${t.bad ? 'b' : 'p'}`;
      if (!this.tileFaces[key]) {
        const mat = this.tileFace(t.l, t.v, t.joker).clone();
        mat.emissive = new THREE.Color(t.bad ? 0x5a0d10 : 0x4a3100);
        this.tileFaces[key] = mat;
      }
      m.children[1].material = this.tileFaces[key];
      const edge = new THREE.Mesh(new THREE.PlaneGeometry(TW + 0.14, TW + 0.14).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: t.bad ? 0xff5a5f : 0xffd166, transparent: true, opacity: 1, depthWrite: false }));
      edge.position.y = -0.002;
      m.add(edge);
      m.position.copy(this.cellPos(t.r, t.c, BT + 0.07));
      m.userData.cell = [t.r, t.c];
      this.world.add(m);
      return m;
    });
  }
  /** Le dernier coup reste éclairé (cases dorées). */
  setHighlight(cells) {
    for (const g of this.lt.glows) this.world.remove(g);
    this.lt.glows = (cells || []).map(([r, c]) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(S * 0.98, S * 0.98).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.45, depthWrite: false, blending: THREE.AdditiveBlending }));
      m.position.copy(this.cellPos(r, c, BT + 0.003));
      this.world.add(m);
      return m;
    });
  }
  /** Coup joué : les lettres volent depuis le côté du joueur et tombent sur le plateau. */
  async dropTiles(tiles, side = 0) {
    const from = [new THREE.Vector3(0, BT + 3, HALF + 4), new THREE.Vector3(-HALF - 4, BT + 3, 0), new THREE.Vector3(0, BT + 3, -HALF - 4), new THREE.Vector3(HALF + 4, BT + 3, 0)][side % 4];
    const proms = tiles.map(async (t, i) => {
      await this.wait(i * 130);
      const key = `${t.r},${t.c}`;
      if (this.lt.tiles[key]) this.world.remove(this.lt.tiles[key]);
      const m = this.makeTile(t.letter, t.value, t.joker);
      this.lt.tiles[key] = m;
      const to = this.cellPos(t.r, t.c);
      const spin = (Math.random() - 0.5) * 3;
      this.cb.onTile && this.cb.onTile();
      await this.fly(m, from.clone(), to.clone().setY(BT + 0.6), { ms: 520, arc: 1.2, rotFrom: spin, rotTo: 0 });
      await this.tween(260, (k) => {
        const b = Math.abs(Math.sin(k * Math.PI * 1.5)) * (1 - k);
        m.position.y = BT + 0.6 * (1 - Math.min(1, k * 2)) + b * 0.12;
      });
      m.position.y = BT;
    });
    await Promise.all(proms);
  }
  /** Onde dorée sous un mot (score, Lettres d'Or). */
  wordFx(cells, color = 0xffd166) {
    const glows = cells.map(([r, c]) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(S, S).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
      m.position.copy(this.cellPos(r, c, BT + 0.006));
      this.world.add(m);
      return m;
    });
    return this.tween(1100, (t) => {
      glows.forEach((m, i) => {
        const k = Math.max(0, Math.min(1, t * 1.6 - i * 0.08));
        m.material.opacity = Math.sin(k * Math.PI) * 0.9;
        m.scale.setScalar(1 + Math.sin(k * Math.PI) * 0.12);
      });
    }).then(() => glows.forEach((m) => this.world.remove(m)));
  }

  // ------------------------------------------------------------------ interaction
  /** Case sous un point de l'écran (ou null). */
  cellAt(clientX, clientY) {
    const el = this.renderer.domElement;
    const rect = el.getBoundingClientRect();
    if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) return null;
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -BT);
    const p = new THREE.Vector3();
    if (!ray.ray.intersectPlane(plane, p)) return null;
    const c = Math.floor((p.x + HALF) / S);
    const r = Math.floor((p.z + HALF) / S);
    if (r < 0 || c < 0 || r >= N || c >= N) return null;
    return { r, c };
  }
  showHover(cell) {
    if (!cell) {
      this.hover.material.opacity = 0;
      return;
    }
    this.hover.position.copy(this.cellPos(cell.r, cell.c, BT + 0.004));
    this.hover.material.opacity = 0.35;
  }
  bindCells() {
    const el = this.renderer.domElement;
    let down = null;
    el.addEventListener('pointerdown', (e) => (down = { x: e.clientX, y: e.clientY }));
    el.addEventListener('pointerup', (e) => {
      if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 8) return (down = null);
      down = null;
      const cell = this.cellAt(e.clientX, e.clientY);
      if (cell && this.cb.onCell) this.cb.onCell(cell.r, cell.c);
    });
    el.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'touch') return;
      const cell = this.cellAt(e.clientX, e.clientY);
      this.showHover(cell && this.cb.canHover && this.cb.canHover(cell.r, cell.c) ? cell : null);
    });
    el.addEventListener('pointerleave', () => this.showHover(null));
  }
  cellScreen(r, c) {
    return this.screenOf(this.cellPos(r, c, BT + TH));
  }
}

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const f = (x) => Math.max(0, Math.min(255, Math.round(amt >= 0 ? x + (255 - x) * amt : x * (1 + amt))));
  return '#' + [f(n >> 16), f((n >> 8) & 255), f(n & 255)].map((x) => x.toString(16).padStart(2, '0')).join('');
}
