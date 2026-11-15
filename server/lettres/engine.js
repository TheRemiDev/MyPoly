'use strict';
/**
 * « Lettres d'Or » — jeu de mots croisés (moteur côté serveur, autoritaire).
 *
 * - Plateau 15 × 15 aux cases bonus originales (Lettre ×2 / ×3, Mot ×2 / ×3).
 * - Sac de 103 lettres (dont 2 jokers) mélangé par le CSPRNG du serveur.
 * - Chaque joueur ne reçoit que SON chevalet ; le sac reste secret.
 * - Un coup : des lettres posées sur une même ligne ou colonne, reliées aux mots
 *   existants ; tous les mots formés doivent exister dans le dictionnaire.
 * - Les 7 lettres posées d'un coup : bonus « Lettres d'Or ».
 * - Fin : sac vide et un joueur sans lettres, ou tout le monde passe deux fois de suite,
 *   ou objectif de points atteint. Les lettres restantes sont décomptées.
 */
const R = require('../game/random');
const DICT = require('./dictionary');

const N = 15;
const C = 7; // case centrale
/** Lettres : [lettre, valeur, nombre]. « * » = joker. */
const LETTERS = [
  ['E', 1, 15], ['A', 1, 9], ['I', 1, 8], ['N', 1, 6], ['O', 1, 6], ['R', 1, 6], ['S', 1, 6], ['T', 1, 6], ['U', 1, 6],
  ['L', 2, 5], ['D', 2, 3], ['M', 2, 3],
  ['C', 3, 3], ['P', 3, 2], ['G', 3, 2], ['B', 3, 2],
  ['F', 4, 2], ['H', 4, 2], ['V', 4, 2],
  ['J', 8, 1], ['Q', 8, 1],
  ['K', 10, 1], ['W', 10, 1], ['X', 10, 1], ['Y', 10, 1], ['Z', 10, 1],
  ['*', 0, 2],
];
const VALUES = Object.fromEntries(LETTERS.map(([l, v]) => [l, v]));

/**
 * Cases bonus : motif symétrique original, décrit dans un huitième du plateau
 * (dx ≥ dy, par rapport au centre) puis reproduit par symétrie.
 */
const PATTERN = {
  M3: [[7, 2], [6, 6]],
  M2: [[3, 3], [5, 4], [4, 0]],
  L3: [[7, 7], [5, 1], [2, 1]],
  L2: [[1, 1], [3, 0], [6, 3], [7, 5], [4, 2], [6, 0]],
};
function buildBonus() {
  const grid = Array.from({ length: N }, () => Array(N).fill(null));
  for (const [type, list] of Object.entries(PATTERN)) {
    for (const [dx, dy] of list) {
      for (const [a, b] of [[dx, dy], [dy, dx]]) {
        for (const sx of [-1, 1]) for (const sy of [-1, 1]) grid[C + sy * b][C + sx * a] = type;
      }
    }
  }
  grid[C][C] = 'ST'; // départ : compte comme Mot ×2
  return grid;
}
const BONUS = buildBonus();

class LettersGame {
  constructor({ players, settings, onUpdate, onEnd }) {
    this.kind = 'lettres';
    this.settings = settings;
    this.onUpdate = onUpdate || (() => {});
    this.onEnd = onEnd || (() => {});
    this.players = players.map((p) => ({
      id: p.id,
      userId: p.userId || null,
      name: p.name,
      color: p.color,
      pawn: p.pawn,
      isBot: !!p.isBot,
      role: p.role,
      vip: !!p.vip,
      level: p.level || 0,
      connected: true,
      afk: false,
      timeouts: 0,
      rack: [],
      score: 0,
      out: false,
      forfeit: false,
      rank: 0,
      lastMove: null,
      stats: { words: 0, bestWord: '', bestScore: 0, bingos: 0, moves: 0, passes: 0, exchanges: 0, longest: '' },
    }));
    // Sac
    const bag = [];
    let id = 0;
    for (const [l, , n] of LETTERS) for (let k = 0; k < n; k++) bag.push({ id: id++, l });
    this.bag = R.shuffle(bag);
    this.board = Array.from({ length: N }, () => Array(N).fill(null));
    this.turn = R.int(0, this.players.length - 1);
    this.passes = 0;
    this.moves = 0;
    this.lastPlay = null;
    this.events = [];
    this.anim = 0;
    this.log = [];
    this.over = false;
    this.winner = null;
    this.deadline = null;
    this.timer = null;
    this.botTimers = [];
    this.seq = 0;
    this.startedAt = Date.now();
  }

