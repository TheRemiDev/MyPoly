'use strict';
/**
 * Petits chevaux — moteur côté serveur (autoritaire).
 * Le dé est tiré par le CSPRNG du serveur : rien n'est scripté.
 *
 * Positions relatives d'un cheval (par rapport à la case de départ de son joueur) :
 *   -1        écurie
 *   0 .. 58   parcours (case globale = (départ + r) % 60) ; 58 = case d'entrée de l'échelle
 *   59 .. 64  marches 1 à 6 de l'échelle
 *   65        centre : cheval arrivé
 */
const R = require('../game/random');

const TRACK = 60;
const ENTRY = 58;
const CENTER = 65;
const QUAD_COLORS = ['#ff5a5f', '#2ecc71', '#ffb020', '#3fa7ff']; // rouge, vert, jaune, bleu
const QUAD_NAMES = ['rouge', 'vert', 'jaune', 'bleu'];
/** Quadrants utilisés selon le nombre de joueurs (face à face à deux). */
const SEATING = { 2: [0, 2], 3: [0, 1, 2], 4: [0, 1, 2, 3] };

class HorseGame {
  constructor({ players, settings, onUpdate, onEnd }) {
    this.kind = 'chevaux';
    this.settings = settings;
    this.onUpdate = onUpdate || (() => {});
    this.onEnd = onEnd || (() => {});
    const quads = SEATING[players.length] || SEATING[4];
    this.players = players.map((p, k) => ({
      id: p.id,
      userId: p.userId || null,
      name: p.name,
      pawn: p.pawn,
      isBot: !!p.isBot,
      role: p.role,
      vip: !!p.vip,
      level: p.level || 0,
      quad: quads[k],
      color: QUAD_COLORS[quads[k]],
      connected: true,
      afk: false,
      timeouts: 0,
      horses: [-1, -1, -1, -1],
      out: false,
      rank: 0,
      stats: { rolls: 0, sixes: 0, captures: 0, captured: 0, finished: 0, moves: 0 },
    }));
    this.turn = R.int(0, this.players.length - 1);
    this.phase = 'roll';
    this.dice = null;
    this.sixStreak = 0;
    this.turns = 0;
    this.round = 1;
    this.events = [];
    this.anim = 0;
    this.log = [];
    this.over = false;
    this.winner = null;
    this.deadline = null;
    this.timer = null;
    this.startedAt = Date.now();
  }

  // ------------------------------------------------------------ utilitaires
  player(id) {
    return this.players.find((p) => p.id === id);
  }
  get cur() {
    return this.players[this.turn];
  }
  get active() {
    return this.players.filter((p) => !p.out);
  }
  emit(ev, ms = 0) {
    ev.at = this.anim;
    this.events.push(ev);
    this.anim += ms;
  }
  say(msg, pid = null) {
    const entry = { msg, pid, t: Date.now() };
    this.log.push(entry);
    if (this.log.length > 80) this.log.shift();
    this.emit({ t: 'log', ...entry });
  }
  start15(p) {
    return 1 + 15 * p.quad;
  }
  /** Case globale du parcours (ou null hors parcours). */
  globalOf(p, r) {
    return r >= 0 && r <= ENTRY ? (this.start15(p) + r) % TRACK : null;
  }
  /** Chevaux (de tous les joueurs) présents sur une case globale du parcours. */
  occupants(g) {
    const list = [];
    for (const q of this.players) {
      if (q.out) continue;
      q.horses.forEach((r, i) => {
        if (this.globalOf(q, r) === g) list.push({ p: q, i });
      });
    }
    return list;
  }
  home(p) {
    return p.horses.filter((r) => r === CENTER).length;
  }

