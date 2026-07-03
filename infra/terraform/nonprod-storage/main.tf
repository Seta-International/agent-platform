resource "aws_s3_bucket" "app" {
  for_each = var.envs
  bucket   = "seta-${each.key}-app-apse1"
  tags     = { Env = each.key }
}

resource "aws_s3_bucket_versioning" "app" {
  for_each = aws_s3_bucket.app
  bucket   = each.value.id
  versioning_configuration { status = "Enabled" }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "app" {
  for_each = aws_s3_bucket.app
  bucket   = each.value.id
  rule {
    apply_server_side_encryption_by_default { sse_algorithm = "aws:kms" }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_public_access_block" "app" {
  for_each                = aws_s3_bucket.app
  bucket                  = each.value.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_lifecycle_configuration" "app" {
  for_each = aws_s3_bucket.app
  bucket   = each.value.id
  rule {
    id     = "expire-noncurrent"
    status = "Enabled"
    filter {}
    noncurrent_version_expiration { noncurrent_days = 30 }
  }
}

resource "aws_iam_user" "app" {
  for_each = var.envs
  name     = "seta-${each.key}-app-s3"
}

data "aws_iam_policy_document" "app" {
  for_each = var.envs
  statement {
    sid       = "ListBucket"
    actions   = ["s3:ListBucket"]
    resources = [aws_s3_bucket.app[each.key].arn]
  }
  statement {
    sid       = "ObjectRW"
    actions   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
    resources = ["${aws_s3_bucket.app[each.key].arn}/*"]
  }
}

resource "aws_iam_user_policy" "app" {
  for_each = var.envs
  name     = "s3-app"
  user     = aws_iam_user.app[each.key].name
  policy   = data.aws_iam_policy_document.app[each.key].json
}

resource "aws_iam_access_key" "app" {
  for_each = var.envs
  user     = aws_iam_user.app[each.key].name
}
