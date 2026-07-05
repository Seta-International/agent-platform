# S3 backend with native lockfile (Terraform >= 1.11 GA) — no DynamoDB table.
#
# Commented out for the import/adopt validation pass: no state bucket exists
# yet for this module (it was never applied — the real infra was built by
# ClickOps), so `terraform init` here uses local state. Uncomment once the
# state bucket exists and this module has been imported + reconciled.
#
# terraform {
#   backend "s3" {
#     bucket       = "seta-tfstate-prod-apse1"
#     key          = "prod/terraform.tfstate"
#     region       = "ap-southeast-1"
#     encrypt      = true
#     use_lockfile = true
#   }
# }