  // ------------------------------------------------------------- utilitaires
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
  value(tile) {
    return tile.l === '*' ? 0 : VALUES[tile.l];
  }
  draw(p) {
    let n = 0;
    while (p.rack.length < 7 && this.bag.length) {
      p.rack.push(this.bag.pop());
      n++;
    }
    return n;
  }
  nextTurn() {
    const n = this.players.length;
    let i = this.turn;
    for (let s = 0; s < n; s++) {
      i = (i + 1) % n;
      if (!this.players[i].out) break;
    }
    this.turn = i;
    this.moves++;
  }
  get boardEmpty() {
    return this.board[C][C] === null;
  }

  // ------------------------------------------------------------ déroulement
  start() {
    for (const p of this.players) this.draw(p);
    this.say(`La partie de Lettres d'Or commence ! ${this.cur.name} pose le premier mot sur l'étoile centrale.`);
    this.emit({ t: 'start', first: this.cur.id }, 1500);
    this.flush();
  }

  // --------------------------------------------------------------- analyse d'un coup
  /**
   * Analyse un coup (sans le jouer) : validité, mots formés, score.
   * placed : [{ r, c, tile, letter }] (letter = lettre réelle, utile pour les jokers).
   */
  analyze(placed, checkWords = true) {
    if (!placed.length) return { error: 'Posez au moins une lettre.' };
    const seen = new Set();
    for (const t of placed) {
      if (!Number.isInteger(t.r) || !Number.isInteger(t.c) || t.r < 0 || t.c < 0 || t.r >= N || t.c >= N) return { error: 'Case hors du plateau.' };
      if (this.board[t.r][t.c]) return { error: 'Cette case est déjà occupée.' };
      const k = t.r * N + t.c;
      if (seen.has(k)) return { error: 'Deux lettres sur la même case.' };
      seen.add(k);
    }
    const rows = new Set(placed.map((t) => t.r));
    const cols = new Set(placed.map((t) => t.c));
    if (rows.size > 1 && cols.size > 1) return { error: 'Les lettres doivent être sur une même ligne ou une même colonne.' };
    const horiz = rows.size === 1 && (cols.size > 1 || this.lineLength(placed[0], true) >= this.lineLength(placed[0], false));
    const at = (r, c) => {
      if (r < 0 || c < 0 || r >= N || c >= N) return null;
      const p = placed.find((t) => t.r === r && t.c === c);
      if (p) return { letter: p.letter, value: this.value(p.tile), fresh: true, r, c };
      const b = this.board[r][c];
      return b ? { letter: b.letter, value: b.value, fresh: false, r, c } : null;
    };
    // Continuité : pas de trou entre la première et la dernière lettre posée
    const line = placed.map((t) => (horiz ? t.c : t.r)).sort((a, b) => a - b);
    const fixed = horiz ? placed[0].r : placed[0].c;
    for (let k = line[0]; k <= line[line.length - 1]; k++) {
      if (!(horiz ? at(fixed, k) : at(k, fixed))) return { error: 'Les lettres doivent former un seul mot, sans trou.' };
    }
    // Premier coup : sur l'étoile centrale, au moins 2 lettres
    if (this.boardEmpty) {
      if (!placed.some((t) => t.r === C && t.c === C)) return { error: 'Le premier mot doit passer par l\'étoile centrale.' };
      if (placed.length < 2) return { error: 'Le premier mot doit faire au moins 2 lettres.' };
    } else {
      // Sinon : toucher au moins une lettre déjà posée
      const touches = placed.some((t) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dr, dc]) => {
        const r = t.r + dr;
        const c = t.c + dc;
        return r >= 0 && c >= 0 && r < N && c < N && this.board[r][c];
      }));
      if (!touches) return { error: 'Le mot doit s\'appuyer sur une lettre déjà posée.' };
    }
    // Mots formés : le mot principal et les mots croisés
    const wordAt = (r, c, h) => {
      let r0 = r;
      let c0 = c;
      while (at(r0 - (h ? 0 : 1), c0 - (h ? 1 : 0))) {
        r0 -= h ? 0 : 1;
        c0 -= h ? 1 : 0;
      }
      const cells = [];
      let rr = r0;
      let cc = c0;
      for (;;) {
        const x = at(rr, cc);
        if (!x) break;
        cells.push(x);
        rr += h ? 0 : 1;
        cc += h ? 1 : 0;
      }
      return cells;
    };
    const words = [];
    const main = wordAt(placed[0].r, placed[0].c, horiz);
    if (main.length >= 2) words.push(main);
    for (const t of placed) {
      const cross = wordAt(t.r, t.c, !horiz);
      if (cross.length >= 2) words.push(cross);
    }
    if (!words.length) return { error: 'Un mot fait au moins 2 lettres.' };
    let total = 0;
    const out = [];
    for (const cells of words) {
      const word = cells.map((x) => x.letter).join('');
      let sum = 0;
      let mult = 1;
      for (const x of cells) {
        let v = x.value;
        if (x.fresh) {
          const b = BONUS[x.r][x.c];
          if (b === 'L2') v *= 2;
          else if (b === 'L3') v *= 3;
          else if (b === 'M2' || b === 'ST') mult *= 2;
          else if (b === 'M3') mult *= 3;
        }
        sum += v;
      }
      const score = sum * mult;
      total += score;
      out.push({ word, score, cells: cells.map((x) => [x.r, x.c]) });
    }
    const bingo = placed.length === 7 ? this.settings.bingo : 0;
    total += bingo;
    if (checkWords) {
      const bad = out.filter((w) => !DICT.has(w.word));
      if (bad.length) return { error: `${bad.map((w) => w.word).join(', ')} : ${bad.length > 1 ? 'mots inconnus' : 'mot inconnu'} du dictionnaire.`, words: out, score: total, invalid: bad.map((w) => w.word) };
    }
    return { ok: true, words: out, score: total, bingo, horiz };
  }
  /** Longueur de la ligne (lettres déjà posées comprises) autour d'une case : pour décider du sens d'une seule lettre. */
  lineLength(t, horiz) {
    let n = 1;
    for (const s of [-1, 1]) {
      let r = t.r + (horiz ? 0 : s);
      let c = t.c + (horiz ? s : 0);
      while (r >= 0 && c >= 0 && r < N && c < N && this.board[r][c]) {
        n++;
        r += horiz ? 0 : s;
        c += horiz ? s : 0;
      }
    }
    return n;
  }

  /** Transforme la demande d'un joueur en lettres de son chevalet. */
  resolve(p, tiles) {
    if (!Array.isArray(tiles) || !tiles.length || tiles.length > 7) return { error: 'Coup invalide.' };
    const used = new Set();
    const placed = [];
    for (const t of tiles) {
      const tile = p.rack.find((x) => x.id === t.id);
      if (!tile || used.has(t.id)) return { error: 'Cette lettre n\'est pas sur votre chevalet.' };
      used.add(t.id);
      let letter = tile.l;
      if (tile.l === '*') {
        letter = String(t.letter || '').toUpperCase();
        if (!/^[A-Z]$/.test(letter)) return { error: 'Choisissez la lettre du joker.' };
      }
      placed.push({ r: Number(t.r), c: Number(t.c), tile, letter });
    }
    return { placed };
  }

  // --------------------------------------------------------------- actions
  act(pid, type, data = {}) {
    if (this.over) return { error: 'La partie est terminée.' };
    const p = this.player(pid);
    if (!p || p.out) return { error: 'Vous ne jouez pas dans cette partie.' };
    // Aperçu (score et validité) possible à tout moment, sans rien changer
    if (type === 'preview') {
      const rs = this.resolve(p, data.tiles);
      if (rs.error) return rs;
      const a = this.analyze(rs.placed);
      return { ok: true, valid: !a.error, error: a.error || null, words: a.words || [], score: a.score || 0, bingo: a.bingo || 0 };
    }
    if (p !== this.cur) return { error: 'Ce n\'est pas votre tour.' };
    p.timeouts = 0;
    p.afk = false;
    const res = this.handle(p, type, data);
    if (!res || !res.error) this.flush();
    return res || { ok: true };
  }

  handle(p, type, data) {
    switch (type) {
      case 'play': {
        const rs = this.resolve(p, data.tiles);
        if (rs.error) return rs;
        const a = this.analyze(rs.placed);
        if (a.error) return { error: a.error };
        for (const t of rs.placed) {
          this.board[t.r][t.c] = { id: t.tile.id, letter: t.letter, value: this.value(t.tile), joker: t.tile.l === '*', by: p.id };
          p.rack = p.rack.filter((x) => x.id !== t.tile.id);
        }
        p.score += a.score;
        p.stats.moves++;
        p.stats.words += a.words.length;
        if (a.bingo) p.stats.bingos++;
        const best = a.words.slice().sort((x, y) => y.score - x.score)[0];
        if (a.score > p.stats.bestScore) {
          p.stats.bestScore = a.score;
          p.stats.bestWord = best.word;
        }
        for (const w of a.words) if (w.word.length > p.stats.longest.length) p.stats.longest = w.word;
        const drawn = this.draw(p);
        this.passes = 0;
        this.lastPlay = { pid: p.id, cells: rs.placed.map((t) => [t.r, t.c]), words: a.words.map((w) => w.word), score: a.score };
        p.lastMove = { type: 'play', words: a.words.map((w) => w.word), score: a.score };
        this.emit({ t: 'play', pid: p.id, tiles: rs.placed.map((t) => ({ r: t.r, c: t.c, letter: t.letter, value: this.value(t.tile), joker: t.tile.l === '*' })), words: a.words, score: a.score, bingo: a.bingo, total: p.score, drawn, bag: this.bag.length }, 1500 + rs.placed.length * 180 + (a.bingo ? 1800 : 0));
        this.say(`${p.name} pose ${a.words.map((w) => w.word).join(', ')} : ${a.score} points${a.bingo ? ' (Lettres d\'Or !)' : ''}.`, p.id);
        // Fin : chevalet vide et sac vide, ou objectif atteint
        if (!p.rack.length && !this.bag.length) return this.finish(p);
        if (this.settings.targetScore && p.score >= this.settings.targetScore) return this.finish(null, 'target');
        this.nextTurn();
        return { ok: true };
      }
      case 'exchange': {
        const ids = Array.isArray(data.ids) ? data.ids.map(Number) : [];
        if (!ids.length) return { error: 'Choisissez les lettres à échanger.' };
        if (this.bag.length < 7) return { error: 'Plus assez de lettres dans le sac pour échanger.' };
        const give = p.rack.filter((x) => ids.includes(x.id));
        if (give.length !== ids.length) return { error: 'Lettre introuvable.' };
        p.rack = p.rack.filter((x) => !ids.includes(x.id));
        this.draw(p);
        this.bag.push(...give);
        this.bag = R.shuffle(this.bag);
        p.stats.exchanges++;
        this.passes++;
        p.lastMove = { type: 'exchange', n: give.length };
        this.emit({ t: 'exchange', pid: p.id, n: give.length }, 1100);
        this.say(`${p.name} échange ${give.length} lettre${give.length > 1 ? 's' : ''}.`, p.id);
        return this.afterPass();
      }
      case 'pass':
        p.stats.passes++;
        this.passes++;
        p.lastMove = { type: 'pass' };
        this.emit({ t: 'pass', pid: p.id }, 700);
        this.say(`${p.name} passe son tour.`, p.id);
        return this.afterPass();
      default:
        return { error: 'Action inconnue.' };
    }
  }

  afterPass() {
    // Tout le monde a passé (ou échangé) deux fois de suite : fin de partie
    if (this.passes >= this.active.length * 2) return this.finish(null, 'blocked');
    this.nextTurn();
    return { ok: true };
  }

  finish(closer = null, reason = 'out') {
    if (this.over) return { ok: true };
    this.over = true;
    clearTimeout(this.timer);
    // Décompte des lettres restantes
    let bonus = 0;
    const left = {};
    for (const p of this.players) {
      const v = p.rack.reduce((s, t) => s + this.value(t), 0);
      left[p.id] = v;
      if (p !== closer && !p.forfeit) {
        p.score -= v;
        bonus += v;
      }
    }
    if (closer) closer.score += bonus;
    const ranked = this.players.filter((p) => !p.forfeit).sort((a, b) => b.score - a.score);
    ranked.forEach((p, k) => (p.rank = k + 1));
    let r = ranked.length;
    for (const p of this.players.filter((q) => q.forfeit)) p.rank = ++r;
    const winner = ranked[0] || null;
    this.winner = winner ? winner.id : null;
    this.endReason = reason;
    this.emit({ t: 'final', left, closer: closer ? closer.id : null, bonus, scores: Object.fromEntries(this.players.map((p) => [p.id, p.score])) }, 2600);
    if (winner) this.say(`${winner.name} remporte la partie avec ${winner.score} points !`, winner.id);
    this.endedAt = Date.now();
    this.onEnd(this.result());
    return { ok: true };
  }

  result() {
    return {
      kind: 'lettres',
      winner: this.winner,
      winType: 'lettres',
      duration: Math.round(((this.endedAt || Date.now()) - this.startedAt) / 1000),
      rounds: Math.ceil(this.moves / Math.max(1, this.players.length)),
      turns: this.moves,
      players: this.players.map((p) => ({
        id: p.id,
        userId: p.userId,
        name: p.name,
        isBot: p.isBot,
        rank: p.rank,
        bankrupt: p.forfeit,
        netWorth: p.score,
        score: p.score,
        stats: p.stats,
      })),
    };
  }

  forfeit(pid) {
    const p = this.player(pid);
    if (!p || p.out || this.over) return;
    const wasCur = p === this.cur;
    p.out = true;
    p.forfeit = true;
    this.bag.push(...p.rack);
    this.bag = R.shuffle(this.bag);
    p.rack = [];
    this.say(`${p.name} quitte la partie.`, p.id);
    this.emit({ t: 'out', pid: p.id }, 500);
    if (this.active.length <= 1) this.finish(null, 'forfeit');
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
  /** Meilleurs coups trouvés pour un chevalet (recherche autour des lettres posées). */
  findMoves(p, limit = 16000) {
    const rack = p.rack;
    const counts = new Array(26).fill(0);
    let jokers = 0;
    for (const t of rack) {
      if (t.l === '*') jokers++;
      else counts[t.l.charCodeAt(0) - 65]++;
    }
    // Mots faisables avec le chevalet + au plus une lettre du plateau
    const cand = [];
    const tmp = new Array(26);
    for (const w of DICT.all()) {
      if (w.length > 8) continue;
      for (let i = 0; i < 26; i++) tmp[i] = counts[i];
      let miss = 0;
      for (let i = 0; i < w.length; i++) {
        const k = w.charCodeAt(i) - 65;
        if (tmp[k] > 0) tmp[k]--;
        else miss++;
      }
      if (miss <= jokers + 1) cand.push(w);
    }
    const moves = [];
    let tries = 0;
    const tryPlace = (w, r0, c0, h) => {
      if (tries++ > limit) return;
      const placed = [];
      const pool = rack.slice();
      for (let i = 0; i < w.length; i++) {
        const r = r0 + (h ? 0 : i);
        const c = c0 + (h ? i : 0);
        if (r < 0 || c < 0 || r >= N || c >= N) return;
        const b = this.board[r][c];
        if (b) {
          if (b.letter !== w[i]) return;
          continue;
        }
        let k = pool.findIndex((t) => t.l === w[i]);
        if (k < 0) k = pool.findIndex((t) => t.l === '*');
        if (k < 0) return;
        const tile = pool.splice(k, 1)[0];
        placed.push({ r, c, tile, letter: w[i] });
      }
      if (!placed.length) return;
      // Le mot ne doit pas se prolonger par une lettre collée avant ou après
      const br = r0 - (h ? 0 : 1);
      const bc = c0 - (h ? 1 : 0);
      const ar = r0 + (h ? 0 : w.length);
      const ac = c0 + (h ? w.length : 0);
      if (br >= 0 && bc >= 0 && this.board[br][bc]) return;
      if (ar < N && ac < N && this.board[ar] && this.board[ar][ac]) return;
      const a = this.analyze(placed);
      if (a.ok) moves.push({ placed, score: a.score, words: a.words.map((x) => x.word) });
    };
    if (this.boardEmpty) {
      for (const w of cand) {
        if (w.length > rack.length) continue;
        for (let i = 0; i < w.length; i++) tryPlace(w, C, C - i, true);
      }
    } else {
      const anchors = [];
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (this.board[r][c]) anchors.push([r, c, this.board[r][c].letter]);
      for (const w of R.shuffle(cand)) {
        if (tries > limit) break;
        for (const [r, c, l] of anchors) {
          for (let i = 0; i < w.length; i++) {
            if (w[i] !== l) continue;
            tryPlace(w, r, c - i, true);
            tryPlace(w, r - i, c, false);
          }
        }
      }
    }
    moves.sort((a, b) => b.score - a.score);
    return moves;
  }

  botDecide(p) {
    const moves = this.findMoves(p);
    if (moves.length) {
      // Pas toujours le meilleur coup : un peu de variété (et de chance pour les humains)
      const pick = moves[Math.min(moves.length - 1, R.pick([0, 0, 0, 1, 1, 2, 3]))];
      return { type: 'play', tiles: pick.placed.map((t) => ({ id: t.tile.id, r: t.r, c: t.c, letter: t.letter })) };
    }
    if (this.bag.length >= 7) {
      // Échange des lettres difficiles
      const hard = p.rack.filter((t) => VALUES[t.l] >= 4 || 'UVW'.includes(t.l)).map((t) => t.id);
      return { type: 'exchange', ids: hard.length ? hard : p.rack.slice(0, 3).map((t) => t.id) };
    }
    return { type: 'pass' };
  }

  // --------------------------------------------------------- minuteur, sortie
  autoAct(useBot) {
    if (this.over) return;
    const p = this.cur;
    if (!p) return;
    const action = useBot ? this.botDecide(p) : { type: 'pass' };
    if (!useBot) this.say(`Temps écoulé : ${p.name} passe son tour.`, p.id);
    const res = this.handle(p, action.type, action);
    if (res && res.error) this.handle(p, 'pass', {});
    this.flush();
  }

  schedule() {
    clearTimeout(this.timer);
    if (this.over) return;
    const base = Math.max(0, this.anim - (Date.now() - (this.flushedAt || Date.now())));
    const p = this.cur;
    if (p.isBot) {
      this.deadline = null;
      this.timer = setTimeout(() => this.autoAct(true), base + R.int(1500, 3000));
      return;
    }
    if (!p.connected || p.afk) {
      this.deadline = Date.now() + base + 8000;
      this.timer = setTimeout(() => this.autoAct(false), base + 8000);
      return;
    }
    const tt = this.settings.turnTime * 1000;
    if (tt) {
      this.deadline = Date.now() + base + tt;
      this.timer = setTimeout(() => {
        p.timeouts++;
        if (p.timeouts >= 3) p.afk = true;
        this.autoAct(false);
      }, base + tt);
    } else this.deadline = null;
  }

  flush() {
    this.flushedAt = Date.now();
    const events = this.events;
    this.events = [];
    this.schedule();
    this.anim = 0;
    this.seq++;
    this.onUpdate({ events, seq: this.seq });
  }

  /** Les évènements ne contiennent aucune lettre de chevalet : identiques pour tous. */
  eventsFor(events) {
    return events;
  }

  publicState(viewer = null) {
    const me = viewer ? this.player(viewer) : null;
    return {
      kind: 'lettres',
      board: this.board.map((row) => row.map((x) => (x ? { l: x.letter, v: x.value, j: x.joker, by: x.by } : null))),
      bonus: BONUS,
      current: this.over ? null : this.cur.id,
      rack: me && !me.out ? me.rack.map((t) => ({ id: t.id, l: t.l, v: this.value(t) })) : null,
      bag: this.bag.length,
      canExchange: this.bag.length >= 7,
      lastPlay: this.lastPlay,
      moves: this.moves,
      players: this.players.map((p) => ({
        id: p.id,
        name: p.name,
        color: p.color,
        pawn: p.pawn,
        isBot: p.isBot,
        role: p.role,
        vip: p.vip,
        level: p.level,
        connected: p.connected,
        afk: p.afk,
        score: p.score,
        tiles: p.rack.length,
        out: p.out,
        bankrupt: p.forfeit,
        rank: p.rank,
        netWorth: p.score,
        lastMove: p.lastMove,
        rackShown: this.over ? p.rack.map((t) => ({ l: t.l, v: this.value(t) })) : null,
      })),
      log: this.log.slice(-40),
      deadline: this.deadline,
      serverNow: Date.now(),
      over: this.over,
      winner: this.winner,
      settings: { targetScore: this.settings.targetScore, bingo: this.settings.bingo, turnTime: this.settings.turnTime },
    };
  }

  destroy() {
    clearTimeout(this.timer);
    this.over = true;
  }
}

module.exports = { LettersGame, BONUS, LETTERS, VALUES, N, C };
