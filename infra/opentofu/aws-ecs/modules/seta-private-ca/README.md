# Module: `seta-private-ca`

Provisions an AWS Private Certificate Authority in short-lived mode (5-day rotation, lower cost) for ECS Service Connect mTLS. Opt-in via the root variable `enable_private_ca = true`; the single-service example leaves it off.

**Status:** stub — full HCL ships in the Layer 4 follow-up PR.

## Inputs (planned)

| Variable | Type | Description |
|---|---|---|
| `name` | string | Stack name prefix. |
| `key_algorithm` | string | Default `EC_prime256v1`. |
| `signing_algorithm` | string | Default `SHA256WITHECDSA`. |

## Outputs (planned)

| Output | Description |
|---|---|
| `certificate_authority_arn` | ARN — passed to ECS Service Connect TLS config. |

## Mode rationale

AWS PCA has two modes: **general-purpose** ($400/month + per-cert fees) and **short-lived** ($50/month + lower per-cert). Short-lived caps cert lifetime at 7 days but ECS auto-rotates every 5 — perfect fit for east-west traffic that never leaves the VPC. The general-purpose mode is documented as opt-out in the follow-up README, not the default.

See `docs/superpowers/plans/2026-05-20-deployment-layer-4-opentofu-aws.md` Task 5 for the full HCL.
