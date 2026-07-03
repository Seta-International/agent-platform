# Terraform state bootstrap

Run **once per account**, with local state, before applying `../prod`:

    cd infra/terraform/bootstrap
    terraform init
    terraform apply

Creates `seta-tfstate-prod-apse1` (versioned, KMS-encrypted, public-access-blocked).
Commit the resulting `.terraform.lock.hcl`. Do NOT commit `terraform.tfstate`
(it is gitignored). This directory is applied by a human operator, not CI.
