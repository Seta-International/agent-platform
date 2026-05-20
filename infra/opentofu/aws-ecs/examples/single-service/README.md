# Example: single-service (monolith on ECS)

Deploys Seta as **one** ECS Fargate service running `seta-server` with `SETA_MODULES=*`. The same image as the OSS self-host. Best fit for: production deployments that do not yet need per-module scaling.

**Status:** stub — full HCL ships in the Layer 4 follow-up PR.

## What this example provisions (planned)

- VPC + one public subnet + one private subnet across two AZs (one NAT gateway in AZ-a; flip to per-AZ NAT for higher availability — variable).
- ALB on `api.<domain>` with ACM cert.
- One ECS Fargate service (`SETA_MODULES=*`) behind the ALB.
- Aurora Postgres Serverless v2 with `pgvector`.
- S3 + CloudFront for the `seta-web` bundle on `app.<domain>` (toggle via `var.enable_web_tier`).
- One Secrets Manager entry per environment for the DSN.

## What this example does NOT provision

- AWS Private CA — east-west mTLS is unnecessary when there's only one service. See the `split-services` example for the multi-service topology that opts in.

See `docs/superpowers/plans/2026-05-20-deployment-layer-4-opentofu-aws.md` Task 7 for the full HCL the follow-up PR will land.

## Apply (after follow-up PR ships the HCL)

```bash
cp terraform.tfvars.example terraform.tfvars
$EDITOR terraform.tfvars                  # set image_uri, domain, region
tofu init
tofu plan -out=tfplan
tofu apply tfplan
```
