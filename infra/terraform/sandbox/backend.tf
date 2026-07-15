# Partial backend config: the bucket name embeds the sandbox account id, so it
# is supplied at init time via -backend-config=bucket=... (derived from the
# caller identity), not hardcoded here. See bootstrap-sandbox for the bucket.
terraform {
  backend "s3" {
    key          = "sandbox/terraform.tfstate"
    region       = "ap-southeast-1"
    encrypt      = true
    use_lockfile = true
  }
}
