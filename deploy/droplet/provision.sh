#!/bin/bash
# GridSync droplet setup: Node 24, Caddy (HTTPS), systemd service, and a timer that
# deploys GridSyncDev/GridSync-Main@main whenever it changes. Run as root.
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive

REPO=https://github.com/GridSyncDev/GridSync-Main.git
BASE=/opt/gridsync

# 2 GB swap so `next build` never runs out of memory.
if ! swapon --show | grep -q /swapfile; then
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

apt-get update -q
apt-get install -y -q git curl ca-certificates gnupg debian-keyring debian-archive-keyring apt-transport-https ufw

if ! command -v node >/dev/null || ! node -v | grep -q '^v24'; then
  curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
  apt-get install -y -q nodejs
fi

if ! command -v caddy >/dev/null; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -q && apt-get install -y -q caddy
fi

id gridsync >/dev/null 2>&1 || useradd -m -s /bin/bash gridsync
mkdir -p $BASE/releases
install -m 600 -o gridsync -g gridsync /root/gridsync.env $BASE/env.local
chown -R gridsync:gridsync $BASE

# Deploy: build the new commit in its own folder, switch only if the build succeeds.
cat > $BASE/deploy.sh <<'EOF'
#!/bin/bash
set -euo pipefail
BASE=/opt/gridsync
REPO=https://github.com/GridSyncDev/GridSync-Main.git
exec 9>/tmp/gridsync-deploy.lock
flock -n 9 || exit 0
SHA=$(git ls-remote "$REPO" refs/heads/main | cut -f1)
[ -n "$SHA" ] || { echo "could not read main"; exit 1; }
CURRENT=$(readlink -f $BASE/current 2>/dev/null | xargs -r basename || true)
if [ "$SHA" = "$CURRENT" ] && [ "${1:-}" != "--force" ]; then exit 0; fi
echo "$(date -u +%FT%TZ) deploying $SHA (was ${CURRENT:-none})"
DIR=$BASE/releases/$SHA
rm -rf "$DIR"
sudo -u gridsync bash -lc "set -e
  git clone -q --depth 1 --branch main '$REPO' '$DIR'
  cd '$DIR'
  git checkout -q '$SHA' 2>/dev/null || true
  cp $BASE/env.local .env.local
  npm ci --no-audit --no-fund --loglevel=error
  npm run build"
ln -sfn "$DIR" $BASE/current.new && mv -T $BASE/current.new $BASE/current
systemctl restart gridsync
sleep 5
curl -fsS -o /dev/null http://127.0.0.1:3000/api/projects && echo "healthy at $SHA" || echo "WARNING: health check failed at $SHA"
# keep the 3 newest releases
ls -1dt $BASE/releases/*/ | tail -n +4 | xargs -r rm -rf
EOF
chmod 755 $BASE/deploy.sh

cat > /etc/systemd/system/gridsync.service <<'EOF'
[Unit]
Description=GridSync Next.js app
After=network-online.target

[Service]
User=gridsync
WorkingDirectory=/opt/gridsync/current
Environment=NODE_ENV=production
Environment=PORT=3000
ExecStart=/usr/bin/npm start -- -p 3000 -H 127.0.0.1
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

cat > /etc/systemd/system/gridsync-deploy.service <<'EOF'
[Unit]
Description=Deploy GridSync if main changed

[Service]
Type=oneshot
ExecStart=/opt/gridsync/deploy.sh
EOF

cat > /etc/systemd/system/gridsync-deploy.timer <<'EOF'
[Unit]
Description=Check GridSync main every 2 minutes

[Timer]
OnBootSec=1min
OnUnitActiveSec=2min

[Install]
WantedBy=timers.target
EOF

IP=$(curl -fsS http://169.254.169.254/metadata/v1/interfaces/public/0/ipv4/address)
HOST="$(echo "$IP" | tr . -).sslip.io"
cat > /etc/caddy/Caddyfile <<EOF
$HOST {
  encode gzip
  reverse_proxy 127.0.0.1:3000
}
EOF

ufw allow OpenSSH >/dev/null && ufw allow 80/tcp >/dev/null && ufw allow 443/tcp >/dev/null && ufw --force enable >/dev/null

systemctl daemon-reload
systemctl enable gridsync >/dev/null
$BASE/deploy.sh --force
systemctl enable --now gridsync-deploy.timer >/dev/null
systemctl reload caddy || systemctl restart caddy
echo "READY https://$HOST"
