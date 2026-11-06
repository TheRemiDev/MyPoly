#!/usr/bin/env bash
# =============================================================================
#  MyPoly — installation 100% automatique sur un VPS neuf
#  Testé sur : Ubuntu 22.04 / 24.04, Debian 11 / 12
#
#  Installe : Node.js 22, Nginx (reverse proxy + WebSocket), certificat SSL
#  Let's Encrypt (renouvellement automatique), pare-feu UFW, Fail2ban,
#  service systemd, sauvegardes quotidiennes de la base, compte administrateur.
#
#  Utilisation (interactive) :
#     sudo bash deploy/install.sh
#  Utilisation (non interactive) :
#     sudo bash deploy/install.sh --domain jeu.exemple.fr --email moi@exemple.fr \
#          --admin-user Admin --admin-email moi@exemple.fr --admin-pass 'MotDePasse!'
#  Directement depuis GitHub :
#     curl -fsSL https://raw.githubusercontent.com/TheRemiDev/MyPoly/main/deploy/install.sh | sudo bash -s -- --domain jeu.exemple.fr --email moi@exemple.fr
# =============================================================================
set -Eeuo pipefail

APP_NAME="mypoly"
APP_DIR="/opt/mypoly"
DATA_DIR="/var/lib/mypoly"
BACKUP_DIR="/var/backups/mypoly"
APP_USER="mypoly"
APP_PORT="3000"
NODE_MAJOR="22"
REPO_URL="${REPO_URL:-https://github.com/TheRemiDev/MyPoly.git}"
BRANCH="${BRANCH:-main}"

DOMAIN=""
EMAIL=""
WITH_WWW="auto"
NO_SSL="0"
ADMIN_USER=""
ADMIN_EMAIL=""
ADMIN_PASS=""

c_green='\033[1;32m'; c_yellow='\033[1;33m'; c_red='\033[1;31m'; c_blue='\033[1;34m'; c_reset='\033[0m'
step() { echo -e "\n${c_blue}▶ $*${c_reset}"; }
ok()   { echo -e "${c_green}✔ $*${c_reset}"; }
warn() { echo -e "${c_yellow}⚠ $*${c_reset}"; }
die()  { echo -e "${c_red}✖ $*${c_reset}" >&2; exit 1; }
trap 'die "Erreur ligne $LINENO. Consultez les messages ci-dessus."' ERR

usage() {
  sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'
  cat <<EOF
Options :
  --domain <nom>        Nom de domaine (ex : jeu.exemple.fr)        [obligatoire]
  --email <email>       E-mail pour Let's Encrypt                    [obligatoire sauf --no-ssl]
  --www | --no-www      Inclure (ou non) www.<domaine> dans le certificat (auto par défaut)
  --no-ssl              Ne pas demander de certificat (HTTP uniquement)
  --admin-user <pseudo> Pseudo du compte administrateur à créer
  --admin-email <email> E-mail du compte administrateur
  --admin-pass <mdp>    Mot de passe du compte administrateur (8 caractères min.)
  --repo <url>          Dépôt Git à installer (défaut : $REPO_URL)
  --branch <nom>        Branche à installer (défaut : $BRANCH)
  --port <port>         Port interne de l'application (défaut : $APP_PORT)
EOF
  exit 0
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --domain) DOMAIN="$2"; shift 2 ;;
    --email) EMAIL="$2"; shift 2 ;;
    --www) WITH_WWW="1"; shift ;;
    --no-www) WITH_WWW="0"; shift ;;
    --no-ssl) NO_SSL="1"; shift ;;
    --admin-user) ADMIN_USER="$2"; shift 2 ;;
    --admin-email) ADMIN_EMAIL="$2"; shift 2 ;;
    --admin-pass) ADMIN_PASS="$2"; shift 2 ;;
    --repo) REPO_URL="$2"; shift 2 ;;
    --branch) BRANCH="$2"; shift 2 ;;
    --port) APP_PORT="$2"; shift 2 ;;
    -h|--help) usage ;;
    *) die "Option inconnue : $1 (voir --help)" ;;
  esac
done

[[ $EUID -eq 0 ]] || die "Ce script doit être lancé en root (sudo)."
[[ -r /etc/os-release ]] || die "Système non reconnu."
. /etc/os-release
case "${ID:-}" in
  ubuntu|debian) ;;
  *) warn "Distribution ${ID:-inconnue} non testée : on continue quand même (apt requis)." ;;
esac
command -v apt-get >/dev/null || die "apt-get introuvable : seules Debian / Ubuntu sont prises en charge."

