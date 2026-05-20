# Module: `seta-service`

Provisions one ECS Fargate service for a `seta-server` process — task definition + container definition + ALB target group attachment + Service Connect endpoint registration in the shared `seta.local` namespace.

**Status:** stub — full HCL ships in the Layer 4 follow-up PR. The contract below is the locked interface that the follow-up will implement.

## Inputs (planned)

| Variable | Type | Description |
|---|---|---|
| `name` | string | Service name suffix (e.g. `gateway`, `planner`, `copilot`). |
| `cluster_arn` | string | ECS cluster ARN this service runs in. |
| `vpc_id` | string | VPC ID. |
| `private_subnet_ids` | list(string) | Subnets the tasks run in. |
| `image_uri` | string | Full image reference (GHCR or ECR). |
| `seta_modules` | string | Value of the `SETA_MODULES` env var for this process (`*` or comma list). |
| `cpu` | number | Fargate task CPU units (e.g. 1024). |
| `memory` | number | Fargate task memory in MiB. |
| `desired_count` | number | Initial service replica count. |
| `db_secret_arn` | string | Secrets Manager ARN containing `DATABASE_URL`. |
| `service_connect_namespace_arn` | string | Cloud Map namespace ARN for `seta.local`. |
| `service_connect_port` | number | East-west listen port (defaults 8080). |
| `alb_target_group_arn` | string | Optional; only the gateway service attaches to the ALB. |

## Outputs (planned)

| Output | Description |
|---|---|
| `service_arn` | ARN of the created `aws_ecs_service`. |
| `task_role_arn` | IAM role tasks assume — operators attach extra policies if needed. |
| `service_connect_dns_name` | e.g. `planner.seta.local` for peers to dial. |

## Composition

Built atop:

- `cloudposse/terraform-aws-ecs-alb-service-task` (the service + task definition wrapper).
- `cloudposse/terraform-aws-ecs-container-definition` (container JSON with secrets, port mappings, log config).

See `docs/superpowers/plans/2026-05-20-deployment-layer-4-opentofu-aws.md` Task 4 for the full HCL the follow-up PR will land.
