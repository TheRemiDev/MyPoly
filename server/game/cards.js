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
  { id: 'quake', icon: '🌋', title: 'Séisme', text: 'La propriété la plus développée d\'un adversaire au hasard perd un niveau.' },
  { id: 'nearest_resort', icon: '🏖️', title: 'Vacances', text: 'Avancez jusqu\'à la prochaine station balnéaire.' },
  { id: 'go_top', icon: '🗼', title: 'Week-end de luxe', text: 'Avancez jusqu\'à Paris.' },
  { id: 'lottery', icon: '🎰', title: 'Loterie', text: 'Vous gagnez entre 10K et 300K (tirage aléatoire).' },
];

module.exports = { CARDS };
