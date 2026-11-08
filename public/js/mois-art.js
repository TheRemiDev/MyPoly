// ============================================================================
//  MyPoly — Fin de mois : illustrations vectorielles maison
//  Un seul style pour tout le jeu (aplats colorés, contour sombre, reflets),
//  utilisé à la fois dans l'interface (SVG en ligne) et sur les cases 3D (images).
// ============================================================================

const O = '#2b2240';
const S = `stroke="${O}" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round"`;
const s = (w) => `stroke="${O}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"`;
const shine = (x, y, w, h, r = 2) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="#fff" opacity=".38"/>`;
const shadow = (cx = 32, cy = 58, rx = 20) => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="3.2" fill="${O}" opacity=".18"/>`;

// ---------------------------------------------------------------- courrier
const envelope = (fill = '#fdf6e6', seal = '#e23b4b', extra = '') => `${shadow(32, 54, 22)}
  <rect x="8" y="16" width="48" height="34" rx="5" fill="${fill}" ${S}/>
  <path d="M8 46 L26 32 M56 46 L38 32" fill="none" ${s(2)} opacity=".45"/>
  <path d="M9 19 L32 36 L55 19" fill="none" ${S}/>
  <circle cx="32" cy="36" r="5" fill="${seal}" ${s(2)}/>${extra}`;
const mailbox = (flagUp = true, letters = 0, body = '#3f7fe0') => `${shadow(32, 59, 16)}
  <rect x="29" y="38" width="6" height="20" rx="1.5" fill="#8a5a2b" ${S}/>
  ${letters ? `<rect x="22" y="${12 - letters}" width="14" height="10" rx="1.5" fill="#fdf6e6" ${s(2)} transform="rotate(-12 29 16)"/>` : ''}
  ${letters > 1 ? `<rect x="28" y="${10 - letters}" width="14" height="10" rx="1.5" fill="#ffe0ef" ${s(2)} transform="rotate(10 35 14)"/>` : ''}
  <path d="M12 40 V24 a12 12 0 0 1 12 -12 h16 a12 12 0 0 1 12 12 V40 z" fill="${body}" ${S}/>
  <path d="M12 24 a12 12 0 0 1 24 0 V40 H12 z" fill="#fff" opacity=".18"/>
  <rect x="18" y="22" width="12" height="3.5" rx="1.75" fill="${O}"/>
  ${flagUp ? `<path d="M50 30 V12 h9 v7 h-9" fill="#e23b4b" ${S}/>` : `<path d="M50 30 h9 v-6 h-9 z" fill="#e23b4b" ${S}/>`}`;

