'use strict';
/**
 * Thèmes de plateau alternatifs (habillage uniquement : les règles et les prix
 * restent identiques). Réservés aux administrateurs dans les règles de la salle.
 *
 * « politique » : plateau satirique qui caricature les idées et les institutions
 * de la gauche (impôts, grèves, bureaucratie, militantisme…). Humour grinçant,
 * sans violence ni attaque contre des personnes réelles.
 */
const POLITIQUE = {
  id: 'politique',
  label: 'Plateau politique',
  // Pays → « quartiers » idéologiques (même ordre que COUNTRIES)
  countries: {
    br: { name: 'La ZAD', flag: '🏕️' },
    ma: { name: 'Le Syndicat', flag: '✊' },
    mx: { name: 'L\'Assemblée Générale', flag: '📣' },
    es: { name: 'Le Ministère des Taxes', flag: '🧾' },
    it: { name: 'La Fac occupée', flag: '📚' },
    gb: { name: 'Le Quartier bobo', flag: '☕' },
    jp: { name: 'Le Grand Soir', flag: '🌅' },
    fr: { name: 'Le Palais rouge', flag: '🚩' },
  },
  // Cases (index du plateau) → nouveau nom et icône
  cells: {
    0: { name: 'Planche à billets' },
    1: { name: 'Cabane en palettes', icon: '🛖' },
    2: { name: 'Potager autogéré', icon: '🥕' },
    3: { name: 'Manif' },
    4: { name: 'Pont du 1er mai', emoji: '🌉' },
    5: { name: 'Piquet de grève', icon: '🪧' },
    6: { name: 'Barbecue merguez', icon: '🌭' },
    7: { name: 'Blocage du dépôt', icon: '🚧' },
    8: { name: 'Commission d\'enquête' },
    9: { name: 'AG interminable', icon: '😴' },
    10: { name: 'Vote à main levée', icon: '✋' },
    11: { name: 'Manif' },
    12: { name: 'RTT éternelle', emoji: '🏖️' },
    13: { name: 'Taxe sur l\'air', icon: '💨' },
    14: { name: 'Taxe sur la taxe', icon: '🧮' },
    15: { name: 'Impôt sur le soleil', icon: '☀️' },
    16: { name: 'Fête de la Lutte' },
    17: { name: 'Amphi bloqué', icon: '🪑' },
    18: { name: 'Séminaire déconstruction', icon: '🧠' },
    19: { name: 'Manif' },
    20: { name: 'Semaine de 4 jours', emoji: '😎' },
    21: { name: 'Terrasse bobo', icon: '🥂' },
    22: { name: 'Latte au soja', icon: '🧋' },
    23: { name: 'Loft rénové', icon: '🏚️' },
    24: { name: 'Exil fiscal' },
    25: { name: 'Révolution reportée', icon: '⏳' },
    26: { name: 'Plan quinquennal', icon: '📜' },
    27: { name: 'Manif' },
    28: { name: 'Retraite à 50 ans', emoji: '🛋️' },
    29: { name: 'Programme chiffré à 0 €', icon: '🧾' },
    30: { name: 'ISF puissance 10' },
    31: { name: 'Nationalisation de tout', icon: '🏭' },
  },
  // Coins / cases spéciales : nom affiché sur le plateau
  corners: { start: 'PLANCHE À BILLETS', jail: 'GARDE À VUE', festival: 'FÊTE DE LA LUTTE', travel: 'EXIL FISCAL', chance: 'MANIF', tax: 'ISF ×10' },
  // Cartes Chance : mêmes effets, textes satiriques
  cards: {
    go_start: { icon: '🖨️', title: 'Planche à billets', text: 'On imprime, on verra plus tard ! Avancez jusqu\'à la Planche à billets.' },
    go_jail: { icon: '🚓', title: 'Manif qui dégénère', text: 'Le cortège a mal tourné : direction la garde à vue.' },
    jail_card: { icon: '🧑‍⚖️', title: 'Avocat militant', text: 'Conservez cette carte : elle vous sort de garde à vue.' },
    back3: { icon: '↩️', title: 'Réforme abandonnée', text: 'Reculade du gouvernement : reculez de 3 cases.' },
    go_travel: { icon: '🧳', title: 'Fuite des capitaux', text: 'Votre fortune s\'enfuit : rendez-vous à l\'Exil fiscal.' },
    go_festival: { icon: '🎪', title: 'Invitation au rassemblement', text: 'Rendez-vous à la Fête de la Lutte.' },
    gain150: { icon: '💶', title: 'Subvention surprise', text: 'Un dossier rempli en 4 exemplaires : vous touchez 150K.' },
    gain100: { icon: '🧾', title: 'Trop-perçu', text: 'Le fisc s\'est trompé (pour une fois) : +100K.' },
    pay100: { icon: '🌱', title: 'Taxe écolo surprise', text: 'Votre voiture a regardé un arbre de travers : payez 100K.' },
    birthday: { icon: '🫙', title: 'Cagnotte solidaire', text: 'Chaque joueur verse 50K à votre caisse de grève.' },
    charity: { icon: '🤲', title: 'Redistribution forcée', text: 'Donnez 30K à chaque joueur. C\'est pour l\'égalité.' },
    repairs: { icon: '📋', title: 'Normes obligatoires', text: 'Mise aux normes de tout : 20K par maison, 80K par hôtel.' },
    shield: { icon: '🛡️', title: 'Niche fiscale', text: 'Votre prochain loyer est annulé.' },
    coupon: { icon: '🏷️', title: 'Chèque énergie', text: 'Votre prochain loyer est réduit de moitié.' },
    quake: { icon: '🪧', title: 'Grève générale', text: 'Tout est bloqué : la ville la plus développée d\'un adversaire perd une maison. Les hôtels résistent.' },
    nearest_resort: { icon: '🏖️', title: 'Pont de mai', text: 'Avancez jusqu\'au prochain jour férié.' },
    go_top: { icon: '🏭', title: 'Grand plan d\'État', text: 'Avancez jusqu\'à la Nationalisation de tout.' },
    lottery: { icon: '🎰', title: 'Loto du patrimoine', text: 'Vous gagnez entre 10K et 300K (avant impôts, évidemment).' },
    free_house: { icon: '🏗️', title: 'Logement de fonction', text: 'Une maison gratuite sur une de vos villes, payée par le contribuable.' },
    tornado: { icon: '🚧', title: 'Blocage des raffineries', text: 'Deux villes d\'un adversaire perdent une maison. Les hôtels résistent.' },
    coin_flip: { icon: '🪙', title: 'Référendum', text: 'Pile : vous gagnez 200K. Face : vous payez 100K.' },
    robin: { icon: '⚖️', title: 'Égalitarisme', text: 'Le plus riche donne 150K au plus pauvre. Personne n\'a demandé son avis.' },
    teleport: { icon: '🌀', title: 'Mutation administrative', text: 'Vous êtes muté au hasard (hors coins), sans préavis.' },
    forward5: { icon: '⏩', title: 'Procédure accélérée', text: 'Avancez de 5 cases (exceptionnellement).' },
    dividends: { icon: '🏦', title: 'Dividendes (honteux)', text: 'Recevez 25K par propriété. Ne le dites à personne.' },
    replay: { icon: '🎲', title: 'Motion de censure ratée', text: 'Rien ne change : relancez les dés !' },
    voucher: { icon: '💌', title: 'Prime à la casse', text: 'Votre prochain achat est à moitié prix.' },
    black_cat: { icon: '📈', title: 'Hausse des charges', text: 'Votre prochain loyer est doublé.' },
    patron: { icon: '🎊', title: 'Mécène… taxé', text: 'Organisez gratuitement un rassemblement sur une de vos propriétés.' },
    crash: { icon: '📉', title: 'Programme appliqué', text: 'Leur programme économique est passé : chacun perd 10 % de son argent liquide.' },
  },
};

const THEMES = { politique: POLITIQUE };

module.exports = { THEMES };