  /** Destination d'un cheval pour un dé donné, ou null si le coup est impossible. */
  target(p, i, d) {
    const r = p.horses[i];
    const st = this.settings;
    if (r === CENTER) return null;
    if (r === -1) return d === 6 || (!st.sixToExit && d === 1) ? 0 : null;
    let to;
    if (st.strictLadder) {
      if (r < ENTRY) {
        to = r + d;
        if (to > ENTRY) return null; // il faut s'arrêter pile devant l'échelle
      } else if (r === ENTRY) {
        if (d !== 1) return null;
        to = ENTRY + 1;
      } else {
        const step = r - ENTRY; // 1..6
        if (step < 6 && d === step + 1) to = r + 1;
        else if (step === 6 && d === 6) to = CENTER;
        else return null;
      }
    } else {
      to = r + d;
      if (to > CENTER) return null;
    }
    // Interdit de doubler : aucune case intermédiaire du parcours ne doit être occupée
    if (st.noPassing && r <= ENTRY) {
      const last = Math.min(to, ENTRY + 1) - 1;
      for (let k = r + 1; k <= last; k++) {
        if (this.occupants(this.globalOf(p, k)).length) return null;
      }
    }
    return to;
  }
  options(p = this.cur, d = this.dice) {
    if (!d) return [];
    return p.horses.map((_, i) => i).filter((i) => this.target(p, i, d) !== null);
  }

  // ------------------------------------------------------------ déroulement
  start() {
    const w = this.settings.horsesToWin;
    this.say(`🐴 La course commence ! Premier à ramener ${w} cheva${w > 1 ? 'ux' : 'l'} au centre.`);
    this.say(`${this.cur.name} lance le premier.`, this.cur.id);
    this.emit({ t: 'turn', pid: this.cur.id }, 300);
    this.flush();
  }

  act(pid, type, data = {}) {
    if (this.over) return { error: 'La partie est terminée.' };
    const p = this.player(pid);
    if (!p || p.out) return { error: 'Vous ne jouez pas dans cette partie.' };
    if (p !== this.cur) return { error: 'Ce n\'est pas votre tour.' };
    p.timeouts = 0;
    p.afk = false;
    const res = this.handle(p, type, data);
    if (!res || !res.error) this.flush();
    return res || { ok: true };
  }

  handle(p, type, data) {
    if (type === 'roll') return this.doRoll(p);
    if (type === 'move') return this.doMove(p, Number(data.horse));
    return { error: 'Action inconnue.' };
  }

  doRoll(p) {
    if (this.phase !== 'roll') return { error: 'Choisissez d\'abord un cheval.' };
    const d = R.die();
    this.dice = d;
    p.stats.rolls++;
    if (d === 6) p.stats.sixes++;
    this.emit({ t: 'dice', pid: p.id, value: d }, 1100);
    const opts = this.options(p, d);
    if (!opts.length) {
      // Aucun cheval en jeu : jusqu'à 3 essais pour faire un 6
      const inPlay = p.horses.some((r) => r >= 0 && r < CENTER);
      if (this.settings.threeTries && !inPlay && d !== 6) {
        this.tries = (this.tries || 0) + 1;
        if (this.tries < 3) {
          this.emit({ t: 'noMove', pid: p.id, value: d, tries: this.tries }, 650);
          this.say(`🎲 ${p.name} fait ${d}… encore ${3 - this.tries} essai${3 - this.tries > 1 ? 's' : ''} pour faire un 6.`, p.id);
          this.dice = null;
          this.phase = 'roll';
          return { ok: true };
        }
      }
      this.emit({ t: 'noMove', pid: p.id, value: d }, 700);
      this.say(`🎲 ${p.name} fait ${d}… aucun cheval ne peut bouger.`, p.id);
      return this.afterMove(p, d, false);
    }
    // Un seul coup possible : il est joué automatiquement
    if (opts.length === 1 || new Set(opts.map((i) => p.horses[i])).size === 1) return this.doMove(p, opts[0], true);
    this.phase = 'move';
    this.say(`🎲 ${p.name} fait ${d}.`, p.id);
    return { ok: true };
  }

