# bootstrap-sandbox

One-time, hand-applied setup in the sandbox AWS account that the sandbox e2e
depends on. Uses LOCAL state (no backend) — it creates the state bucket the rest
of the sandbox uses. The account id is read from the caller identity, not
hardcoded; point `AWS_PROFILE` at the sandbox account before applying.

    export AWS_PROFILE=<your sandbox profile>
    cd infra/terraform/bootstrap-sandbox
    terraform init
    terraform apply

Creates: the GitHub OIDC provider, the `gha-sandbox` deploy role (trusts
`repo:<org>/<repo>:environment:sandbox`), and the tfstate bucket
`<state_bucket_prefix>-<account-id>`.

Then wire the outputs into GitHub:

- `gha_sandbox_role_arn` → `sandbox` environment secret `AWS_SANDBOX_ROLE_ARN`
- `tfstate_bucket` → used as the `-backend-config=bucket=...` for the `sandbox/`
  config (the workflow reads it automatically via caller identity).
