terraform {
  required_version = ">= 1.11.0"
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 6.0" }
  }
}

provider "aws" {
  region = var.region
  default_tags {
    tags = local.tags
  }
}

# Matches the tag set already applied (ClickOps) to every real future-app
# resource: Project / Environment / ManagedBy. Individual resources add
# their own Name (and, for subnets, Tier) tag on top of these.
locals {
  tags = {
    Project     = "future-app"
    Environment = "prod"
    ManagedBy   = "Terraform"
  }
  name = "future-app-prod"
}