  doMove(p, i, auto = false) {
    const d = this.dice;
    if (!auto && this.phase !== 'move') return { error: 'Lancez d\'abord le dé.' };
    if (!(i >= 0 && i < 4)) return { error: 'Cheval introuvable.' };
    const from = p.horses[i];
    const to = this.target(p, i, d);
    if (to === null) return { error: 'Ce cheval ne peut pas avancer de ' + d + '.' };
    if (auto) this.say(`🎲 ${p.name} fait ${d}.`, p.id);
    p.horses[i] = to;
    p.stats.moves++;
    const path = [];
    if (from === -1) path.push(0);
    else for (let k = from + 1; k <= to; k++) path.push(k);
    this.emit({ t: from === -1 ? 'exit' : 'move', pid: p.id, horse: i, from, to, path }, from === -1 ? 700 : 260 + path.length * 170);
    if (from === -1) this.say(`🐎 ${p.name} sort un cheval de l'écurie !`, p.id);
    // Renvoi à l'écurie des chevaux adverses sur la case d'arrivée
    let captured = false;
    const g = this.globalOf(p, to);
    if (g !== null) {
      for (const { p: q, i: j } of this.occupants(g)) {
        if (q === p) continue;
        q.horses[j] = -1;
        q.stats.captured++;
        p.stats.captures++;
        captured = true;
        this.emit({ t: 'capture', pid: p.id, victim: q.id, horse: j, cell: g }, 1100);
        this.say(`💥 ${p.name} renvoie un cheval ${QUAD_NAMES[q.quad]} de ${q.name} à l'écurie !`, p.id);
      }
    }
    if (to === CENTER) {
      p.stats.finished++;
      const n = this.home(p);
      this.emit({ t: 'finish', pid: p.id, horse: i, home: n }, 1200);
      this.say(`🏁 Un cheval de ${p.name} arrive au centre (${n}/${this.settings.horsesToWin}) !`, p.id);
      if (n >= this.settings.horsesToWin) return this.finish(p);
    }
    return this.afterMove(p, d, captured);
  }

  afterMove(p, d, captured) {
    this.phase = 'roll';
    const replay = (d === 6 && this.settings.sixReplay) || (captured && this.settings.captureReplay);
    if (replay && this.sixStreak < 2) {
      this.sixStreak++;
      this.emit({ t: 'replay', pid: p.id }, 500);
      this.say(`🔁 ${p.name} rejoue !`, p.id);
      this.dice = null;
      this.tries = 0;
      return { ok: true };
    }
    this.nextTurn();
    return { ok: true };
  }

  nextTurn() {
    this.sixStreak = 0;
    this.tries = 0;
    this.dice = null;
    this.phase = 'roll';
    this.turns++;
    const n = this.players.length;
    let i = this.turn;
    do {
      i = (i + 1) % n;
      if (i === 0) this.round++;
    } while (this.players[i].out);
    this.turn = i;
    this.emit({ t: 'turn', pid: this.cur.id }, 250);
  }

  finish(winner, type = 'chevaux') {
    if (this.over) return { ok: true };
    this.over = true;
    this.phase = 'over';
    this.winner = winner ? winner.id : null;
    clearTimeout(this.timer);
    const progress = (q) => q.horses.reduce((s, r) => s + (r < 0 ? 0 : r), 0);
    const others = this.players.filter((q) => q !== winner).sort((a, b) => (a.out !== b.out ? (a.out ? 1 : -1) : this.home(b) - this.home(a) || progress(b) - progress(a)));
    [winner, ...others].filter(Boolean).forEach((q, k) => (q.rank = k + 1));
    if (winner) this.say(`🏆 ${winner.name} remporte la course !`, winner.id);
    this.emit({ t: 'win', pid: this.winner, type }, 500);
    this.endedAt = Date.now();
    this.onEnd(this.result());
    return { ok: true };
  }

  result() {
    return {
      kind: 'chevaux',
      winner: this.winner,
      winType: 'chevaux',
      duration: Math.round(((this.endedAt || Date.now()) - this.startedAt) / 1000),
      rounds: this.round,
      turns: this.turns,
      players: this.players.map((p) => ({
        id: p.id,
        userId: p.userId,
        name: p.name,
        isBot: p.isBot,
        rank: p.rank,
        bankrupt: p.out,
        netWorth: this.home(p),
        home: this.home(p),
        stats: p.stats,
      })),
    };
  }

  forfeit(pid) {
    const p = this.player(pid);
    if (!p || p.out || this.over) return;
    const wasCur = p === this.cur;
    p.out = true;
    p.horses = [-1, -1, -1, -1];
    this.say(`🏳️ ${p.name} abandonne la course.`, p.id);
    this.emit({ t: 'out', pid: p.id }, 400);
    const left = this.active;
    if (left.length === 1) this.finish(left[0], 'forfeit');
    else if (wasCur) this.nextTurn();
    this.flush();
  }

