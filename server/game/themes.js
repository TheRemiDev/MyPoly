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
  // Icônes des coins (le coin « Garde à vue » est dessiné à part en 3D : cellule + CRS)
  cornerIcons: { start: '🖨️', jail: '👮', festival: '✊', travel: '🧳' },
  // Cartes Chance : mêmes effets, textes satiriques
  cards: {
    go_start: { icon: '🖨️', title: 'Planche à billets', text: 'L\'argent magique existe, on l\'a trouvé ! Avancez jusqu\'à la Planche à billets.' },
    go_jail: { icon: '🚓', title: 'Manif qui dégénère', text: 'Vous vouliez juste « interpeller le gouvernement ». C\'est lui qui vous interpelle : garde à vue.' },
    jail_card: { icon: '🧑‍⚖️', title: 'Avocat militant', text: 'Il plaide « violences symboliques du capitalisme ». Ça marche : carte de sortie de garde à vue.' },
    back3: { icon: '↩️', title: 'Réforme abandonnée', text: 'Trois jours de grève et le gouvernement recule. Vous aussi : 3 cases en arrière.' },
    go_travel: { icon: '🧳', title: 'Fuite des capitaux', text: 'Votre patrimoine a vu le programme. Il a déjà fait ses valises : direction l\'Exil fiscal.' },
    go_festival: { icon: '✊', title: 'Rassemblement festif', text: 'Merguez, banderoles et Internationale en boucle : rendez-vous à la Fête de la Lutte.' },
    gain150: { icon: '💶', title: 'Subvention miracle', text: 'Dossier « Collectif d\'éveil à la décroissance inclusive » accepté : vous touchez 150K.' },
    gain100: { icon: '🧾', title: 'Erreur de l\'administration', text: 'Le fisc s\'est trompé en votre faveur. Profitez-en, ça n\'arrivera plus jamais : +100K.' },
    pay100: { icon: '🌱', title: 'Taxe écolo surprise', text: 'Votre voiture a émis un regard pollueur vers un arbre. Amende : 100K.' },
    birthday: { icon: '🫙', title: 'Cagnotte solidaire', text: 'Votre caisse de grève a besoin de vous… enfin, de leur argent : chaque joueur vous verse 50K.' },
    charity: { icon: '🤲', title: 'Redistribution forcée', text: 'Vous aviez de l\'argent ? Plus maintenant. Donnez 30K à chaque joueur, au nom de l\'égalité.' },
    repairs: { icon: '📋', title: 'Normes obligatoires', text: 'Rampe PMR, toit végétalisé, toilettes non genrées et nichoir à hérissons : 20K par maison, 80K par hôtel.' },
    shield: { icon: '🛡️', title: 'Niche fiscale', text: 'Vous avez trouvé LA niche que Bercy avait oubliée. Prochain loyer annulé.' },
    coupon: { icon: '🏷️', title: 'Chèque énergie', text: 'Financé par vos propres impôts, mais chut. Prochain loyer réduit de moitié.' },
    quake: { icon: '🪧', title: 'Grève générale', text: 'Plus de train, plus d\'essence, plus de maçons. La ville la plus développée d\'un adversaire perd une maison.' },
    nearest_resort: { icon: '🏖️', title: 'Pont du jeudi', text: 'Le jeudi est férié, le vendredi « fait le pont » et le lundi « récupère ». Avancez au prochain congé.' },
    go_top: { icon: '🏭', title: 'Grand plan d\'État', text: 'Le boulanger, le coiffeur et votre chien sont nationalisés. Avancez jusqu\'à la Nationalisation de tout.' },
    lottery: { icon: '🎰', title: 'Loto du patrimoine', text: 'Vous gagnez entre 10K et 300K. Le fisc vous recontactera dans la journée.' },
    free_house: { icon: '🏗️', title: 'Logement de fonction', text: 'Payé par le contribuable, attribué « au mérite » (de votre carte d\'adhérent) : une maison gratuite.' },
    tornado: { icon: '🚧', title: 'Blocage des raffineries', text: 'Plus une goutte d\'essence, les chantiers s\'arrêtent : deux villes d\'un adversaire perdent une maison.' },
    coin_flip: { icon: '🪙', title: 'Référendum d\'initiative citoyenne', text: 'Pile : vous gagnez 200K. Face : vous payez 100K. Le résultat sera contesté de toute façon.' },
    robin: { icon: '⚖️', title: 'Égalitarisme radical', text: 'Le plus riche donne 150K au plus pauvre. On ne lui a pas demandé son avis, on ne le demande jamais.' },
    teleport: { icon: '🌀', title: 'Mutation administrative', text: 'Formulaire Cerfa 12-B/bis validé après 3 ans : vous êtes muté au hasard (hors coins).' },
    forward5: { icon: '⏩', title: 'Procédure accélérée', text: 'Une administration rapide ? C\'est un bug. Avancez de 5 cases avant qu\'ils ne le corrigent.' },
    dividends: { icon: '🏦', title: 'Dividendes honteux', text: 'Recevez 25K par propriété. Cachez-les bien avant la prochaine AG.' },
    replay: { icon: '🎲', title: 'Motion de censure ratée', text: 'Ils ont encore raté leur coup. Rien ne change : relancez les dés !' },
    voucher: { icon: '💌', title: 'Prime à la casse', text: 'L\'État vous paie pour détruire ce qui marche. Votre prochain achat est à moitié prix.' },
    black_cat: { icon: '📈', title: 'Hausse des charges', text: 'Nouvelle contribution « solidarité-transition-avenir » : votre prochain loyer est doublé.' },
    patron: { icon: '🎊', title: 'Mécène (avant redressement)', text: 'Profitez-en avant la taxe sur les mécènes : un rassemblement gratuit sur une de vos propriétés.' },
    crash: { icon: '📉', title: 'Programme appliqué', text: 'Leur programme économique est enfin appliqué. Résultat garanti : chacun perd 10 % de son argent liquide.' },
  },
  // Piques ajoutées aux notifications (une au hasard selon l'évènement)
  quips: {
    buy: ['Propriété privée ? Pas pour longtemps.', 'Un capitaliste de plus. La ZAD est furieuse.', 'Achat signalé à la commission « Partage des richesses ».', 'Achat légal, mais moralement suspect.'],
    build: ['Permis accordé après seulement 4 ans de recours.', 'Le collectif riverain a déjà lancé une pétition.', 'Bétonisation ! Un militant s\'enchaîne au chantier.', 'Normes RE2045 respectées… pour l\'instant.'],
    rent: ['Le loyer, cet outil d\'oppression.', 'Encadrement des loyers ? Jamais entendu parler.', 'Payé sous protestation et avec banderole.', 'Le propriétaire est désormais « ennemi de classe ».'],
    takeover: ['Expropriation… mais dans le bon sens.', 'Nationalisation inversée !', 'La propriété, c\'est le vol. Le rachat aussi.'],
    jail: ['Il voulait juste manifester pacifiquement. Avec des pavés.', 'Garde à vue : le militant réclame un menu végan.', 'Placé en cellule avec trois black blocs et un syndicaliste.'],
    bankrupt: ['Faillite : il demande un plan de sauvetage public.', 'Ruiné, mais fier de ses valeurs.', 'Il a appliqué le programme sur ses propres finances.'],
    tax: ['Merci pour votre contribution « volontaire ».', 'Prélevé à la source, à la racine et aux branches.', 'L\'État vous remercie. Il en redemande déjà.'],
    festival: ['Merguez, sono et Internationale en boucle !', 'Rassemblement déclaré… à la préfecture d\'à côté.', 'Entrée gratuite, sortie payante.'],
    monopoly: ['Concentration capitaliste détectée !', 'Le monopole, c\'est bien quand c\'est l\'État.', 'Le Syndicat appelle déjà à la grève.'],
    sell: ['Vendu ! Le collectif squatte déjà.', 'Bradé au prix du marché « solidaire ».'],
    fly: ['Bilan carbone : catastrophique. Exil : magnifique.', 'Il part avant la prochaine taxe.'],
    quake: ['La CGT confirme : « mouvement reconductible ».', 'Tout est bloqué, même les ascenseurs.'],
  },
};

const THEMES = { politique: POLITIQUE };

module.exports = { THEMES };
