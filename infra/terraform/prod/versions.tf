terraform {
  required_version = ">= 1.11.0"
  required_providers {
    aws    = { source = "hashicorp/aws", version = "~> 6.0" }
    http   = { source = "hashicorp/http", version = "~> 3.4" }
    random = { source = "hashicorp/random", version = "~> 3.6" }
  }
}

provider "aws" {
  region = var.region
  default_tags {
    tags = local.tags
  }
}

locals {
  tags = {
    Project   = "seta"
    Env       = "prod"
    ManagedBy = "terraform"
  }
}
