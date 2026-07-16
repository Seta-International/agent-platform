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

# CloudFront only accepts ACM certs from us-east-1.
provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"
  default_tags {
    tags = {
      Project     = "future-app"
      Environment = "sandbox"
      ManagedBy   = "Terraform"
    }
  }
}
