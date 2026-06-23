# CI/CD: build once → ECR → pull-deploy (dev / UAT)

How Seta is built and deployed with GitHub Actions. The app image is built **once** in CI and pushed to Amazon ECR; every environment **deploys by pulling** that image. Environment is a workflow input mapped to a **GitHub Environment** — there is no per-environment workflow file.

Production is out of scope here; it slots in as a new GitHub Environment (`prod`) with required reviewers, no new workflow file.

## Workflows

| Workflow | Trigger | What it does |
|---|---|---|
| `ci.yml` | PR + push `main` | Quality gate (typecheck/lint/test/bundle). Never builds images. |
| `build.yml` | manual (`workflow_dispatch`) | OIDC → ECR. Builds server + web, pushes `server-git-<sha>` + `server-latest` (and `web-…`). Prints `image_tag` in the run summary. |
| `deploy.yml` | manual (`workflow_dispatch`) | Pull + migrate + `up` on the chosen environment's self-hosted runner, then `/health/ready` smoke. Chains `e2e.yml` for `uat`. |
| `e2e.yml` | manual + chained from `deploy.yml` (uat) | Playwright (official container) vs the live URL; publishes the HTML report behind Traefik basic-auth. |

**Build-once / deploy-by-pull:** `build.yml` is the only thing that pushes to ECR. Deploy runners only pull. Rollback = run `deploy.yml` with a prior `git-<sha>` — no rebuild.

## Environments

| | dev | uat |
|---|---|---|
| Runner | self-hosted, label `dev` | self-hosted, label `uat` |
| Data services | bundled Docker (Postgres + MinIO) via the `bundled-infra` compose profile | **AWS RDS** (Postgres+pgvector) + **AWS S3** |
| App image | pulled from ECR | pulled from ECR |
| Compose project | `seta-dev` | `seta-uat` |

## One-time prerequisites

1. **ECR repo** (single, e.g. `seta`) with image scanning + a lifecycle policy. Server and web share it via `server-` / `web-` tag prefixes (see [image policy](README.md#image-and-version-policy)).
2. **OIDC IAM role** for pushing: an IAM role whose trust policy allows GitHub OIDC from this repo, with `ecr:*` push permissions on the repo. Set repo Secret `AWS_BUILD_ROLE_ARN`; repo Variables `ECR_REGISTRY`, `ECR_REPOSITORY`, `AWS_REGION`.
3. **ECR read-only IAM user per box**: create an IAM user limited to `ecr:GetAuthorizationToken` + pull on the repo; `aws configure` it on each self-hosted runner. Deploy runners never push.
4. **Self-hosted runners**: register the dev box with label `dev` and the UAT VPS with label `uat`. Ensure Docker + AWS CLI are installed.
5. **RDS** Postgres+pgvector reachable from the VPS (see [`aws.md`](aws.md)); **S3** bucket in the target region.
6. **GitHub Environments** `dev` and `uat` populated with the Variables + Secrets below.
7. **DNS**: `e2e.<uat-domain>` → the VPS (for the E2E report route).

The box env file (`/etc/seta/<env>.env`) is **rendered from the GitHub Environment on every deploy** by `scripts/render-env.sh` — do not hand-edit it.

## GitHub Environment configuration

### Variables (non-secret) — set per environment

| Variable | dev | uat |
|---|---|---|
| `COMPOSE_PROJECT` | `seta-dev` | `seta-uat` |
| `COMPOSE_PROFILES` | `bundled-infra` | *(empty)* |
| `ENV_FILE` | `/etc/seta/dev.env` | `/etc/seta/uat.env` |
| `PUBLIC_DOMAIN` | dev domain | uat domain |
| `PUBLIC_URL` | `https://<dev-domain>` | `https://<uat-domain>` |
| `PLATFORM_TLS_MODE` | `self-signed` | `letsencrypt` |
| `PLATFORM_ACME_EMAIL` | ops email | ops email |
| `PLATFORM_MODULES` | `*` | `*` |
| `SESSION_COOKIE_SAMESITE` | `lax` | `lax` |
| `S3_REGION` | `ap-southeast-1` | real region |
| `S3_ENDPOINT` | `http://minio:9000` | *(empty = AWS S3)* |
| `S3_BUCKET` | `seta-knowledge` | real bucket |
| `S3_FORCE_PATH_STYLE` | `true` | `false` |
| `AGENT_MODELS`, `AGENT_MODEL_DEFAULT`, `OLLAMA_BASE_URL`, `EMBED_MODEL` | per env | per env |
| `MAILER_DEFAULT_TRANSPORT`, `MAILER_DEFAULT_SENDER`, `MAILER_DEFAULT_SENDER_DISPLAY_NAME`, `MAILER_GRAPH_CLIENT_ID` | per env | per env |
| `POSTGRES_BIND_ADDR` | as needed (dev) | n/a |
| `E2E_REPORTS_DIR` | n/a | host dir served by the `e2e-report` service |

Repo-level Variables (shared): `ECR_REGISTRY`, `ECR_REPOSITORY`, `AWS_REGION`.

### Secrets (sensitive) — set per environment

`DATABASE_URL` (dev: bundled Postgres DSN; uat: RDS DSN), `BETTER_AUTH_SECRET`, `CRYPTO_LOCAL_MASTER_KEY`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` (dev bundled Postgres), `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `OPENAI_API_KEY`, `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, `M365_WEBHOOK_SECRET`, `MAILER_DEFAULT_SMTP_URL`, `MAILER_GRAPH_CLIENT_SECRET`.

uat-only E2E secrets: `E2E_BASICAUTH_USERS` (htpasswd line for the report route), `E2E_ADMIN_EMAIL`, `E2E_ADMIN_PASSWORD` (test sign-in).

Repo-level Secret (shared): `AWS_BUILD_ROLE_ARN` (build OIDC role).

## Run procedure

1. **Build** — run the **Build** workflow (`workflow_dispatch`), optionally with a `ref`. Copy the `image_tag` (`git-<sha>`) from the run summary.
2. **Deploy** — run the **Deploy** workflow: pick `environment` (`dev` | `uat`) and `image_tag` (`latest`, or the `git-<sha>` you just built). It pulls, migrates, brings the stack up, and smoke-tests `/health/ready`.
3. **Verify** — for `uat`, `deploy.yml` chains `e2e.yml`; the E2E report is linked in the run summary and served at `https://e2e.<uat-domain>/` (basic-auth).

### Rollback

Run **Deploy** again with `image_tag` set to a previous `git-<sha>`. No rebuild — the immutable tag is already in ECR.