  setConnected(pid, connected) {
    const p = this.player(pid);
    if (!p) return;
    p.connected = connected;
    if (!this.over) this.schedule();
  }

  // ------------------------------------------------------------------- bots
  /** Le cheval adverse le plus proche derrière une case globale (distance 1..6), ou 0. */
  threatAt(p, g) {
    if (g === null) return 0;
    let danger = 0;
    for (const q of this.players) {
      if (q === p || q.out) continue;
      for (const r of q.horses) {
        const qg = this.globalOf(q, r);
        if (qg === null) continue;
        const dist = (g - qg + TRACK) % TRACK;
        if (dist >= 1 && dist <= 6) danger++;
      }
    }
    return danger;
  }
  botChoice(p) {
    const d = this.dice;
    const opts = this.options(p, d);
    let best = opts[0];
    let bestScore = -Infinity;
    for (const i of opts) {
      const from = p.horses[i];
      const to = this.target(p, i, d);
      const g = this.globalOf(p, to);
      let s = to / 10;
      if (g !== null && this.occupants(g).some((o) => o.p !== p)) s += 100;
      if (to === CENTER) s += 80;
      if (from === -1) s += 60;
      if (from <= ENTRY && to > ENTRY) s += 40;
      s += this.threatAt(p, this.globalOf(p, from)) * 15;
      s -= this.threatAt(p, g) * 20;
      s += Math.random();
      if (s > bestScore) {
        bestScore = s;
        best = i;
      }
    }
    return best;
  }

  // --------------------------------------------------------- minuteur, sortie
  autoAct() {
    if (this.over) return;
    const p = this.cur;
    let res;
    if (this.phase === 'roll') res = this.doRoll(p);
    else res = this.doMove(p, this.botChoice(p));
    if (res && res.error) this.nextTurn();
    this.flush();
  }

  schedule() {
    clearTimeout(this.timer);
    if (this.over) return;
    const base = Math.max(0, this.anim - (Date.now() - (this.flushedAt || Date.now())));
    const p = this.cur;
    const tt = this.settings.turnTime * 1000;
    if (p.isBot) {
      this.deadline = null;
      this.timer = setTimeout(() => this.autoAct(), base + 550 + R.int(0, 600));
      return;
    }
    if (!p.connected || p.afk) {
      this.deadline = Date.now() + base + 4000;
      this.timer = setTimeout(() => this.autoAct(), base + 4000);
      return;
    }
    if (tt) {
      this.deadline = Date.now() + base + tt;
      this.timer = setTimeout(() => {
        p.timeouts++;
        if (p.timeouts >= 3) p.afk = true;
        this.autoAct();
      }, base + tt);
    } else this.deadline = null;
  }

  flush() {
    this.flushedAt = Date.now();
    const events = this.events;
    this.events = [];
    this.schedule();
    this.anim = 0;
    this.onUpdate({ events, state: this.publicState() });
  }

  publicState() {
    return {
      kind: 'chevaux',
      round: this.round,
      turns: this.turns,
      phase: this.phase,
      current: this.cur ? this.cur.id : null,
      dice: this.dice,
      options: this.phase === 'move' ? this.options() : [],
      players: this.players.map((p) => ({
        id: p.id,
        name: p.name,
        color: p.color,
        quad: p.quad,
        pawn: p.pawn,
        isBot: p.isBot,
        role: p.role,
        vip: p.vip,
        level: p.level,
        connected: p.connected,
        afk: p.afk,
        horses: p.horses.slice(),
        home: this.home(p),
        out: p.out,
        bankrupt: p.out,
        rank: p.rank,
        netWorth: this.home(p),
      })),
      log: this.log.slice(-40),
      deadline: this.deadline,
      serverNow: Date.now(),
      over: this.over,
      winner: this.winner,
      settings: { horsesToWin: this.settings.horsesToWin, strictLadder: this.settings.strictLadder, sixToExit: this.settings.sixToExit, noPassing: this.settings.noPassing, threeTries: this.settings.threeTries },
      tries: this.tries || 0,
    };
  }

  destroy() {
    clearTimeout(this.timer);
    this.over = true;
  }
}

module.exports = { HorseGame, TRACK, ENTRY, CENTER, QUAD_COLORS };
