// ============================================================================
//  MyPoly — Blackjack : table 3D en demi-lune (Three.js)
//  Reprend la mécanique de la table de poker (lumières, reflets, cartes, jetons,
//  animations, caméra) avec une table de casino : banque en haut, joueurs en arc.
// ============================================================================
import { Poker3D, TOP, CW, CH, CT, makeCanvas, rr, drawSuit, THREE } from './poker3d.js';

const FONT = "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";
const SERIF = "Georgia, 'Times New Roman', 'Palatino Linotype', serif";
const DZ = -2.9; // bord droit (côté banque)
const RX = 6.2; // demi-largeur du tapis
const RZ = 6.3; // profondeur du tapis (de la banque vers les joueurs)
const RAILW = 0.85;
const SEAT_T = { c: 90, r1: 57, l1: 123, r2: 26, l2: 154 };
const ease = { out: (t) => 1 - (1 - t) ** 3 };

/** Demi-lune : bord droit en z = DZ, arc elliptique vers les joueurs (repère de la forme : y = -z). */
function halfMoon(rx, rz, shape = new THREE.Shape(), n = 96) {
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * Math.PI;
    const x = rx * Math.cos(t);
    const z = DZ + rz * Math.sin(t);
    if (i === 0) shape.moveTo(x, -z);
    else shape.lineTo(x, -z);
  }
  shape.lineTo(rx, -DZ);
  return shape;
}

export class Blackjack3D extends Poker3D {
  /** Emplacements : moi au centre, puis à droite / à gauche en alternance. */
  static slotsFor(n) {
    return ['r1', 'l1', 'r2', 'l2'].slice(0, n);
  }
  L(x, z, y = TOP) {
    return new THREE.Vector3(x, y, z);
  }
  get upRot() {
    return 0;
  }
  get dealerCenter() {
    return new THREE.Vector3(0, TOP, DZ);
  }

