'use strict';
/**
 * Plateau MyPoly : 32 cases (4 coins + 4 côtés de 7 cases).
 * Les montants sont exprimés en milliers (K). 2000 = 2,00M.
 *
 * Index 0 = coin "Départ" (en bas à droite), on avance dans le sens horaire visuel
 * (bas → gauche → haut → droite).
 */

const COUNTRIES = [
  { id: 'br', name: 'Brésil', flag: '🇧🇷', color: '#8d6e63' },
  { id: 'ma', name: 'Maroc', flag: '🇲🇦', color: '#4fc3f7' },
  { id: 'mx', name: 'Mexique', flag: '🇲🇽', color: '#ec407a' },
  { id: 'es', name: 'Espagne', flag: '🇪🇸', color: '#ff9800' },
  { id: 'it', name: 'Italie', flag: '🇮🇹', color: '#f44336' },
  { id: 'gb', name: 'Royaume-Uni', flag: '🇬🇧', color: '#fdd835' },
  { id: 'jp', name: 'Japon', flag: '🇯🇵', color: '#66bb6a' },
  { id: 'fr', name: 'France', flag: '🇫🇷', color: '#3f51b5' },
];

// Monument / symbole affiché sur chaque ville
const ICONS = {
  'Salvador': '🥁',
  'Rio de Janeiro': '🎭',
  'Fès': '🏺',
  'Marrakech': '🐪',
  'Casablanca': '🕌',
  'Guadalajara': '🌵',
  'Mexico': '🌮',
  'Séville': '💃',
  'Madrid': '👑',
  'Barcelone': '⛪',
  'Milan': '👗',
  'Rome': '🏛️',
  'Manchester': '🏟️',
  'Édimbourg': '🏰',
  'Londres': '💂',
  'Osaka': '🏯',
  'Tokyo': '🍣',
  'Lyon': '🦁',
  'Paris': '🗼',
};

// Multiplicateurs de loyer par niveau : 0 = terrain, 1-3 = maisons, 4 = hôtel
const RENT_MULT = [0.2, 0.7, 1.6, 2.6, 4.0];

function city(name, country, price) {
  return {
    type: 'city',
    name,
    icon: ICONS[name] || '🏙️',
    country,
    price,
    houseCost: Math.round(price * 0.5),
    hotelCost: price,
    rents: RENT_MULT.map((m) => Math.round(price * m)),
  };
}
function resort(name, emoji) {
  return { type: 'resort', name, emoji, price: 200 };
}

const CELLS = [
  { type: 'start', name: 'Départ' }, // 0
  city('Salvador', 'br', 60), // 1
  city('Rio de Janeiro', 'br', 80), // 2
  { type: 'chance', name: 'Chance' }, // 3
  resort('Bali', '🌴'), // 4
  city('Fès', 'ma', 100), // 5
  city('Marrakech', 'ma', 100), // 6
  city('Casablanca', 'ma', 120), // 7
  { type: 'jail', name: 'Île déserte' }, // 8
  city('Guadalajara', 'mx', 140), // 9
  city('Mexico', 'mx', 160), // 10
  { type: 'chance', name: 'Chance' }, // 11
  resort('Maldives', '🏝️'), // 12
  city('Séville', 'es', 180), // 13
  city('Madrid', 'es', 180), // 14
  city('Barcelone', 'es', 200), // 15
  { type: 'festival', name: 'Festival' }, // 16
  city('Milan', 'it', 220), // 17
  city('Rome', 'it', 240), // 18
  { type: 'chance', name: 'Chance' }, // 19
  resort('Seychelles', '🐚'), // 20
  city('Manchester', 'gb', 260), // 21
  city('Édimbourg', 'gb', 260), // 22
  city('Londres', 'gb', 280), // 23
  { type: 'travel', name: 'Aéroport' }, // 24
  city('Osaka', 'jp', 300), // 25
  city('Tokyo', 'jp', 320), // 26
  { type: 'chance', name: 'Chance' }, // 27
  resort('Tahiti', '🌺'), // 28
  city('Lyon', 'fr', 350), // 29
  { type: 'tax', name: 'Impôts' }, // 30
  city('Paris', 'fr', 400), // 31
];

CELLS.forEach((c, i) => (c.index = i));

const OWNABLE = CELLS.filter((c) => c.type === 'city' || c.type === 'resort').map((c) => c.index);
const RESORTS = CELLS.filter((c) => c.type === 'resort').map((c) => c.index);
const COUNTRY_CELLS = {};
for (const c of CELLS) {
  if (c.type === 'city') (COUNTRY_CELLS[c.country] ||= []).push(c.index);
}
// Cases achetables de chaque côté (pour le monopole de ligne)
const SIDES = [0, 1, 2, 3].map((s) => OWNABLE.filter((i) => i > s * 8 && i < (s + 1) * 8));

const RESORT_RENT = [0, 50, 110, 240, 500];

const CORNERS = { start: 0, jail: 8, festival: 16, travel: 24 };

module.exports = { CELLS, COUNTRIES, OWNABLE, RESORTS, COUNTRY_CELLS, SIDES, RESORT_RENT, CORNERS, RENT_MULT };
