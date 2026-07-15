data "aws_caller_identity" "current" {}

# GitHub Actions OIDC provider. Thumbprint list is ignored by AWS for this
# well-known IdP since mid-2023 but the argument is still required.
resource "aws_iam_openid_connect_provider" "github" {
  url             = "https://token.actions.githubusercontent.com"
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = ["ffffffffffffffffffffffffffffffffffffffff"]
}

data "aws_iam_policy_document" "gha_sandbox_trust" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRoleWithWebIdentity"]
    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.github.arn]
    }
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:sub"
      values   = ["repo:${var.github_org_repo}:environment:${var.environment_name}"]
    }
  }
}

resource "aws_iam_role" "gha_sandbox" {
  name               = "gha-sandbox"
  assume_role_policy = data.aws_iam_policy_document.gha_sandbox_trust.json
}

# Sandbox is a throwaway personal account; grant broad rights so the ephemeral
# apply/destroy never blocks on a missing action. Tighten in a follow-up once
# the first green run pins the exact action set.
resource "aws_iam_role_policy_attachment" "gha_sandbox_admin" {
  role       = aws_iam_role.gha_sandbox.name
  policy_arn = "arn:aws:iam::aws:policy/AdministratorAccess"
}

resource "aws_s3_bucket" "tfstate" {
  bucket = "seta-tfstate-sandbox-931628308308"
}

resource "aws_s3_bucket_versioning" "tfstate" {
  bucket = aws_s3_bucket.tfstate.id
  versioning_configuration { status = "Enabled" }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "tfstate" {
  bucket = aws_s3_bucket.tfstate.id
  rule {
    apply_server_side_encryption_by_default { sse_algorithm = "AES256" }
  }
}

resource "aws_s3_bucket_public_access_block" "tfstate" {
  bucket                  = aws_s3_bucket.tfstate.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}
