# CI/CD: build once → ECR → pull-deploy (dev / UAT)

How Seta is built and deployed with GitHub Actions. The app image is built **once** in CI and pushed to Amazon ECR; every environment **deploys by pulling** that image. Environment is a workflow input mapped to a **GitHub Environment** — there is no per-environment workflow file.

Production is out of scope here; it slots in as a new GitHub Environment (`prod`) with required reviewers, no new workflow file.

> `workflow_dispatch` only works for workflows present on the repo's **default branch**. This repo's default branch is **`develop`** (where the new workflows live).

## Workflows

| Workflow | Trigger | What it does |
|---|---|---|
| `ci.yml` | PR + push `main` | Quality gate (typecheck/lint/test/bundle). Never builds images. |
| `build.yml` | manual (`workflow_dispatch`) + `workflow_call` | OIDC → ECR. Builds server + web (`linux/amd64`), pushes `server-git-<sha>` + `server-latest` (and `web-…`). Prints `image_tag` in the run summary. |
| `deploy.yml` | manual (`workflow_dispatch`) | Pull + render env + migrate + `up` on the chosen environment's self-hosted runner, then `/health/ready` smoke. Chains `e2e.yml` for `uat`. |
| `e2e.yml` | manual + chained from `deploy.yml` (uat) | Playwright (official container) vs the live URL; publishes the HTML report behind Traefik basic-auth. |

**Build-once / deploy-by-pull:** `build.yml` is the only thing that pushes to ECR. Deploy runners only pull. Rollback = run `deploy.yml` with a prior `git-<sha>` — no rebuild.

A normal release is two clicks: **Build**, then **Deploy** (pick env + tag).

## Environments

Environment-specific config lives entirely in the matching **GitHub Environment** (Variables + Secrets); the workflow bodies are uniform. The self-hosted runner is targeted by a label equal to the environment name (`runs-on: [self-hosted, <env>]`).

| | dev | uat |
|---|---|---|
| Runner label | `dev` | `uat` |
| Data services | bundled Docker (Postgres + MinIO) via the `bundled-infra` compose profile | **AWS RDS** (Postgres+pgvector) + **AWS S3** |
| App image | pulled from ECR | pulled from ECR |
| Compose project | `seta-dev` | `seta-uat` |
| Published ports (host) | `80` / `443` / `5173` (defaults) | `8080` / `8443` / `8173` (`HTTP_BIND`/`HTTPS_BIND`/`SMOKE_BIND`) |
| TLS | self-signed (Traefik) | self-signed (Traefik); real TLS terminated at the edge (Cloudflare) |

Two environments can share one host: the proxy's published ports are parameterized (`${HTTP_BIND:-80}` / `${HTTPS_BIND:-443}` / `${SMOKE_BIND:-5173}`), so a second stack binds alternate host ports while still listening on 80/443 inside its container.

## Compose mechanics

- **`bundled-infra` profile** (`compose.yml`): the bundled `postgres` + `minio` (+ a one-shot `minio-setup`) sit behind this profile, **off by default**. dev sets `COMPOSE_PROFILES=bundled-infra`; uat leaves it empty and uses external RDS/S3. `server`/`worker`/`migrator` declare the bundled `postgres` dependency as `required: false`, so the stack starts cleanly when the profile is off.
- **Egress for an external DB:** `migrator` and `seeder` join `seta-edge` (not just the internal-only network) so they can resolve and reach a public **RDS** endpoint. Without this they fail with `EAI_AGAIN`.
- **Env file** is a **generated artifact**: `deploy.yml` renders it from the GitHub Environment on every deploy via `scripts/render-env.sh` (`chmod 600`, no secret echoed). **Do not hand-edit it.** Path is the `ENV_FILE` variable (the live deployment uses `/home/ubuntu/seta/<env>.env` because the runner user has no passwordless `sudo` for `/etc`).

## One-time prerequisites

