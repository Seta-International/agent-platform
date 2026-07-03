data "aws_iam_policy_document" "ec2_assume" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ec2.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "app" {
  name               = "${var.name}-app"
  assume_role_policy = data.aws_iam_policy_document.ec2_assume.json
}

# SSM Session Manager (admin access, zero inbound).
resource "aws_iam_role_policy_attachment" "ssm" {
  role       = aws_iam_role.app.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

# ECR pull (auth token is account-wide; read scoped to the repo).
data "aws_iam_policy_document" "ecr_pull" {
  statement {
    sid       = "EcrAuth"
    effect    = "Allow"
    actions   = ["ecr:GetAuthorizationToken"]
    resources = ["*"]
  }
  statement {
    sid    = "EcrPull"
    effect = "Allow"
    actions = [
      "ecr:BatchGetImage",
      "ecr:GetDownloadUrlForLayer",
      "ecr:BatchCheckLayerAvailability",
    ]
    resources = [var.ecr_repository_arn]
  }
}

resource "aws_iam_role_policy" "ecr_pull" {
  name   = "ecr-pull"
  role   = aws_iam_role.app.id
  policy = data.aws_iam_policy_document.ecr_pull.json
}

# S3 app bucket access (no static keys — SDK uses the instance role).
data "aws_iam_policy_document" "s3_app" {
  statement {
    sid       = "ListBucket"
    effect    = "Allow"
    actions   = ["s3:ListBucket"]
    resources = [aws_s3_bucket.app.arn]
  }
  statement {
    sid       = "ObjectRW"
    effect    = "Allow"
    actions   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
    resources = ["${aws_s3_bucket.app.arn}/*"]
  }
}

resource "aws_iam_role_policy" "s3_app" {
  name   = "s3-app"
  role   = aws_iam_role.app.id
  policy = data.aws_iam_policy_document.s3_app.json
}

# Boot secrets for unattended recovery (SSM SecureString, seeded out-of-band).
data "aws_iam_policy_document" "boot_secrets" {
  statement {
    sid       = "ReadBootParams"
    effect    = "Allow"
    actions   = ["ssm:GetParameter"]
    resources = ["arn:aws:ssm:${var.region}:*:parameter/seta/prod/*"]
  }
  statement {
    sid       = "DecryptBootParams"
    effect    = "Allow"
    actions   = ["kms:Decrypt"]
    resources = ["*"] # scope to the SSM KMS key ARN when known
  }
}

resource "aws_iam_role_policy" "boot_secrets" {
  name   = "boot-secrets"
  role   = aws_iam_role.app.id
  policy = data.aws_iam_policy_document.boot_secrets.json
}

# Read-only CloudWatch metrics for the RDS scrape (cloudwatch_exporter). No Logs.
data "aws_iam_policy_document" "cw_read" {
  statement {
    sid       = "CloudWatchRead"
    effect    = "Allow"
    actions   = ["cloudwatch:GetMetricData", "cloudwatch:ListMetrics", "cloudwatch:GetMetricStatistics"]
    resources = ["*"]
  }
}

resource "aws_iam_role_policy" "cw_read" {
  name   = "cloudwatch-read"
  role   = aws_iam_role.app.id
  policy = data.aws_iam_policy_document.cw_read.json
}

resource "aws_iam_instance_profile" "app" {
  name = "${var.name}-app"
  role = aws_iam_role.app.name
}
