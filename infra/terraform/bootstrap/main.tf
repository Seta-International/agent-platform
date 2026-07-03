# Bootstrap: creates the remote-state bucket ONCE, with local state.
# A state bucket cannot store its own creation, so this is applied out-of-band
# before `prod/` uses it as its S3 backend.

resource "aws_s3_bucket" "tfstate" {
  bucket = "seta-tfstate-prod-apse1"

  # Guard against accidental `terraform destroy` wiping prod state history.
  lifecycle {
    prevent_destroy = true
  }

  tags = {
    Project   = "seta"
    Env       = "prod"
    ManagedBy = "terraform"
    Purpose   = "tfstate"
  }
}

resource "aws_s3_bucket_versioning" "tfstate" {
  bucket = aws_s3_bucket.tfstate.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "tfstate" {
  bucket = aws_s3_bucket.tfstate.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "aws:kms"
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_public_access_block" "tfstate" {
  bucket                  = aws_s3_bucket.tfstate.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}