  // ------------------------------------------------------------------ table
  buildTable() {
    this.bj = { seats: {}, dealer: [] };
    const wood = new THREE.MeshStandardMaterial({ color: 0x4a2a14, roughness: 0.48, metalness: 0.08 });
    const darkWood = new THREE.MeshStandardMaterial({ color: 0x2a170b, roughness: 0.55 });
    const gold = new THREE.MeshStandardMaterial({ color: 0xe0b54f, roughness: 0.25, metalness: 0.9 });
    // Pieds
    for (const x of [-3.6, 3.6]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.55, TOP - 0.2, 24), darkWood);
      leg.position.set(x, (TOP - 0.2) / 2, 0);
      leg.castShadow = true;
      this.world.add(leg);
    }
    // Plateau en bois
    const deck = new THREE.Mesh(new THREE.ExtrudeGeometry(halfMoon(RX + RAILW + 0.06, RZ + RAILW + 0.06), { depth: 0.16, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelSegments: 3 }), wood);
    deck.rotation.x = -Math.PI / 2;
    deck.position.y = TOP - 0.3;
    deck.castShadow = deck.receiveShadow = true;
    this.world.add(deck);
    // Rebord capitonné le long de l'arc
    const ring = halfMoon(RX + RAILW, RZ + RAILW);
    ring.holes.push(new THREE.Path(halfMoon(RX + 0.02, RZ + 0.02).getPoints().reverse()));
    const leather = new THREE.MeshStandardMaterial({ color: 0x2b1626, roughness: 0.45, metalness: 0.05 });
    const rail = new THREE.Mesh(new THREE.ExtrudeGeometry(ring, { depth: 0.1, bevelEnabled: true, bevelThickness: 0.12, bevelSize: 0.16, bevelSegments: 6 }), leather);
    rail.rotation.x = -Math.PI / 2;
    rail.position.y = TOP - 0.02;
    rail.castShadow = rail.receiveShadow = true;
    this.world.add(rail);
    // Côté banque : bord en bois verni et liseré doré
    const edge = new THREE.Mesh(new THREE.BoxGeometry((RX + RAILW) * 2, 0.26, 0.5), wood);
    edge.position.set(0, TOP + 0.02, DZ - 0.25);
    edge.castShadow = edge.receiveShadow = true;
    this.world.add(edge);
    const trimShape = halfMoon(RX + 0.05, RZ + 0.05);
    trimShape.holes.push(new THREE.Path(halfMoon(RX - 0.01, RZ - 0.01).getPoints().reverse()));
    const trim = new THREE.Mesh(new THREE.ExtrudeGeometry(trimShape, { depth: 0.03, bevelEnabled: false }), gold);
    trim.rotation.x = -Math.PI / 2;
    trim.position.y = TOP - 0.005;
    this.world.add(trim);
    // Tapis
    const geo = new THREE.ShapeGeometry(halfMoon(RX, RZ), 1);
    const uv = geo.attributes.uv;
    const pos = geo.attributes.position;
    for (let k = 0; k < uv.count; k++) {
      const x = pos.getX(k);
      const z = -pos.getY(k);
      uv.setXY(k, (x + RX) / (2 * RX), 1 - (z - DZ) / RZ);
    }
    const felt = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: this.tex(this.paintFelt()), roughness: 0.92 }));
    felt.rotation.x = -Math.PI / 2;
    felt.position.y = TOP;
    felt.receiveShadow = true;
    this.feltMesh = felt;
    this.world.add(felt);
    this.buildDealerProps(gold, wood, darkWood);
  }

  /** Feutre bleu royal, inscriptions dorées en arc, cercles de mise. */
  paintFelt() {
    const W = 2048;
    const H = Math.round((W * RZ) / (2 * RX));
    const fc = makeCanvas(W, H);
    const g = fc.getContext('2d');
    const k = W / (2 * RX);
    const X = (x) => (x + RX) * k;
    const Z = (z) => (z - DZ) * k;
    const bg = g.createRadialGradient(W / 2, Z(DZ + 1.2), 60, W / 2, Z(DZ + 2), W * 0.6);
    bg.addColorStop(0, '#2d5bd0');
    bg.addColorStop(0.55, '#173b93');
    bg.addColorStop(1, '#0a1d52');
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);
    for (let i = 0; i < 9000; i++) {
      g.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,.025)' : 'rgba(0,0,0,.06)';
      g.fillRect(Math.random() * W, Math.random() * H, 2, 2);
    }
    const cx = X(0);
    const cy = Z(DZ);
    // Texte en arc autour de la banque
    const arcText = (text, r, size, color, weight = 900) => {
      g.save();
      g.font = `${weight} ${size * k}px ${FONT}`;
      g.fillStyle = color;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      const total = [...text].reduce((s, ch) => s + g.measureText(ch).width, 0) + (text.length - 1) * size * k * 0.12;
      let a = Math.PI / 2 + total / (2 * r * k);
      for (const ch of text) {
        const w = g.measureText(ch).width;
        const step = (w + size * k * 0.12) / (r * k);
        a -= (w / 2) / (r * k);
        g.save();
        g.translate(cx + Math.cos(a) * r * k, cy + Math.sin(a) * r * k);
        g.rotate(a - Math.PI / 2);
        g.fillText(ch, 0, 0);
        g.restore();
        a -= step - (w / 2) / (r * k);
      }
      g.restore();
    };
    const arcLine = (r, width, color, dash) => {
      g.save();
      g.strokeStyle = color;
      g.lineWidth = width;
      if (dash) g.setLineDash(dash);
      g.beginPath();
      g.arc(cx, cy, r * k, 0.08, Math.PI - 0.08);
      g.stroke();
      g.restore();
    };
    arcLine(2.25, 4, 'rgba(255,209,102,.55)');
    arcText('BLACKJACK PAIE 3 POUR 2', 2.6, 0.27, '#ffd166');
    arcText('LA BANQUE TIRE À 16 ET RESTE À 17', 3.08, 0.2, 'rgba(255,240,200,.85)', 800);
    arcLine(3.4, 3, 'rgba(255,209,102,.4)', [16, 10]);
    // Cercles de mise (un par place)
    for (const t of Object.values(SEAT_T)) {
      const p = this.circlePos(t);
      g.save();
      g.translate(X(p.x), Z(p.z));
      g.strokeStyle = '#ffd166';
      g.lineWidth = 6;
      g.beginPath();
      g.arc(0, 0, 0.5 * k, 0, Math.PI * 2);
      g.stroke();
      g.strokeStyle = 'rgba(255,209,102,.45)';
      g.lineWidth = 3;
      g.beginPath();
      g.arc(0, 0, 0.42 * k, 0, Math.PI * 2);
      g.stroke();
      for (let s = 0; s < 4; s++) drawSuit(g, s, Math.cos((s * Math.PI) / 2 + Math.PI / 4) * 0.62 * k, Math.sin((s * Math.PI) / 2 + Math.PI / 4) * 0.62 * k, 0.13 * k, 'rgba(255,209,102,.55)');
      g.restore();
    }
    // Emplacements des cartes de la banque
    g.strokeStyle = 'rgba(255,255,255,.15)';
    g.lineWidth = 4;
    for (const x of [-0.53, 0.53]) {
      const z = this.dealerZ;
      rr(g, X(x - CW / 2 - 0.04), Z(z - CH / 2 - 0.04), (CW + 0.08) * k, (CH + 0.08) * k, 0.1 * k);
      g.stroke();
    }
    return fc;
  }

  get dealerZ() {
    return DZ + 1.45;
  }
  circlePos(t) {
    const a = (t * Math.PI) / 180;
    return new THREE.Vector3(RX * 0.66 * Math.cos(a), TOP, DZ + RZ * 0.66 * Math.sin(a));
  }

  /** Sabot, bac des cartes jouées et rack de jetons de la banque. */
  buildDealerProps(gold, wood, darkWood) {
    // Sabot (à droite de la banque)
    const shoe = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.42, 1.5), new THREE.MeshStandardMaterial({ color: 0x15121f, roughness: 0.35, metalness: 0.2 }));
    body.position.y = 0.21;
    const stack = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.3, 1.25), new THREE.MeshStandardMaterial({ map: this.backMat.map, roughness: 0.6 }));
    stack.position.set(0, 0.36, -0.05);
    const lip = new THREE.Mesh(new THREE.BoxGeometry(0.94, 0.06, 0.18), gold);
    lip.position.set(0, 0.42, 0.74);
    shoe.add(body, stack, lip);
    shoe.traverse((o) => o.isMesh && (o.castShadow = true));
    shoe.position.set(RX * 0.6, TOP, DZ + 0.75);
    shoe.rotation.y = -0.5;
    this.world.add(shoe);
    this.shoePos = new THREE.Vector3(RX * 0.6 - 0.3, TOP + 0.45, DZ + 1.3);
    // Bac des cartes jouées (à gauche)
    const tray = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.24, 1.4), new THREE.MeshStandardMaterial({ color: 0x1c1726, roughness: 0.5, transparent: true, opacity: 0.92 }));
    tray.position.set(-RX * 0.6, TOP + 0.12, DZ + 0.75);
    tray.rotation.y = 0.5;
    tray.castShadow = true;
    this.world.add(tray);
    this.discardPos = new THREE.Vector3(-RX * 0.6, TOP + 0.3, DZ + 0.75);
    // Rack de jetons de la banque
    const rack = new THREE.Group();
    const base = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.14, 0.55), wood);
    base.position.y = 0.07;
    rack.add(base);
    const cols = [100000, 25000, 5000, 1000, 500, 100, 25, 5];
    cols.forEach((v, i) => {
      const g = this.makeChipColumn(v, 7 + (i % 3));
      g.position.set(-1.58 + i * 0.45, 0.14, 0);
      rack.add(g);
    });
    rack.position.set(0, TOP, DZ + 0.32);
    this.world.add(rack);
    this.trayPos = new THREE.Vector3(0, TOP + 0.4, DZ + 0.4);
    // Fauteuils joueurs (décor) : posés par setSeats
  }
  /** Colonne de jetons couchés (rack de la banque). */
  makeChipColumn(v, n) {
    const g = new THREE.Group();
    const mats = this.chipMats[v];
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(this.chipGeo, mats);
      m.rotation.x = Math.PI / 2;
      m.position.set(0, 0.17, -0.2 + i * 0.045);
      g.add(m);
    }
    return g;
  }

  buildProps() {
    this.portraitPitch = 1.3;
    this.turnRing = new THREE.Mesh(new THREE.RingGeometry(0.62, 0.74, 64), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
    this.turnRing.rotation.x = -Math.PI / 2;
    this.world.add(this.turnRing);
    // Compat. avec la table de poker (non utilisés ici)
    this.potGroup = new THREE.Group();
    this.dealerBtn = new THREE.Group();
  }
  setLayout(portrait) {
    if (portrait === this.portrait && this.layoutDone) return;
    this.layoutDone = true;
    this.portrait = portrait;
    this.cb.onLayout && this.cb.onLayout();
  }
  /** La caméra cadre la zone de jeu (en portrait, les bords du rebord peuvent sortir de l'écran). */
  tableCorners() {
    const out = [];
    // En portrait : on cadre serré sur les cercles de mise (les bords du rebord sortent de l'écran)
    const rx = this.portrait ? 4.3 : RX + RAILW;
    const rz = this.portrait ? RZ * 0.8 : RZ + RAILW;
    for (let i = 0; i <= 8; i++) {
      const t = (i / 8) * Math.PI;
      out.push(new THREE.Vector3(rx * Math.cos(t), TOP + 0.2, DZ + rz * Math.sin(t)));
    }
    out.push(new THREE.Vector3(0, TOP + 0.5, DZ - 0.3));
    return out;
  }

  // ------------------------------------------------------------------ places
  setSeats(map) {
    this.lastMap = map;
    for (const [pid, s] of Object.entries(this.bj.seats)) if (!map[pid]) this.removeBjSeat(pid, s);
    for (const [pid, slot] of Object.entries(map)) {
      const t = SEAT_T[slot === 'me' ? 'c' : slot];
      const circle = this.circlePos(t);
      const toward = this.dealerCenter.clone().sub(circle).setY(0).normalize();
      const out = toward.clone().negate();
      const perp = new THREE.Vector3(-out.z, 0, out.x); // à la droite du joueur
      let s = this.bj.seats[pid];
      if (!s) s = this.bj.seats[pid] = { hands: [], bets: [], stack: null, chair: null, amount: -1 };
      if (s.slot !== slot) {
        if (s.chair) this.world.remove(s.chair);
        s.chair = null; // pas de fauteuil : la table reste dégagée
        s.amount = -1;
      }
      Object.assign(s, { slot, t, circle, toward, out, perp, rot: Math.atan2(out.x, out.z) });
    }
    // Compatibilité avec les méthodes de la table de poker
    this.seatPos = Object.fromEntries(Object.entries(this.bj.seats).map(([pid, s]) => [pid, { slot: s.slot, v: s.circle, dir: s.out, perp: s.perp, rot: s.rot }]));
  }
  removeBjSeat(pid, s) {
    for (const hand of s.hands) for (const m of hand) this.world.remove(m);
    for (const b of s.bets) if (b) this.world.remove(b);
    if (s.stack) this.world.remove(s.stack);
    if (s.chair) this.world.remove(s.chair);
    delete this.bj.seats[pid];
  }
  handOffset(s, h, n) {
    return n > 1 ? (h - (n - 1) / 2) * 1.25 : 0;
  }
  /** Position de la k-ième carte d'une main (cartes en escalier, comme au casino). */
  cardPos(pid, h, k, n) {
    const s = this.bj.seats[pid];
    return s.circle.clone().addScaledVector(s.perp, this.handOffset(s, h, n) - 0.2 + k * 0.3).addScaledVector(s.toward, 0.95 + k * 0.13).setY(TOP + CT / 2 + 0.002 + k * 0.006);
  }
  betPos(pid, h = 0, n = 1) {
    const s = this.bj.seats[pid];
    return s.circle.clone().addScaledVector(s.perp, this.handOffset(s, h, n)).setY(TOP + 0.001);
  }
  stackPos(pid) {
    const s = this.bj.seats[pid];
    return s.circle.clone().addScaledVector(s.out, 1.05).addScaledVector(s.perp, 1.0).setY(TOP + 0.001);
  }
  dealerCardPos(k, n) {
    const step = 1.04;
    return new THREE.Vector3((k - (n - 1) / 2) * step, TOP + CT / 2 + 0.002 + k * 0.004, this.dealerZ);
  }
  placeCard(m, pos, rot, scale = 1) {
    m.position.copy(pos);
    m.rotation.set(0, rot, 0);
    m.scale.setScalar(scale);
  }

  // ------------------------------------------------------------ état statique
  /**
   * players : [{ id, chips, hands: [{ cards, bet }] }], dealer : [cartes, null = cachée], current : { pid, hand }.
   */
  syncBj({ players, dealer, current }) {
    for (const p of players) {
      const s = this.bj.seats[p.id];
      if (!s) continue;
      if (s.amount !== p.chips) {
        if (s.stack) this.world.remove(s.stack);
        s.stack = p.chips > 0 ? this.makeChips(p.chips) : null;
        if (s.stack) {
          s.stack.position.copy(this.stackPos(p.id));
          this.world.add(s.stack);
        }
        s.amount = p.chips;
      }
      const n = p.hands.length;
      // Cartes
      while (s.hands.length > n) for (const m of s.hands.pop()) this.world.remove(m);
      p.hands.forEach((hand, h) => {
        const list = (s.hands[h] ||= []);
        while (list.length > hand.cards.length) this.world.remove(list.pop());
        hand.cards.forEach((c, k) => {
          let m = list[k];
          if (!m) {
            m = this.makeCard(c);
            this.world.add(m);
            list[k] = m;
          } else if (m.userData.card !== c) this.setCardFace(m, c);
          this.placeCard(m, this.cardPos(p.id, h, k, n), s.rot + (k % 2 ? 0.04 : -0.04), 0.92);
        });
      });
      // Mises
      while (s.bets.length > n) {
        const b = s.bets.pop();
        if (b) this.world.remove(b);
      }
      p.hands.forEach((hand, h) => {
        const cur = s.bets[h];
        if (cur && cur.userData.amount === hand.bet) {
          cur.position.copy(this.betPos(p.id, h, n));
          return;
        }
        if (cur) this.world.remove(cur);
        s.bets[h] = hand.bet > 0 ? this.makeChips(hand.bet) : null;
        if (s.bets[h]) {
          s.bets[h].position.copy(this.betPos(p.id, h, n));
          this.world.add(s.bets[h]);
        }
      });
    }
    // Banque
    const D = this.bj.dealer;
    while (D.length > dealer.length) this.world.remove(D.pop());
    dealer.forEach((c, k) => {
      let m = D[k];
      if (!m) {
        m = this.makeCard(c);
        this.world.add(m);
        D[k] = m;
      } else if (m.userData.card !== c) this.setCardFace(m, c);
      this.placeCard(m, this.dealerCardPos(k, dealer.length), 0);
    });
    this.setTurnBj(current);
  }
  setTurnBj(current) {
    const s = current && this.bj.seats[current.pid];
    this.turnPid = s ? current.pid : null;
    if (!s) {
      this.turnRing.material.opacity = 0;
      return;
    }
    const n = Math.max(1, s.hands.length);
    this.turnRing.position.copy(this.betPos(current.pid, current.hand, n)).setY(TOP + 0.012);
  }

  // ------------------------------------------------------------ animations
  /** Une carte part du sabot vers une main (ou la banque), et se retourne si elle est visible. */
  async dealCard(target, card, info) {
    const m = this.makeCard(null);
    let to;
    let rot = 0;
    let scale = 1;
    if (target === 'dealer') {
      const D = this.bj.dealer;
      D.push(m);
      D.forEach((x, k) => k < D.length - 1 && x.position.copy(this.dealerCardPos(k, D.length)));
      to = this.dealerCardPos(D.length - 1, D.length);
    } else {
      const s = this.bj.seats[target.pid];
      if (!s) return;
      const list = (s.hands[target.hand] ||= []);
      list.push(m);
      to = this.cardPos(target.pid, target.hand, list.length - 1, info && info.n ? info.n : Math.max(1, s.hands.length));
      rot = s.rot + ((list.length - 1) % 2 ? 0.04 : -0.04);
      scale = 0.92;
    }
    this.cb.onDeal && this.cb.onDeal();
    await this.fly(m, this.shoePos.clone(), to, { ms: 360, arc: 0.4, rotFrom: rot + 0.9, rotTo: rot, scaleFrom: 0.8, scaleTo: scale });
    if (card != null) await this.flipUp(m, card, 300);
  }
  /** La banque retourne sa carte cachée. */
  async revealHole(card) {
    const m = this.bj.dealer[1];
    if (m) await this.flipUp(m, card, 480);
  }
  /** Mise : les jetons partent de la pile vers le cercle de mise. */
  async placeBet(pid, amount, chips, h = 0, n = 1) {
    const s = this.bj.seats[pid];
    if (!s) return;
    const g = this.makeChips(amount);
    if (s.stack) this.world.remove(s.stack);
    s.stack = chips > 0 ? this.makeChips(chips) : null;
    if (s.stack) {
      s.stack.position.copy(this.stackPos(pid));
      this.world.add(s.stack);
    }
    s.amount = chips;
    this.cb.onChip && this.cb.onChip();
    await this.fly(g, this.stackPos(pid), this.betPos(pid, h, n), { ms: 420, arc: 0.45 });
    if (s.bets[h]) this.world.remove(s.bets[h]);
    s.bets[h] = g;
    g.userData.amount = amount;
  }
  /** Gain : la banque paie à côté de la mise, puis tout rejoint la pile du joueur. */
  async payWin(pid, h, n, bet, payout) {
    const s = this.bj.seats[pid];
    if (!s) return;
    const win = payout - bet;
    const spot = this.betPos(pid, h, n).add(new THREE.Vector3(0.38, 0, 0));
    if (win > 0) {
      const g = this.makeChips(win);
      this.cb.onChips && this.cb.onChips();
      await this.fly(g, this.trayPos.clone(), spot, { ms: 520, arc: 0.6 });
      await this.wait(250);
      const b = s.bets[h];
      s.bets[h] = null;
      await Promise.all([
        this.fly(g, g.position.clone(), this.stackPos(pid), { ms: 480, arc: 0.4 }).then(() => this.world.remove(g)),
        b ? this.fly(b, b.position.clone(), this.stackPos(pid), { ms: 480, arc: 0.4 }).then(() => this.world.remove(b)) : null,
      ]);
    }
  }
  /** Égalité : la mise revient au joueur. */
  async pushBack(pid, h) {
    const s = this.bj.seats[pid];
    const b = s && s.bets[h];
    if (!b) return;
    s.bets[h] = null;
    await this.fly(b, b.position.clone(), this.stackPos(pid), { ms: 450, arc: 0.4 });
    this.world.remove(b);
  }
  /** Perte : la banque ramasse la mise. */
  async collectLoss(pid, h) {
    const s = this.bj.seats[pid];
    const b = s && s.bets[h];
    if (!b) return;
    s.bets[h] = null;
    this.cb.onChips && this.cb.onChips();
    await this.fly(b, b.position.clone(), this.trayPos.clone(), { ms: 500, arc: 0.5 });
    this.world.remove(b);
  }
  /** Fin de manche : toutes les cartes partent dans le bac. */
  async clearCards() {
    const all = [...this.bj.dealer];
    this.bj.dealer = [];
    for (const s of Object.values(this.bj.seats)) {
      for (const hand of s.hands) all.push(...hand);
      s.hands = [];
    }
    if (!all.length) return;
    await Promise.all(all.map((m, i) => this.wait(i * 30).then(() => this.fly(m, m.position.clone(), this.discardPos.clone(), { ms: 380, arc: 0.3, rotTo: 0.5 })).then(() => this.world.remove(m))));
  }

  // ------------------------------------------------------------ écran
  handScreen(pid, h = 0, n = 1, k = 0) {
    const s = this.bj.seats[pid];
    // À droite de la dernière carte de la main (jamais par-dessus les mises ni la banque)
    return s ? this.screenOf(this.cardPos(pid, h, k, n).add(new THREE.Vector3(0, 0.05, 0)).addScaledVector(s.perp, CW * 0.5 + 0.28)) : null;
  }
  dealerScreen() {
    return this.screenOf(new THREE.Vector3(0, TOP + 0.05, this.dealerZ - CH * 0.62));
  }
  betScreen(pid, h = 0, n = 1) {
    return this.bj.seats[pid] ? this.screenOf(this.betPos(pid, h, n).setY(TOP + 0.05)) : null;
  }
  seatAnchor(pid) {
    const s = this.bj.seats[pid];
    if (!s) return null;
    return { slot: s.slot, ...this.screenOf(s.circle.clone().addScaledVector(s.out, 1.0).setY(TOP + 0.2)) };
  }
  seatScreen(pid) {
    const s = this.bj.seats[pid];
    return s ? this.screenOf(s.circle.clone().setY(TOP + 0.3)) : null;
  }
}

export { DZ, SERIF };
