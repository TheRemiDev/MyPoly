// Effets sonores synthétisés (Web Audio) : aucun fichier externe nécessaire.
import { storage } from './util.js';

let ctx = null;
let master = null;
let enabled = storage('sound') !== 'off';
let volume = Number(storage('volume') || 0.5);

function ac() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = volume;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function tone(freq, start, dur, { type = 'sine', gain = 0.3, slide = 0 } = {}) {
  const c = ac();
  if (!c) return;
  const t = c.currentTime + start;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.05);
}
function noise(start, dur, gain = 0.2, freq = 2000) {
  const c = ac();
  if (!c) return;
  const t = c.currentTime + start;
  const buf = c.createBuffer(1, Math.ceil(c.sampleRate * dur), c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = freq;
  const g = c.createGain();
  g.gain.value = gain;
  src.connect(f).connect(g).connect(master);
  src.start(t);
}

const SFX = {
  click: () => tone(660, 0, 0.06, { type: 'triangle', gain: 0.15 }),
  dice: () => {
    for (let i = 0; i < 7; i++) noise(i * 0.09 + Math.random() * 0.03, 0.05, 0.35, 1500 + Math.random() * 2500);
  },
  step: () => tone(520 + Math.random() * 80, 0, 0.07, { type: 'triangle', gain: 0.12 }),
  cash: () => [880, 1108, 1318, 1760].forEach((f, i) => tone(f, i * 0.06, 0.18, { type: 'square', gain: 0.07 })),
  pay: () => [600, 450, 300].forEach((f, i) => tone(f, i * 0.08, 0.16, { type: 'sawtooth', gain: 0.08 })),
  buy: () => [523, 659, 784, 1046].forEach((f, i) => tone(f, i * 0.07, 0.25, { type: 'triangle', gain: 0.18 })),
  build: () => {
    noise(0, 0.12, 0.4, 300);
    tone(180, 0, 0.2, { type: 'square', gain: 0.12, slide: -80 });
    tone(784, 0.15, 0.25, { type: 'triangle', gain: 0.15 });
  },
  card: () => {
    noise(0, 0.3, 0.18, 4000);
    tone(400, 0.05, 0.35, { slide: 600, gain: 0.12 });
  },
  jail: () => [300, 250, 200, 150].forEach((f, i) => tone(f, i * 0.12, 0.25, { type: 'square', gain: 0.08 })),
  turn: () => {
    tone(880, 0, 0.12, { gain: 0.2 });
    tone(1320, 0.12, 0.2, { gain: 0.2 });
  },
  takeover: () => [392, 523, 392, 659].forEach((f, i) => tone(f, i * 0.09, 0.2, { type: 'sawtooth', gain: 0.09 })),
  bankrupt: () => [400, 350, 300, 200, 120].forEach((f, i) => tone(f, i * 0.15, 0.3, { type: 'sawtooth', gain: 0.1 })),
  win: () => [523, 659, 784, 1046, 784, 1046, 1318].forEach((f, i) => tone(f, i * 0.13, 0.35, { type: 'triangle', gain: 0.2 })),
  festival: () => [659, 784, 988, 1318, 988, 1318].forEach((f, i) => tone(f, i * 0.08, 0.2, { type: 'square', gain: 0.07 })),
  fly: () => {
    noise(0, 0.8, 0.12, 800);
    tone(200, 0, 0.8, { slide: 500, gain: 0.08 });
  },
  error: () => tone(160, 0, 0.25, { type: 'square', gain: 0.1 }),
  demolish: () => {
    noise(0, 0.5, 0.55, 220);
    noise(0.05, 0.35, 0.3, 900);
    tone(140, 0, 0.5, { type: 'sawtooth', gain: 0.12, slide: -90 });
  },
  crumble: () => {
    for (let i = 0; i < 5; i++) noise(i * 0.06, 0.08, 0.25, 400 + Math.random() * 800);
  },
  chat: () => tone(1200, 0, 0.08, { gain: 0.08 }),
  tick: () => tone(1000, 0, 0.04, { type: 'square', gain: 0.05 }),
  quake: () => {
    noise(0, 0.9, 0.5, 120);
    tone(60, 0, 0.9, { type: 'sawtooth', gain: 0.15 });
  },
};

export function play(name) {
  if (!enabled || !SFX[name]) return;
  try {
    SFX[name]();
  } catch {}
}
export function isEnabled() {
  return enabled;
}
export function toggle() {
  enabled = !enabled;
  storage('sound', enabled ? 'on' : 'off');
  if (enabled) play('click');
  return enabled;
}
export function setVolume(v) {
  volume = v;
  storage('volume', String(v));
  if (master) master.gain.value = v;
}
// Débloque l'audio au premier geste utilisateur (politique des navigateurs)
window.addEventListener('pointerdown', () => ac(), { once: true });
