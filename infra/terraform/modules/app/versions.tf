terraform {
  required_version = ">= 1.11.0"
  required_providers {
    # us_east_1 alias: CloudFront only accepts ACM certs from us-east-1.
    aws = {
      source                = "hashicorp/aws"
      version               = "~> 6.0"
      configuration_aliases = [aws.us_east_1]
    }
  }
}
