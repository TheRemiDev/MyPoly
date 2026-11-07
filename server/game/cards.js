'use strict';
/** Cartes Chance. L'effet est appliqué par le moteur (engine.js) selon l'id. */
const CARDS = [
  { id: 'go_start', icon: '🏁', title: 'Retour aux sources', text: 'Avancez jusqu\'à la case Départ.' },
  { id: 'go_jail', icon: '🏝️', title: 'Naufrage !', text: 'Vous échouez sur l\'Île déserte.' },
  { id: 'jail_card', icon: '🛟', title: 'Gilet de sauvetage', text: 'Conservez cette carte : elle vous libère de l\'Île déserte.' },
  { id: 'back3', icon: '↩️', title: 'Demi-tour', text: 'Reculez de 3 cases.' },
  { id: 'go_travel', icon: '✈️', title: 'Billet d\'avion', text: 'Rendez-vous à l\'Aéroport.' },
  { id: 'go_festival', icon: '🎉', title: 'Invitation VIP', text: 'Rendez-vous au Festival.' },
  { id: 'gain150', icon: '💰', title: 'Héritage', text: 'Vous héritez de 150K.' },
  { id: 'gain100', icon: '🧾', title: 'Remboursement', text: 'Le fisc vous rembourse 100K.' },
  { id: 'pay100', icon: '🚓', title: 'Excès de vitesse', text: 'Payez une amende de 100K.' },
  { id: 'birthday', icon: '🎂', title: 'Anniversaire', text: 'Chaque joueur vous offre 50K.' },
  { id: 'charity', icon: '🤝', title: 'Générosité', text: 'Donnez 30K à chaque joueur.' },
  { id: 'repairs', icon: '🛠️', title: 'Travaux', text: 'Payez 20K par maison et 80K par hôtel.' },
  { id: 'shield', icon: '🛡️', title: 'Bouclier', text: 'Votre prochain loyer est annulé.' },
  { id: 'coupon', icon: '🏷️', title: 'Coupon', text: 'Votre prochain loyer est réduit de moitié.' },
  { id: 'quake', icon: '🌋', title: 'Séisme', text: 'La ville la plus développée d\'un adversaire au hasard perd une maison. Les hôtels sont intouchables.' },
  { id: 'nearest_resort', icon: '🏖️', title: 'Vacances', text: 'Avancez jusqu\'à la prochaine station balnéaire.' },
  { id: 'go_top', icon: '🗼', title: 'Week-end de luxe', text: 'Avancez jusqu\'à Paris.' },
  { id: 'lottery', icon: '🎰', title: 'Loterie', text: 'Vous gagnez entre 10K et 300K (tirage aléatoire).' },
  // --- Nouvelles cartes ---
  { id: 'free_house', icon: '🏗️', title: 'Permis express', text: 'Une maison gratuite sur une de vos villes, tirée au hasard.' },
  { id: 'tornado', icon: '🌪️', title: 'Tornade', text: 'Deux villes d\'un adversaire au hasard perdent une maison. Les hôtels résistent.' },
  { id: 'coin_flip', icon: '🪙', title: 'Pile ou face', text: 'Pile : vous gagnez 200K. Face : vous payez 100K.' },
  { id: 'robin', icon: '🏹', title: 'Robin des bois', text: 'Le joueur le plus riche donne 150K au plus pauvre.' },
  { id: 'teleport', icon: '🌀', title: 'Téléporteur', text: 'Vous êtes téléporté vers une case au hasard (hors coins).' },
  { id: 'forward5', icon: '⏩', title: 'Raccourci', text: 'Avancez de 5 cases.' },
  { id: 'dividends', icon: '🏦', title: 'Dividendes', text: 'Recevez 25K par propriété que vous possédez.' },
  { id: 'replay', icon: '🎲', title: 'Coup de pouce', text: 'Relancez les dés immédiatement !' },
  { id: 'voucher', icon: '💌', title: 'Bon d\'achat', text: 'Votre prochain achat de terrain (avec maisons) est à moitié prix.' },
  { id: 'black_cat', icon: '🐈‍⬛', title: 'Chat noir', text: 'Pas de chance : votre prochain loyer est doublé.' },
  { id: 'patron', icon: '🎊', title: 'Mécène', text: 'Organisez gratuitement un Festival sur une de vos propriétés.' },
  { id: 'crash', icon: '📉', title: 'Krach boursier', text: 'Chaque joueur perd 10 % de son argent liquide (vous compris).' },
];

module.exports = { CARDS };
