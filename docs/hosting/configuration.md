# Configuration reference

Every environment variable the `platform-server` and `platform-web` images read is listed here. The source of truth is `.env.example` at the repo root — if a variable is in `.env.example`, it must be documented on this page. `pnpm docs:hosting:check` enforces.

Each entry shows: required/optional, type, default, and a short paragraph of meaning. For values that depend on deployment shape (single-VPS vs. split modules), the entry calls that out explicitly.

## Image versions

Compose-level variables. They are interpolated into `compose.yml` to choose the image to pull. The running `platform-server` and `platform-web` do not read them. Images are published to **Amazon ECR**; see the [image and version policy](README.md#image-and-version-policy) for the canonical tag/registry scheme.

### PLATFORM_VERSION

Required. String. Default: `latest`.

Version tag pulled for both `platform-server` and `platform-web` (used as `server-${PLATFORM_VERSION}` / `web-${PLATFORM_VERSION}`). Pin to a specific semver (`v1.2.3`) in production; `latest` is only acceptable for first-try installs.

### PLATFORM_IMAGE_SERVER

Optional. String. Default: `${ECR_REGISTRY}/${ECR_REPOSITORY}:server-${PLATFORM_VERSION}`.

Full image reference for the API + workers container. Override when testing a fork or a local build (`docker build -t platform-server:local -f infra/docker/server.Dockerfile . && PLATFORM_IMAGE_SERVER=platform-server:local docker compose up`).

### PLATFORM_IMAGE_WEB

Optional. String. Default: `${ECR_REGISTRY}/${ECR_REPOSITORY}:web-${PLATFORM_VERSION}`.

Full image reference for the static web bundle. Override to point at a fork.

## Public surface (Traefik + TLS)

### PLATFORM_DOMAIN

Required. String. Default: `localhost`.

Public hostname users hit. Used for Traefik routing rules and the ACME certificate SAN. Must resolve to this host's public IP for Let's Encrypt HTTP-01 to succeed (port 80 must be reachable from the internet). For local testing, keep `localhost` and set `PLATFORM_TLS_MODE=self-signed`.

### PUBLIC_URL

Required. URL. Default (local dev): `http://localhost:5173`. Self-host: `https://${PLATFORM_DOMAIN}`.

Read by the server (better-auth `baseURL` and `trustedOrigins`). Must match the externally-visible scheme and host; a mismatch breaks cookie and CORS flows. Local dev serves the web app from Vite on `http://localhost:5173`; when deploying via Docker Compose, override to `https://${PLATFORM_DOMAIN}`.

### PLATFORM_ACME_EMAIL

Required when `PLATFORM_TLS_MODE=letsencrypt`. String. Default: `admin@example.com`.

Email Traefik registers with Let's Encrypt. Used for expiry warnings only; not exposed publicly.

### PLATFORM_TLS_MODE

Required. Enum: `letsencrypt` | `self-signed`. Default: `letsencrypt`.

- `letsencrypt` — Traefik runs ACME HTTP-01 against `PLATFORM_DOMAIN`. Requires port 80 reachable from the public internet.
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

Required. URL. Default (local dev): `postgres://seta:seta@localhost:5542/seta`. Self-host: `postgres://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}`.

Connection string read by the server and CLI. Local dev connects to the Docker Postgres mapped to host port `5542` (`pnpm db:up`). For the Docker Compose self-host stack, override to use the in-network `postgres` service hostname — do not change `postgres` unless you also rename the service. Set this explicitly to a managed-service endpoint when pointing at RDS — see [`aws.md`](aws.md).

## Server runtime

### NODE_ENV

Required. Enum: `development` | `production` | `test`. Default (local dev): `development`. Self-host: `production`.

Standard Node.js environment switch. Affects assert-style invariants, log verbosity, and error response shapes. Set to `production` when deploying via Docker Compose.

### PORT

Optional. Int. Default: `3000`.

In-container listen port for `platform-server`. Traefik routes to this; never expose publicly.

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

### PLATFORM_MODULES

Optional. String. Default: `*`.

Comma-separated list of modules to load in this process, or `*` for all. The default `*` is the supported single-process monolith deploy. Valid module names: `core`, `identity`, `planner`, `agent`, `integrations`. Leave this as `*` for the supported single-process monolith.

## Optional integrations

### MICROSOFT_CLIENT_ID

Optional. String. No default.

Microsoft Entra ID application (multi-tenant) Application ID. When unset, the `/admin/sso` UI shows "SSO not configured at operator level" — local password auth still works. Set this and `MICROSOFT_CLIENT_SECRET` together to enable Entra SSO.

### MICROSOFT_CLIENT_SECRET

Optional. Secret. No default.

Client secret for the Entra application referenced by `MICROSOFT_CLIENT_ID`. Treat as a high-value secret; store outside the compose environment file on production hosts (Docker secrets, Secrets Manager, etc.).

### OTEL_EXPORTER_OTLP_ENDPOINT

Optional. URL. No default.

OTLP HTTP endpoint for traces. When unset, traces are dropped locally; metrics are still scraped by Prometheus. Point at your own collector (e.g. `http://otel-collector:4318`) to enable trace export. The compose stack ships Jaeger as the default traces backend — set this to `http://jaeger:4318`.

### OTEL_PROMETHEUS_PORT

Optional. Integer. Default: `9464`.

Port on which each app container exposes the Prometheus `/metrics` endpoint. Override if 9464 conflicts with another service on your host. The bundled `prometheus` service scrapes this port on both `server` and `worker`.

### GRAFANA_ADMIN_PASSWORD

Optional. String. Default: `admin`.

Initial password for the Grafana `admin` account. Change this before exposing Grafana publicly. The compose stack mounts `infra/grafana/provisioning/` and pre-provisions Prometheus as the default datasource.

### GRAFANA_ROOT_URL

Optional. URL. No default.

Root URL Grafana uses for absolute links and redirects when served behind a reverse proxy (e.g. `https://metrics.example.com`). Matches the `metrics.<domain>` Traefik router.

### DLQ_ALERT_THRESHOLD

Optional. Int. Default: `100`.

`/health/ready` returns 503 when any subscription has more than this many dead-letter rows in the last 24h. Lower it to fail readiness sooner on a poison-pill subscriber.

## Mail (outbound transactional only)

### MAILER_DEFAULT_TRANSPORT

Optional. Enum (`dev-stub` | `smtp` | `graph`). Default: `dev-stub`.

Default outbound mail transport. `dev-stub` captures emails in memory (dev/test only); production must set `smtp` (or per-tenant Microsoft Graph).

### MAILER_DEFAULT_SENDER

Optional. String. Default: `noreply@seta.example`.

Default From address for outbound transactional mail.

### MAILER_DEFAULT_SENDER_DISPLAY_NAME

Optional. String. No default.

Optional display name paired with `MAILER_DEFAULT_SENDER` on the From header.

### MAILER_DEFAULT_SMTP_URL

Conditional. String. No default.

Required when `MAILER_DEFAULT_TRANSPORT=smtp`. SMTP connection URL, e.g. `smtp://user:pass@email-smtp.us-east-1.amazonaws.com:587`.

### MAILER_GRAPH_CLIENT_ID

Conditional. String. No default.

Required only for tenants using Microsoft Graph `/sendMail`. Reuse the operator Entra app (with `Mail.Send` Application permission + tenant admin consent).

### MAILER_GRAPH_CLIENT_SECRET

Conditional. Secret. No default.

Client secret for the Entra app referenced by `MAILER_GRAPH_CLIENT_ID`. Treat as a high-value secret.

## Agent

### AGENT_MODELS

Optional. Comma-separated list. Default: `openai/gpt-5.5:balanced`.

Chat models as `provider/model[:tier]`, where tier ∈ `fast` | `balanced` | `reasoning` (default `balanced`). The first entry is used when `AGENT_MODEL_DEFAULT=auto` can't infer a model. Unset disables agent chat.

### OPENAI_API_KEY

Conditional. Secret. No default.

OpenAI API key. Required when any `openai/*` model is used in `AGENT_MODELS` or `EMBED_MODEL` (Mastra reads it automatically). Other providers use their own conventional `<PROVIDER>_API_KEY` variables.

## Retrieval — rerank + HNSW

### EMBED_MODEL

Optional. String. Default: `openai/text-embedding-3-small`.

Online + batch embedding model as `provider/model`. Must be a 1536-dim model (pgvector columns are pinned to 1536). Batch backfill requires an `openai/*` model.

### RERANKER_PROVIDER

Optional. Enum (`auto` | `cohere` | `none`). Default: `auto`.

Reranker selection. `auto` uses Cohere when `COHERE_API_KEY` is set, otherwise falls back to LLM-as-judge; `none` skips reranking entirely.

### COHERE_API_KEY

Conditional. Secret. No default.

Cohere API key. Enables the Cohere reranker when `RERANKER_PROVIDER=auto` (or `cohere`).

### RERANK_STAGE1_TOPK

Optional. Int. Default: `50`.

Stage-1 oversample size: how many candidates the first retrieval pass returns before reranking.

### RERANK_STAGE2_TOPN

Optional. Int. Default: `10`.

Stage-2 cap: how many reranked results are kept and passed to the agent.

### RERANK_CACHE_TTL_SECONDS

Optional. Int. Default: `300`.

Time-to-live (seconds) for cached rerank results.

### HNSW_EF_SEARCH

Optional. Int. Default: `100`.

pgvector HNSW search-list size. Higher = better recall, slower query.

## S3-lite storage (tenant knowledge files)

### S3_REGION

Optional. String. Default: `ap-southeast-1`.

AWS region of the knowledge bucket.

### S3_BUCKET

Optional. String. Default: `seta-knowledge`.

Bucket for tenant knowledge file uploads. Keys are prefixed `tenants/<id>/`.

### S3_ENDPOINT

Optional. URL. No default.

Custom S3 endpoint for MinIO / LocalStack (e.g. `http://localhost:9000`). Leave unset for AWS S3.

### S3_ACCESS_KEY_ID

Conditional. Secret. No default.

Access key ID. Required when `S3_ENDPOINT` is set or when running outside an IAM instance role.

### S3_SECRET_ACCESS_KEY

Conditional. Secret. No default.

Secret access key paired with `S3_ACCESS_KEY_ID`.

### S3_FORCE_PATH_STYLE

Optional. Boolean. Default: `false`.

`true` for MinIO (path-style addressing); `false` for AWS S3 (virtual-hosted style).

## Knowledge upload AV scanning (ClamAV)

### CLAMAV_HOST

Optional. String. Default: `clamav`.

ClamAV daemon hostname. Defaults to the compose service name `clamav`; use `localhost` for split deploys.

### CLAMAV_PORT

Optional. Int. Default: `3310`.

ClamAV daemon TCP port.

### KNOWLEDGE_AV_REQUIRED

Optional. Boolean. Default: `false`.

When `true`, uploaded files cannot move past `uploading` until ClamAV marks them clean. Set to `false` only for environments that intentionally skip AV.

## Sync-check contract

This page must list every variable in `.env.example` exactly once, with a heading of the form `### VAR_NAME` (uppercase letters, digits, and underscores only). Run `pnpm docs:hosting:check` locally — or wait for CI — to detect drift. If you add a var, add a section here in the same PR.
