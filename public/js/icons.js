// ============================================================================
//  MyPoly — icônes de l'interface (traits SVG, style homogène)
// ============================================================================
const P = {
  chat: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.3A8 8 0 1 1 21 12Z"/>',
  log: '<path d="M8 6h12M8 12h12M8 18h12"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/>',
  emote: '<circle cx="12" cy="12" r="9"/><path d="M8.5 14.5a4.5 4.5 0 0 0 7 0"/><path d="M9 9.5h.01M15 9.5h.01"/>',
  music: '<path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>',
  musicOff: '<path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/><path d="M3 3l18 18"/>',
  camera: '<path d="M3 7h3l2-3h8l2 3h3v12H3Z"/><circle cx="12" cy="13" r="3.5"/>',
  rules: '<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2Z"/><path d="M4 19V5M9 7h6"/>',
  sound: '<path d="M11 5 6 9H3v6h3l5 4Z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/>',
  soundOff: '<path d="M11 5 6 9H3v6h3l5 4Z"/><path d="m16 9 5 6M21 9l-5 6"/>',
  fullscreen: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  flag: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
  ban: '<circle cx="12" cy="12" r="8.5"/><path d="m6 6 12 12"/>',
  exit: '<path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h11"/>',
  link: '<path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1"/><path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1"/>',
  shield: '<path d="M12 3 4.5 6v6c0 4.4 3.2 7.6 7.5 9 4.3-1.4 7.5-4.6 7.5-9V6Z"/><path d="m9 12 2 2 4-4"/>',
  cube: '<path d="m12 3 8 4.5v9L12 21l-8-4.5v-9Z"/><path d="m4 7.5 8 4.5 8-4.5M12 12v9"/>',
  square: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M4 12h16M12 4v16"/>',
};
/** Icône en ligne (hérite de la couleur du texte). */
export function icon(name) {
  return `<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || ''}</svg>`;
}