# Lecture interactive (fonctionne aussi via « curl | bash » grâce à /dev/tty)
ask() {
  local prompt="$1" var="$2" secret="${3:-0}" value=""
  if [[ -e /dev/tty ]]; then
    if [[ "$secret" == "1" ]]; then read -r -s -p "$prompt" value </dev/tty; echo >/dev/tty
    else read -r -p "$prompt" value </dev/tty; fi
  fi
  printf -v "$var" '%s' "$value"
}

echo -e "${c_green}"
cat <<'BANNER'
  __  __       ____       _
 |  \/  |_   _|  _ \ ___ | |_   _
 | |\/| | | | | |_) / _ \| | | | |
 | |  | | |_| |  __/ (_) | | |_| |
 |_|  |_|\__, |_|   \___/|_|\__, |
         |___/              |___/   Installation automatique
BANNER
echo -e "${c_reset}"

[[ -n "$DOMAIN" ]] || ask "Nom de domaine (ex : jeu.exemple.fr) : " DOMAIN
DOMAIN="${DOMAIN#http://}"; DOMAIN="${DOMAIN#https://}"; DOMAIN="${DOMAIN%%/*}"; DOMAIN="${DOMAIN,,}"
[[ "$DOMAIN" =~ ^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$ ]] || die "Nom de domaine invalide : '$DOMAIN'"
if [[ "$NO_SSL" != "1" && -z "$EMAIL" ]]; then ask "E-mail pour le certificat SSL Let's Encrypt : " EMAIL; fi
[[ "$NO_SSL" == "1" || "$EMAIL" =~ ^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$ ]] || die "E-mail invalide : '$EMAIL'"
if [[ -z "$ADMIN_USER" ]]; then
  ask "Pseudo du compte administrateur (laisser vide pour ignorer) : " ADMIN_USER
