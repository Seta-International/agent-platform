# Example: split-services (per-module ECS topology)

Deploys Seta as **N** ECS Fargate services — one per loaded module — wired via ECS Service Connect with mTLS issued by AWS Private CA. Best fit for: workloads where one module dominates CPU/memory/LLM cost and benefits from an independent scaling envelope (typically `copilot`).

**Status:** stub — full HCL ships in the Layer 4 follow-up PR.

## What this example provisions (planned)

Everything in `single-service`, plus:

- AWS Private CA (short-lived mode) for east-west mTLS.
- Per-module ECS services:
  - `seta-gateway` — `SETA_MODULES=identity,core` (owns the bus dispatcher).
  - `seta-planner` — `SETA_MODULES=planner`.
  - `seta-copilot` — `SETA_MODULES=copilot`.
  - `seta-integrations` — `SETA_MODULES=integrations`.
- Cloud Map namespace `seta.local` for service discovery.
- Per-service security groups allowing only Service Connect east-west traffic.

The gateway service is the only one attached to the public ALB. All other services serve `/_rpc/<module>/*` over Service Connect endpoints — never directly internet-reachable.

## Bus ownership

Per `docs/superpowers/specs/2026-05-20-deployment-strategy-design.md` §6, the container that loads `core` owns the `LISTEN/NOTIFY` dispatch and the 2-second fallback poll. In this example that is the gateway service. Other services run their own subscriber-cursor polling for the events they subscribe to.

## Apply (after follow-up PR ships the HCL)

```bash
cp terraform.tfvars.example terraform.tfvars
$EDITOR terraform.tfvars                  # set image_uri, domain, region, per-service capacity
tofu init
tofu plan -out=tfplan
tofu apply tfplan
```

After the first apply, run migrations once per module via `../../scripts/run-migrations.sh` (the helper that wraps `aws ecs run-task` with the migrator task definition).

See `docs/superpowers/plans/2026-05-20-deployment-layer-4-opentofu-aws.md` Task 8 for the full HCL.