1. **ECR repo** (single) with image scanning + a lifecycle policy. Server and web share it via `server-` / `web-` tag prefixes (see [image policy](README.md#image-and-version-policy)).
2. **GitHub OIDC provider** + an **IAM push role** trusted by this repo (`sts:AssumeRoleWithWebIdentity`, `sub = repo:<org>/<repo>:*`) with ECR push on the repo. Set repo Secret `AWS_BUILD_ROLE_ARN`; repo Variables `ECR_REGISTRY`, `ECR_REPOSITORY`, `AWS_REGION`.
3. **ECR read-only IAM user per box**: `ecr:GetAuthorizationToken` + pull on the repo; `aws configure` it on each self-hosted runner (the runner user's `~/.aws`). Deploy runners never push.
4. **Self-hosted runners**: register each box with a label equal to its environment name (`dev`, `uat`). Ensure Docker + AWS CLI are installed. (One box can carry multiple labels.)
5. **RDS** Postgres+pgvector reachable from the box (see [`aws.md`](aws.md)); **S3** bucket in the target region with an access key that can read/write it.
6. **GitHub Environments** `dev` and `uat` populated with the Variables + Secrets below.
7. **DNS**: `e2e.<uat-domain>` → the box (for the E2E report route).

## GitHub Environment configuration

### Variables (non-secret) — set per environment

| Variable | dev | uat |
|---|---|---|
| `COMPOSE_PROJECT` | `seta-dev` | `seta-uat` |
| `COMPOSE_PROFILES` | `bundled-infra` | *(unset/empty)* |
| `ENV_FILE` | `/home/ubuntu/seta/dev.env` | `/home/ubuntu/seta/uat.env` |
| `HTTP_BIND` / `HTTPS_BIND` / `SMOKE_BIND` | *(unset → 80/443/5173)* | `8080` / `8443` / `8173` |
| `PUBLIC_DOMAIN` | dev domain | uat domain |
| `PUBLIC_URL` | `https://<dev-domain>` | `https://<uat-domain>` |
| `SMOKE_URL` | *(unset → `https://$PUBLIC_DOMAIN/health/ready`)* | `https://127.0.0.1:8443/health/ready` |
| `PLATFORM_TLS_MODE` | `self-signed` | `self-signed` |
| `PLATFORM_ACME_EMAIL` | ops email | ops email |
| `PLATFORM_MODULES` | `*` | `*` |
| `SESSION_COOKIE_SAMESITE` | `lax` | `lax` |
| `S3_REGION` | `ap-southeast-1` | real region |
| `S3_ENDPOINT` | `http://minio:9000` | *(unset = AWS S3)* |
| `S3_BUCKET` | `seta-knowledge` | real bucket |
| `S3_FORCE_PATH_STYLE` | `true` | `false` |
| `AGENT_MODELS`, `AGENT_MODEL_DEFAULT`, `OLLAMA_BASE_URL`, `EMBED_MODEL` | per env | per env |
| `MAILER_DEFAULT_TRANSPORT`, `MAILER_DEFAULT_SENDER`, `MAILER_DEFAULT_SENDER_DISPLAY_NAME`, `MAILER_GRAPH_CLIENT_ID` | per env | per env |
| `POSTGRES_BIND_ADDR` | as needed (dev) | n/a |
| `E2E_REPORTS_DIR` | n/a | host dir served by the `e2e-report` service |

Repo-level Variables (shared): `ECR_REGISTRY`, `ECR_REPOSITORY`, `AWS_REGION`.

### Secrets (sensitive) — set per environment

`DATABASE_URL` (dev: bundled Postgres DSN; uat: RDS DSN — see RDS note), plus `POSTGRES_USER`/`POSTGRES_PASSWORD`/`POSTGRES_DB` (dev bundled Postgres), `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `MICROSOFT_CLIENT_ID`.

These already exist at **repo** level and resolve into both environments (no need to duplicate unless overriding): `BETTER_AUTH_SECRET`, `CRYPTO_LOCAL_MASTER_KEY`, `OPENAI_API_KEY`, `MICROSOFT_CLIENT_SECRET`, `M365_WEBHOOK_SECRET`, `MAILER_DEFAULT_SMTP_URL`, `MAILER_GRAPH_CLIENT_SECRET`.

uat-only E2E secrets: `E2E_BASICAUTH_USERS` (htpasswd line for the report route), `E2E_ADMIN_EMAIL`, `E2E_ADMIN_PASSWORD` (test sign-in).

Repo-level Secret (shared): `AWS_BUILD_ROLE_ARN` (build OIDC role).

> **RDS `DATABASE_URL`:** use `?sslmode=no-verify` — the pools open TLS but RDS's CA isn't in the default trust store, so plain `require` fails verification. URL-encode any special characters in the password (`{ , : @` …).

## Run procedure

1. **Build** — run **Build** (`workflow_dispatch`), optionally with a `ref`. Copy the `image_tag` (`git-<sha>`) from the run summary.
2. **Deploy** — run **Deploy**: pick `environment` (`dev` | `uat`) and `image_tag` (`latest`, or the `git-<sha>` you just built). It renders the env file, pulls, migrates, brings the stack up, and smoke-tests `/health/ready`.
3. **Verify** — for `uat`, `deploy.yml` chains `e2e.yml`; the E2E report is linked in the run summary and served at `https://e2e.<uat-domain>/` (basic-auth).

### Rollback

Run **Deploy** again with `image_tag` set to a previous `git-<sha>`. No rebuild — the immutable tag is already in ECR.

## Seeding demo / fixture data

The fixture workbook (`private/seta-fixture.xlsx`) holds real PII and is **gitignored**, so it is not in the image. To seed an environment, copy it to the box and run the `seed` subcommand from the deployed image:

```bash
# once: copy the fixture onto the box
scp private/seta-fixture.xlsx <box>:/home/ubuntu/seta/private/

# seed (run on the box). Use the env's egress network + rendered env file.
docker run --rm --network <project>_seta-edge \
  --env-file /home/ubuntu/seta/<env>.env \
  -v /home/ubuntu/seta/private:/seed:ro \
  <ECR_REGISTRY>/<ECR_REPOSITORY>:server-latest \
  seed --dir /seed
```

- Admin defaults: `--admin-email admin@seta-international.vn`, `--password ChangeMe@2026` (idempotent; auto-creates tenant + admin; degrades to tenant+admin only if the workbook is absent).
- **Do not pipe the seeder to `| tail`** — that masks its exit code; a truncated run can look successful while leaving planner/hiring unseeded. Redirect to a log and check the exit code instead.

## Operational notes

- **`gh` account:** repo/Environment writes require the `seta-canhta` collaborator account (admin for Environment secrets). The CLI can revert to a non-collaborator account — run `gh auth switch --user seta-canhta` before write operations.
- **Two stacks, one host:** dev (`seta-dev`, ports 80/443/5173) and uat (`seta-uat`, ports 8080/8443/8173) coexist. Each owns its own networks/volumes; the bundled `postgres`/`minio` only exist in dev.
- **S3 credentials hardening:** if you wired S3 with a broad personal IAM key to get going, swap it for a dedicated bucket-scoped key.
- **`build-images` action** logs into ECR with no `registries:` input (that field expects a 12-digit account id, not the registry hostname) — it uses the caller's default registry.

## Reference: current Seta dev + UAT

Concrete, non-secret values for the running deployment.

| | dev | uat |
|---|---|---|
| Host / runner | `future` box (`seta-future` runner), label `dev` | same box, label `uat` |
| Public URL | `https://dev-future.seta-international.com` | `https://uat-future.seta-international.com` (→ box `8443`) |
| Database | bundled Docker Postgres (`seta-dev`) | RDS `future-app-db` … db `future_app`, user `future_admin` |
| Object storage | bundled MinIO | S3 `future-app-bucket-seta` |
| ECR | `555146423830.dkr.ecr.ap-southeast-1.amazonaws.com/future-app` (`ap-southeast-1`) | same |
| OIDC build role | `future-app-gha-build` | same |
| ECR pull user (box) | `future-app-ecr-pull` | same |

**Status:** dev + uat both deployed, seeded (202 users / 201 workers / 243 tasks / 6 requisitions), healthy. **E2E** for uat is not yet wired (needs `E2E_BASICAUTH_USERS` + `E2E_ADMIN_*` secrets, `E2E_REPORTS_DIR`, DNS for `e2e.uat-future…`, and a Playwright-container networking tweak for the `8443` target).
