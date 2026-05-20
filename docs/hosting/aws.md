# AWS deployment

Seta deploys to AWS via ECS Fargate. The supported infrastructure-as-code path is the OpenTofu module at `infra/opentofu/aws-ecs/` (this page summarizes what it provisions). Run that module against a target account once Layer 4 has been applied to your environment.

## Topology

```
                       ┌───────────────────┐
       Internet ─────► │  Public ALB       │
                       │  (api.seta.io)    │
                       └────────┬──────────┘
                                │  HTTPS
                                ▼
                       ┌───────────────────┐
                       │  ECS: seta-gateway│
                       │  SETA_MODULES=    │
                       │   identity,core   │
                       └────────┬──────────┘
                                │  Service Connect (mTLS via PCA)
                ┌───────────────┼───────────────┐
                ▼               ▼               ▼
        ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
        │ ECS: planner│ │ ECS: copilot│ │ ECS: integr.│
        │ SETA_MODULES│ │ SETA_MODULES│ │ SETA_MODULES│
        │ =planner    │ │ =copilot    │ │ =integr.    │
        └──────┬──────┘ └──────┬──────┘ └──────┬──────┘
               │               │               │
               └───────────────┼───────────────┘
                               ▼
                       ┌───────────────────┐
                       │  RDS Postgres     │
                       │  (pgvector)       │
                       └───────────────────┘

S3 + CloudFront (web tier) ─────► app.seta.io   (independent of ECS)
```

The single-service example (one ECS service, `SETA_MODULES=*`) is the same picture with the gateway and per-module boxes collapsed into one — same image, different env.

## Compute

- One public ALB terminates HTTPS at `api.<domain>`.
- The gateway ECS service runs `seta-server` with `SETA_MODULES=identity,core`. It owns the bus (`core.events` `LISTEN/NOTIFY` dispatcher and the 2 s fallback poll).
- Each split module (`planner`, `copilot`, `integrations`) is its own ECS service with `SETA_MODULES=<module>` and zero shared state with siblings beyond Postgres.
- East-west traffic flows over ECS Service Connect endpoints. AWS Private CA issues mTLS certificates with 5-day rotation; the dispatch shim verifies them on every call.
- The web tier (`seta-web`) deploys to S3 + CloudFront at `app.<domain>` — independent of ECS, so a web bundle update never bounces the API.

## Data

- RDS Postgres (or Aurora Postgres) with the `pgvector` extension, sized per workload.
- One database; modules are isolated by Postgres schemas (`core`, `identity`, `planner`, `copilot`, `integrations`). See `CLAUDE.md` for the boundary rule — no cross-schema FKs, projections live in the consumer's own schema.
- S3 bucket for attachments (Phase B). CloudFront in front of the `seta-web` static bundle.

## What the OpenTofu module owns vs. you own

The module provisions:

- VPC and subnets (or attaches to an existing one — variable-controlled).
- ECS cluster and per-module services using `cloudposse/terraform-aws-ecs-alb-service-task`.
- ALB, target groups, and ACM certificate.
- RDS Postgres with a parameter group enabling `pgvector`.
- AWS Private CA and the Service Connect namespace.
- CloudFront distribution and S3 bucket for `seta-web`.

You own:

- The DNS records pointing at the ALB and the CloudFront distribution.
- Secrets Manager entries the module reads (passwords, API keys).
- The IAM role the deploy workflow uses to call `tofu apply`.

## Image source

AWS production pulls `seta-server` from ECR. CI mirrors GHCR → ECR on every tagged release (see the Layer 5 release workflow). Self-hosters pulling from GHCR directly is supported but not the production path — bandwidth and rate-limit considerations make ECR the right home for prod.

## GitHub Actions OIDC trust policy

The release workflow (`.github/workflows/release.yml`) authenticates to AWS via OIDC — no static AWS access keys live in repository secrets. Set up once per AWS account.

### Step 1: Add the GitHub OIDC provider to IAM

```bash
aws iam create-open-id-connect-provider \
  --url https://token.actions.githubusercontent.com \
  --client-id-list sts.amazonaws.com
```

Skip if your account already has this provider — most do.

### Step 2: Create the IAM role

Trust policy (saved as `trust-policy.json`):

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": {
      "Federated": "arn:aws:iam::<ACCOUNT_ID>:oidc-provider/token.actions.githubusercontent.com"
    },
    "Action": "sts:AssumeRoleWithWebIdentity",
    "Condition": {
      "StringEquals": {
        "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
      },
      "StringLike": {
        "token.actions.githubusercontent.com:sub": "repo:<ORG>/agent-platform:ref:refs/tags/v*"
      }
    }
  }]
}
```

The `StringLike` on `sub` scopes the trust to `refs/tags/v*` only — `main` pushes (the `edge` workflow) cannot assume this role even if the AWS gate were removed.

Attach a policy with these actions (scoped to your ECR repo, S3 bucket, and CloudFront distribution):

- `ecr:GetAuthorizationToken`, `ecr:BatchCheckLayerAvailability`, `ecr:CompleteLayerUpload`, `ecr:InitiateLayerUpload`, `ecr:PutImage`, `ecr:UploadLayerPart`, `ecr:BatchGetImage`
- `s3:PutObject`, `s3:DeleteObject`, `s3:ListBucket`, `s3:GetObject`
- `cloudfront:CreateInvalidation`

### Step 3: Set repository variables

In repository **Settings → Secrets and variables → Actions → Variables**:

| Variable | Example |
|---|---|
| `SETA_AWS_MIRROR` | `true` |
| `SETA_AWS_REGION` | `us-east-1` |
| `SETA_AWS_ROLE_ARN` | `arn:aws:iam::123456789012:role/seta-gha-release` |
| `SETA_ECR_SERVER_URI` | `123456789012.dkr.ecr.us-east-1.amazonaws.com/seta-server` |
| `SETA_S3_WEB_BUCKET` | `seta-web-prod` |
| `SETA_CF_DISTRIBUTION_ID` | `E1ABCDEFGHIJKL` |

OSS forks leave `SETA_AWS_MIRROR` unset — the AWS jobs `if:` gate skips them with no errors.

## See also

- [`scaling.md`](scaling.md) — when to use the split topology shown here vs. a single ECS service.
- [`upgrading.md`](upgrading.md) — migration discipline across split services and Cosign signature verification.
- `infra/opentofu/aws-ecs/README.md` — the executable form (Layer 4 — see that directory once it lands).
