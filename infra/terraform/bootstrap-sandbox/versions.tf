terraform {
  required_version = ">= 1.11.0"
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 6.0" }
  }
}

provider "aws" {
  region = var.region
  default_tags {
    tags = {
      Project     = "future-app"
      Environment = "sandbox"
      ManagedBy   = "Terraform"
    }
  }
}
