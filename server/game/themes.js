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
    ma: { name: 'Le Syndicat du Blocage', flag: '✊' },
    mx: { name: 'L\'AG Permanente', flag: '📣' },
    es: { name: 'Le Ministère des Taxes', flag: '🧾' },
    it: { name: 'La Fac Bloquée', flag: '📚' },
    gb: { name: 'Le Quartier Bobo', flag: '☕' },
    jp: { name: 'Le Grand Soir (reporté)', flag: '🌅' },
    fr: { name: 'Le Palais Rouge', flag: '🚩' },
  },
  // Cases (index du plateau) → nom, icône et description satirique (survol / clic)
  cells: {
    0: { name: 'Planche à billets', desc: 'L\'argent magique existe : il suffit d\'appuyer sur le bouton « imprimer ». L\'inflation ? Une invention du capital.' },
    1: { name: 'Yourte sans permis', icon: '🛖', desc: 'Pas d\'eau, pas d\'électricité, pas de permis. Mais 4 ateliers « reconnexion à la Terre » par semaine.' },
    2: { name: 'Potager stérile', icon: '🥀', desc: 'Cultivé sans engrais, sans pesticide, sans arrosage… et sans légume. Récolte annuelle : 3 radis.' },
    3: { name: 'Manif', desc: 'Départ 14 h, arrivée jamais. Tirez une carte et priez.' },
    4: { name: 'Pont de 15 jours', emoji: '🌉', desc: 'Un jour férié le jeudi ? Le pont commence le lundi d\'avant et finit le lundi d\'après.' },
    5: { name: 'Grève préventive', icon: '🪧', desc: 'On ne sait pas encore contre quoi, mais on fait grève avant, au cas où.' },
    6: { name: 'Merguez syndicale', icon: '🌭', desc: 'Le vrai moteur de la lutte des classes. Sans merguez, pas de cortège.' },
    7: { name: 'Blocage du lundi', icon: '🚧', desc: 'Bloqué le lundi, en AG le mardi, en grève le mercredi. Jeudi : pont.' },
    8: { name: 'Garde à vue', desc: 'Réservée aux militants « pacifiques » arrêtés avec un sac de pavés.' },
    9: { name: 'AG de 9 heures', icon: '😴', desc: '9 heures de débat pour décider de la date de la prochaine AG. Motion adoptée à 3 voix contre 2.' },
    10: { name: 'Vote à main levée', icon: '✋', desc: 'Démocratie directe : on compte les mains… sauf celles de ceux qui ne sont pas d\'accord.' },
    11: { name: 'Manif', desc: 'Slogans rimés, banderoles en draps et sono à fond. Tirez une carte.' },
    12: { name: 'RTT perpétuelles', emoji: '🏖️', desc: 'Travailler moins pour gagner autant, puis travailler encore moins. La productivité ? Facho.' },
    13: { name: 'Taxe sur l\'oxygène', icon: '💨', desc: 'Vous respirez ? Vous polluez. Barème progressif selon votre capacité pulmonaire.' },
    14: { name: 'Taxe sur la taxe', icon: '🧮', desc: 'Pour financer la collecte de la taxe, une taxe a été créée. Elle-même taxée, évidemment.' },
    15: { name: 'Impôt sur le soleil', icon: '☀️', desc: 'Vous profitez du soleil gratuitement ? Inacceptable. Supplément pour les terrasses exposées sud.' },
    16: { name: 'Fête de la Lutte', desc: 'Concerts engagés, débats sur l\'abolition de l\'argent… et pinte à 9 €.' },
    17: { name: 'Amphi barricadé', icon: '🪑', desc: 'Les cours sont annulés pour « lutter pour l\'éducation ». Logique implacable.' },
    18: { name: 'Atelier déconstruction', icon: '🧠', desc: 'On y déconstruit tout : le genre, la langue, les murs porteurs. Le bâtiment s\'effondre.' },
    19: { name: 'Manif', desc: 'Le parcours a changé trois fois, personne ne sait où il est. Tirez une carte.' },
    20: { name: 'Semaine de 2 jours', emoji: '😎', desc: 'Deux jours de travail, cinq jours de récupération. Les deux jours sont en télétravail.' },
    21: { name: 'Café à 9 €', icon: '🥂', desc: 'Lait d\'avoine bio, commerce équitable, prix déséquitable. Le serveur est en grève.' },
    22: { name: 'Trottinette en grève', icon: '🛴', desc: 'Même les trottinettes en libre-service réclament leurs 35 heures.' },
    23: { name: 'Loft « populaire »', icon: '🏚️', desc: 'Ancien atelier ouvrier racheté 2 millions par un « artiste engagé ». Les ouvriers ont été priés de partir.' },
    24: { name: 'Exil fiscal', desc: 'Le seul vol direct que tout le monde réserve après les élections.' },
    25: { name: 'Révolution en retard', icon: '⏳', desc: 'Prévue en 1848, puis en 1968, puis « l\'an prochain ». Toujours en retard, comme les trains.' },
    26: { name: 'Plan sur 50 ans', icon: '📜', desc: 'Objectifs ambitieux, moyens inexistants, résultats prévus pour la génération suivante.' },
    27: { name: 'Manif', desc: 'Interpellation, gaz lacrymogène ou merguez : tirez une carte.' },
    28: { name: 'Retraite à 30 ans', emoji: '🛋️', desc: 'Commencer à travailler à 28 ans, partir à 30. Qui paie ? Les autres, comme d\'habitude.' },
    29: { name: 'Budget magique', icon: '🪄', desc: 'Toutes les dépenses sont chiffrées, les recettes « seront trouvées ». Abracadabra.' },
    30: { name: 'ISF ×10', desc: 'Être riche est désormais une circonstance aggravante. Plus vous possédez, plus vous payez.' },
    31: { name: 'Tout nationalisé', icon: '🏭', desc: 'La boulangerie, le coiffeur, votre chat. Les files d\'attente aussi sont nationalisées.' },
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
