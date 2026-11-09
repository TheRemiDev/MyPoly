// ============================================================================
//  MyPoly — Petits chevaux : plateau 3D (WebGL / Three.js)
//  Même rendu que le plateau MyPoly : cadre bois, liseré doré, cases en relief,
//  pièces en 3D, dé qui roule, caméra orientable.
// ============================================================================
import * as THREE from '/vendor/three/three.module.min.js';

const FONT = "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'Noto Color Emoji', 'Apple Color Emoji', 'Segoe UI Emoji', sans-serif";
const N = 17;
const S = 10 / N; // taille d'une case
const BOARD_TOP = 0.2;
const TILE_H = 0.12;
const TOP = BOARD_TOP + TILE_H;
const ease = {
  out: (t) => 1 - Math.pow(1 - t, 3),
  inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  bounce: (t) => {
    const n1 = 7.5625, d1 = 2.75;
    if (t < 1 / d1) return n1 * t * t;
    if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
    if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
    return n1 * (t -= 2.625 / d1) * t + 0.984375;
  },
};

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
/** Centre (x, z) d'une case de la grille 17 × 17. */
export function cellXZ([r, c]) {
  return [-5 + (c + 0.5) * S, -5 + (r + 0.5) * S];
}

export class Horse3D {
  constructor(container, cb = {}) {
    this.container = container;
    this.cb = cb;
    if (location.hostname === 'localhost') window.__h3 = this;
    this.tweens = [];
    this.horses = {};
    this.clock = new THREE.Clock();
    this.view = { yaw: 0, pitch: 1.0, zoom: 1 };
    this.shakeT = 0;
    this.texCache = {};

    const r = (this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' }));
    this.mobile = matchMedia('(pointer: coarse)').matches || Math.min(screen.width, screen.height) < 700;
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
    this.target = new THREE.Vector3(0, 0, 0.2);
    this.homeTarget = this.target.clone();
    this.boardGroup = new THREE.Group(); // cases (reconstruites selon les joueurs)
    this.scene.add(this.boardGroup);
    this.pickables = [];

    this.buildLights();
    this.buildTable();
    this.buildDie();
    this.buildMarker();
    this.bindInput();

    this.resizeObs = new ResizeObserver(() => this.resize());
    this.resizeObs.observe(container);
    this.resize();
    this.loop = this.loop.bind(this);
    this.raf = requestAnimationFrame(this.loop);
  }

  // ------------------------------------------------------------------ scène
  buildLights() {
    const s = this.scene;
    s.add(new THREE.HemisphereLight(0xffffff, 0x2a3550, 1.15));
    const sun = new THREE.DirectionalLight(0xfff3dd, 2.1);
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
    // Cadre bois + liseré doré + feutre (comme le plateau MyPoly)
    const wood = new THREE.MeshStandardMaterial({ color: 0x6b4420, roughness: 0.55, metalness: 0.05 });
    const gold = new THREE.MeshStandardMaterial({ color: 0xe0b54f, roughness: 0.28, metalness: 0.85 });
    const base = new THREE.Mesh(new THREE.BoxGeometry(10.9, BOARD_TOP - 0.02, 10.9), wood);
    base.position.y = (BOARD_TOP - 0.02) / 2;
    base.castShadow = base.receiveShadow = true;
    this.scene.add(base);
    const rim = new THREE.Mesh(new THREE.BoxGeometry(10.62, 0.04, 10.62), gold);
    rim.position.y = BOARD_TOP - 0.01;
    rim.receiveShadow = true;
    this.scene.add(rim);
    // Feutre décoré : motif discret en losanges
    const fc = makeCanvas(1024, 1024);
    const fg = fc.getContext('2d');
    const grd = fg.createRadialGradient(512, 480, 80, 512, 512, 720);
    grd.addColorStop(0, '#16707a');
    grd.addColorStop(1, '#0b3f46');
    fg.fillStyle = grd;
    fg.fillRect(0, 0, 1024, 1024);
    fg.strokeStyle = 'rgba(255,255,255,.04)';
    fg.lineWidth = 2;
    for (let k = -1024; k < 2048; k += 48) {
      fg.beginPath();
      fg.moveTo(k, 0);
      fg.lineTo(k + 1024, 1024);
      fg.stroke();
      fg.beginPath();
      fg.moveTo(k, 1024);
      fg.lineTo(k + 1024, 0);
      fg.stroke();
    }
    const ft = new THREE.CanvasTexture(fc);
    ft.colorSpace = THREE.SRGBColorSpace;
    const felt = new THREE.Mesh(new THREE.BoxGeometry(10.36, 0.04, 10.36), [
      new THREE.MeshStandardMaterial({ color: 0x0f4a50 }), new THREE.MeshStandardMaterial({ color: 0x0f4a50 }),
      new THREE.MeshStandardMaterial({ map: ft, roughness: 0.92 }), new THREE.MeshStandardMaterial({ color: 0x0f4a50 }),
      new THREE.MeshStandardMaterial({ color: 0x0f4a50 }), new THREE.MeshStandardMaterial({ color: 0x0f4a50 }),
    ]);
    felt.position.y = BOARD_TOP;
    felt.receiveShadow = true;
    this.scene.add(felt);
  }

  /** Texture d'une face de case (mise en cache). */
  faceTex(key, draw, w = 160, h = 160) {
    if (this.texCache[key]) return this.texCache[key];
    const c = makeCanvas(w, h);
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = this.maxAniso;
    this.texCache[key] = t;
    return t;
  }

  /**
   * Construit les cases du plateau.
   * layout = { track: [[r,c]…], starts: {g: {color, angle}}, ladders: [{rc, color, n}], yards: [{rc0, color, name, slots:[[r,c]…]}], center: {rc0, colors:[haut, droite, bas, gauche]} }
   */
  buildBoard(layout) {
    const g = this.boardGroup;
    while (g.children.length) g.remove(g.children[0]);
    const cream = new THREE.MeshStandardMaterial({ color: 0xe9dcbc, roughness: 0.7 });
    const tile = (rc, tex, tint = null, h = TILE_H, sz = S - 0.06) => {
      const [x, z] = cellXZ(rc);
      const grp = new THREE.Group();
      grp.position.set(x, BOARD_TOP, z);
      const body = new THREE.Mesh(new THREE.BoxGeometry(sz, h, sz), tint ? new THREE.MeshStandardMaterial({ color: tint, roughness: 0.6 }) : cream);
      body.position.y = h / 2;
      body.castShadow = body.receiveShadow = true;
      const face = new THREE.Mesh(new THREE.PlaneGeometry(sz, sz), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55 }));
      face.rotation.x = -Math.PI / 2;
      face.position.y = h + 0.002;
      face.receiveShadow = true;
      grp.add(body, face);
      g.add(grp);
      return grp;
    };
    const plain = this.faceTex('plain', (c, w, hh) => {
      const grd = c.createLinearGradient(0, 0, w, hh);
      grd.addColorStop(0, '#fffaf0');
      grd.addColorStop(1, '#efe3c6');
      c.fillStyle = grd;
      c.fillRect(0, 0, w, hh);
      c.strokeStyle = 'rgba(120,90,40,.25)';
      c.lineWidth = 6;
      rr(c, 10, 10, w - 20, hh - 20, 18);
      c.stroke();
    });
    // Parcours
    layout.track.forEach((rc, k) => {
      const st = layout.starts[k];
      if (!st) return tile(rc, plain);
      const tex = this.faceTex('start' + st.color + st.angle, (c, w, hh) => {
        const grd = c.createLinearGradient(0, 0, w, hh);
        grd.addColorStop(0, shade(st.color, 0.12));
        grd.addColorStop(1, shade(st.color, -0.08));
        c.fillStyle = grd;
        c.fillRect(0, 0, w, hh);
        c.strokeStyle = 'rgba(255,255,255,.85)';
        c.lineWidth = 7;
        rr(c, 9, 9, w - 18, hh - 18, 18);
        c.stroke();
        c.save();
        c.translate(w / 2, hh / 2);
        c.rotate((st.angle * Math.PI) / 180);
        c.fillStyle = '#fff';
        c.beginPath();
        c.moveTo(-40, -14); c.lineTo(10, -14); c.lineTo(10, -34); c.lineTo(46, 0); c.lineTo(10, 34); c.lineTo(10, 14); c.lineTo(-40, 14);
        c.closePath();
        c.shadowColor = 'rgba(0,0,0,.35)';
        c.shadowBlur = 6;
        c.fill();
        c.restore();
      });
      tile(rc, tex, shade(st.color, -0.2));
    });
    // Échelles
    for (const l of layout.ladders) {
      const tex = this.faceTex('lad' + l.color + l.n, (c, w, hh) => {
        const grd = c.createLinearGradient(0, 0, w, hh);
        grd.addColorStop(0, shade(l.color, 0.18));
        grd.addColorStop(1, l.color);
        c.fillStyle = grd;
        c.fillRect(0, 0, w, hh);
        c.strokeStyle = 'rgba(255,255,255,.7)';
        c.lineWidth = 6;
        rr(c, 9, 9, w - 18, hh - 18, 18);
        c.stroke();
        c.fillStyle = '#fff';
        c.font = `900 92px ${FONT}`;
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.shadowColor = 'rgba(0,0,0,.4)';
        c.shadowBlur = 8;
        c.fillText(String(l.n), w / 2, hh / 2 + 4);
      });
      tile(l.rc, tex, shade(l.color, -0.25), TILE_H + l.n * 0.012);
    }
    // Écuries : grand plateau coloré, alvéoles pour 4 chevaux, nom du joueur
    for (const y of layout.yards) {
      const size = 7 * S - 0.16;
      const tex = this.faceTex('yard' + y.color + y.name + y.slotsKey, (c, w, hh) => {
        const grd = c.createRadialGradient(w / 2, hh * 0.45, w * 0.1, w / 2, hh / 2, w * 0.75);
        grd.addColorStop(0, shade(y.color, 0.16));
        grd.addColorStop(1, shade(y.color, -0.14));
        c.fillStyle = grd;
        c.fillRect(0, 0, w, hh);
        c.strokeStyle = 'rgba(255,255,255,.85)';
        c.lineWidth = 10;
        rr(c, 18, 18, w - 36, hh - 36, 46);
        c.stroke();
        c.setLineDash([16, 14]);
        c.lineWidth = 4;
        c.strokeStyle = 'rgba(255,255,255,.45)';
        rr(c, 40, 40, w - 80, hh - 80, 34);
        c.stroke();
        c.setLineDash([]);
        // Alvéoles
        for (const [sx, sy] of y.slots) {
          const cx = sx * w;
          const cy = sy * hh;
          const rg = c.createRadialGradient(cx, cy - 8, 6, cx, cy, 58);
          rg.addColorStop(0, 'rgba(0,0,0,.45)');
          rg.addColorStop(1, 'rgba(0,0,0,.18)');
          c.fillStyle = rg;
          c.beginPath();
          c.arc(cx, cy, 56, 0, Math.PI * 2);
          c.fill();
          c.strokeStyle = 'rgba(255,255,255,.75)';
          c.lineWidth = 5;
          c.stroke();
        }
        // Nom
        c.font = `900 46px ${FONT}`;
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        let name = y.name;
        while (c.measureText(name).width > w - 140 && name.length > 3) name = name.slice(0, -2) + '…';
        const tw = c.measureText(name).width + 50;
        c.fillStyle = 'rgba(0,0,0,.32)';
        rr(c, w / 2 - tw / 2, 58, tw, 64, 32);
        c.fill();
        c.fillStyle = '#fff';
        c.fillText(name, w / 2, 92);
      }, 640, 640);
      const [x0, z0] = cellXZ(y.rc0);
      const grp = new THREE.Group();
      grp.position.set(x0 - S / 2 + (7 * S) / 2, BOARD_TOP, z0 - S / 2 + (7 * S) / 2);
      const body = new THREE.Mesh(new THREE.BoxGeometry(size, TILE_H * 0.7, size), new THREE.MeshStandardMaterial({ color: shade(y.color, -0.25), roughness: 0.6 }));
      body.position.y = TILE_H * 0.35;
      body.castShadow = body.receiveShadow = true;
      const face = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5 }));
      face.rotation.x = -Math.PI / 2;
      face.position.y = TILE_H * 0.7 + 0.002;
      face.receiveShadow = true;
      grp.add(body, face);
      g.add(grp);
    }
    // Arrivée centrale : 4 triangles colorés et trophée
    const ct = layout.center;
    const ctex = this.faceTex('center' + ct.colors.join(), (c, w, hh) => {
      const tri = (col, pts) => {
        c.fillStyle = col;
        c.beginPath();
        c.moveTo(...pts[0]);
        c.lineTo(...pts[1]);
        c.lineTo(w / 2, hh / 2);
        c.closePath();
        c.fill();
      };
      tri(ct.colors[0], [[0, 0], [w, 0]]);
      tri(ct.colors[1], [[w, 0], [w, hh]]);
      tri(ct.colors[2], [[w, hh], [0, hh]]);
      tri(ct.colors[3], [[0, hh], [0, 0]]);
      c.strokeStyle = 'rgba(255,255,255,.85)';
      c.lineWidth = 8;
      c.beginPath();
      c.moveTo(0, 0); c.lineTo(w, hh); c.moveTo(w, 0); c.lineTo(0, hh);
      c.stroke();
      c.lineWidth = 14;
      c.strokeRect(0, 0, w, hh);
      const rg = c.createRadialGradient(w / 2, hh / 2, 10, w / 2, hh / 2, w * 0.24);
      rg.addColorStop(0, 'rgba(255,255,255,.95)');
      rg.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = rg;
      c.beginPath();
      c.arc(w / 2, hh / 2, w * 0.24, 0, Math.PI * 2);
      c.fill();
    }, 480, 480);
    const [cx, cz] = cellXZ([8, 8]);
    const cgrp = new THREE.Group();
    cgrp.position.set(cx, BOARD_TOP, cz);
    const cbody = new THREE.Mesh(new THREE.BoxGeometry(3 * S - 0.06, TILE_H * 1.6, 3 * S - 0.06), new THREE.MeshStandardMaterial({ color: 0xe0b54f, roughness: 0.3, metalness: 0.7 }));
    cbody.position.y = TILE_H * 0.8;
    cbody.castShadow = cbody.receiveShadow = true;
    const cface = new THREE.Mesh(new THREE.PlaneGeometry(3 * S - 0.06, 3 * S - 0.06), new THREE.MeshStandardMaterial({ map: ctex, roughness: 0.45 }));
    cface.rotation.x = -Math.PI / 2;
    cface.position.y = TILE_H * 1.6 + 0.002;
    cface.receiveShadow = true;
    cgrp.add(cbody, cface);
    g.add(cgrp);
    this.centerTop = BOARD_TOP + TILE_H * 1.6;

  }

  // ------------------------------------------------------------------ chevaux
  /** Pièce « cheval » : socle tourné et tête sculptée (extrudée), comme un cavalier d'échecs. */
  makeHorse(color) {
    const grp = new THREE.Group();
    const col = new THREE.Color(color);
    const mat = new THREE.MeshStandardMaterial({ color: col, roughness: 0.26, metalness: 0.18 });
    const base = new THREE.Mesh(new THREE.LatheGeometry([[0, 0], [0.17, 0], [0.19, 0.025], [0.175, 0.055], [0.12, 0.08], [0.1, 0.12], [0, 0.12]].map(([a, b]) => new THREE.Vector2(a, b)), 32), mat);
    const shape = new THREE.Shape();
    const pts = [[-0.085, 0], [0.085, 0], [0.075, 0.07], [0.05, 0.13], [0.1, 0.17], [0.135, 0.21], [0.13, 0.25], [0.085, 0.265], [0.04, 0.27], [0.02, 0.33], [-0.005, 0.355], [-0.02, 0.31], [-0.06, 0.29], [-0.095, 0.22], [-0.105, 0.12]];
    shape.moveTo(pts[0][0], pts[0][1]);
    for (const [x, y] of pts.slice(1)) shape.lineTo(x, y);
    shape.closePath();
    const head = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.08, bevelEnabled: true, bevelThickness: 0.028, bevelSize: 0.022, bevelSegments: 3, curveSegments: 4 }), mat);
    head.position.set(0, 0.11, -0.04);
    // Crinière : rangée de petites mèches plus sombres le long de la nuque
    const maneMat = new THREE.MeshStandardMaterial({ color: col.clone().multiplyScalar(0.45), roughness: 0.5 });
    const mane = new THREE.Group();
    [[-0.1, 0.19], [-0.085, 0.24], [-0.06, 0.285], [-0.025, 0.32]].forEach(([x, y], k) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.06, 0.05), maneMat);
      m.position.set(x, 0.11 + y, 0);
      m.rotation.z = 0.5 + k * 0.15;
      mane.add(m);
    });
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 });
    const eye1 = new THREE.Mesh(new THREE.SphereGeometry(0.018, 10, 8), eyeMat);
    eye1.position.set(0.06, 0.34, 0.06);
    const eye2 = eye1.clone();
    eye2.position.z = -0.06;
    const neck = new THREE.Group();
    neck.add(head, mane, eye1, eye2);
    grp.add(base, neck);
    grp.traverse((o) => o.isMesh && (o.castShadow = true));
    // Anneau lumineux (cheval jouable)
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.22, 0.29, 40), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.012;
    grp.add(ring);
    grp.userData = { ring, neck, mat };
    grp.scale.setScalar(1.35);
    this.scene.add(grp);
    return grp;
  }

  /**
   * Place les chevaux. list = [{ key, color, rc:[r,c], top (hauteur du sol), can, mine, dir }]
   * Les déplacements sont animés par un petit saut.
   */
  sync(list, animate = true, hopMs = 160) {
    const seen = new Set();
    this.pickables = [];
    for (const it of list) {
      seen.add(it.key);
      let hz = this.horses[it.key];
      if (!hz) {
        const obj = this.makeHorse(it.color);
        obj.traverse((o) => o.isMesh && (o.userData.horse = it.key));
        hz = this.horses[it.key] = { obj, pos: null };
      }
      const [x, z] = cellXZ(it.rc);
      const to = new THREE.Vector3(x + (it.off ? it.off[0] : 0), it.top ?? TOP, z + (it.off ? it.off[1] : 0));
      hz.can = it.can;
      hz.mine = it.mine;
      hz.home = it.home;
      hz.obj.scale.setScalar(it.home ? 0.85 : 1.35);
      if (!hz.pos || !animate) {
        hz.obj.position.copy(to);
        hz.pos = to.clone();
      } else if (hz.pos.distanceTo(to) > 0.001) {
        const from = hz.obj.position.clone();
        const dist = from.distanceTo(to);
        const ms = it.flight ? 700 : hopMs;
        const hgt = it.flight ? 1.6 : 0.25 + Math.min(0.4, dist * 0.08);
        // Le cheval regarde dans la direction du saut
        const yaw = Math.atan2(-(to.z - from.z), to.x - from.x);
        if (dist > 0.01) hz.obj.rotation.y = yaw;
        hz.pos = to.clone();
        const tok = (hz.tok = (hz.tok || 0) + 1);
        this.tween(ms, (t) => {
          if (hz.tok !== tok) return;
          const e = it.flight ? ease.inOut(t) : t;
          hz.obj.position.lerpVectors(from, to, e);
          hz.obj.position.y = from.y + (to.y - from.y) * e + Math.sin(Math.PI * t) * hgt;
        });
      }
      this.pickables.push(...hz.obj.children.filter((c) => c.isMesh || c.isGroup).flatMap((c) => (c.isGroup ? c.children : [c])));
    }
    for (const [k, hz] of Object.entries(this.horses)) {
      if (seen.has(k)) continue;
      this.scene.remove(hz.obj);
      delete this.horses[k];
    }
  }

  // ------------------------------------------------------------------ dé
  buildDie() {
    const faceTex = (v) => {
      const c = makeCanvas(128, 128);
      const g = c.getContext('2d');
      const grd = g.createLinearGradient(0, 0, 128, 128);
      grd.addColorStop(0, '#ffffff');
      grd.addColorStop(1, '#e3e3ee');
      g.fillStyle = grd;
      rr(g, 0, 0, 128, 128, 22);
      g.fill();
      const P = { 1: [[64, 64]], 2: [[36, 36], [92, 92]], 3: [[34, 34], [64, 64], [94, 94]], 4: [[36, 36], [92, 36], [36, 92], [92, 92]], 5: [[34, 34], [94, 34], [64, 64], [34, 94], [94, 94]], 6: [[36, 32], [92, 32], [36, 64], [92, 64], [36, 96], [92, 96]] };
      for (const [x, y] of P[v]) {
        const rg = g.createRadialGradient(x - 3, y - 3, 1, x, y, 13);
        rg.addColorStop(0, v === 1 || v === 6 ? '#ff7b7b' : '#555');
        rg.addColorStop(1, v === 1 || v === 6 ? '#b3261e' : '#111');
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
    const mats = [3, 4, 1, 6, 2, 5].map(faceTex);
    this.die = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), mats);
    this.die.castShadow = true;
    this.scene.add(this.die);
    this.dieRest = new THREE.Vector3(0, BOARD_TOP + TILE_H * 1.6 + 0.25, 0);
    this.die.position.copy(this.dieRest);
    this.setDie(6);
  }
  faceQuat(v, yaw) {
    const e = { 1: [0, 0, 0], 6: [Math.PI, 0, 0], 3: [0, 0, Math.PI / 2], 4: [0, 0, -Math.PI / 2], 2: [-Math.PI / 2, 0, 0], 5: [Math.PI / 2, 0, 0] }[v];
    const qf = new THREE.Quaternion().setFromEuler(new THREE.Euler(e[0], e[1], e[2]));
    return new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw).multiply(qf);
  }
  setDie(v) {
    this.die.quaternion.copy(this.faceQuat(v || 6, 0.3));
    this.die.position.copy(this.dieRest);
  }
  /** Lancer de dé : il tombe en tournant et rebondit sur l'arrivée centrale. */
  rollDie(v, color = '#ffffff') {
    const m = this.die;
    const yaw = (Math.random() - 0.5) * 1.2;
    const qF = this.faceQuat(v, yaw);
    const axis = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.3, Math.random() - 0.5).normalize();
    const spins = (3 + Math.random() * 2) * Math.PI * 2;
    const from = new THREE.Vector3((Math.random() - 0.5) * 3, 3, 3);
    // Le dé retombe toujours sur l'arrivée centrale (jamais à cheval sur les cases)
    const to = new THREE.Vector3((Math.random() - 0.5) * 0.4, this.dieRest.y, (Math.random() - 0.5) * 0.4);
    this.dieGlow = new THREE.Color(color);
    return this.tween(1050, (t) => {
      const e = ease.out(t);
      m.position.x = from.x + (to.x - from.x) * e;
      m.position.z = from.z + (to.z - from.z) * e;
      m.position.y = from.y + (to.y - from.y) * ease.bounce(Math.min(1, t * 1.15));
      m.quaternion.copy(qF).multiply(new THREE.Quaternion().setFromAxisAngle(axis, spins * (1 - e)));
    }).then(() => {
      m.quaternion.copy(qF);
      this.dieRest.set(to.x, to.y, to.z);
    });
  }

  // --------------------------------------------------------- repères, effets
  buildMarker() {
    const g = new THREE.Group();
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(new THREE.RingGeometry(S * 0.32, S * 0.44, 48), ringMat);
    ring.rotation.x = -Math.PI / 2;
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(S * 0.38, S * 0.44, 1.6, 32, 1, true), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    beam.position.y = 0.8;
    const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.26, 4), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.3 }));
    arrow.rotation.x = Math.PI;
    g.add(ring, beam, arrow);
    g.visible = false;
    g.userData = { ring, beam, arrow };
    this.marker = g;
    this.scene.add(g);
  }
  /** Repère de la case d'arrivée du cheval survolé. */
  showTarget(rc, color, top = TOP) {
    const m = this.marker;
    if (!rc) {
      m.visible = false;
      return;
    }
    const [x, z] = cellXZ(rc);
    const col = new THREE.Color(color);
    m.userData.ring.material.color.copy(col);
    m.userData.beam.material.color.copy(col);
    m.userData.arrow.material.color.copy(col);
    m.userData.arrow.material.emissive.copy(col);
    m.position.set(x, top + 0.01, z);
    m.visible = true;
  }
  burst(rc, color, n = 22, top = TOP) {
    const [x, z] = cellXZ(rc);
    const col = new THREE.Color(color);
    const geo = new THREE.SphereGeometry(0.045, 6, 5);
    for (let k = 0; k < n; k++) {
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: k % 3 ? col : new THREE.Color(0xffd166), transparent: true }));
      const a = (k / n) * Math.PI * 2;
      const sp = 0.6 + Math.random() * 0.8;
      const vy = 1.4 + Math.random() * 1.2;
      m.position.set(x, top + 0.2, z);
      this.scene.add(m);
      this.tween(800, (t) => {
        m.position.set(x + Math.cos(a) * sp * t, top + 0.2 + vy * t - 2.6 * t * t, z + Math.sin(a) * sp * t);
        m.material.opacity = 1 - t;
      }).then(() => this.scene.remove(m));
    }
  }
  shake(p = 0.5) {
    this.shakeT = p;
  }
  /** Position à l'écran (pixels) d'un point de la grille. */
  toScreen(rc, y = TOP + 0.4) {
    const [x, z] = cellXZ(rc);
    const v = new THREE.Vector3(x, y, z).project(this.camera);
    const r = this.renderer.domElement.getBoundingClientRect();
    return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
  }
  dieScreen() {
    const v = this.die.position.clone().project(this.camera);
    const r = this.renderer.domElement.getBoundingClientRect();
    return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
  }

  // ------------------------------------------------------------------ caméra
  resize() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (!w || !h) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (this.renderer.getPixelRatio() !== dpr) this.renderer.setPixelRatio(dpr);
    this.readSafeArea();
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    const sa = this.sa;
    const base = (w - sa.left - sa.right) / Math.max(1, h - sa.top - sa.bottom) < 1.2 ? 1.2 : 1.0;
    if (this.basePitch !== base) {
      this.basePitch = base;
      this.view.pitch = base;
    }
    this.fitCamera();
  }
  readSafeArea() {
    const cs = getComputedStyle(this.container);
    const v = (n) => {
      const x = parseFloat(cs.getPropertyValue(n));
      return Number.isFinite(x) ? x : 0;
    };
    this.sa = { top: v('--safe-top'), bottom: v('--safe-y'), left: v('--safe-x'), right: v('--safe-x') };
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
    for (const x of [-5.45, 5.45]) for (const z of [-5.45, 5.45]) for (const y of [0, 0.5]) corners.push(new THREE.Vector3(x, y, z));
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
    const fromT = this.target.clone();
    const to = { yaw: 0, pitch: this.basePitch || 1.0, zoom: 1 };
    this.tween(500, (t) => {
      const e = ease.inOut(t);
      this.view = { yaw: from.yaw + (to.yaw - from.yaw) * e, pitch: from.pitch + (to.pitch - from.pitch) * e, zoom: from.zoom + (to.zoom - from.zoom) * e };
      this.target.lerpVectors(fromT, this.homeTarget, e);
      this.fitCamera();
    });
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
      return hit ? hit.object.userData.horse : null;
    };
    const pointers = new Map();
    let drag = null;
    let pinch = null;
    let lastTap = null;
    const groundAt = (cx, cy) => {
      const r = el.getBoundingClientRect();
      ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, this.camera);
      const hit = new THREE.Vector3();
      return ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -TOP), hit) ? hit : null;
    };
    el.addEventListener('pointerdown', (e) => {
      el.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 1) drag = { x: e.clientX, y: e.clientY, lx: e.clientX, ly: e.clientY, yaw: this.view.yaw, pitch: this.view.pitch, moved: 0, touch: e.pointerType !== 'mouse' };
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), zoom: this.view.zoom, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
        drag = null;
      }
    });
    el.addEventListener('pointermove', (e) => {
      if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch && pointers.size === 2) {
        // Pincer : zoom, et déplacement du plateau avec les deux doigts
        const [a, b] = [...pointers.values()];
        const mx = (a.x + b.x) / 2;
        const my = (a.y + b.y) / 2;
        this.view.zoom = Math.min(this.maxZoom(), Math.max(0.8, pinch.zoom * (Math.hypot(a.x - b.x, a.y - b.y) / pinch.d)));
        this.panBy(mx - pinch.mx, my - pinch.my);
        pinch.mx = mx;
        pinch.my = my;
        this.fitCamera();
        return;
      }
      if (drag) {
        const dx = e.clientX - drag.x;
        const dy = e.clientY - drag.y;
        drag.moved = Math.max(drag.moved, Math.abs(dx) + Math.abs(dy));
        if (drag.moved > 6) {
          if (drag.touch && this.view.zoom > 1.05) this.panBy(e.clientX - drag.lx, e.clientY - drag.ly);
          else {
            this.view.yaw = Math.max(-1.1, Math.min(1.1, drag.yaw - dx * 0.006));
            this.view.pitch = Math.max(0.55, Math.min(1.45, drag.pitch + dy * 0.005));
          }
          drag.lx = e.clientX;
          drag.ly = e.clientY;
          this.fitCamera();
        }
        return;
      }
      if (e.pointerType === 'mouse') this.setHover(pick(e));
    });
    const up = (e) => {
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinch = null;
      if (drag && drag.moved <= 6 && e.type === 'pointerup') {
        const now = performance.now();
        if (drag.touch && lastTap && now - lastTap.t < 320 && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 40) {
          lastTap = null;
          if (this.view.zoom > 1.2) this.resetView();
          else {
            const g = groundAt(e.clientX, e.clientY);
            if (g) this.zoomAt(g.x, g.z, 2.2);
          }
          drag = null;
          return;
        }
        lastTap = drag.touch ? { t: now, x: e.clientX, y: e.clientY } : null;
        const k = pick(e);
        if (k && this.cb.onClick) this.cb.onClick(k);
      }
      drag = null;
    };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('pointerleave', () => this.setHover(null));
    el.addEventListener('dblclick', () => {
      if (!matchMedia('(pointer: coarse)').matches) this.resetView();
    });
    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.view.zoom = Math.min(2.2, Math.max(0.8, this.view.zoom * (e.deltaY < 0 ? 1.08 : 0.93)));
      this.fitCamera();
    }, { passive: false });
  }
  maxZoom() {
    return matchMedia('(pointer: coarse)').matches ? 3 : 2.2;
  }
  /** Déplace le point visé selon un glissement à l'écran (en pixels), sans sortir du plateau. */
  panBy(dx, dy) {
    const H = this.container.clientHeight || 1;
    const dist = this.camera.position.distanceTo(this.target);
    const k = (2 * dist * Math.tan((this.camera.fov * Math.PI) / 360)) / H;
    const yaw = this.view.yaw;
    const sp = Math.max(0.5, Math.sin(this.view.pitch));
    const wx = -dx * k;
    const wz = (-dy * k) / sp;
    this.target.x += wx * Math.cos(yaw) + wz * Math.sin(yaw);
    this.target.z += -wx * Math.sin(yaw) + wz * Math.cos(yaw);
    const lim = Math.max(0, 5.2 * (1 - 1 / Math.max(1, this.view.zoom)));
    this.target.x = Math.max(-lim, Math.min(lim, this.target.x));
    this.target.z = Math.max(-lim, Math.min(lim, this.target.z));
  }
  /** Zoom animé sur un point du plateau (double appui, bouton loupe). */
  zoomAt(x, z, zoom = 2.2) {
    const fromT = this.target.clone();
    const fromZ = this.view.zoom;
    const toZ = Math.min(this.maxZoom(), zoom);
    const lim = 5.2 * (1 - 1 / toZ);
    const toT = new THREE.Vector3(Math.max(-lim, Math.min(lim, x)), this.target.y, Math.max(-lim, Math.min(lim, z)));
    return this.tween(450, (t) => {
      const e = ease.inOut(t);
      this.target.lerpVectors(fromT, toT, e);
      this.view.zoom = fromZ + (toZ - fromZ) * e;
      this.fitCamera();
    });
  }
  /** Bouton loupe : zoom sur une pièce (clé de pion / cheval), ou retour à la vue d'ensemble. */
  toggleZoomOn(key) {
    if (this.view.zoom > 1.2) return this.resetView();
    const hz = key && this.horses[key];
    const p = hz ? hz.obj.position : new THREE.Vector3(0, 0, 0);
    return this.zoomAt(p.x, p.z, 2.2);
  }
  setHover(k) {
    if (this.hover === k) return;
    this.hover = k;
    const can = k && this.horses[k] && this.horses[k].can;
    this.renderer.domElement.style.cursor = can ? 'pointer' : '';
    if (this.cb.onHover) this.cb.onHover(can ? k : null);
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
    // Chevaux jouables : anneau pulsant et petit balancement
    for (const [k, hz] of Object.entries(this.horses)) {
      const { ring, neck } = hz.obj.userData;
      const p = (time * 1.1) % 1;
      const hov = this.hover === k && hz.can;
      ring.material.opacity = hz.can ? 0.9 * (1 - p) + (hov ? 0.3 : 0) : 0;
      ring.scale.setScalar(hz.can ? 0.9 + p * 0.9 : 1);
      neck.position.y = hz.can ? Math.abs(Math.sin(time * 5 + hz.obj.position.x)) * 0.06 : 0;
      neck.rotation.x = hz.can ? Math.sin(time * 5) * 0.06 : 0;
    }
    if (this.marker.visible) {
      const m = this.marker.userData;
      m.arrow.position.y = 0.5 + Math.abs(Math.sin(time * 5)) * 0.16;
      m.arrow.rotation.y = time * 1.5;
      m.beam.material.opacity = 0.14 + Math.sin(time * 5) * 0.05;
    }
    let off = null;
    if (this.shakeT > 0) {
      this.shakeT = Math.max(0, this.shakeT - dt);
      off = new THREE.Vector3((Math.random() - 0.5) * 0.18, (Math.random() - 0.5) * 0.1, 0).multiplyScalar(this.shakeT * 2);
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
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
    });
    for (const t of Object.values(this.texCache)) t.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}

export { TOP, BOARD_TOP, TILE_H };
