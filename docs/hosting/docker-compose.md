# Docker Compose quickstart

This is the supported self-host install path. End-to-end clock time on a fresh Ubuntu 24.04 VPS with Docker preinstalled: ≤5 minutes from clone to login screen.

## Prerequisites

- Linux host with ≥4 GB RAM and ≥20 GB free disk.
- Docker Engine 27+ with `docker compose` v2.
- A DNS A-record pointing at the host (Traefik provisions Let's Encrypt automatically).
- Outbound HTTPS to GHCR (`ghcr.io`) and Let's Encrypt (`acme-v02.api.letsencrypt.org`).

## Five-minute install

1. Clone the repo at the version tag you want to install:
   ```bash
   git clone --depth 1 --branch v0.1.0 https://github.com/seta-io/agent-platform.git seta && cd seta
   ```

2. Copy the env template and edit the required values:
   ```bash
   cp .env.example .env
   chmod 600 .env
   $EDITOR .env
   ```
   Required edits (see [`configuration.md`](configuration.md) for the full list): `SETA_DOMAIN`, `SETA_ACME_EMAIL`, `POSTGRES_PASSWORD`, `BETTER_AUTH_SECRET`. For first-try local installs, leave `SETA_TLS_MODE=self-signed` and `SETA_DOMAIN=localhost`.

3. Pull and start the stack:
   ```bash
   docker compose pull
   docker compose up -d
   ```

4. Run database migrations (one-shot container, exits when done):
   ```bash
   docker compose run --rm migrator
   ```

5. (Optional, for demo data) Seed:
   ```bash
   docker compose run --rm server seed
   ```

6. Open `https://${SETA_DOMAIN}` and log in with the bootstrap credentials printed to the `server` logs:
   ```bash
   docker compose logs server | grep -i 'bootstrap'
   ```

## What got installed

| Service | Image | Role |
|---|---|---|
| `proxy` | `traefik:v3` | Reverse proxy, Let's Encrypt or self-signed TLS, port 443. |
| `web` | `${SETA_IMAGE_WEB}` | Static React bundle, served by `proxy`. |
| `server` | `${SETA_IMAGE_SERVER}` | API + workers, default `SETA_MODULES=*`. |
| `migrator` | `${SETA_IMAGE_SERVER}` | One-shot `seta-server migrate`. `depends_on: postgres healthy`. |
| `postgres` | `pgvector/pgvector:pg17-trixie` | Persistent named volume. |

## Verifying the install

- `docker compose ps` — all services `running`/`healthy`; `migrator` `exited (0)`.
- `curl -sfk https://${SETA_DOMAIN}/healthz` — returns `{"status":"ok"}`. (`-k` for `self-signed`.)
- Log in with the bootstrap user from step 6 above.

## Common first-install issues

- **Let's Encrypt rate-limited.** Cause: testing repeatedly against the same domain. Fix: temporarily set `SETA_TLS_MODE=self-signed` in `.env`, restart `proxy`.
- **Postgres pull is slow.** Pre-pull: `docker pull pgvector/pgvector:pg17-trixie`.
- **Bootstrap credentials not in logs.** `migrator` must succeed before first `server` start. Rerun `docker compose run --rm migrator`, then `docker compose restart server`.
- **Permission denied binding to :443.** Run Docker as root, or use rootless Docker with `cap_add: NET_BIND_SERVICE`.
- **`POSTGRES_PASSWORD` and `BETTER_AUTH_SECRET` are required and empty by default.** The compose stack will refuse to start until you set them.

## Next steps

- Tune any env var → [`configuration.md`](configuration.md).
- Plan your upgrade strategy → [`upgrading.md`](upgrading.md).
- Outgrowing one VPS → [`scaling.md`](scaling.md).
