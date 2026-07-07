# AWS production

Seta's production environment is a **single-box** deployment on AWS: one EC2 instance behind a Cloudflare Tunnel, an external RDS Postgres, and S3. It runs the same `platform-server` / `platform-web` images as `dev`/`uat` (see [`README.md`](README.md#image-and-version-policy)), composed via `compose.yaml` + `compose.prod.yaml`. Everything except the tunnel and DNS is provisioned by Terraform in `infra/terraform/prod/`.

This tier is deliberately minimal — no load balancer, no multi-AZ, no NAT gateway (see [Future levers](#future-levers)). It is sized for the current traffic and optimizes for **zero recurring cost beyond RDS/EC2/S3** and **unattended self-recovery** over horizontal scale.

## 1. Topology

```
Internet
   │
   ▼
Cloudflare (DNS + edge TLS + Tunnel)
   │  outbound-only connection from the box — no inbound port ever opens
   ▼
┌────────────────────────────── VPC (ap-southeast-1, 10.20.0.0/16) ──────────────────────────────┐
│                                                                                                  │
│  ┌─ public subnets (2 AZs) ─────────────┐        ┌─ private subnets (2 AZs) ──────────────────┐ │
│  │                                       │        │                                            │ │
│  │  EC2 Auto Scaling Group (size 1)      │  5432  │  RDS Postgres (pgvector)                   │ │
│  │   - cloudflared (systemd service)     │───────▶│   - db.t3.micro, gp3, encrypted            │ │
│  │   - GitHub Actions runner (systemd)   │        │   - multi_az = false                       │ │
│  │   - docker compose: proxy/web/server/ │        │   - publicly_accessible = false             │ │
│  │     worker/migrator + obs-agent       │        │   - 7-day PITR + prevent_destroy            │ │
│  │   - security group: EGRESS ONLY       │        │   - SG: ingress 5432 from app SG only       │ │
│  │     (zero inbound rules)              │        └────────────────────────────────────────────┘ │
│  │                                       │                                                        │
│  └───────────────────────────────────────┘        S3 (app bucket, versioned, SSE-KMS, PAB)       │
│                                                                                                    │
└────────────────────────────────────────────────────────────────────────────────────────────────┘

Admin access: AWS Systems Manager Session Manager (no SSH, no bastion, no open port 22).
```

- **Region**: `ap-southeast-1` throughout (VPC, RDS, S3, state bucket).
- **Zero inbound to the box.** The app security group (`infra/terraform/prod/compute.tf`) has no ingress rules at all — public traffic reaches Traefik only via the outbound Cloudflare Tunnel; operator access is via SSM Session Manager (IAM-authenticated, no keys, no open ports).
- **No NAT gateway.** Private subnets (for RDS) have no default route; the app box lives in a *public* subnet only because the ASG needs an internet-facing IP for cloudflared/ECR/GitHub egress — it accepts no inbound regardless. An S3 VPC Gateway endpoint (`aws_vpc_endpoint.s3`, free) keeps S3/ECR-layer traffic off the public internet.
- **Data plane**: `compose.prod.yaml` overrides the base stack's `proxy` service to publish HTTP on `127.0.0.1:8080` only (loopback — not reachable from outside the box even though the security group would allow it), and sets `PLATFORM_TLS_MODE=none` because TLS terminates at Cloudflare (Full mode), not on the origin.

## 2. Provision

Terraform lives in two directories, applied in order:

### 2.1 `infra/terraform/bootstrap/` — once per AWS account

Creates the remote-state bucket. A state bucket can't store its own creation, so this runs with **local** state, by a human, before anything else:

```bash
cd infra/terraform/bootstrap
terraform init
terraform apply
```

Produces `seta-tfstate-prod-apse1` (versioned, KMS-encrypted, public-access-blocked, `prevent_destroy`). `infra/terraform/prod/backend.tf` points at this bucket (key `prod/terraform.tfstate`, native S3 lockfile via `use_lockfile = true` — no DynamoDB table needed on Terraform ≥ 1.11).

### 2.2 `infra/terraform/prod/` — the prod stack

```bash
cd infra/terraform/prod
cp terraform.tfvars.example terraform.tfvars   # fill in the values below; gitignored
terraform init                                  # backend = the bootstrap bucket
terraform plan -out=prod.tfplan
terraform apply prod.tfplan                     # gated: run by a human, reviewed before apply
```

Required `terraform.tfvars` values:

| Variable | Source |
|---|---|
| `db_master_password` | **Same value as the GitHub `prod` Environment's `DATABASE_URL` secret's password component** (informally "`DATABASE_PASSWORD`" — see [§8 rotation](#8-rds-password-rotation-runbook)). Lands in Terraform state, which is encrypted at rest (bucket SSE-KMS) and access-controlled (bucket policy) — treat state as sensitive regardless. |
| `github_runner_url` | `https://github.com/<org>/agent-platform` — the repo the self-hosted runner registers against (baked into `user-data.sh.tftpl`). |
| `ecr_repository_arn` | ARN of the shared ECR repository (`arn:aws:ecr:ap-southeast-1:<account-id>:repository/<repo>`) the box's instance role is scoped to pull from. |

Everything else (`name`, `region`, `vpc_cidr`, `instance_type`, `db_instance_class`) has a sane default in `variables.tf` and rarely needs overriding.

`terraform apply` creates, in order: VPC + 2 public + 2 private subnets + IGW + route tables + S3 Gateway endpoint (`network.tf`) → S3 app bucket (`storage.tf`) → instance IAM role/policies/profile (`iam.tf`) → launch template + ASG + egress-only security group (`compute.tf`) → RDS subnet group + security group + instance (`data.tf`) → outputs (`outputs.tf`: `app_asg_name`, `db_endpoint`, `s3_bucket`, `vpc_id`).

**Apply is a gate, not an automation.** There is no CI workflow that runs `terraform apply` against prod — it is always a human running the three commands above, from a machine with prod AWS credentials, after reviewing the plan.

## 3. Manual / out-of-repo

Terraform provisions AWS resources; it does **not** configure the Cloudflare side, seed boot secrets, or set up CI. These steps are one-time, done by a human, in this order — **before the first `terraform apply`** for the SSM parameters (the box reads them on first boot):

1. **Install & configure `cloudflared` + Cloudflare DNS.** In the Cloudflare dashboard: create a Tunnel, note its token, add a public hostname (e.g. `app.example.com`) routed to `http://localhost:8080` (the loopback port `compose.prod.yaml` publishes), and set TLS mode to **Full** (Cloudflare terminates TLS at the edge; the origin serves plain HTTP). This is managed entirely in Cloudflare — Terraform has no Cloudflare provider here.
2. **Seed the two SSM SecureString parameters** the box reads on every boot (`user-data.sh.tftpl`), **before the ASG launches its first instance**:
   - `/seta/prod/cloudflared-token` — the Tunnel token from step 1. Installed as a systemd service via `cloudflared service install "$TOKEN"`.
   - `/seta/prod/gh-runner-registration` — a GitHub PAT (or fine-grained token) with `admin:org`/repo-runner-registration scope, used at boot to mint a short-lived runner registration token via the GitHub API. The box never stores the long-lived PAT itself beyond this SSM read.

   ```bash
   aws ssm put-parameter --region ap-southeast-1 --type SecureString \
     --name /seta/prod/cloudflared-token --value "<tunnel-token>"
   aws ssm put-parameter --region ap-southeast-1 --type SecureString \
     --name /seta/prod/gh-runner-registration --value "<github-pat>"
   ```
   The instance role's `boot-secrets` IAM policy (`iam.tf`) scopes `ssm:GetParameter` to `/seta/prod/*` and `kms:Decrypt` for the parameter store key — nothing else can read these.
3. **Register the `prod` self-hosted runner.** This happens automatically via `user-data.sh.tftpl` on every boot (using the PAT from step 2 to mint a fresh registration token — `--replace --ephemeral --labels prod`), so there's nothing to do by hand here beyond seeding the PAT. Confirm the runner shows **Idle** under Settings → Actions → Runners after the first `terraform apply`.
4. **Create the GitHub Environments.** Two, with identical Variables/Secrets, differing only in the reviewer gate:
   - **`prod`** — gated: add a **required reviewer** (the deploy approval gate for normal releases).
   - **`prod-recovery`** — **no required reviewer**. Same vars/secrets as `prod`. This is the unattended path [self-heal](#5-runbook-instance-replacement) dispatches to; a human never approves a recovery deploy.

   Both Environments' runner label resolves to `prod` (`deploy.yml`'s `runs-on` maps `prod-recovery` → the `prod`-labelled runner), so one box serves both.

   Variables and Secrets (mirror in both Environments):

   | Name | Kind | Value |
   |---|---|---|
   | `COMPOSE_FILE` | Variable | `compose.yaml:compose.prod.yaml` |
   | `COMPOSE_PROFILES` | Variable | `obs-agent` |
   | `COMPOSE_PROJECT` | Variable | `seta-prod` |
   | `ENV_FILE` | Variable | e.g. `/home/ec2-user/seta/prod.env` |
   | `AWS_REGION` | Variable | `ap-southeast-1` |
   | `S3_REGION` | Variable | `ap-southeast-1` |
   | `S3_BUCKET` | Variable | `seta-prod-app-apse1` |
   | `RDS_INSTANCE_ID` | Variable | `seta-prod-pg` (used by the pre-migration snapshot step) |
   | `PUBLIC_DOMAIN` / `PUBLIC_URL` | Variable | the Cloudflare-published hostname |
   | `PLATFORM_TLS_MODE` | Variable | `none` (TLS terminates at Cloudflare) |
   | `PROD_HEALTH_URL` | Variable | the Cloudflare-published `/health/ready` URL (probed by self-heal) |
   | `PROD_LAST_GOOD_TAG` | Variable | written automatically by every successful `prod` deploy — do not hand-set except to bootstrap the first value |
   | `MONITORING_ENV` | Variable | `prod` |
   | `REMOTE_WRITE_URL` / `LOKI_URL` | Variable | central Prometheus/Loki push endpoints (see [§9](#9-observability)) |
   | `REMOTE_WRITE_USERNAME` / `REMOTE_WRITE_PASSWORD` | Secret | basic-auth credentials for the central stack's receivers |
   | `MAILER_*` | Variable/Secret | as in `docs/hosting/configuration.md` |
   | `M365_*` | Variable/Secret | as in `docs/hosting/configuration.md` |
   | `DATABASE_URL` | Secret | full RDS DSN: `postgres://seta:<password>@<db_endpoint output>/seta?sslmode=no-verify` — the password component is the "`DATABASE_PASSWORD`" referenced by `var.db_master_password`'s description; see [§8](#8-rds-password-rotation-runbook). |
   | `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` | Secret | **leave unset.** The app's S3 client falls back to the EC2 instance role (`iam.tf`'s `s3-app` policy) — no static keys on the box. |

   `COMPOSE_PROFILES=obs-agent` turns on the Grafana Alloy agent, `node-exporter`, `postgres-exporter` (`compose.yaml`), and `cloudwatch-exporter` (`compose.prod.yaml`) — see [§9](#9-observability). `bundled-db` is intentionally **not** in `COMPOSE_PROFILES`: prod always uses external RDS, never the bundled Postgres container.

## 4. Deploy

Prod uses the same **build-once → ECR → deploy-by-pull** pipeline as dev/uat (see [`deploying.md`](deploying.md)); there is no prod-specific workflow file, only the `prod` / `prod-recovery` GitHub Environments feeding the same `deploy.yml`.

1. **Build** — `build.yml` (manual) builds `linux/amd64` server + web images, pushes `server-git-<sha>` / `web-git-<sha>` (immutable) plus a moving `-latest` to the shared ECR repo.
2. **Deploy** — run `deploy.yml` with `environment=prod` and `image_tag=<git-sha or latest>`. Because `prod` has a required reviewer, the run pauses for approval before the job starts. Once approved, the job:
   - logs into ECR (box's instance role — no static keys),
   - renders `prod.env` from the `prod` Environment's Variables/Secrets (`scripts/release/render-env.sh`),
   - takes a **pre-migration RDS snapshot** (`aws rds create-db-snapshot`, named `seta-prod-pg-pre-<image_tag>-<timestamp>`, waits for `available`) — see [§7](#7-runbook-backup--restore),
   - `docker compose pull`, `docker compose run --rm migrator` — this runs Drizzle migrations, including `CREATE EXTENSION vector` (RDS Postgres ships the `vector` extension; no Terraform parameter-group change is needed — the extension is created at migration time, not provisioning time),
   - `docker compose up -d --wait proxy server web worker`,
   - smoke-tests `/health/ready` through the Cloudflare-published URL (12 retries × 5s),
   - on success, records `PROD_LAST_GOOD_TAG = image_tag` (repo Variable) — the pointer [self-heal](#5-runbook-instance-replacement) uses.

A normal prod release is: **Build**, then **Deploy** (`environment=prod`), approve the gate.

## 5. Runbook: instance replacement

The ASG (`min_size = max_size = desired_capacity = 1`) replaces the box automatically on health-check failure or manual termination, and `user-data.sh.tftpl` makes the replacement **self-restoring, with no human involved**, in the common case:

1. **ASG detects** the instance unhealthy (or an operator terminates it) and launches a replacement from the current launch template version.
2. **User-data runs on first boot**: installs Docker + the compose plugin, installs `cloudflared` and registers it as a systemd service (token from `/seta/prod/cloudflared-token`), mints a fresh GitHub Actions runner registration token (from `/seta/prod/gh-runner-registration`) and installs the runner as a systemd service with `--labels prod --replace --ephemeral`.
3. **The runner comes online** (labelled `prod`) but the box has **no app running yet** — user-data does not `docker compose up` anything; it only restores the *capability to deploy*.
4. **The self-heal workflow** (`.github/workflows/prod-self-heal.yml`) polls `PROD_HEALTH_URL` every 10 minutes. Once it sees the health check failing (the old box is gone, the new one hasn't deployed yet) it dispatches `deploy.yml` with `environment=prod-recovery` and `image_tag=${{ vars.PROD_LAST_GOOD_TAG }}` — the **non-gated** Environment, so this runs with no human approval. The deploy job (same steps as §4, minus the reviewer pause) pulls the last-known-good image, runs the migrator (a no-op if nothing changed since last deploy), and brings the stack up.
5. **Fail-closed by design:** if `PROD_LAST_GOOD_TAG` is unset, self-heal exits 1 rather than deploying the mutable `latest` tag — it never guesses at a version.

**Expected timeline:** ASG detection + replacement launch (~2–5 min) + user-data boot (~2–3 min, mostly package installs) + up to 10 min until the next self-heal poll + deploy (~2–5 min, migrator is normally a no-op) ≈ **10–20 minutes from failure to a healthy app**, fully unattended.

**Manual fallback (total-box-loss / SSM params missing or expired):** if the Tunnel token or GitHub PAT in SSM has expired, or was never seeded (e.g. after deleting and recreating the parameters), user-data's `aws ssm get-parameter` calls fail and the box comes up with no tunnel and no runner — self-heal cannot reach it because there is no health signal, and there is no runner to dispatch a deploy on. Recovery:
1. Re-seed both SSM parameters (§3 step 2) with fresh values.
2. Manually terminate the broken instance (or run `terraform apply` — the launch template is unchanged, so this just triggers another ASG replacement) to force a fresh boot with the corrected parameters.
3. Once the runner shows **Idle**, either wait for the next self-heal poll or run `workflow_dispatch` on `prod-self-heal.yml` directly to trigger recovery immediately.

## 6. Runbook: rollback

Three independent layers — pick the one that matches the incident:

- **App rollback.** Run `deploy.yml` with `environment=prod` and `image_tag=<prior server-git-<sha>>` (from a previous `build.yml` run summary, or `PROD_LAST_GOOD_TAG`'s prior value in the Environment history). No rebuild — the immutable tag is already in ECR. This re-runs the migrator, so only roll back to a tag whose migrations are compatible with the current DB state (see DB rollback below if not).
- **DB rollback.** Every prod deploy takes a labelled pre-migration snapshot (`seta-prod-pg-pre-<image_tag>-<timestamp>`, §4). To roll back the schema: restore that snapshot to a new RDS instance (`aws rds restore-db-snapshot` — see [§7](#7-runbook-backup--restore) for the full restore procedure), point `DATABASE_URL` at the restored endpoint, redeploy the matching app version.
- **Infra rollback.** For a bad Terraform change (wrong instance type, broken security group, etc.): `git revert` or `git checkout` the prior commit for `infra/terraform/prod/`, then `terraform plan` / `apply` from that state. Because the ASG's `instance_refresh` block triggers automatically whenever the launch template's `latest_version` changes, reverting `compute.tf` and applying is enough to roll the box back to the prior configuration — no separate `instance_refresh` command needed (though `aws autoscaling start-instance-refresh` works too if a refresh needs to be forced without a config change).

## 7. Runbook: backup & restore

| Asset | Mechanism | Retention |
|---|---|---|
| RDS data | Automated backups + PITR (`backup_retention_period = 7` in `data.tf`) | 7 days |
| RDS data (release boundaries) | Pre-migration manual snapshot, taken by every prod `deploy.yml` run | Until manually pruned |
| S3 app bucket | Versioning enabled (`storage.tf`) + noncurrent-version expiration | 30 days for old versions |
| RDS instance itself | `deletion_protection = true` + `lifecycle.prevent_destroy = true` | N/A — blocks accidental `terraform destroy` |

**Recovery objectives:** RPO ≈ 5 minutes (RDS PITR granularity), RTO ≈ 30–60 minutes (restore a new instance from snapshot/PITR, repoint `DATABASE_URL`, redeploy, smoke-test).

### Restore procedure

1. Identify the restore point: a specific pre-migration snapshot (`aws rds describe-db-snapshots --db-instance-identifier seta-prod-pg`) or a PITR timestamp within the last 7 days.
2. Restore to a **new** instance (never in-place):
   ```bash
   # from a snapshot
   aws rds restore-db-instance-from-db-snapshot \
     --db-instance-identifier seta-prod-pg-restore-<date> \
     --db-snapshot-identifier <snapshot-id>

   # or point-in-time
   aws rds restore-db-instance-to-point-in-time \
     --source-db-instance-identifier seta-prod-pg \
     --target-db-instance-identifier seta-prod-pg-restore-<date> \
     --restore-time <ISO8601 timestamp>
   ```
3. Wait for `available` (~10–15 min for `db.t3.micro`).
4. Update the `prod` (and `prod-recovery`) Environment's `DATABASE_URL` secret to the restored instance's endpoint.
5. Run `deploy.yml` (`environment=prod`) to bring the app up against the restored DB and smoke-test.
6. Once validated, either promote the restored instance (update Terraform's `aws_db_instance.main` via `terraform import`/manual reconciliation) or keep it as a side-by-side validation instance and cut over deliberately — don't leave two prod-labelled DBs running unmanaged.

### Tested restore drill

**"Backups exist" is not "restore works."** Run this drill on the schedule below and after any RDS/Terraform change that touches backup config:

1. Pick the most recent pre-migration snapshot (or a PITR timestamp from the last 24h).
2. Restore it to a new, disposable RDS instance (`seta-prod-pg-drill-<date>`) in the same VPC.
3. Point a disposable deploy (a temporary compose stack or a second `server` container) at the restored instance's `DATABASE_URL`.
4. Validate: `/health/ready` returns 200, a test user can log in, `docker compose run --rm migrator` is a no-op (all migrations already applied), and the latest rows in `core.events` have plausible timestamps.
5. Record the wall-clock time from "start restore" to "validated." If it drifts materially above the 30–60 min RTO, raise a follow-up.
6. Tear down the drill instance (`terraform state rm` was never used for it — it was never in state — just `aws rds delete-db-instance --skip-final-snapshot`).

**Schedule:** at least once before this environment is trusted for real traffic, then quarterly (align with the same cadence as [`disaster-recovery.md`](disaster-recovery.md)'s existing drill).

## 8. RDS password rotation runbook

The RDS master password is a **single value with two independent homes** that must never drift apart: the GitHub `prod`/`prod-recovery` Environment's `DATABASE_URL` secret (password component — informally "`DATABASE_PASSWORD`") and Terraform's `var.db_master_password` (`terraform.tfvars`, gitignored). Because Terraform owns the actual RDS master password and GitHub Actions owns what the app connects with, an update to one **without** the other breaks prod: either the app can't authenticate, or the next `terraform apply` resets RDS to a password the app doesn't have.

**Atomic-update procedure** (treat as one change, not two):

1. Generate the new password.
2. Update `terraform.tfvars` locally (`db_master_password = "<new>"`).
3. `terraform plan` — confirm the **only** change is `aws_db_instance.main`'s password (an in-place update, not a replace; `apply_immediately = false` means RDS applies it in the next maintenance window **unless** you force it — see step 4).
4. `terraform apply` with `apply_immediately` forced for this one operation (either temporarily flip `apply_immediately = true` in `data.tf` for this apply and revert after, or use `aws rds modify-db-instance --apply-immediately` directly) — a deferred password change means the box is locked out until the next maintenance window, which is not acceptable for a rotation.
5. Immediately update the `DATABASE_URL` secret in **both** the `prod` and `prod-recovery` GitHub Environments to the same new password (same DSN, password swapped).
6. Redeploy (`deploy.yml`, `environment=prod`) to pick up the new secret and confirm `/health/ready` and a DB-touching smoke path succeed.
7. If step 6 fails, you have a short window where RDS has the new password but the running containers still hold the old one in their env — redeploying (step 6 again) resolves it; there is no code that caches the old password beyond process restart.

Do this during a low-traffic window; there is a brief moment (between step 4 landing and step 6 completing) where the currently-running containers hold a stale password and would fail to open new DB connections.

## 9. Observability

Prod does **not** use CloudWatch Logs. `COMPOSE_PROFILES=obs-agent` (§3) turns on a **Grafana Alloy** agent (`compose.yaml`'s `alloy` service) that:

- scrapes the app's Prometheus metrics (`server`/`worker` on port `9464`) and `node-exporter` (host CPU/mem/disk — disk-full is the single-box failure mode to watch) and `postgres-exporter` (RDS connection/query stats via `DATABASE_URL`), then `remote_write`s them to the central Prometheus (`REMOTE_WRITE_URL`, basic-auth via `REMOTE_WRITE_USERNAME`/`PASSWORD`),
- tails container logs and pushes them to the central Loki (`LOKI_URL`),
- tags every series/log line with `MONITORING_ENV=prod` so the central Grafana can filter/compare across dev/uat/prod in one dashboard set.

RDS itself only exposes infra-level metrics (storage-fill, burst-balance, connection count) via **CloudWatch metrics** (not Logs) — `compose.prod.yaml`'s `cloudwatch-exporter` service (also gated on `obs-agent`) scrapes those read-only via the instance role's `cloudwatch-read` IAM policy and re-exposes them on `:9106` for Alloy to pick up alongside the app metrics. This is the **only** CloudWatch usage in prod: no CloudWatch Logs, no CloudWatch alarms — alerting lives in the central stack.

The central Prometheus + Loki + Grafana stack (`compose.monitoring.yaml`) runs on a separate VPS, not in this AWS account — it is the single pane of glass across all environments (dev/uat/prod), not something this Terraform module provisions. Alertmanager wiring (email + MS 365 Teams) and the dead-man's-switch / blackbox-probe hardening called out in the FUT-388 review are a separate follow-up slice, tracked outside this doc.

## 10. Future levers

Deliberately **not** built at this tier — each is a known, documented lever to pull if/when prod outgrows a single box, not a gap:

- **NAT gateway** — only needed if a private-subnet workload requires outbound internet; today nothing does (the app box is in a public subnet for its own egress, RDS needs none).
- **Elastic IP** — the box's public IP is ephemeral today because nothing inbound depends on it (Cloudflare Tunnel is outbound-initiated). Would matter if something needed a stable IP to hand to a third party (e.g. an IP allowlist on an external API).
- **Load balancer** — needed once the ASG runs more than one instance; today `min_size = max_size = 1` makes an ALB pure overhead.
- **Multi-AZ RDS** — trades cost for automatic failover; the current single-AZ + 7-day PITR + tested restore drill (§7) is the deliberate tradeoff until availability requirements tighten.
- **Larger instance class** — `t3.medium` (app) / `db.t3.micro` (DB) are sized for current load; bump `var.instance_type` / `var.db_instance_class` and re-`apply` when metrics (§9) show sustained pressure.