fi
if [[ -n "$ADMIN_USER" ]]; then
  [[ -n "$ADMIN_EMAIL" ]] || ADMIN_EMAIL="${EMAIL}"
  [[ -n "$ADMIN_EMAIL" ]] || ask "E-mail du compte administrateur : " ADMIN_EMAIL
  while [[ ${#ADMIN_PASS} -lt 8 ]]; do
    ask "Mot de passe administrateur (8 caractères min.) : " ADMIN_PASS 1
    [[ -e /dev/tty ]] || break
  done
fi

export DEBIAN_FRONTEND=noninteractive

# --------------------------------------------------------------- paquets
step "Mise à jour du système et installation des dépendances"
apt-get update -qq
apt-get install -y -qq curl ca-certificates gnupg git rsync nginx ufw fail2ban sqlite3 dnsutils build-essential python3 cron >/dev/null
if [[ "$NO_SSL" != "1" ]]; then apt-get install -y -qq certbot python3-certbot-nginx >/dev/null; fi
ok "Dépendances installées"

# --------------------------------------------------------------- Node.js
step "Installation de Node.js ${NODE_MAJOR}"
need_node=1
if command -v node >/dev/null; then
  cur=$(node -p 'process.versions.node.split(".")[0]')
  [[ "$cur" -ge 20 ]] && need_node=0
fi
if [[ $need_node -eq 1 ]]; then
  install -d -m 0755 /etc/apt/keyrings
  curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor --yes -o /etc/apt/keyrings/nodesource.gpg
  echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_${NODE_MAJOR}.x nodistro main" > /etc/apt/sources.list.d/nodesource.list
  apt-get update -qq
  apt-get install -y -qq nodejs >/dev/null
fi
ok "Node.js $(node -v)"

# --------------------------------------------------------------- utilisateur
step "Création de l'utilisateur système « ${APP_USER} »"
id "$APP_USER" &>/dev/null || useradd --system --home "$APP_DIR" --shell /usr/sbin/nologin "$APP_USER"
install -d -o "$APP_USER" -g "$APP_USER" -m 0750 "$DATA_DIR"
install -d -m 0750 "$BACKUP_DIR"
ok "Utilisateur prêt"

# --------------------------------------------------------------- code source
step "Récupération du code de MyPoly"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" 2>/dev/null && pwd || echo /nonexistent)"
SRC_DIR="$(dirname "$SCRIPT_DIR")"
if [[ -f "$SRC_DIR/package.json" ]] && grep -q '"name": "mypoly"' "$SRC_DIR/package.json" && [[ "$SRC_DIR" != "$APP_DIR" ]]; then
  echo "Copie depuis $SRC_DIR"
  install -d "$APP_DIR"
  rsync -a --delete --exclude node_modules --exclude data --exclude .env "$SRC_DIR/" "$APP_DIR/"
elif [[ -d "$APP_DIR/.git" ]]; then
  echo "Mise à jour du dépôt existant"
  git -C "$APP_DIR" fetch --quiet origin "$BRANCH"
  git -C "$APP_DIR" reset --quiet --hard "origin/$BRANCH"
elif [[ -f "$APP_DIR/package.json" ]]; then
  echo "Code déjà présent dans $APP_DIR"
else
  git clone --quiet --depth 1 --branch "$BRANCH" "$REPO_URL" "$APP_DIR" || die "Impossible de cloner $REPO_URL (dépôt privé ? copiez le code sur le serveur et lancez deploy/install.sh depuis ce dossier)."
fi
chown -R "$APP_USER:$APP_USER" "$APP_DIR"
git config --global --add safe.directory "$APP_DIR" 2>/dev/null || true
ok "Code installé dans $APP_DIR"

step "Installation des modules Node.js"
cd "$APP_DIR"
sudo -u "$APP_USER" -H bash -c "cd '$APP_DIR' && npm ci --omit=dev --no-audit --no-fund --loglevel=error"
ok "Modules installés"

# --------------------------------------------------------------- configuration
step "Configuration (.env)"
SCHEME="https"; [[ "$NO_SSL" == "1" ]] && SCHEME="http"
ENV_FILE="$APP_DIR/.env"
if [[ -f "$ENV_FILE" ]] && grep -q '^JWT_SECRET=' "$ENV_FILE"; then
  JWT_SECRET=$(grep '^JWT_SECRET=' "$ENV_FILE" | cut -d= -f2-)
else
  JWT_SECRET=$(openssl rand -hex 48 2>/dev/null || head -c 48 /dev/urandom | od -An -tx1 | tr -d ' \n')
fi
cat > "$ENV_FILE" <<EOF
# Généré par deploy/install.sh le $(date -Iseconds)
NODE_ENV=production
HOST=127.0.0.1
PORT=${APP_PORT}
PUBLIC_URL=${SCHEME}://${DOMAIN}
DATA_DIR=${DATA_DIR}
TRUST_PROXY=1
JWT_SECRET=${JWT_SECRET}
EOF
chown "$APP_USER:$APP_USER" "$ENV_FILE"
chmod 600 "$ENV_FILE"
ok "Configuration écrite"

# --------------------------------------------------------------- systemd
step "Service systemd"
cat > /etc/systemd/system/${APP_NAME}.service <<EOF
[Unit]
Description=MyPoly - jeu de plateau multijoueur
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${APP_USER}
Group=${APP_USER}
WorkingDirectory=${APP_DIR}
EnvironmentFile=${ENV_FILE}
ExecStart=/usr/bin/env node server/index.js
Restart=always
RestartSec=3
KillSignal=SIGTERM
TimeoutStopSec=10
LimitNOFILE=65536
# Durcissement
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=${DATA_DIR}
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectControlGroups=true
RestrictSUIDSGID=true
LockPersonality=true

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable --quiet ${APP_NAME}
systemctl restart ${APP_NAME}
for i in {1..20}; do
  curl -fsS "http://127.0.0.1:${APP_PORT}/api/health" >/dev/null 2>&1 && break
  sleep 1
done
curl -fsS "http://127.0.0.1:${APP_PORT}/api/health" >/dev/null || { journalctl -u ${APP_NAME} -n 40 --no-pager; die "L'application ne démarre pas."; }
ok "MyPoly tourne sur le port ${APP_PORT}"

# --------------------------------------------------------------- DNS
step "Vérification du DNS"
PUBLIC_IP4=$(curl -4 -fsS --max-time 6 https://api.ipify.org 2>/dev/null || true)
PUBLIC_IP6=$(curl -6 -fsS --max-time 6 https://api64.ipify.org 2>/dev/null || true)
DNS_A=$(dig +short A "$DOMAIN" | tail -n1 || true)
DNS_AAAA=$(dig +short AAAA "$DOMAIN" | tail -n1 || true)
DNS_OK=0
if [[ -n "$DNS_A" && "$DNS_A" == "$PUBLIC_IP4" ]] || [[ -n "$DNS_AAAA" && -n "$PUBLIC_IP6" && "$DNS_AAAA" == "$PUBLIC_IP6" ]]; then
  DNS_OK=1; ok "$DOMAIN pointe bien vers ce serveur (${DNS_A:-$DNS_AAAA})"
else
  warn "$DOMAIN pointe vers '${DNS_A:-aucune IP}' alors que ce serveur est '${PUBLIC_IP4:-?}'."
  warn "Créez un enregistrement DNS de type A : $DOMAIN → ${PUBLIC_IP4:-<IP du VPS>}"
fi
if [[ "$WITH_WWW" == "auto" ]]; then
  WWW_A=$(dig +short A "www.$DOMAIN" | tail -n1 || true)
  if [[ -n "$WWW_A" && "$WWW_A" == "$PUBLIC_IP4" && "$DOMAIN" != www.* ]]; then WITH_WWW="1"; else WITH_WWW="0"; fi
fi
SERVER_NAMES="$DOMAIN"; [[ "$WITH_WWW" == "1" ]] && SERVER_NAMES="$DOMAIN www.$DOMAIN"

# --------------------------------------------------------------- nginx
step "Configuration de Nginx"
cat > /etc/nginx/sites-available/${APP_NAME}.conf <<EOF
# MyPoly — généré par deploy/install.sh
map \$http_upgrade \$connection_upgrade {
    default upgrade;
    ''      close;
}

upstream mypoly_app {
    server 127.0.0.1:${APP_PORT};
    keepalive 32;
}

server {
    listen 80;
    listen [::]:80;
    server_name ${SERVER_NAMES};

    client_max_body_size 1m;
    server_tokens off;

    gzip on;
    gzip_types text/css application/javascript application/json image/svg+xml application/manifest+json;
    gzip_min_length 1024;

    location /socket.io/ {
        proxy_pass http://mypoly_app;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection \$connection_upgrade;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
        proxy_buffering off;
    }

    location / {
        proxy_pass http://mypoly_app;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF
ln -sf /etc/nginx/sites-available/${APP_NAME}.conf /etc/nginx/sites-enabled/${APP_NAME}.conf
rm -f /etc/nginx/sites-enabled/default
nginx -t -q
systemctl enable --quiet nginx
systemctl reload nginx || systemctl restart nginx
ok "Nginx configuré pour $SERVER_NAMES"

# --------------------------------------------------------------- pare-feu
step "Pare-feu (UFW) et Fail2ban"
SSH_PORT=$(ss -tlnp 2>/dev/null | awk '/sshd/ {split($4,a,":"); print a[length(a)]; exit}')
ufw allow "${SSH_PORT:-22}/tcp" >/dev/null
ufw allow 'Nginx Full' >/dev/null
ufw --force enable >/dev/null
systemctl enable --quiet --now fail2ban || true
ok "Ports ouverts : SSH (${SSH_PORT:-22}), HTTP (80), HTTPS (443)"

# --------------------------------------------------------------- SSL
SSL_OK=0
if [[ "$NO_SSL" != "1" ]]; then
  step "Certificat SSL Let's Encrypt"
  CERT_ARGS=(-d "$DOMAIN"); [[ "$WITH_WWW" == "1" ]] && CERT_ARGS+=(-d "www.$DOMAIN")
  if certbot --nginx "${CERT_ARGS[@]}" --non-interactive --agree-tos -m "$EMAIL" --redirect --keep-until-expiring; then
    SSL_OK=1
    install -d /etc/letsencrypt/renewal-hooks/deploy
    printf '#!/bin/sh\nsystemctl reload nginx\n' > /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh
    chmod +x /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh
    systemctl enable --quiet --now certbot.timer 2>/dev/null || true
    ok "HTTPS actif, renouvellement automatique configuré"
  else
    warn "Échec de l'obtention du certificat (DNS pas encore propagé ?)."
    warn "Le site reste accessible en HTTP. Relancez plus tard : sudo mypoly ssl"
    sed -i "s#^PUBLIC_URL=.*#PUBLIC_URL=http://${DOMAIN}#" "$ENV_FILE"
    systemctl restart ${APP_NAME}
  fi
fi

# --------------------------------------------------------------- sauvegardes
step "Sauvegardes automatiques quotidiennes"
cat > /usr/local/sbin/mypoly-backup <<EOF
#!/bin/sh
# Sauvegarde à chaud de la base SQLite de MyPoly (conserve 14 jours)
set -e
mkdir -p ${BACKUP_DIR}
sqlite3 ${DATA_DIR}/mypoly.db ".backup '${BACKUP_DIR}/mypoly-\$(date +%Y%m%d-%H%M%S).db'"
gzip -f ${BACKUP_DIR}/mypoly-*.db 2>/dev/null || true
find ${BACKUP_DIR} -name 'mypoly-*.db.gz' -mtime +14 -delete
EOF
chmod 750 /usr/local/sbin/mypoly-backup
echo "17 4 * * * root /usr/local/sbin/mypoly-backup >/dev/null 2>&1" > /etc/cron.d/mypoly-backup
ok "Sauvegarde chaque nuit dans $BACKUP_DIR (14 jours conservés)"

# --------------------------------------------------------------- outil CLI
step "Commande d'administration « mypoly »"
cat > /usr/local/bin/mypoly <<EOF
#!/usr/bin/env bash
# Outil d'administration de MyPoly
set -e
APP_DIR="${APP_DIR}"
run_app() { sudo -u ${APP_USER} -H bash -c "cd \$APP_DIR && set -a && . ./.env && set +a && \$*"; }
case "\${1:-}" in
  status)  systemctl status ${APP_NAME} --no-pager ;;
  logs)    journalctl -u ${APP_NAME} -f -n 100 ;;
  restart) systemctl restart ${APP_NAME} && echo "MyPoly redémarré." ;;
  stop)    systemctl stop ${APP_NAME} ;;
  start)   systemctl start ${APP_NAME} ;;
  update)
    if [ -d "\$APP_DIR/.git" ]; then
      git -C "\$APP_DIR" fetch --quiet origin && git -C "\$APP_DIR" reset --quiet --hard "origin/\$(git -C "\$APP_DIR" rev-parse --abbrev-ref HEAD)"
    else
      echo "Pas de dépôt Git : copiez la nouvelle version puis relancez deploy/install.sh"; exit 1
    fi
    chown -R ${APP_USER}:${APP_USER} "\$APP_DIR"
    /usr/local/sbin/mypoly-backup || true
    run_app "npm ci --omit=dev --no-audit --no-fund --loglevel=error"
    systemctl restart ${APP_NAME} && echo "MyPoly mis à jour et redémarré." ;;
  backup)  /usr/local/sbin/mypoly-backup && ls -lh ${BACKUP_DIR} | tail -5 ;;
  admin)
    [ -n "\${2:-}" ] || { echo "Usage : mypoly admin <pseudo> [email] [motdepasse]"; exit 1; }
    run_app "node scripts/create-admin.js '\$2' '\${3:-}' '\${4:-}'" ;;
  ssl)
    certbot --nginx -d ${DOMAIN} $( [[ "$WITH_WWW" == "1" ]] && echo "-d www.${DOMAIN}" ) --non-interactive --agree-tos -m '${EMAIL:-admin@${DOMAIN}}' --redirect --keep-until-expiring
    sed -i "s#^PUBLIC_URL=.*#PUBLIC_URL=https://${DOMAIN}#" "\$APP_DIR/.env"
    systemctl restart ${APP_NAME} && echo "HTTPS activé." ;;
  *)
    echo "Usage : mypoly {status|logs|restart|start|stop|update|backup|admin <pseudo> [email] [mdp]|ssl}" ;;
