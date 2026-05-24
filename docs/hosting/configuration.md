# Configuration reference

Every environment variable the `seta-server` and `seta-web` images read is listed here. The source of truth is `.env.example` at the repo root — if a variable is in `.env.example`, it must be documented on this page. `pnpm docs:hosting:check` enforces.

Each entry shows: required/optional, type, default, and a short paragraph of meaning. For values that depend on deployment shape (single-VPS vs. split modules), the entry calls that out explicitly.

## Image versions

Compose-level variables. They are interpolated into `compose.yml` to choose the image to pull. The running `seta-server` and `seta-web` do not read them.

### SETA_VERSION

Required. String. Default: `latest`.

Image tag pulled for both `seta-server` and `seta-web`. Pin to a specific semver (`v1.2.3`) in production; `latest` is only acceptable for first-try installs. Tag scheme is documented in [`upgrading.md`](upgrading.md).

### SETA_IMAGE_SERVER

Optional. String. Default: `ghcr.io/seta-io/seta-server:${SETA_VERSION}`.

Full image reference for the API + workers container. Override when testing a fork or a local build (`docker build -t seta-server:local -f infra/docker/server.Dockerfile . && SETA_IMAGE_SERVER=seta-server:local docker compose up`).

### SETA_IMAGE_WEB

Optional. String. Default: `ghcr.io/seta-io/seta-web:${SETA_VERSION}`.

Full image reference for the static web bundle. Override to point at a fork.

## Public surface (Traefik + TLS)

### SETA_DOMAIN

Required. String. Default: `localhost`.

Public hostname users hit. Used for Traefik routing rules and the ACME certificate SAN. Must resolve to this host's public IP for Let's Encrypt HTTP-01 to succeed (port 80 must be reachable from the internet). For local testing, keep `localhost` and set `SETA_TLS_MODE=self-signed`.

### PUBLIC_URL

Required. URL. Default: `https://${SETA_DOMAIN}`.

Read by the server (better-auth `baseURL` and `trustedOrigins`). Must match the externally-visible scheme and host; a mismatch breaks cookie and CORS flows.

### SETA_ACME_EMAIL

Required when `SETA_TLS_MODE=letsencrypt`. String. Default: `admin@example.com`.

Email Traefik registers with Let's Encrypt. Used for expiry warnings only; not exposed publicly.

### SETA_TLS_MODE

Required. Enum: `letsencrypt` | `self-signed`. Default: `letsencrypt`.

- `letsencrypt` — Traefik runs ACME HTTP-01 against `SETA_DOMAIN`. Requires port 80 reachable from the public internet.
- `self-signed` — Traefik mints a self-signed cert at boot. Used by the smoke test and local-domain deploys; browsers will warn. Use `curl -k` to verify.

## Postgres

### POSTGRES_USER

Required. String. Default: `seta`.

Postgres role created at first boot. Used by the server for all DB access.

### POSTGRES_PASSWORD

Required. Secret. No default.

REQUIRED to set explicitly to a strong random value before first boot. Used by both the postgres container (passed as `POSTGRES_PASSWORD`) and the server (interpolated into `DATABASE_URL`). The compose stack refuses to start with an empty value.

### POSTGRES_DB

Required. String. Default: `seta`.

Database name created at first boot.

### DATABASE_URL

Required. URL. Default: `postgres://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}`.

Connection string read by the server and CLI. The hostname `postgres` is the compose service name; do not change unless you also rename the service. Set this explicitly only when pointing at a managed service (RDS) — see [`aws.md`](aws.md).

## Server runtime

### NODE_ENV

Required. Enum: `development` | `production` | `test`. Default: `production`.

Standard Node.js environment switch. Affects assert-style invariants, log verbosity, and error response shapes.

### PORT

Optional. Int. Default: `3000`.

In-container listen port for `seta-server`. Traefik routes to this; never expose publicly.

### BETTER_AUTH_SECRET

Required. Secret. No default.

REQUIRED. Minimum 32 characters. Used by better-auth to sign session cookies and JWTs. Generate with `openssl rand -hex 32`. Rotating invalidates all existing sessions.

### SESSION_COOKIE_SAMESITE

Optional. Enum (`strict` | `lax`). Default: `strict`.

SameSite attribute for the session cookie. `strict` is the safest default: the cookie is sent only on same-site navigations, blocking the broad class of CSRF where an attacker site triggers a credentialed cross-site POST. Switch to `lax` only when your Entra SSO callback lives on a different registered domain than the app and the post-callback redirect drops the session cookie — that's a real cross-site navigation that `strict` would interrupt.

