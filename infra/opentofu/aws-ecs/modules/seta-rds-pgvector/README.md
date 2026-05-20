# Module: `seta-rds-pgvector`

Provisions Aurora Postgres Serverless v2 with the `pgvector` extension enabled, plus the DSN secret in Secrets Manager that ECS task definitions reference.

**Status:** stub — full HCL ships in the Layer 4 follow-up PR.

## Inputs (planned)

| Variable | Type | Description |
|---|---|---|
| `name` | string | Stack name prefix. |
| `vpc_id` | string | VPC the cluster lives in. |
| `database_subnet_ids` | list(string) | Subnet IDs (private, db tier). |
| `min_capacity` | number | Aurora Serverless v2 min ACU. |
| `max_capacity` | number | Aurora Serverless v2 max ACU. |
| `backup_retention_days` | number | Default 7. |

## Outputs (planned)

| Output | Description |
|---|---|
| `cluster_endpoint` | Writer endpoint hostname. |
| `dsn_secret_arn` | Secrets Manager ARN holding the full `DATABASE_URL`. |

## pgvector enablement

The Cloud Posse `terraform-aws-rds-cluster` module provisions the cluster but does not run extension DDL. The follow-up PR's `main.tf` triggers a one-shot ECS RunTask after cluster creation that runs `CREATE EXTENSION IF NOT EXISTS vector` — first-apply only, idempotent on re-apply.

See `docs/superpowers/plans/2026-05-20-deployment-layer-4-opentofu-aws.md` Task 6 for the full HCL.