esac
EOF
chmod 755 /usr/local/bin/mypoly
ok "Commande « mypoly » disponible"

# --------------------------------------------------------------- admin
if [[ -n "$ADMIN_USER" ]]; then
  step "Compte administrateur"
  if sudo -u "$APP_USER" -H env $(grep -v '^#' "$ENV_FILE" | xargs) node "$APP_DIR/scripts/create-admin.js" "$ADMIN_USER" "$ADMIN_EMAIL" "$ADMIN_PASS"; then
    ok "Administrateur « $ADMIN_USER » prêt"
  else
    warn "Création de l'administrateur impossible. Plus tard : sudo mypoly admin <pseudo> <email> <motdepasse>"
  fi
fi

# --------------------------------------------------------------- résumé
URL="http://${DOMAIN}"; [[ $SSL_OK -eq 1 ]] && URL="https://${DOMAIN}"
echo
echo -e "${c_green}════════════════════════════════════════════════════════════${c_reset}"
echo -e "${c_green}  🎲 MyPoly est installé !${c_reset}"
echo -e "${c_green}════════════════════════════════════════════════════════════${c_reset}"
echo -e "  Site            : ${URL}"
[[ -n "$ADMIN_USER" ]] && echo -e "  Administrateur  : ${ADMIN_USER} (panneau : ${URL}/admin)"
echo -e "  Code            : ${APP_DIR}"
echo -e "  Données         : ${DATA_DIR}"
echo -e "  Sauvegardes     : ${BACKUP_DIR}"
echo
echo -e "  Commandes utiles :"
echo -e "    mypoly status | logs | restart | update | backup | ssl"
echo -e "    mypoly admin <pseudo> [email] [motdepasse]"
[[ $DNS_OK -eq 0 ]] && echo -e "\n${c_yellow}  ⚠ Pensez à faire pointer le DNS de ${DOMAIN} vers ${PUBLIC_IP4:-ce serveur}, puis : sudo mypoly ssl${c_reset}"
echo
