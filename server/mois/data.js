'use strict';
/**
 * « Fin de mois » — contenu du jeu : les cases du calendrier, le courrier et les affaires.
 */

/**
 * Les cases du mois : index = jour (0 = départ, 31 = jour de paye).
 * Le plateau est un anneau de 32 cases (comme MyPoly) : les angles sont les jours 0, 8, 16 et 24.
 */
const DAYS = [
  { k: 'start' },
  { k: 'mail', n: 1 }, { k: 'deal' }, { k: 'mail', n: 2 }, { k: 'birthday' }, { k: 'deal' }, { k: 'bet' }, { k: 'buyer' },
  { k: 'tombola' },
  { k: 'mail', n: 1 }, { k: 'deal' }, { k: 'bonus' }, { k: 'mail', n: 3 }, { k: 'bet' }, { k: 'buyer' }, { k: 'mail', n: 1 },
  { k: 'garage' },
  { k: 'deal' }, { k: 'contest' }, { k: 'mail', n: 2 }, { k: 'bet' }, { k: 'buyer' }, { k: 'mail', n: 1 }, { k: 'deal' },
  { k: 'round' },
  { k: 'tough' }, { k: 'mail', n: 2 }, { k: 'bet' }, { k: 'buyer' }, { k: 'deal' }, { k: 'mail', n: 1 }, { k: 'payday' },
];
const PAYDAY = 31;

/**
 * Courrier.
 *  bill    : facture à régler le jour de paye
 *  fine    : à payer tout de suite (va dans la cagnotte)
 *  gain    : argent reçu
 *  give    : à payer au joueur suivant ; take : reçu du joueur précédent
 *  ad      : publicité (rien)
 *  goto    : avancer jusqu'à la prochaine case d'un type
 */
const MAIL = [
  { t: 'bill', icon: '💡', name: 'Facture d\'électricité', amount: 240 },
  { t: 'bill', icon: '💡', name: 'Facture d\'électricité', amount: 240 },
  { t: 'bill', icon: '📱', name: 'Forfait téléphone', amount: 90 },
  { t: 'bill', icon: '🚗', name: 'Assurance auto', amount: 380 },
  { t: 'bill', icon: '🚿', name: 'Facture d\'eau', amount: 150 },
  { t: 'bill', icon: '🔧', name: 'Réparation de la chaudière', amount: 620 },
  { t: 'bill', icon: '🏋️', name: 'Abonnement à la salle de sport', amount: 60 },
  { t: 'bill', icon: '🌐', name: 'Box internet', amount: 45 },
  { t: 'bill', icon: '🛠️', name: 'Contrôle technique', amount: 110 },
  { t: 'bill', icon: '🐶', name: 'Visite chez le vétérinaire', amount: 180 },
  { t: 'bill', icon: '🏠', name: 'Taxe d\'habitation', amount: 700 },
  { t: 'bill', icon: '🍽️', name: 'Cantine des enfants', amount: 220 },
  { t: 'bill', icon: '🩺', name: 'Mutuelle santé', amount: 130 },
  { t: 'bill', icon: '🦷', name: 'Dentiste', amount: 320 },
  { t: 'bill', icon: '📺', name: 'Abonnement streaming', amount: 30 },
  { t: 'bill', icon: '🔥', name: 'Plein de fioul', amount: 450 },
  { t: 'fine', icon: '🚓', name: 'Amende de stationnement', amount: 135 },
  { t: 'fine', icon: '📸', name: 'Flashé par un radar', amount: 90 },
  { t: 'fine', icon: '⏰', name: 'Pénalité de retard', amount: 60 },
  { t: 'fine', icon: '🧾', name: 'Frais bancaires', amount: 40 },
  { t: 'gain', icon: '💶', name: 'Remboursement des impôts', amount: 450 },
  { t: 'gain', icon: '👵', name: 'Chèque de mamie', amount: 200 },
  { t: 'gain', icon: '🏅', name: 'Prime d\'ancienneté', amount: 300 },
  { t: 'gain', icon: '📦', name: 'Vente sur internet', amount: 250 },
  { t: 'gain', icon: '🎟️', name: 'Ticket à gratter gagnant', amount: 500 },
  { t: 'gain', icon: '🩹', name: 'Remboursement de la mutuelle', amount: 120 },
  { t: 'give', icon: '🐕', name: 'Votre chien a ravagé le potager du voisin', amount: 150 },
  { t: 'give', icon: '⚽', name: 'Ballon dans la vitre du voisin', amount: 200 },
  { t: 'take', icon: '🤝', name: 'Un ami vous rembourse un vieux prêt', amount: 200 },
  { t: 'take', icon: '🎁', name: 'Votre voisin vous rachète votre tondeuse', amount: 150 },
  { t: 'ad', icon: '📰', name: 'Prospectus du supermarché', text: 'Direction le bac de recyclage.' },
  { t: 'ad', icon: '🍕', name: 'Menu de la pizzeria du coin', text: 'Ça donne faim, mais rien à payer.' },
  { t: 'ad', icon: '✈️', name: 'Catalogue de voyages', text: 'On peut toujours rêver…' },
  { t: 'goto', icon: '🛍️', name: 'Un client vous attend', to: 'buyer', text: 'Avancez jusqu\'au prochain acheteur.' },
  { t: 'goto', icon: '🏷️', name: 'Bon plan repéré', to: 'deal', text: 'Avancez jusqu\'à la prochaine affaire.' },
];

