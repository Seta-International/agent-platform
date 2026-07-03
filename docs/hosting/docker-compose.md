# Docker Compose quickstart

This is the supported self-host install path. End-to-end clock time on a fresh Ubuntu 24.04 VPS with Docker preinstalled: ≤5 minutes from clone to login screen.

## Compose file layout

The stack is one base file plus per-env overlays; only the base auto-loads:

| File | Loaded when | Adds |
|---|---|---|
| `compose.yaml` | always | `proxy`, `web`, `server`, `worker`, `migrator`, `seeder`, bundled `postgres` (behind the `bundled-db` profile), `alloy`/`node-exporter`/`postgres-exporter` (behind `obs-agent`). |
| `compose.override.yaml` | **auto-loaded by bare `docker compose up`** — never on a deployed box | Bundled **MinIO** (+ `minio-setup`), local port-bindings, local `build:` context for `server`/`web`. |
| `compose.dev.yaml` / `compose.uat.yaml` / `compose.prod.yaml` | only when named explicitly via `COMPOSE_FILE` | Env-specific overlay: alt ports, `e2e-report` (uat), the Cloudflare-tunnel-only proxy port + `cloudwatch-exporter` (prod). |
| `compose.monitoring.yaml` | only when named explicitly | The central Prometheus + Loki + Grafana stack (runs once, on the VPS that hosts it — not per app-env). |

`docker compose` merges `compose.yaml` with whatever `compose.override.yaml` (implicit) or `-f`/`COMPOSE_FILE` (explicit) name, in order. A bare `docker compose up` on a laptop always picks up the override; a deployed box pins `COMPOSE_FILE` so the override is never in the merge (see [`deploying.md`](deploying.md#compose-mechanics)).

## Prerequisites

- Linux host with ≥4 GB RAM and ≥20 GB free disk.
- Docker Engine 27+ with `docker compose` v2.
- A DNS A-record pointing at the host (Traefik provisions Let's Encrypt automatically).
- Outbound HTTPS to your image registry (Amazon ECR — see the [image and version policy](README.md#image-and-version-policy)) and Let's Encrypt (`acme-v02.api.letsencrypt.org`).

## Five-minute install

1. Clone the repo at the version tag you want to install:
   ```bash
   git clone --depth 1 --branch v0.1.0 https://github.com/Seta-International/agent-platform.git seta && cd seta
   ```

2. Copy the env template and edit the required values:
   ```bash
   cp .env.example .env
   chmod 600 .env
   $EDITOR .env
   ```
   Required edits (see [`configuration.md`](configuration.md) for the full list): `PLATFORM_DOMAIN`, `PLATFORM_ACME_EMAIL`, `POSTGRES_PASSWORD`, `BETTER_AUTH_SECRET`. For first-try local installs, leave `PLATFORM_TLS_MODE=self-signed` and `PLATFORM_DOMAIN=localhost`. Also add `COMPOSE_PROFILES=bundled-db` — the bundled `postgres` sits behind that profile so it doesn't start by accident on boxes that point `DATABASE_URL` at an external database.

3. Pull and start the stack. A bare `docker compose up` auto-loads `compose.override.yaml` on top of `compose.yaml`, which brings in bundled **MinIO** — this install path never needs AWS credentials:
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
   docker compose run --rm seeder
   ```
   `seeder` is a dedicated one-shot service behind the `seed` profile; `docker compose run` auto-enables the profile of the named service, so `up -d` (no args) skips it.

6. Open `https://${PLATFORM_DOMAIN}` and log in with the bootstrap credentials printed to the `server` logs:
   ```bash
   docker compose logs server | grep -i 'bootstrap'
   ```

## What got installed

| Service | Image | Role |
|---|---|---|
| `proxy` | `traefik:v3.1` | Reverse proxy, Let's Encrypt or self-signed TLS, port 443. |
| `web` | `${PLATFORM_IMAGE_WEB}` | Static React bundle, served by `proxy`. |
| `server` | `${PLATFORM_IMAGE_SERVER}` | API + workers, default `PLATFORM_MODULES=*`. |
| `migrator` | `${PLATFORM_IMAGE_SERVER}` | One-shot `platform-server migrate`. `depends_on: postgres healthy`. |
| `postgres` | `pgvector/pgvector:pg17-trixie` | Persistent named volume. Behind the `bundled-db` profile. |
| `minio` | `minio/minio` | S3-compatible object store for tenant knowledge files. From `compose.override.yaml` — **local-only**; not part of the base stack and never runs on a deployed box (dev/uat/prod talk to real AWS S3 instead, see [`deploying.md`](deploying.md)). |

## Verifying the install

- `docker compose ps` — all services `running`/`healthy`; `migrator` `exited (0)`.
- `curl -sfk https://${PLATFORM_DOMAIN}/health/live` — the API liveness probe, returns `{ "ok": true }`. (`-k` for `self-signed`.) (`/healthz` is the `web` container's nginx static endpoint returning `ok`, not the API.)
- Log in with the bootstrap user from step 6 above.

## Common first-install issues

- **Let's Encrypt rate-limited.** Cause: testing repeatedly against the same domain. Fix: temporarily set `PLATFORM_TLS_MODE=self-signed` in `.env`, restart `proxy`.
- **Postgres pull is slow.** Pre-pull: `docker pull pgvector/pgvector:pg17-trixie`.
- **Bootstrap credentials not in logs.** `migrator` must succeed before first `server` start. Rerun `docker compose run --rm migrator`, then `docker compose restart server`.
- **Permission denied binding to :443.** Run Docker as root, or use rootless Docker with `cap_add: NET_BIND_SERVICE`.
- **`POSTGRES_PASSWORD` and `BETTER_AUTH_SECRET` are required and empty by default.** The compose stack will refuse to start until you set them.

## Next steps

- Tune any env var → [`configuration.md`](configuration.md).