const ART = {
  envelope: envelope(),
  envFast: `${envelope('#fdf6e6', '#e23b4b', `<rect x="42" y="20" width="10" height="12" rx="1.5" fill="#e23b4b" ${s(2)}/><path d="M45 23 h3 a2 2 0 0 1 0 4 h-3 v-4 M45 27 l3.5 3" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/>`)}
    <path d="M2 24 h6 M0 31 h7 M2 38 h6" ${s(2.4)}/>`,
  envBig: `${envelope('#e9c48f', '#3f7fe0', `<path d="M32 6 v12 M26 13 l6 6 l6 -6" fill="none" ${s(3)}/>`)}`,
  envHeart: envelope('#ffe0ef', '#ff4f8b', `<path d="M32 30 c-3 -4 -9 -1 -6 3 l6 6 l6 -6 c3 -4 -3 -7 -6 -3z" fill="#ff4f8b" ${s(2)}/>`),
  postcard: `${shadow(32, 55, 22)}<g transform="rotate(-6 32 32)">
    <rect x="6" y="14" width="52" height="36" rx="4" fill="#fffaf0" ${S}/>
    <rect x="10" y="18" width="22" height="28" rx="2" fill="#6cc6ff" ${s(2)}/>
    <circle cx="25" cy="25" r="4" fill="#ffd166"/><path d="M10 40 l8 -8 l6 6 l4 -4 l4 4 v8 h-22 z" fill="#2ecc71" ${s(1.8)}/>
    <rect x="44" y="18" width="10" height="11" rx="1" fill="#e23b4b" ${s(1.8)}/>
    <path d="M36 34 h18 M36 39 h18 M36 44 h12" ${s(2)}/></g>`,
  scroll: `${shadow(32, 57, 18)}
    <path d="M16 12 h30 a5 5 0 0 1 0 10 h-2 v26 a6 6 0 0 1 -6 6 h-24 a5 5 0 0 1 0 -10 h2 v-26 a6 6 0 0 1 0 -6z" fill="#f6e2b3" ${S}/>
    <path d="M44 22 h2 a5 5 0 0 0 0 -10 M16 44 h-2 a5 5 0 0 0 0 10" fill="#e7c98c" ${S}/>
    <path d="M22 22 h16 M22 28 h16 M22 34 h12" ${s(2)}/>
    <circle cx="34" cy="44" r="5" fill="#e23b4b" ${s(2)}/>`,
  mailbox: mailbox(true, 0),
  mailboxFull: mailbox(true, 2, '#e23b4b'),
  mailboxOne: mailbox(true, 1),
  mailboxEmpty: mailbox(false, 0, '#7b8bb5'),

  // ---------------------------------------------------------------- affaires
  tag: `${shadow(32, 57, 18)}<g transform="rotate(-18 32 32)">
    <path d="M14 18 h24 l14 14 l-14 14 h-24 a4 4 0 0 1 -4 -4 v-20 a4 4 0 0 1 4 -4z" fill="#ffb020" ${S}/>
    <circle cx="40" cy="32" r="3.5" fill="#fff" ${s(2)}/>
    <path d="M17 26 h12 M17 33 h16 M17 40 h10" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/></g>`,
  newspaper: `${shadow(32, 57, 20)}
    <rect x="10" y="12" width="44" height="40" rx="3" fill="#fbf7ee" ${S}/>
    <rect x="15" y="17" width="34" height="7" rx="1.5" fill="${O}"/>
    <rect x="15" y="28" width="15" height="14" rx="1.5" fill="#ffb020" ${s(2)}/>
    <path d="M34 30 h15 M34 35 h15 M34 40 h11 M15 47 h34" ${s(2)}/>
    <path d="M54 18 v30 a4 4 0 0 1 -4 4" fill="none" ${S}/>`,
  bulb: `${shadow(32, 59, 10)}
    <path d="M32 6 a16 16 0 0 1 10 28 c-2 2 -3 4 -3 7 h-14 c0 -3 -1 -5 -3 -7 a16 16 0 0 1 10 -28z" fill="#ffd166" ${S}/>
    <path d="M24 16 a10 10 0 0 1 8 -4" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".7"/>
    <rect x="25" y="41" width="14" height="10" rx="2" fill="#aab4c8" ${S}/><path d="M25 46 h14" ${s(2)}/>
    <path d="M6 22 h5 M53 22 h5 M12 6 l4 4 M52 6 l-4 4" ${s(2.6)}/>`,
  vase: `${shadow(32, 59, 13)}
    <path d="M24 8 h16 v6 c0 3 8 6 8 18 c0 12 -8 18 -8 22 h-16 c0 -4 -8 -10 -8 -22 c0 -12 8 -15 8 -18z" fill="#e8804a" ${S}/>
    <path d="M17 28 h30 M18 38 h28" ${s(2)}/>
    <path d="M22 31 l4 4 l4 -4 l4 4 l4 -4 l4 4" fill="none" stroke="#fff3d6" stroke-width="2" stroke-linecap="round"/>
    ${shine(22, 16, 3, 10, 1.5)}`,
  gavel: `${shadow(32, 58, 22)}
    <rect x="12" y="46" width="30" height="8" rx="2" fill="#a0612f" ${S}/>
    <g transform="rotate(-35 34 26)"><rect x="30" y="22" width="30" height="7" rx="3" fill="#c98a4b" ${S}/>
    <rect x="18" y="12" width="14" height="26" rx="4" fill="#8a5a2b" ${S}/><path d="M18 18 h14 M18 32 h14" ${s(2)}/></g>`,
  cart: `${shadow(32, 59, 20)}
    <path d="M6 12 h8 l6 28 h28 l6 -20 h-36" fill="none" ${s(3)}/>
    <path d="M18 20 h34 l-5 16 h-25z" fill="#6cc0ff" ${S}/>
    <rect x="24" y="12" width="9" height="10" rx="2" fill="#ff5a5f" ${s(2)}/><rect x="35" y="9" width="8" height="13" rx="2" fill="#2ecc71" ${s(2)}/>
    <circle cx="24" cy="50" r="4.5" fill="#fff" ${S}/><circle cx="44" cy="50" r="4.5" fill="#fff" ${S}/>`,
  basket: `${shadow(32, 58, 22)}
    <path d="M18 26 a14 14 0 0 1 28 0" fill="none" ${s(3)}/>
    <circle cx="24" cy="25" r="6" fill="#ff5a5f" ${s(2)}/><circle cx="36" cy="23" r="6" fill="#ffd166" ${s(2)}/><circle cx="44" cy="27" r="5" fill="#2ecc71" ${s(2)}/>
    <path d="M8 28 h48 l-6 24 h-36z" fill="#d79a52" ${S}/>
    <path d="M12 36 h40 M14 44 h36 M22 28 l2 24 M32 28 v24 M42 28 l-2 24" ${s(1.8)} opacity=".7"/>`,
  sold: `${shadow(32, 57, 18)}<g transform="rotate(-10 32 32)">
    <path d="M14 18 h24 l14 14 l-14 14 h-24 a4 4 0 0 1 -4 -4 v-20 a4 4 0 0 1 4 -4z" fill="#2ecc71" ${S}/>
    <circle cx="40" cy="32" r="3.5" fill="#fff" ${s(2)}/>
    <path d="M17 32 l6 6 l10 -12" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></g>`,
  bagFast: `${shadow(36, 58, 16)}
    <path d="M28 22 v-4 a8 8 0 0 1 16 0 v4" fill="none" ${s(3)}/>
    <path d="M22 22 h28 l3 32 h-34z" fill="#2ecc71" ${S}/>
    ${shine(26, 26, 4, 18, 2)}
    <path d="M4 28 h10 M2 37 h12 M6 46 h8" ${s(2.6)}/>`,
  magnifier: `${shadow(32, 59, 16)}
    <path d="M40 40 l14 14" ${s(7)}/><path d="M40 40 l14 14" stroke="#8a5a2b" stroke-width="3.5" stroke-linecap="round"/>
    <circle cx="27" cy="27" r="16" fill="#cfefff" ${s(3.2)}/>
    <path d="M18 22 a10 10 0 0 1 8 -6" fill="none" stroke="#fff" stroke-width="3.5" stroke-linecap="round"/>
    <circle cx="27" cy="29" r="5" fill="#3f7fe0" ${s(2)}/>`,
  clock: `${shadow(32, 60, 14)}
    <path d="M18 14 a14 14 0 0 1 28 0 v40 h-28z" fill="#8a5a2b" ${S}/>
    <circle cx="32" cy="18" r="9" fill="#fffaf0" ${s(2.2)}/><path d="M32 13 v5 l4 2" fill="none" ${s(2)}/>
    <rect x="24" y="31" width="16" height="18" rx="2" fill="#5e3b1b" ${s(2)}/>
    <path d="M32 31 v10" ${s(1.8)}/><circle cx="32" cy="43" r="3" fill="#ffd166" ${s(1.8)}/>`,

  // ---------------------------------------------------------------- dimanche
  ball: `${shadow(32, 59, 16)}
    <circle cx="32" cy="31" r="22" fill="#fff" ${S}/>
    <path d="M32 22 l8 6 l-3 9 h-10 l-3 -9z" fill="${O}"/>
    <path d="M32 22 v-12 M40 28 l11 -4 M37 37 l7 9 M27 37 l-7 9 M24 28 l-11 -4" ${s(2)}/>
    <path d="M14 22 l-1 -2 M50 22 l1 -2" ${s(2)}/>
    <path d="M18 18 a20 20 0 0 1 8 -6" fill="none" stroke="#9fb4d6" stroke-width="3" stroke-linecap="round"/>`,
  stadium: `${shadow(32, 58, 26)}
    <ellipse cx="32" cy="36" rx="28" ry="16" fill="#7b8bb5" ${S}/>
    <ellipse cx="32" cy="36" rx="20" ry="10" fill="#2e9e4f" ${s(2)}/>
    <path d="M32 26 v20 M12 36 h40" stroke="#fff" stroke-width="1.6" opacity=".7"/><circle cx="32" cy="36" r="4" fill="none" stroke="#fff" stroke-width="1.6" opacity=".7"/>
    <path d="M8 30 v-18 M56 30 v-18" ${s(2.6)}/><rect x="4" y="8" width="8" height="5" rx="1.5" fill="#ffd166" ${s(2)}/><rect x="52" y="8" width="8" height="5" rx="1.5" fill="#ffd166" ${s(2)}/>`,
  trophy: `${shadow(32, 59, 14)}
    <path d="M18 10 h28 v10 a14 14 0 0 1 -28 0z" fill="#ffc94a" ${S}/>
    <path d="M18 14 h-6 a6 6 0 0 0 8 10 M46 14 h6 a6 6 0 0 1 -8 10" fill="none" ${S}/>
    <path d="M29 33 h6 v8 h-6z" fill="#f0a72a" ${S}/><rect x="20" y="41" width="24" height="10" rx="2" fill="#8a5a2b" ${S}/>
    ${shine(22, 13, 4, 12, 2)}<path d="M32 16 l2 4 h4 l-3 3 l1 4 l-4 -2 l-4 2 l1 -4 l-3 -3 h4z" fill="#fff" opacity=".85"/>`,
  goal: `${shadow(32, 58, 26)}
    <path d="M6 52 V16 h52 v36" fill="none" ${s(3.2)}/>
    <path d="M6 16 l8 8 h36 l8 -8 M14 24 v28 M50 24 v28" fill="none" ${s(2)}/>
    <path d="M18 24 v28 M24 24 v28 M30 24 v28 M36 24 v28 M42 24 v28 M14 31 h36 M14 38 h36 M14 45 h36" stroke="${O}" stroke-width="1" opacity=".35"/>
    <circle cx="40" cy="44" r="8" fill="#fff" ${s(2.2)}/><path d="M40 40 l3 2 l-1 4 h-4 l-1 -4z" fill="${O}"/>`,

  // ---------------------------------------------------------------- événements
  cake: `${shadow(32, 59, 22)}
    <path d="M22 18 v-6 M32 18 v-8 M42 18 v-6" ${s(2.6)}/>
    <path d="M22 9 c-2 -3 2 -5 0 -7 c3 1 4 4 0 7z M32 7 c-2 -3 2 -5 0 -7 c3 1 4 4 0 7z M42 9 c-2 -3 2 -5 0 -7 c3 1 4 4 0 7z" fill="#ffb020"/>
    <rect x="16" y="18" width="32" height="14" rx="3" fill="#ffb3d9" ${S}/>
    <rect x="10" y="32" width="44" height="20" rx="3" fill="#ff7ac6" ${S}/>
    <path d="M10 38 c4 4 8 -4 11 0 c4 4 7 -4 11 0 c4 4 7 -4 11 0 c4 4 7 -4 11 0" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/>
    <circle cx="22" cy="25" r="1.6" fill="#e23b4b"/><circle cx="32" cy="24" r="1.6" fill="#3f7fe0"/><circle cx="42" cy="25" r="1.6" fill="#2ecc71"/>`,
  stopwatch: `${shadow(32, 60, 16)}
    <rect x="27" y="4" width="10" height="6" rx="2" fill="#ff5a5f" ${S}/><path d="M32 10 v4 M47 15 l3 -3" ${s(2.6)}/>
    <circle cx="32" cy="36" r="21" fill="#fff" ${s(3)}/><circle cx="32" cy="36" r="16" fill="#e8fbf6" ${s(1.6)}/>
    <path d="M32 36 V24" ${s(3)}/><path d="M32 36 l8 5" ${s(2.4)}/><circle cx="32" cy="36" r="2.5" fill="${O}"/>
    <path d="M47 50 h10 M52 45 v10" stroke="#14b8a6" stroke-width="3.4" stroke-linecap="round"/>`,
  radio: `${shadow(32, 58, 24)}
    <path d="M16 18 l30 -10" ${s(2.6)}/><circle cx="46" cy="8" r="2.5" fill="#ff5a5f" ${s(1.6)}/>
    <rect x="6" y="18" width="52" height="34" rx="7" fill="#ff8a3d" ${S}/>
    <circle cx="22" cy="35" r="10" fill="#5e3b1b" ${s(2.2)}/><circle cx="22" cy="35" r="5" fill="#8a5a2b"/>
    <rect x="36" y="25" width="16" height="9" rx="2" fill="#fffaf0" ${s(2)}/><path d="M40 25 v9" stroke="#e23b4b" stroke-width="1.6"/>
    <circle cx="40" cy="43" r="3" fill="#ffd166" ${s(1.8)}/><circle cx="49" cy="43" r="3" fill="#ffd166" ${s(1.8)}/>`,
  leak: `${shadow(32, 60, 22)}
    <path d="M4 18 h26 a8 8 0 0 1 8 8 v8" fill="none" stroke="#9aa6bd" stroke-width="10" stroke-linecap="round"/>
    <path d="M4 18 h26 a8 8 0 0 1 8 8 v8" fill="none" ${s(2)} transform="translate(0 -5)" opacity=".0"/>
    <path d="M24 14 l3 4 l-3 4" fill="none" ${s(2.4)}/><path d="M33 16 l-3 2 l3 3" fill="none" stroke="${O}" stroke-width="2" stroke-linecap="round" opacity=".6"/>
    <path d="M38 36 c-4 6 -6 9 -6 12 a6 6 0 0 0 12 0 c0 -3 -2 -6 -6 -12z" fill="#4cc9f0" ${S}/>
    <path d="M22 30 c-3 4 -4 6 -4 8 a4 4 0 0 0 8 0 c0 -2 -1 -4 -4 -8z M50 44 c-2 3 -3 4 -3 6 a3 3 0 0 0 6 0 c0 -2 -1 -3 -3 -6z" fill="#4cc9f0" ${s(2)}/>
    <path d="M10 56 h44" stroke="#4cc9f0" stroke-width="4" stroke-linecap="round" opacity=".6"/>`,
  ticket: `${shadow(32, 55, 22)}<g transform="rotate(-10 32 32)">
    <path d="M8 18 h48 v8 a6 6 0 0 0 0 12 v8 h-48 v-8 a6 6 0 0 0 0 -12z" fill="#a66bff" ${S}/>
    <path d="M22 20 v24" stroke="#fff" stroke-width="2" stroke-dasharray="3 3"/>
    <path d="M38 24 l2.5 5 l5.5 .8 l-4 3.9 l1 5.5 l-5 -2.6 l-5 2.6 l1 -5.5 l-4 -3.9 l5.5 -.8z" fill="#ffd166" ${s(1.8)}/></g>`,
  wheel: `${shadow(32, 60, 14)}
    <path d="M26 56 l6 -18 l6 18" fill="none" ${s(3)}/>
    <circle cx="32" cy="28" r="22" fill="#fff" ${S}/>
    ${['#ff5a5f', '#ffd166', '#2ecc71', '#3fa7ff', '#a66bff', '#ff8a3d'].map((c, k) => { const a0 = (k / 6) * Math.PI * 2; const a1 = ((k + 1) / 6) * Math.PI * 2; return `<path d="M32 28 L${32 + Math.cos(a0) * 19} ${28 + Math.sin(a0) * 19} A19 19 0 0 1 ${32 + Math.cos(a1) * 19} ${28 + Math.sin(a1) * 19}z" fill="${c}"/>`; }).join('')}
    <circle cx="32" cy="28" r="19" fill="none" ${s(2)}/><circle cx="32" cy="28" r="4" fill="#fff" ${s(2)}/>
    <path d="M32 2 l4 6 h-8z" fill="${O}"/>`,
  box: `${shadow(32, 59, 22)}
    <path d="M10 26 l22 -8 l22 8 v24 l-22 8 l-22 -8z" fill="#d6a064" ${S}/>
    <path d="M10 26 l22 8 l22 -8 M32 34 v24" fill="none" ${S}/>
    <path d="M10 26 l-6 -8 l22 -8 l6 8 M54 26 l6 -8 l-22 -8 l-6 8" fill="#e8bb83" ${S}/>
    <circle cx="26" cy="14" r="5" fill="#ff5a5f" ${s(2)}/><path d="M36 6 l4 10 h-8z" fill="#3fa7ff" ${s(2)}/>
    <rect x="38" y="38" width="10" height="6" rx="1" fill="#fff" opacity=".6" transform="rotate(-18 43 41)"/>`,
  mugs: `${shadow(32, 59, 24)}
    <g transform="rotate(12 20 34)"><path d="M8 20 h22 v30 a4 4 0 0 1 -4 4 h-14 a4 4 0 0 1 -4 -4z" fill="#ffb020" ${S}/>
      <path d="M30 26 h5 a5 5 0 0 1 5 5 v6 a5 5 0 0 1 -5 5 h-5" fill="none" ${S}/>
      <path d="M6 20 c0 -6 6 -8 9 -5 c2 -4 9 -4 10 0 c4 -2 8 1 7 5z" fill="#fff" ${S}/>${shine(12, 26, 3, 20, 1.5)}</g>
    <g transform="rotate(-12 44 34)"><path d="M34 20 h22 v30 a4 4 0 0 1 -4 4 h-14 a4 4 0 0 1 -4 -4z" fill="#ffc94a" ${S}/>
      <path d="M34 26 h-5 a5 5 0 0 0 -5 5 v6 a5 5 0 0 0 5 5 h5" fill="none" ${S}/>
      <path d="M32 20 c0 -6 6 -8 9 -5 c2 -4 9 -4 10 0 c4 -2 8 1 7 5z" fill="#fff" ${S}/>${shine(48, 26, 3, 20, 1.5)}</g>`,
  flag: `${shadow(26, 59, 12)}
    <path d="M16 58 V6" ${s(3.4)}/><circle cx="16" cy="6" r="3" fill="#ffc94a" ${s(2)}/>
    <path d="M17 9 c10 -4 18 4 30 0 v24 c-12 4 -20 -4 -30 0z" fill="#fff" ${S}/>
    <path d="M17 9 c3 -1 6 -1 8 0 v8 c-2 -1 -5 -1 -8 0z M25 17 c3 1 5 2 8 2 v8 c-3 0 -5 -1 -8 -2z M33 11 c3 0 6 0 8 -1 v8 c-2 1 -5 1 -8 1z M41 18 c2 -1 4 -1 6 -2 v8 c-2 1 -4 1 -6 2z M17 25 c3 -1 6 -1 8 0 v8 c-2 -1 -5 -1 -8 0z M33 27 c3 0 6 0 8 -1 v6 c-2 1 -5 1 -8 1z" fill="${O}"/>`,

  // ---------------------------------------------------------------- argent
  banknote: `${shadow(32, 54, 24)}<g transform="rotate(-8 32 32)">
    <rect x="4" y="16" width="56" height="32" rx="4" fill="#5fd38d" ${S}/>
    <rect x="9" y="21" width="46" height="22" rx="3" fill="none" stroke="#1e8f4e" stroke-width="1.8"/>
    <circle cx="32" cy="32" r="8" fill="#e8fff0" ${s(2)}/><path d="M35 28 a5 5 0 1 0 0 8 M27 31 h6 M27 34 h6" fill="none" ${s(1.8)}/>
    <circle cx="14" cy="32" r="2.5" fill="#1e8f4e"/><circle cx="50" cy="32" r="2.5" fill="#1e8f4e"/></g>`,
  coin: `${shadow(32, 58, 16)}
    <circle cx="32" cy="32" r="22" fill="#ffc94a" ${s(3)}/><circle cx="32" cy="32" r="16" fill="none" stroke="#d1931a" stroke-width="2.4"/>
    <path d="M38 24 a9 9 0 1 0 0 16 M23 29 h11 M23 35 h11" fill="none" ${s(3)}/>
    <path d="M17 22 a18 18 0 0 1 8 -6" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".7"/>`,
  pig: `${shadow(32, 58, 20)}
    <path d="M14 46 v8 M24 49 v6 M40 49 v6 M50 46 v8" ${s(5)}/><path d="M14 46 v8 M24 49 v6 M40 49 v6 M50 46 v8" stroke="#ff8fc4" stroke-width="2.2" stroke-linecap="round"/>
    <ellipse cx="32" cy="35" rx="23" ry="17" fill="#ff8fc4" ${S}/>
    <path d="M18 22 l-2 -10 l10 6z M40 20 l6 -9 l3 11z" fill="#ff8fc4" ${S}/>
    <rect x="25" y="19" width="14" height="4" rx="2" fill="${O}"/>
    <ellipse cx="54" cy="36" rx="6" ry="7" fill="#ffb3d9" ${S}/><circle cx="53" cy="34" r="1.3" fill="${O}"/><circle cx="53" cy="38" r="1.3" fill="${O}"/>
    <circle cx="44" cy="29" r="2.2" fill="${O}"/>
    <path d="M9 32 c-5 0 -5 -6 0 -5" fill="none" ${s(2.2)}/>
    <path d="M18 30 a16 12 0 0 1 10 -8" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".6"/>`,
  wallet: `${shadow(32, 57, 22)}
    <path d="M14 16 l26 -8 l4 10" fill="#e23b4b" ${S}/>
    <rect x="8" y="18" width="48" height="34" rx="6" fill="#8a5a2b" ${S}/>
    <rect x="38" y="28" width="20" height="14" rx="5" fill="#a87443" ${S}/><circle cx="46" cy="35" r="2.6" fill="#ffc94a" ${s(1.8)}/>
    <path d="M12 24 h24" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity=".35"/>`,
  bank: `${shadow(32, 59, 24)}
    <path d="M6 22 L32 8 L58 22z" fill="#f4efe4" ${S}/><circle cx="32" cy="16" r="3.5" fill="#ffc94a" ${s(1.8)}/>
    <rect x="8" y="22" width="48" height="5" rx="1" fill="#e1d8c4" ${S}/>
    <path d="M14 27 v19 M24 27 v19 M40 27 v19 M50 27 v19" ${s(5)}/><path d="M14 27 v19 M24 27 v19 M40 27 v19 M50 27 v19" stroke="#f4efe4" stroke-width="2.4"/>
    <rect x="28" y="32" width="8" height="14" rx="1" fill="#3f4f8a" ${s(2)}/>
    <rect x="6" y="46" width="52" height="8" rx="1.5" fill="#e1d8c4" ${S}/>`,
  loan: `${shadow(32, 59, 22)}
    <rect x="8" y="14" width="48" height="36" rx="5" fill="#fffaf0" ${S}/>
    <path d="M14 22 h22 M14 28 h30 M14 34 h18" ${s(2)}/>
    <path d="M36 44 c4 -8 8 4 12 -4" fill="none" stroke="#3f7fe0" stroke-width="2.4" stroke-linecap="round"/>
    <circle cx="46" cy="24" r="6" fill="#ff5a5f" ${s(2)}/><path d="M43 24 h6" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/>`,
  bill: `${shadow(32, 59, 16)}
    <path d="M14 6 h36 v48 l-4 -3 l-4 3 l-5 -3 l-5 3 l-5 -3 l-4 3 l-4 -3 l-5 3z" fill="#fffaf0" ${S}/>
    <path d="M20 16 h24 M20 23 h24 M20 30 h16" ${s(2)}/>
    <path d="M20 40 h10" ${s(2)}/><path d="M36 40 h8" stroke="#e23b4b" stroke-width="3" stroke-linecap="round"/>`,
  payslip: `${shadow(32, 59, 18)}
    <rect x="12" y="6" width="40" height="50" rx="4" fill="#fff" ${S}/>
    <rect x="12" y="6" width="40" height="10" rx="4" fill="#16a34a" ${S}/>
    <path d="M18 24 h20 M18 31 h28 M18 38 h16" ${s(2)}/>
    <g transform="rotate(-14 40 46)"><rect x="30" y="40" width="20" height="10" rx="2" fill="none" stroke="#16a34a" stroke-width="2.4"/><path d="M34 45 h12" stroke="#16a34a" stroke-width="2.4" stroke-linecap="round"/></g>`,
  jar: `${shadow(32, 60, 18)}
    <rect x="18" y="6" width="28" height="7" rx="2" fill="#ffc94a" ${S}/>
    <path d="M16 13 h32 a4 4 0 0 1 4 4 v34 a6 6 0 0 1 -6 6 h-28 a6 6 0 0 1 -6 -6 v-34 a4 4 0 0 1 4 -4z" fill="#d8f1ff" ${S}/>
    <ellipse cx="26" cy="48" rx="7" ry="3" fill="#ffc94a" ${s(1.8)}/><ellipse cx="38" cy="50" rx="7" ry="3" fill="#ffc94a" ${s(1.8)}/><ellipse cx="32" cy="43" rx="7" ry="3" fill="#ffc94a" ${s(1.8)}/>
    <rect x="16" y="24" width="32" height="9" fill="#e23b4b" ${s(2)}/>
    ${shine(20, 36, 3, 12, 1.5)}`,
  calendar: `${shadow(32, 59, 22)}
    <rect x="8" y="12" width="48" height="42" rx="6" fill="#fff" ${S}/>
    <path d="M8 18 a6 6 0 0 1 6 -6 h36 a6 6 0 0 1 6 6 v8 h-48z" fill="#ff5a5f" ${S}/>
    <path d="M20 8 v8 M44 8 v8" ${s(3.4)}/>
    <text x="32" y="48" text-anchor="middle" font-family="system-ui, sans-serif" font-weight="900" font-size="20" fill="${O}">31</text>`,
  dice: `${shadow(32, 58, 18)}
    <rect x="12" y="12" width="40" height="40" rx="9" fill="#fff" ${S}/>
    <circle cx="23" cy="23" r="3.6" fill="${O}"/><circle cx="41" cy="23" r="3.6" fill="${O}"/><circle cx="32" cy="32" r="3.6" fill="#e23b4b"/><circle cx="23" cy="41" r="3.6" fill="${O}"/><circle cx="41" cy="41" r="3.6" fill="${O}"/>`,

  // ---------------------------------------------------------------- factures (courrier)
  phone: `${shadow(32, 60, 12)}<rect x="20" y="6" width="24" height="50" rx="5" fill="#3d4466" ${S}/><rect x="23" y="12" width="18" height="34" rx="2" fill="#6cc0ff"/><circle cx="32" cy="51" r="2" fill="#fff"/><path d="M27 20 h10 M27 26 h7" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/>`,
  car: `${shadow(32, 54, 26)}<path d="M6 40 v-8 l8 -2 l6 -10 h20 l8 10 l8 3 v7z" fill="#ff5a5f" ${S}/><path d="M22 22 h7 v8 h-12z M33 22 h6 l5 8 h-11z" fill="#cfefff" ${s(2)}/><circle cx="18" cy="42" r="6" fill="#3d4466" ${S}/><circle cx="46" cy="42" r="6" fill="#3d4466" ${S}/><circle cx="18" cy="42" r="2" fill="#fff"/><circle cx="46" cy="42" r="2" fill="#fff"/>`,
  wrench: `${shadow(32, 59, 16)}<g transform="rotate(-45 32 32)"><rect x="28" y="20" width="8" height="38" rx="4" fill="#aab4c8" ${S}/><path d="M22 10 a10 10 0 0 0 20 0 v-6 l-5 4 h-10 l-5 -4z" fill="#aab4c8" ${S}/></g><circle cx="44" cy="44" r="2.5" fill="${O}" opacity=".4"/>`,
  dumbbell: `${shadow(32, 54, 24)}<rect x="18" y="29" width="28" height="6" rx="3" fill="#aab4c8" ${S}/><rect x="8" y="20" width="10" height="24" rx="3" fill="#3f7fe0" ${S}/><rect x="46" y="20" width="10" height="24" rx="3" fill="#3f7fe0" ${S}/><rect x="3" y="25" width="5" height="14" rx="2" fill="#2a5bb8" ${S}/><rect x="56" y="25" width="5" height="14" rx="2" fill="#2a5bb8" ${S}/>`,
  router: `${shadow(32, 56, 22)}<rect x="8" y="34" width="48" height="16" rx="4" fill="#3d4466" ${S}/><circle cx="18" cy="42" r="2" fill="#2ecc71"/><circle cx="26" cy="42" r="2" fill="#2ecc71"/><circle cx="34" cy="42" r="2" fill="#ffd166"/><path d="M20 22 a17 17 0 0 1 24 0 M25 27 a10 10 0 0 1 14 0" fill="none" ${s(3)}/><circle cx="32" cy="31" r="2.6" fill="${O}"/>`,
  paw: `${shadow(32, 58, 16)}<ellipse cx="32" cy="40" rx="12" ry="10" fill="#c98a4b" ${S}/><ellipse cx="18" cy="26" rx="5" ry="7" fill="#c98a4b" ${S}/><ellipse cx="27" cy="18" rx="5" ry="7" fill="#c98a4b" ${S}/><ellipse cx="38" cy="18" rx="5" ry="7" fill="#c98a4b" ${S}/><ellipse cx="47" cy="26" rx="5" ry="7" fill="#c98a4b" ${S}/>`,
  house: `${shadow(32, 59, 22)}<path d="M8 30 L32 10 L56 30" fill="none" ${s(3.4)}/><path d="M14 26 v28 h36 v-28 l-18 -14z" fill="#ffe0b8" ${S}/><path d="M8 30 L32 10 L56 30 l-4 -2 L32 14 L12 28z" fill="#e23b4b" ${S}/><rect x="27" y="38" width="10" height="16" rx="1" fill="#8a5a2b" ${s(2)}/><rect x="18" y="34" width="7" height="7" rx="1" fill="#6cc0ff" ${s(2)}/><rect x="41" y="34" width="7" height="7" rx="1" fill="#6cc0ff" ${s(2)}/>`,
  plate: `${shadow(32, 56, 24)}<circle cx="32" cy="34" r="18" fill="#fff" ${S}/><circle cx="32" cy="34" r="11" fill="#ffe0b8" ${s(2)}/><path d="M8 18 v14 M5 18 v8 a3 3 0 0 0 6 0 v-8 M56 18 c-4 2 -4 10 0 12 v12" fill="none" ${s(2.4)}/>`,
  health: `${shadow(32, 59, 16)}<path d="M32 6 l20 7 v14 c0 14 -9 22 -20 27 c-11 -5 -20 -13 -20 -27 v-14z" fill="#e8fbf6" ${S}/><path d="M28 18 h8 v8 h8 v8 h-8 v8 h-8 v-8 h-8 v-8 h8z" fill="#2ecc71" ${s(2)}/>`,
  tooth: `${shadow(32, 59, 12)}<path d="M18 12 c6 -4 10 0 14 0 s8 -4 14 0 c6 4 4 16 0 22 c-2 4 -2 18 -6 18 s-4 -12 -8 -12 s-4 12 -8 12 s-4 -14 -6 -18 c-4 -6 -6 -18 0 -22z" fill="#fff" ${S}/><path d="M22 18 c2 -2 4 -2 6 0" fill="none" stroke="#6cc0ff" stroke-width="2.4" stroke-linecap="round"/>`,
  tv: `${shadow(32, 58, 22)}<rect x="6" y="14" width="52" height="34" rx="5" fill="#3d4466" ${S}/><rect x="11" y="19" width="42" height="24" rx="2" fill="#a66bff"/><path d="M28 26 v10 l9 -5z" fill="#fff"/><path d="M24 52 h16 M28 48 v4 M36 48 v4" ${s(2.6)}/>`,
  flame: `${shadow(32, 59, 12)}<path d="M32 6 c4 10 16 14 16 30 a16 16 0 0 1 -32 0 c0 -8 4 -12 8 -16 c0 6 2 8 4 9 c0 -10 2 -16 4 -23z" fill="#ff8a3d" ${S}/><path d="M32 30 c3 5 8 7 8 14 a8 8 0 0 1 -16 0 c0 -5 4 -8 8 -14z" fill="#ffd166"/>`,
  police: `${shadow(32, 58, 20)}<rect x="12" y="38" width="40" height="14" rx="3" fill="#3d4466" ${S}/><path d="M20 38 v-12 a12 12 0 0 1 24 0 v12z" fill="#3fa7ff" ${S}/><path d="M24 30 a8 8 0 0 1 8 -8" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".7"/><path d="M8 18 l5 4 M56 18 l-5 4 M32 6 v6 M14 8 l4 5 M50 8 l-4 5" stroke="#3fa7ff" stroke-width="3" stroke-linecap="round"/>`,
  radar: `${shadow(32, 59, 14)}<path d="M32 58 V30" ${s(4)}/><rect x="14" y="14" width="32" height="18" rx="4" fill="#aab4c8" ${S}/><circle cx="38" cy="23" r="5.5" fill="#3d4466" ${s(2)}/><circle cx="38" cy="23" r="2" fill="#6cc0ff"/><rect x="18" y="19" width="10" height="4" rx="2" fill="#e23b4b"/><path d="M48 14 l8 -6 M50 22 h8 M48 30 l8 6" stroke="#ffd166" stroke-width="3" stroke-linecap="round"/>`,
  alarm: `${shadow(32, 60, 16)}<circle cx="32" cy="34" r="20" fill="#ff5a5f" ${S}/><circle cx="32" cy="34" r="14" fill="#fff" ${s(2)}/><path d="M32 34 V24 M32 34 l7 4" ${s(2.8)}/><path d="M12 14 a8 8 0 0 1 12 -4 M52 14 a8 8 0 0 0 -12 -4" fill="#ffd166" ${S}/><path d="M18 52 l-4 6 M46 52 l4 6" ${s(3)}/>`,
  cheque: `${shadow(32, 54, 24)}<g transform="rotate(-6 32 32)"><rect x="4" y="16" width="56" height="30" rx="4" fill="#fff6dc" ${S}/><path d="M10 24 h22 M10 30 h14" ${s(2)}/><path d="M10 39 c5 -6 8 4 12 -2 s6 4 10 0" fill="none" stroke="#3f7fe0" stroke-width="2.4" stroke-linecap="round"/><path d="M46 26 c-2 -3 -7 -1 -5 2 l5 5 l5 -5 c2 -3 -3 -5 -5 -2z" fill="#ff4f8b" ${s(1.8)}/></g>`,
  medal: `${shadow(32, 60, 12)}<path d="M20 6 l8 20 M44 6 l-8 20" stroke="#3f7fe0" stroke-width="7" stroke-linecap="round"/><circle cx="32" cy="40" r="15" fill="#ffc94a" ${S}/><path d="M32 31 l3 6 l6 1 l-4.5 4 l1 6 l-5.5 -3 l-5.5 3 l1 -6 l-4.5 -4 l6 -1z" fill="#fff" ${s(1.6)}/>`,
  parcel: `${shadow(32, 59, 22)}<path d="M8 22 l24 -10 l24 10 v26 l-24 10 l-24 -10z" fill="#d6a064" ${S}/><path d="M8 22 l24 10 l24 -10 M32 32 v26" fill="none" ${S}/><path d="M20 17 l24 10 v8" fill="none" stroke="#fff" stroke-width="4" opacity=".7"/>`,
  scratch: `${shadow(32, 56, 20)}<rect x="10" y="10" width="44" height="42" rx="5" fill="#ffd166" ${S}/><rect x="16" y="22" width="32" height="22" rx="3" fill="#aab4c8" ${s(2)}/><path d="M18 36 c6 -6 10 4 16 -4 c4 -4 8 2 12 -2" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round"/><text x="32" y="19" text-anchor="middle" font-family="system-ui, sans-serif" font-weight="900" font-size="8" fill="${O}">GAGNANT</text>`,
  bandage: `${shadow(32, 54, 22)}<g transform="rotate(-30 32 32)"><rect x="4" y="22" width="56" height="20" rx="10" fill="#f6c99a" ${S}/><rect x="22" y="22" width="20" height="20" fill="#fbe3c9" ${s(2)}/><circle cx="28" cy="28" r="1.3" fill="${O}"/><circle cx="36" cy="28" r="1.3" fill="${O}"/><circle cx="28" cy="36" r="1.3" fill="${O}"/><circle cx="36" cy="36" r="1.3" fill="${O}"/></g>`,
  gift: `${shadow(32, 59, 20)}<rect x="10" y="26" width="44" height="28" rx="3" fill="#ff5a5f" ${S}/><rect x="6" y="18" width="52" height="10" rx="2" fill="#ff7a7e" ${S}/><path d="M32 18 v36" stroke="#ffd166" stroke-width="7"/><path d="M32 18 v36" ${s(1.8)} opacity=".3"/><path d="M32 18 c-6 -10 -16 -8 -12 -2 c2 3 8 2 12 2 c4 0 10 1 12 -2 c4 -6 -6 -8 -12 2z" fill="#ffd166" ${S}/>`,
  pizza: `${shadow(32, 58, 18)}<path d="M8 14 c14 -6 34 -6 48 0 l-24 44z" fill="#ffd166" ${S}/><path d="M8 14 c14 -6 34 -6 48 0 l-3 6 c-12 -5 -30 -5 -42 0z" fill="#e8a24a" ${S}/><circle cx="26" cy="26" r="4" fill="#e23b4b" ${s(1.8)}/><circle cx="38" cy="28" r="4" fill="#e23b4b" ${s(1.8)}/><circle cx="32" cy="40" r="3.5" fill="#e23b4b" ${s(1.8)}/>`,
  plane: `${shadow(32, 58, 22)}<path d="M6 34 l50 -22 c4 -2 6 2 3 4 l-20 18 l-2 18 l-6 -10 l-10 6 l2 -10z" fill="#fff" ${S}/><path d="M39 34 l-16 -6" fill="none" ${s(2)}/><path d="M26 30 l-6 12" fill="none" ${s(2)}/><circle cx="46" cy="18" r="2" fill="#3fa7ff"/>`,

  // ---------------------------------------------------------------- objets à vendre
  bike: `${shadow(32, 56, 26)}<circle cx="16" cy="40" r="11" fill="none" ${s(3)}/><circle cx="48" cy="40" r="11" fill="none" ${s(3)}/><path d="M16 40 l10 -16 h16 l6 16 M26 24 l8 16 l8 -16 M34 40 h-18" fill="none" stroke="#ff5a5f" stroke-width="3.4" stroke-linejoin="round" stroke-linecap="round"/><path d="M22 18 h8 M42 24 l-2 -8 h6" fill="none" ${s(3)}/><circle cx="34" cy="40" r="3" fill="${O}"/>`,
  gamepad: `${shadow(32, 56, 24)}<path d="M18 18 h28 c8 0 12 8 12 20 c0 8 -6 12 -10 8 l-6 -6 h-20 l-6 6 c-4 4 -10 0 -10 -8 c0 -12 4 -20 12 -20z" fill="#a66bff" ${S}/><path d="M16 30 h10 M21 25 v10" stroke="#fff" stroke-width="3.4" stroke-linecap="round"/><circle cx="42" cy="27" r="3" fill="#ffd166" ${s(1.6)}/><circle cx="48" cy="33" r="3" fill="#2ecc71" ${s(1.6)}/>`,
  vinyl: `${shadow(32, 59, 18)}<circle cx="32" cy="32" r="24" fill="#2b2240" ${s(2)}/><circle cx="32" cy="32" r="18" fill="none" stroke="#5a5070" stroke-width="1.4"/><circle cx="32" cy="32" r="13" fill="none" stroke="#5a5070" stroke-width="1.4"/><circle cx="32" cy="32" r="8" fill="#ff5a5f" ${s(1.6)}/><circle cx="32" cy="32" r="2" fill="#fff"/><path d="M14 22 a20 20 0 0 1 10 -10" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" opacity=".45"/>`,
  sofa: `${shadow(32, 57, 26)}<rect x="12" y="16" width="40" height="18" rx="6" fill="#3fa7ff" ${S}/><rect x="4" y="26" width="12" height="22" rx="5" fill="#2f8be6" ${S}/><rect x="48" y="26" width="12" height="22" rx="5" fill="#2f8be6" ${S}/><rect x="14" y="32" width="36" height="14" rx="4" fill="#5fb6ff" ${S}/><path d="M32 32 v14" ${s(2)}/><path d="M10 48 v6 M54 48 v6" ${s(3)}/>`,
  watch: `${shadow(32, 60, 12)}<rect x="24" y="4" width="16" height="56" rx="5" fill="#8a5a2b" ${S}/><circle cx="32" cy="32" r="15" fill="#ffc94a" ${S}/><circle cx="32" cy="32" r="11" fill="#fffaf0" ${s(1.6)}/><path d="M32 32 V25 M32 32 l5 3" ${s(2.2)}/><rect x="46" y="29" width="4" height="6" rx="1" fill="#ffc94a" ${s(1.6)}/>`,
  painting: `${shadow(32, 58, 24)}<rect x="6" y="10" width="52" height="42" rx="3" fill="#c98a4b" ${S}/><rect x="12" y="16" width="40" height="30" fill="#ffe8a8" ${s(2)}/><circle cx="24" cy="26" r="5" fill="#ff8a3d"/><path d="M12 42 l12 -10 l8 6 l8 -8 l12 10 v6 h-40z" fill="#2ecc71" ${s(1.8)}/><path d="M28 6 l4 4 l4 -4" fill="none" ${s(2)}/>`,
  scooter: `${shadow(32, 56, 26)}<circle cx="16" cy="44" r="7" fill="#3d4466" ${S}/><circle cx="50" cy="44" r="7" fill="#3d4466" ${S}/><path d="M16 44 c0 -10 6 -14 14 -14 h10 l4 -16 h6" fill="none" ${s(3)}/><path d="M12 36 c2 -8 10 -10 18 -8 h14 l4 16 h-30z" fill="#2ecc71" ${S}/><rect x="20" y="24" width="14" height="5" rx="2.5" fill="#3d4466" ${s(2)}/>`,
  truck: `${shadow(32, 56, 28)}<rect x="4" y="16" width="38" height="28" rx="4" fill="#ff8a3d" ${S}/><path d="M42 24 h10 l8 10 v10 h-18z" fill="#ffb020" ${S}/><rect x="10" y="22" width="20" height="10" rx="2" fill="#fffaf0" ${s(2)}/><path d="M10 22 l4 -6 h12 l4 6" fill="#e23b4b" ${s(2)}/><circle cx="16" cy="46" r="6" fill="#3d4466" ${S}/><circle cx="48" cy="46" r="6" fill="#3d4466" ${S}/><path d="M46 28 h4 l4 5 h-8z" fill="#cfefff" ${s(1.6)}/>`,
  van: `${shadow(32, 56, 28)}<path d="M4 44 v-24 a6 6 0 0 1 6 -6 h30 c6 0 10 4 14 12 l6 4 v14z" fill="#6cc0ff" ${S}/><path d="M4 32 h56" stroke="#fff" stroke-width="4"/><path d="M42 18 c4 0 7 3 9 8 h-9z" fill="#cfefff" ${s(2)}/><rect x="10" y="18" width="12" height="9" rx="2" fill="#cfefff" ${s(2)}/><rect x="26" y="18" width="12" height="9" rx="2" fill="#cfefff" ${s(2)}/><circle cx="16" cy="46" r="6" fill="#3d4466" ${S}/><circle cx="48" cy="46" r="6" fill="#3d4466" ${S}/>`,
  coffee: `${shadow(32, 58, 22)}<rect x="10" y="6" width="36" height="48" rx="5" fill="#3d4466" ${S}/><rect x="16" y="12" width="24" height="8" rx="2" fill="#6cc0ff"/><path d="M18 26 h20 v6 h-20z" fill="#aab4c8" ${s(2)}/><path d="M22 40 h12 v8 a4 4 0 0 1 -4 4 h-4 a4 4 0 0 1 -4 -4z" fill="#fff" ${s(2)}/><path d="M34 42 h3 a3 3 0 0 1 0 6 h-3" fill="none" ${s(2)}/><path d="M26 34 v4 M30 34 v4" stroke="#8a5a2b" stroke-width="2" stroke-linecap="round"/><circle cx="52" cy="40" r="5" fill="#ff5a5f" ${s(2)}/>`,
  drone: `${shadow(32, 58, 22)}<path d="M14 24 l36 0 M14 24 l10 8 M50 24 l-10 8" ${s(3)}/><rect x="22" y="28" width="20" height="12" rx="4" fill="#3d4466" ${S}/><circle cx="32" cy="34" r="3" fill="#6cc0ff"/><ellipse cx="14" cy="20" rx="10" ry="2.5" fill="#aab4c8" ${s(2)}/><ellipse cx="50" cy="20" rx="10" ry="2.5" fill="#aab4c8" ${s(2)}/><path d="M14 20 v4 M50 20 v4 M26 40 l-4 6 M38 40 l4 6" ${s(2.4)}/>`,
  guitar: `${shadow(28, 59, 16)}<g transform="rotate(35 32 32)"><rect x="29" y="0" width="6" height="30" rx="2" fill="#8a5a2b" ${S}/><rect x="27" y="-4" width="10" height="7" rx="2" fill="#3d4466" ${s(2)}/><path d="M32 26 c-10 0 -14 6 -12 12 c-6 4 -6 16 4 18 c4 1 6 0 8 0 s4 1 8 0 c10 -2 10 -14 4 -18 c2 -6 -2 -12 -12 -12z" fill="#ff5a5f" ${S}/><circle cx="32" cy="40" r="4" fill="${O}"/><rect x="27" y="48" width="10" height="3" rx="1" fill="${O}"/></g>`,
  kick: `${shadow(32, 57, 26)}<circle cx="12" cy="48" r="6" fill="#3d4466" ${S}/><circle cx="52" cy="48" r="6" fill="#3d4466" ${S}/><path d="M12 48 l6 -4 h28 l6 4" fill="none" ${s(3.4)}/><path d="M46 44 l-6 -34 h-6 M40 10 h8" fill="none" stroke="#14b8a6" stroke-width="4" stroke-linecap="round"/><path d="M46 44 l-6 -34" ${s(1.6)} opacity=".4"/>`,
  oldhouse: `${shadow(32, 59, 22)}<path d="M12 28 v26 h40 v-26 l-20 -16z" fill="#c9b08a" ${S}/><path d="M6 30 L32 10 L58 30" fill="none" ${s(3.6)}/><path d="M6 30 L32 10 L58 30" fill="none" stroke="#8a5a2b" stroke-width="2"/><rect x="27" y="38" width="10" height="16" fill="#5e3b1b" ${s(2)}/><path d="M18 34 h7 v7 h-7z" fill="#3d4466" ${s(2)}/><path d="M18 34 l7 7 M25 34 l-7 7" stroke="#c9b08a" stroke-width="1.6"/><path d="M40 33 l8 4 M42 42 l6 -2" stroke="${O}" stroke-width="2" stroke-linecap="round"/><path d="M44 16 v-8 h6 v12" fill="#aab4c8" ${s(2)}/>`,
  wine: `${shadow(32, 60, 16)}<rect x="14" y="4" width="10" height="12" rx="2" fill="#2e7d4f" ${S}/><path d="M14 16 c-4 4 -6 8 -6 14 v24 a4 4 0 0 0 4 4 h14 a4 4 0 0 0 4 -4 v-24 c0 -6 -2 -10 -6 -14z" fill="#2e7d4f" ${S}/><rect x="11" y="32" width="16" height="12" rx="2" fill="#fff6dc" ${s(1.8)}/><path d="M40 24 h16 c0 10 -4 14 -8 14 s-8 -4 -8 -14z" fill="#fff" ${S}/><path d="M41 28 h14 c-1 6 -4 8 -7 8 s-6 -2 -7 -8z" fill="#b3263a"/><path d="M48 38 v14 M42 54 h12" ${s(2.6)}/>`,
  sneaker: `${shadow(32, 54, 28)}<path d="M4 44 v-10 c0 -4 4 -6 8 -4 l8 4 c4 2 6 -6 10 -10 l6 2 c-2 6 4 12 14 14 c8 2 10 6 10 10 v2z" fill="#fff" ${S}/><path d="M4 44 h56 v4 a2 2 0 0 1 -2 2 h-52 a2 2 0 0 1 -2 -2z" fill="#ff5a5f" ${S}/><path d="M24 34 l4 -4 M30 37 l4 -4 M36 39 l3 -4" ${s(2)}/><path d="M42 40 c6 0 10 2 12 4" fill="none" stroke="#3fa7ff" stroke-width="3" stroke-linecap="round"/>`,
  billiard: `${shadow(32, 59, 18)}<circle cx="32" cy="32" r="23" fill="#2b2240" ${s(2)}/><circle cx="32" cy="30" r="10" fill="#fff" ${s(1.6)}/><text x="32" y="35" text-anchor="middle" font-family="system-ui, sans-serif" font-weight="900" font-size="14" fill="${O}">8</text><path d="M16 20 a18 18 0 0 1 8 -8" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".45"/>`,
  camera: `${shadow(32, 56, 26)}<rect x="6" y="18" width="52" height="34" rx="6" fill="#3d4466" ${S}/><path d="M20 18 l4 -6 h16 l4 6" fill="#3d4466" ${S}/><rect x="6" y="24" width="52" height="8" fill="#c98a4b" ${s(2)}/><circle cx="32" cy="35" r="11" fill="#aab4c8" ${S}/><circle cx="32" cy="35" r="6" fill="#2b2240"/><circle cx="30" cy="33" r="2" fill="#fff"/><rect x="46" y="14" width="8" height="4" rx="1" fill="#ff5a5f" ${s(1.6)}/>`,
  kayak: `${shadow(32, 50, 28)}<path d="M2 38 c14 -10 46 -10 60 0 c-14 8 -46 8 -60 0z" fill="#ffb020" ${S}/><ellipse cx="32" cy="36" rx="8" ry="3" fill="#3d4466" ${s(2)}/><path d="M10 18 l44 32" ${s(3)}/><path d="M6 14 l8 2 l-2 6z M58 54 l-8 -2 l2 -6z" fill="#3fa7ff" ${s(2)}/><path d="M4 50 c6 -2 10 2 16 0 M44 50 c6 -2 10 2 16 0" fill="none" stroke="#4cc9f0" stroke-width="2.4" stroke-linecap="round"/>`,
  candy: `${shadow(32, 60, 14)}<circle cx="32" cy="22" r="16" fill="#e8f6ff" ${S}/><circle cx="26" cy="20" r="4" fill="#ff5a5f"/><circle cx="36" cy="16" r="4" fill="#ffd166"/><circle cx="36" cy="26" r="4" fill="#2ecc71"/><circle cx="27" cy="29" r="4" fill="#a66bff"/><rect x="22" y="36" width="20" height="20" rx="3" fill="#ff5a5f" ${S}/><rect x="28" y="42" width="8" height="6" rx="1.5" fill="#3d4466"/><rect x="26" y="4" width="12" height="4" rx="2" fill="#ff5a5f" ${s(2)}/>`,
  ring: `${shadow(32, 60, 14)}<circle cx="32" cy="40" r="15" fill="none" stroke="#ffc94a" stroke-width="6"/><circle cx="32" cy="40" r="15" fill="none" ${s(1.6)}/><circle cx="32" cy="40" r="18.5" fill="none" ${s(1.6)}/><path d="M24 14 h16 l6 6 l-14 12 l-14 -12z" fill="#a8e6ff" ${S}/><path d="M24 14 l8 18 l8 -18 M18 20 h28" fill="none" ${s(1.6)}/>`,
  jukebox: `${shadow(32, 60, 20)}<path d="M10 58 v-30 a22 22 0 0 1 44 0 v30z" fill="#ff5a5f" ${S}/><path d="M16 56 v-26 a16 16 0 0 1 32 0 v26z" fill="#ffd166" ${s(2)}/><path d="M22 30 a10 10 0 0 1 20 0 v8 h-20z" fill="#a66bff" ${s(2)}/><path d="M22 44 h20 M22 49 h20" ${s(2)}/><circle cx="32" cy="32" r="3" fill="#fff"/>`,
  sailboat: `${shadow(32, 58, 26)}<path d="M8 44 h48 l-8 10 h-32z" fill="#8a5a2b" ${S}/><path d="M32 6 v38" ${s(3)}/><path d="M34 10 c10 10 14 20 14 30 h-14z" fill="#fff" ${S}/><path d="M30 14 c-8 8 -12 16 -14 26 h14z" fill="#ff5a5f" ${S}/><path d="M4 58 c6 -2 10 2 16 0 s10 2 16 0 s10 2 16 0" fill="none" stroke="#4cc9f0" stroke-width="2.4" stroke-linecap="round"/>`,
  mixer: `${shadow(32, 60, 20)}<path d="M14 10 h24 a10 10 0 0 1 10 10 v2 h-34z" fill="#ff7ac6" ${S}/><path d="M38 22 v28" ${s(5)}/><path d="M38 22 v28" stroke="#ff7ac6" stroke-width="2.4"/><path d="M14 34 h24 l-3 16 h-18z" fill="#e8f6ff" ${S}/><path d="M24 22 v12" ${s(2.4)}/><rect x="8" y="50" width="44" height="6" rx="2" fill="#ff7ac6" ${S}/>`,
};

