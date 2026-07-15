# bootstrap-sandbox

One-time, hand-applied setup in the canhta account (931628308308) that the
sandbox e2e depends on. Uses LOCAL state (no backend) — it creates the state
bucket the rest of the sandbox uses.

    export AWS_PROFILE=canhta
    cd infra/terraform/bootstrap-sandbox
    terraform init
    terraform apply

Then copy the `gha_sandbox_role_arn` output into the GitHub `sandbox`
environment as secret `AWS_SANDBOX_ROLE_ARN`.
