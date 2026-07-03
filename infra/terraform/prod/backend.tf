# S3 backend with native lockfile (Terraform >= 1.11 GA) — no DynamoDB table.
terraform {
  backend "s3" {
    bucket       = "seta-tfstate-prod-apse1"
    key          = "prod/terraform.tfstate"
    region       = "ap-southeast-1"
    encrypt      = true
    use_lockfile = true
  }
}