/** Émojis envoyés par le serveur → illustration correspondante. */
const FROM_EMOJI = {
  '✉️': 'envelope', '📬': 'mailboxOne', '📨': 'envFast', '📮': 'mailboxFull', '📪': 'mailbox', '💌': 'envHeart', '📜': 'scroll', '📩': 'envBig', '📭': 'mailboxEmpty',
  '🏷️': 'tag', '📰': 'newspaper', '💡': 'bulb', '🏺': 'vase', '🔨': 'gavel', '🛒': 'cart', '🧺': 'basket', '🛍️': 'bagFast', '🧐': 'magnifier', '🕰️': 'clock', '🏃': 'bagFast', '🤝': 'sold',
  '⚽': 'ball', '🏟️': 'stadium', '🏆': 'trophy', '🥅': 'goal', '🎂': 'cake', '⏱️': 'stopwatch', '📻': 'radio', '🚿': 'leak', '💥': 'leak', '🎟️': 'ticket', '📦': 'box', '🍻': 'mugs', '🚩': 'flag',
  '💶': 'banknote', '🐷': 'pig', '👛': 'wallet', '🏦': 'bank', '🧾': 'bill', '💰': 'jar', '🫙': 'jar', '📅': 'calendar', '🎲': 'dice',
  '📱': 'phone', '🚗': 'car', '🔧': 'wrench', '🛠️': 'wrench', '🏋️': 'dumbbell', '🌐': 'router', '🐶': 'paw', '🐕': 'paw', '🏠': 'house', '🍽️': 'plate', '🩺': 'health', '🦷': 'tooth', '📺': 'tv', '🔥': 'flame',
  '🚓': 'police', '📸': 'radar', '⏰': 'alarm', '👵': 'cheque', '🏅': 'medal', '🩹': 'bandage', '🎁': 'gift', '🍕': 'pizza', '✈️': 'plane',
  '🚲': 'bike', '🎮': 'gamepad', '💿': 'vinyl', '🛋️': 'sofa', '⌚': 'watch', '🖼️': 'painting', '🛵': 'scooter', '🚚': 'truck', '🚐': 'van', '☕': 'coffee', '🚁': 'drone', '🎸': 'guitar', '🛴': 'kick',
  '🏚️': 'oldhouse', '🍷': 'wine', '👟': 'sneaker', '🎱': 'billiard', '📷': 'camera', '🛶': 'kayak', '🍬': 'candy', '💍': 'ring', '⛵': 'sailboat', '🧁': 'mixer', '🤑': 'sold', '🙅': 'tag', '🏁': 'flag',
  '☀️': 'calendar', '😴': 'calendar', '🔁': 'dice', '🏳️': 'flag',
};