/** Affaires : prix d'achat → prix de revente à un acheteur. */
const DEALS = [
  { icon: '🚲', name: 'Vélo vintage', cost: 600, value: 1100 },
  { icon: '🎮', name: 'Console rétro', cost: 900, value: 1700 },
  { icon: '💿', name: 'Lot de vinyles', cost: 400, value: 800 },
  { icon: '🛋️', name: 'Canapé design', cost: 1200, value: 2100 },
  { icon: '⌚', name: 'Montre de collection', cost: 2500, value: 4200 },
  { icon: '🖼️', name: 'Tableau d\'artiste', cost: 3000, value: 5200 },
  { icon: '🛵', name: 'Scooter d\'occasion', cost: 1500, value: 2600 },
  { icon: '🚚', name: 'Food truck', cost: 4000, value: 6800 },
  { icon: '🚐', name: 'Van aménagé', cost: 3500, value: 5600 },
  { icon: '☕', name: 'Machine à café pro', cost: 700, value: 1300 },
  { icon: '🚁', name: 'Drone', cost: 800, value: 1400 },
  { icon: '🎸', name: 'Guitare électrique', cost: 1000, value: 1800 },
  { icon: '🛴', name: 'Trottinette électrique', cost: 450, value: 850 },
  { icon: '🏚️', name: 'Studio à rénover', cost: 6000, value: 10000 },
  { icon: '🍷', name: 'Cave à vin', cost: 2000, value: 3400 },
  { icon: '👟', name: 'Baskets en édition limitée', cost: 1100, value: 2000 },
  { icon: '🎱', name: 'Billard', cost: 1800, value: 3000 },
  { icon: '📷', name: 'Appareil photo argentique', cost: 500, value: 950 },
  { icon: '🛶', name: 'Kayak', cost: 650, value: 1150 },
  { icon: '🍬', name: 'Distributeur de bonbons', cost: 300, value: 600 },
  { icon: '💍', name: 'Bijoux anciens', cost: 2200, value: 3900 },
  { icon: '📻', name: 'Juke-box', cost: 2800, value: 4700 },
  { icon: '⛵', name: 'Petit voilier', cost: 5000, value: 8200 },
  { icon: '🧁', name: 'Robot pâtissier', cost: 350, value: 700 },
];

module.exports = { DAYS, PAYDAY, MAIL, DEALS };
