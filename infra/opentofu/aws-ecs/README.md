# Seta on AWS — OpenTofu module

This directory provisions the AWS ECS Fargate topology described in `docs/superpowers/specs/2026-05-20-deployment-strategy-design.md` §5.5. It is the executable form of the diagram in [`docs/hosting/aws.md`](../../../docs/hosting/aws.md).

## Status

Layer 4 of the deployment strategy ships in two PRs:

1. **This PR — scaffolding.** Directory shape, root config, gate script, single-service example skeleton. The Cloud Posse-composed per-module HCL bodies are deferred.
2. **Follow-up PR — full HCL bodies.** Implements `modules/seta-service/`, `modules/seta-private-ca/`, `modules/seta-rds-pgvector/`, and the `examples/split-services/` topology. Lands when an operator with `tofu` installed can run `tofu fmt -check && tofu validate` against the full tree before merge.

The reason for the split: the surrounding tooling (gate script, `.gitignore`, README) is verifiable without OpenTofu installed. The HCL bodies require `tofu validate`, which requires the OpenTofu CLI and (for some checks) network access to fetch provider schemas. Shipping un-validated HCL in this PR would land code that "looks right" but has not been exercised by the tool that will execute it. The follow-up PR closes that gap.

The plan is fully written: see `docs/superpowers/plans/2026-05-20-deployment-layer-4-opentofu-aws.md`. Each task in that plan corresponds to one file in the tree below.

## Topology summary

```
                       ┌───────────────────┐
       Internet ─────► │  Public ALB       │
                       │  (api.<domain>)   │
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
        └──────┬──────┘ └──────┬──────┘ └──────┬──────┘
               │               │               │
               └───────────────┼───────────────┘
                               ▼
                       ┌───────────────────┐
                       │  RDS Aurora PG    │
                       │  (pgvector)       │
                       └───────────────────┘

S3 + CloudFront (seta-web) ────► app.<domain>
```

For the single-service variant, the per-module ECS services collapse into one; the same code runs with `SETA_MODULES=*`.

## Layout

```
infra/opentofu/aws-ecs/
  README.md                     # this file
  versions.tf                   # required_version + required_providers
  variables.tf                  # variables shared across examples
  backend.tf                    # commented S3 backend template
  outputs.tf                    # top-level convenience outputs
  main.tf                       # placeholder; examples are the entrypoints
  modules/
    seta-service/               # one ECS Fargate service + ALB target + Service Connect endpoint
    seta-private-ca/            # AWS Private CA for east-west mTLS (opt-in)
    seta-rds-pgvector/          # Aurora Postgres + pgvector RunTask bootstrap
  examples/
    single-service/             # one ECS service, SETA_MODULES=*  ← default
    split-services/             # one ECS service per loaded module
```

## Decisions locked in

These resolve open questions called out in `docs/superpowers/specs/2026-05-20-deployment-strategy-design.md` §9. The follow-up PR repeats them in module-local READMEs.

1. **Migrator runs as `aws ecs run-task`, not as a compose service.** The same `seta-server` image with `command: ["migrate"]` is invoked by `scripts/run-migrations.sh` from the Layer 5 deploy workflow.
2. **Cloud Posse module versions pinned by exact tag.** No `~>` ranges. Bumps require an ADR row.
3. **AWS Private CA = short-lived mode.** Lower cost; ECS Service Connect handles 5-day cert rotation.
4. **NAT topology = one NAT gateway in one AZ** for v1 (cost-conscious). Per-AZ NAT documented as a one-flag flip.
5. **Image source is variable-controlled** — GHCR or ECR. Default ECR with a precondition that fails if left at placeholder.
6. **Web tier optional** — `var.enable_web_tier = true` defaults on; flip off if the bundle deploys elsewhere.

## Verification

The supported gate is:

```bash
./scripts/check-opentofu.sh
```

Which runs `tofu fmt -check` and `tofu validate` against every directory under `infra/opentofu/` that contains `*.tf` files. The script no-ops with a friendly notice when `tofu` is not installed (so non-infra contributors don't have to install OpenTofu to run `pnpm lint`).

CI runs the same script on a runner with `tofu >= 1.10` installed. The Layer 5 release workflow does NOT call `tofu apply` — production deploys are a separate, environment-approved workflow gated on review.

## Apply (operator workflow, not part of CI)

```bash
cd infra/opentofu/aws-ecs/examples/single-service
cp terraform.tfvars.example terraform.tfvars
$EDITOR terraform.tfvars                  # set image_uri, domain, secrets ARNs, ACM cert ARN
tofu init                                 # downloads providers + Cloud Posse modules
tofu plan -out=tfplan
tofu apply tfplan
```

Then trigger the first migration:

```bash
../../../../../scripts/run-migrations.sh    # wraps aws ecs run-task with the migrator task definition
```

See [`docs/hosting/aws.md`](../../../docs/hosting/aws.md) for the surrounding context (DNS, OIDC trust policy, repository variables for the release workflow).