/** Nom de l'illustration pour un émoji (ou un nom déjà valide). */
export function artKey(k) {
  if (!k) return null;
  if (ART[k]) return k;
  return FROM_EMOJI[k] || FROM_EMOJI[String(k).replace(/️/g, '')] || FROM_EMOJI[k + '️'] || null;
}
/** Code SVG complet d'une illustration. */
export function artSvg(k) {
  const key = artKey(k);
  if (!key) return null;
  return `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${ART[key]}</svg>`;
}
/** Élément HTML (span) contenant l'illustration, ou l'émoji d'origine à défaut. */
export function art(k, cls = '') {
  const el = document.createElement('span');
  el.className = 'mo-art' + (cls ? ' ' + cls : '');
  const svg = artSvg(k);
  if (svg) el.innerHTML = svg;
  else el.textContent = k || '';
  return el;
}

/** Images prêtes à dessiner sur une toile (cases 3D). */
const images = {};
export function loadArt(keys = Object.keys(ART)) {
  return Promise.all(keys.map((k) => {
    const key = artKey(k);
    if (!key || images[key]) return images[key] && images[key].ready;
    const img = new Image();
    img.ready = new Promise((r) => {
      img.onload = r;
      img.onerror = r;
    });
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(artSvg(key).replace('<svg ', '<svg width="256" height="256" '));
    images[key] = img;
    return img.ready;
  }));
}
/** Dessine une illustration sur une toile (si elle est chargée). Renvoie false sinon. */
export function drawArt(g, k, cx, cy, size) {
  const img = images[artKey(k)];
  if (!img || !img.complete || !img.naturalWidth) return false;
  g.drawImage(img, cx - size / 2, cy - size / 2, size, size);
  return true;
}
