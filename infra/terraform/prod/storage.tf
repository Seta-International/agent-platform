# Models the real future-app-bucket-prod-seta S3 bucket and the
# future-app ECR repository. Adopted via import — only the sub-resources
# that actually exist are declared (no bucket policy, no CORS/website/
# logging config, no custom ACL beyond the default owner-full-control).

resource "aws_s3_bucket" "app" {
  bucket = "future-app-bucket-prod-seta"

  lifecycle {
    prevent_destroy = true # guard uploaded objects against destroy/replace
  }
}

resource "aws_s3_bucket_versioning" "app" {
  bucket = aws_s3_bucket.app.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "app" {
  bucket = aws_s3_bucket.app.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_public_access_block" "app" {
  bucket                  = aws_s3_bucket.app.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_lifecycle_configuration" "app" {
  bucket = aws_s3_bucket.app.id
  rule {
    id     = "expire-noncurrent-versions"
    status = "Enabled"
    filter {
      prefix = ""
    }
    noncurrent_version_expiration {
      noncurrent_days = 30
    }
    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }
}

resource "aws_ecr_repository" "app" {
  name                 = "future-app"
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }

  encryption_configuration {
    encryption_type = "AES256"
  }

  # Repo carries a stray Environment=dev tag from whatever created it,
  # inconsistent with every other future-app resource (all Environment=prod).
  # Preserved as-is rather than "fixed" here — flip in a follow-up ticket
  # if it should read prod.
  tags = { Environment = "dev" }
}
