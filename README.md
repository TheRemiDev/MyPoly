# 🎲 MyPoly

**MyPoly** est un jeu de plateau de magnats multijoueur, gratuit et jouable dans le navigateur (dans l'esprit de *Business Tour*). On achète des villes du monde entier, on construit des maisons et des hôtels, on rachète les propriétés des adversaires et on vise le triple monopole.

- 🏠 **Salles privées gratuites** : un code à 6 caractères ou un lien à partager, sans téléchargement.
- ⚙️ **Règles configurables** : argent de départ, salaire, chrono par décision, durée de partie, nombre de tours, rachat (et son prix), construction dès l'achat, Festival, loyer doublé par pays, conditions de victoire (triple monopole, monopole de ligne, **monopole balnéaire**), amendes, billet d'avion, impôts, salle publique ou privée, spectateurs. Préréglages Classique, Blitz, Longue et Détente.
- 🤖 **Bots** pour compléter une table ou jouer seul. Un joueur déconnecté est joué automatiquement jusqu'à son retour (reconnexion transparente).
- 👤 **Comptes** : inscription et connexion, profil personnalisable (pion, couleur, bio), statistiques détaillées, historique des parties, XP et niveaux, classement (points, victoires, % de victoires, record de fortune…).
- 🎖️ **21 badges** à débloquer : première victoire, séries, triple monopole, roi des plages, requin, multimillionnaire, remontada…
- 👑 **VIP** et 🛡️ **STAFF / ⚡ ADMIN** : badges visibles partout, en jeu compris (cartes joueurs, pions dorés, chat, salon). Les VIP ont des pions, des couleurs exclusives et un pseudo doré.
- 🛡️ **Panneau d'administration** : statistiques globales, recherche de joueurs, attribution du VIP (30 jours ou à vie), rôles, bannissements, réinitialisation des stats, salles en direct (observer, fermer), annonces globales, journal d'audit.
- 🎮 **Plateau 3D en temps réel (WebGL / Three.js)** : vrai plateau en volume avec éclairage et ombres, cases illustrées très lisibles (monument, drapeau, prix), **maisons et hôtels 3D qui tombent et se construisent** sous vos yeux à la couleur du propriétaire, drapeau planté à l'achat, pions sculptés qui sautent de case en case, dés 3D lancés sur la table, pièces d'or qui volent lors des paiements, Festival animé, caméra orientable (glisser, molette ou pincer, double-clic pour recentrer). Le plateau 2D reste disponible d'un clic (et sert de secours sans WebGL). Également : plein écran (touche **F**), dés 3D, déplacements animés case par case, cartes Chance qui se retournent, effets sonores synthétisés, émotes, chat, confettis, interface adaptée au mobile.
- 🎲 **100 % aléatoire** : les dés, le mélange des cartes et les tirages sont faits **uniquement côté serveur** avec `crypto.randomInt` (générateur cryptographique du système, voir `server/game/random.js`). Rien n'est scripté et le client ne fait qu'afficher le résultat.

---

## 🚀 Installation sur un VPS neuf (100 % automatique)

Prérequis : un VPS **Ubuntu 22.04/24.04** ou **Debian 11/12** et un nom de domaine dont l'enregistrement **A** pointe vers l'IP du VPS.

```bash
git clone https://github.com/TheRemiDev/MyPoly.git
cd MyPoly
sudo bash deploy/install.sh
```

Le script pose ses questions (domaine, e-mail, compte admin). En mode non interactif :

```bash
sudo bash deploy/install.sh \
  --domain jeu.exemple.fr \
  --email moi@exemple.fr \
  --admin-user Admin --admin-email moi@exemple.fr --admin-pass 'UnMotDePasseSolide'
```

Le script installe et configure tout :

| Étape | Détail |
|---|---|
| Node.js 22 | via NodeSource |
| Application | dans `/opt/mypoly`, exécutée par l'utilisateur système `mypoly` |
| Service | `systemd` avec redémarrage automatique et durcissement |
| Nginx | reverse proxy avec WebSocket et gzip |
| SSL | certificat Let's Encrypt, redirection HTTP → HTTPS, renouvellement automatique |
| Sécurité | pare-feu UFW (SSH, 80, 443) et Fail2ban |
| Base de données | SQLite dans `/var/lib/mypoly`, sauvegardée chaque nuit dans `/var/backups/mypoly` (14 jours conservés) |
| Vérification DNS | le script avertit si le domaine ne pointe pas vers le serveur |

Options : `--www` / `--no-www`, `--no-ssl`, `--port`, `--repo`, `--branch` (voir `--help`).

### Administration du serveur

```bash
mypoly status      # état du service
mypoly logs        # journaux en direct
mypoly restart     # redémarrer
mypoly update      # mettre à jour depuis Git (sauvegarde automatique avant)
mypoly version     # version installée
mypoly backup      # sauvegarde immédiate
mypoly ssl         # (ré)obtenir le certificat HTTPS
mypoly admin Pseudo                     # promouvoir un compte existant en admin
mypoly admin Pseudo email motdepasse    # créer un compte admin
```

### 🔄 Mettre à jour le jeu

1. Prévenez les joueurs (panneau **/admin** → *Annonce globale*) : les parties en cours sont interrompues au redémarrage. Les comptes, statistiques et badges, eux, sont conservés.
2. Sur le serveur :

```bash
sudo mypoly update
```

La commande sauvegarde la base, récupère la dernière version de la branche installée, met à jour les dépendances et redémarre le service. Elle affiche ensuite la version avant et après (`mypoly version` pour la consulter). Les navigateurs des joueurs se reconnectent tout seuls et reçoivent directement la nouvelle version.

En cas de problème : `mypoly logs` pour lire les erreurs. Pour revenir en arrière :

```bash
sudo git -C /opt/mypoly reset --hard <ancien-commit>
sudo chown -R mypoly:mypoly /opt/mypoly
sudo -u mypoly -H bash -c 'cd /opt/mypoly && npm ci --omit=dev'
sudo systemctl restart mypoly
```

Les sauvegardes de la base se trouvent dans `/var/backups/mypoly`.

Le VIP s'attribue depuis le panneau **/admin** (+30 jours, à vie, ou retrait). Les rôles `staff` et `admin` s'y gèrent aussi : seul un admin peut changer les rôles.

---

## 🧑‍💻 Développement local

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # 40 parties simulées entre bots pour valider le moteur
npm run simulate 500
node scripts/create-admin.js MonPseudo moi@exemple.fr motdepasse
```

Variables d'environnement (fichier `.env` facultatif) : `PORT`, `HOST`, `PUBLIC_URL`, `DATA_DIR`, `JWT_SECRET` (généré automatiquement s'il est absent), `TRUST_PROXY`, `NODE_ENV`.

### Architecture

```
server/
  index.js          Express, API REST, Socket.IO
  config.js         configuration (.env)
  db.js             schéma SQLite (better-sqlite3)
  auth.js           inscription / connexion (bcrypt + JWT en cookie httpOnly)
  users.js          profils, statistiques, classement, enregistrement des parties
  badges.js         définition et attribution des badges
  admin.js          API d'administration (staff / admin)
  rooms.js          salles temps réel : salon, bots, chat, reconnexion
  game/
    board.js        plateau (32 cases, 8 pays, 4 stations balnéaires)
    cards.js        cartes Chance
    engine.js       moteur de règles qui fait autorité (machine à états, chrono)
    bot.js          IA des bots et des joueurs absents
    random.js       aléatoire cryptographique (dés, cartes)
    settings.js     règles configurables et validation
public/             client web (HTML, CSS, JS modules, sans étape de build)
deploy/install.sh   installation automatique sur VPS
scripts/            simulation de parties, création d'admin
```

## 📜 Règles en bref

- **Tour** : lancez les dés. Un double fait rejouer, mais 3 doubles envoient sur l'Île déserte.
- **Villes** : achetez le terrain et posez jusqu'à 3 maisons d'un coup. L'hôtel (niveau 4) se construit sur une ville qui a déjà 3 maisons. Un pays complet double les loyers.
- **Rachat** : après avoir payé le loyer chez un adversaire, rachetez-lui sa ville (×2 sa valeur par défaut). Les hôtels ne sont pas rachetables.
- **Festival** : multiplie le loyer d'une de vos propriétés (×2, jusqu'à ×5 s'il revient au même endroit).
- **Aéroport** : au tour suivant, volez vers la case de votre choix.
- **Victoire** : faillite de tous les adversaires, triple monopole, monopole de ligne ou monopole balnéaire. Avec une limite de temps ou de tours, le joueur le plus riche l'emporte.

## Application Android

Le dossier `android/` contient l'application **MyPoly pour Android** : le site en plein écran
(tous les jeux), avec la 3D, la musique, le bouton retour, le partage natif des invitations,
les vibrations, l'écran toujours allumé pendant la partie et l'ouverture des liens `/r/CODE`
directement dans l'application.

- **Téléchargement** : `https://<votre site>/downloads/MyPoly.apk` (un bandeau l'annonce aux
  visiteurs sur Android).
- **Adresse du site** : `mypolyUrl` dans `android/gradle.properties` (ou variable GitHub
  `MYPOLY_URL`). Vide : l'application la demande au premier lancement.
- **Compilation locale** : `cd android && ./gradlew assembleRelease` (SDK Android requis).
- **Compilation automatique** : l'action GitHub « Application Android » produit l'APK à chaque
  modification de `android/` (onglet Actions → artefact `MyPoly-android`). Pour que les mises à
  jour s'installent par-dessus l'ancienne version, ajoutez la clé de signature dans les secrets
  du dépôt : `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`,
  `ANDROID_KEY_PASSWORD`.
