#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Platform hackathon bootstrap — runs once on first EC2 launch.
# Rendered by OpenTofu templatefile(); all $${var} are substituted at plan time.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail
exec > >(tee /var/log/platform-bootstrap.log | logger -t platform-bootstrap) 2>&1

echo "=== Platform hackathon bootstrap started ==="

# ── 1. System packages ────────────────────────────────────────────────────────
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y --no-install-recommends \
  ca-certificates \
  curl \
  gnupg \
  unzip \
  awscli \
  postgresql-client

# ── 2. Docker + Compose plugin ────────────────────────────────────────────────
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
  | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg

echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  | tee /etc/apt/sources.list.d/docker.list > /dev/null

apt-get update -qq
apt-get install -y --no-install-recommends \
  docker-ce \
  docker-ce-cli \
  containerd.io \
  docker-buildx-plugin \
  docker-compose-plugin

systemctl enable --now docker

# ── 3. Write .env ─────────────────────────────────────────────────────────────
mkdir -p /opt/platform
cat > /opt/seta/.env <<'ENV'
NODE_ENV=production
PLATFORM_IMAGE_SERVER=${ecr_registry}/${ecr_repository}:server-latest
PLATFORM_IMAGE_WEB=${ecr_registry}/${ecr_repository}:web-latest
PLATFORM_MODULES=*
PLATFORM_DOMAIN=${domain}
PLATFORM_ACME_EMAIL=${acme_email}
PLATFORM_TLS_MODE=letsencrypt

DATABASE_URL=postgres://seta:${postgres_password}@postgres:5432/seta
POSTGRES_USER=seta
POSTGRES_PASSWORD=${postgres_password}
POSTGRES_DB=seta

NODE_ENV=production
PORT=3000
PUBLIC_URL=https://${domain}
BETTER_AUTH_SECRET=${better_auth_secret}
SESSION_COOKIE_SAMESITE=strict
CORS_ORIGINS=https://${domain}
EVENTS_RETENTION_DAYS=30
DLQ_ALERT_THRESHOLD=100

OPENAI_API_KEY=${openai_api_key}
COPILOT_MODEL=${copilot_model}

KNOWLEDGE_AV_REQUIRED=false
MAILER_DEFAULT_TRANSPORT=dev-stub
MAILER_DEFAULT_SENDER=noreply@${domain}
CRYPTO_KEY_PROVIDER=env
ENV
# Write crypto key separately (generated fresh at bootstrap, not from tfvars)
CRYPTO_KEY=$(openssl rand -hex 32)
echo "CRYPTO_LOCAL_MASTER_KEY=$CRYPTO_KEY" >> /opt/seta/.env

chmod 600 /opt/seta/.env

# ── 4. Pull compose + Traefik config from repo ───────────────────────────────
REPO_RAW="https://raw.githubusercontent.com/Seta-International/agent-platform/main"

curl -fsSL "$REPO_RAW/compose.yml" -o /opt/platform/compose.yml

mkdir -p /opt/platform/infra/traefik/dynamic
curl -fsSL "$REPO_RAW/infra/traefik/traefik.yml" \
  -o /opt/platform/infra/traefik/traefik.yml
curl -fsSL "$REPO_RAW/infra/traefik/dynamic/routes.yml" \
  -o /opt/platform/infra/traefik/dynamic/routes.yml

# Substitute domain placeholder written by OpenTofu into routes.yml
sed -i "s/DOMAIN_PLACEHOLDER/${domain}/g" /opt/platform/infra/traefik/dynamic/routes.yml

# Generate Jaeger BasicAuth credentials (htpasswd apr1 format)
JAEGER_HASH=$(openssl passwd -apr1 "${jaeger_auth_password}")
printf '%s:%s\n' "${jaeger_auth_user}" "$JAEGER_HASH" \
  > /opt/platform/infra/traefik/jaeger-auth
chmod 600 /opt/platform/infra/traefik/jaeger-auth

# ── 5. Login to ECR then pull images + start stack ──────────────────────────
cd /opt/platform
aws ecr get-login-password --region ${aws_region} \
  | docker login --username AWS --password-stdin ${ecr_registry}
docker compose --env-file /opt/seta/.env pull --quiet
docker compose --env-file /opt/seta/.env up -d

# ── 6. Wait for Postgres then run migrations ──────────────────────────────────
echo "Waiting for postgres to be healthy..."
for i in $(seq 1 30); do
  docker compose --env-file /opt/seta/.env exec -T postgres \
    pg_isready -U seta -d seta -q && break
  sleep 3
done

docker compose --env-file /opt/seta/.env run --rm migrator

echo "=== Stack up and migrated ==="

# ── 7. Backup script ─────────────────────────────────────────────────────────
cat > /usr/local/bin/platform-backup.sh <<'BACKUP'
#!/usr/bin/env bash
# Daily pg_dump → S3. Called by cron at 03:30 UTC.
set -euo pipefail

BUCKET="${backup_bucket}"
REGION="${aws_region}"
DATE=$(date -u +%Y-%m-%d)
BACKUP_FILE="/tmp/platform-pg-$DATE.dump"

source /opt/seta/.env

# Dump
docker compose -f /opt/platform/compose.yml --env-file /opt/seta/.env \
  exec -T postgres \
  pg_dump -U "$POSTGRES_USER" -Fc "$POSTGRES_DB" > "$BACKUP_FILE"

# Upload
aws s3 cp "$BACKUP_FILE" "s3://$BUCKET/db/$DATE/seta.dump" \
  --region "$REGION" \
  --no-progress

rm -f "$BACKUP_FILE"

echo "Backup complete: s3://$BUCKET/db/$DATE/seta.dump"
BACKUP

chmod +x /usr/local/bin/platform-backup.sh

# ── 8. Cron: daily backup at 03:30 UTC ───────────────────────────────────────
echo "30 3 * * * root /usr/local/bin/platform-backup.sh >> /var/log/platform-backup.log 2>&1" \
  > /etc/cron.d/platform-backup
chmod 644 /etc/cron.d/platform-backup

# ── 9. Restore helper (run manually when needed) ─────────────────────────────
cat > /usr/local/bin/platform-restore.sh <<'RESTORE'
#!/usr/bin/env bash
# Usage: platform-restore.sh 2026-05-26
# Restores the specified date's dump from S3 into the running postgres container.
set -euo pipefail

DATE="$${1:?Usage: platform-restore.sh YYYY-MM-DD}"
BUCKET="${backup_bucket}"
REGION="${aws_region}"
RESTORE_FILE="/tmp/platform-pg-restore.dump"

source /opt/seta/.env

aws s3 cp "s3://$BUCKET/db/$DATE/seta.dump" "$RESTORE_FILE" \
  --region "$REGION"

docker compose -f /opt/platform/compose.yml --env-file /opt/seta/.env \
  exec -T postgres \
  pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists "$RESTORE_FILE"

rm -f "$RESTORE_FILE"
echo "Restore from $DATE complete."
RESTORE

chmod +x /usr/local/bin/platform-restore.sh

echo "=== Bootstrap complete. App: https://${domain} ==="