### CORS_ORIGINS

Optional. Comma-separated origins. Default: `http://localhost:5173`.

Allowlist of origins the API will honour for cross-origin browser requests with credentials. Production deployments where the web bundle is served from a different origin than the API must list every such origin here. An empty list disables CORS entirely (same-origin only) and is the safest production setting if you co-locate web + API behind one Traefik host.

### EVENTS_RETENTION_DAYS

Optional. Int. Default: `30`.

Days to retain rows in the `core.events` outbox before the partition manager drops them. Lower values reduce disk usage at the cost of audit history.

### CRYPTO_KEY_PROVIDER

Optional. Enum (`env` | `kms`). Default: `env`.

Selects how `@seta/shared-crypto` resolves its KEK. `env` reads a master key from `CRYPTO_LOCAL_MASTER_KEY` (or the rotation-aware `CRYPTO_LOCAL_KEYS` / `CRYPTO_LOCAL_PRIMARY_KID`) — appropriate for dev, test, and self-host scenarios without an AWS account. `kms` uses AWS KMS via `CRYPTO_KMS_KEY_ARN`. The chosen provider runs a `selfTest()` at server boot; misconfiguration crash-loops the process rather than silently failing.

### CRYPTO_LOCAL_MASTER_KEY

Conditional. Secret. No default.

REQUIRED when `CRYPTO_KEY_PROVIDER=env`. 64-character hex string (32 bytes / 256 bits). Used to wrap per-message DEKs via AES-256-GCM in process. Generate with `pnpm --filter @seta/shared-crypto crypto:gen-local-key`. Treat as a high-value secret; rotating it leaves previously-encrypted blobs undecryptable unless you migrate to the multi-key form `CRYPTO_LOCAL_KEYS=new:<hex>,old:<hex>` + `CRYPTO_LOCAL_PRIMARY_KID=new`.

### CRYPTO_KMS_KEY_ARN

Conditional. String. No default.

REQUIRED when `CRYPTO_KEY_PROVIDER=kms`. Full ARN (or `alias/<name>`) of the operator-provisioned customer master key. Provision the CMK out-of-band (CDK / Terraform); app code never creates or deletes CMKs. Grant the Fargate task IAM role `kms:GenerateDataKey`, `kms:Decrypt`, and `kms:DescribeKey` on this ARN. KMS rotates the underlying key material annually and transparently; same ARN keeps working without app changes.

### AWS_REGION

Conditional. String. No default.

REQUIRED alongside `CRYPTO_KMS_KEY_ARN`. Identifies the AWS region the KMS key lives in so the SDK can route the request without a separate config file. Standard AWS region code (e.g. `us-east-1`, `eu-west-1`).

### SETA_MODULES

Optional. String. Default: `*`.

Comma-separated list of modules to load in this process, or `*` for all. The default `*` is the supported single-process monolith deploy. Valid module names: `core`, `identity`, `planner`, `copilot`, `integrations`. Split-mode deploys (one process per module) are described in [`scaling.md`](scaling.md). The Hono RPC transport and peer-addressing env vars that split-mode requires land with the dispatch shim — until then, leave this as `*`.

## Optional integrations

### MICROSOFT_CLIENT_ID

Optional. String. No default.

Microsoft Entra ID application (multi-tenant) Application ID. When unset, the `/admin/sso` UI shows "SSO not configured at operator level" — local password auth still works. Set this and `MICROSOFT_CLIENT_SECRET` together to enable Entra SSO.

### MICROSOFT_CLIENT_SECRET

Optional. Secret. No default.

Client secret for the Entra application referenced by `MICROSOFT_CLIENT_ID`. Treat as a high-value secret; store outside the compose environment file on production hosts (Docker secrets, Secrets Manager, etc.).

### OTEL_EXPORTER_OTLP_ENDPOINT

Optional. URL. No default.

OTLP HTTP endpoint for traces, metrics, and logs. When unset, telemetry is dropped locally. Point at your own collector (e.g. `http://otel-collector:4318`) to enable observability. The production compose stack does NOT ship a collector — that's a `compose.dev.yml` convenience only.

## Sync-check contract

This page must list every variable in `.env.example` exactly once, with a heading of the form `### VAR_NAME` (uppercase letters, digits, and underscores only). Run `pnpm docs:hosting:check` locally — or wait for CI — to detect drift. If you add a var, add a section here in the same PR.
