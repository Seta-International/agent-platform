terraform {
  backend "s3" {
    bucket       = "seta-tfstate-prod-apse1"
    key          = "nonprod-storage/terraform.tfstate"
    region       = "ap-southeast-1"
    encrypt      = true
    use_lockfile = true
  }
}
