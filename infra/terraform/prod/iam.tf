# Models the real future-app-prod-ec2-role / -profile. Adopted via import.

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
  name               = "future-app-prod-ec2-role"
  assume_role_policy = data.aws_iam_policy_document.ec2_assume.json
}

resource "aws_iam_role_policy_attachment" "ecr_read_only" {
  role       = aws_iam_role.app.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly"
}

# cloudwatch-exporter (RDS storage/CPU/conns metrics, FUT-388) — CloudWatch has no
# resource-level scoping for ListMetrics/GetMetricData, so this is account-wide read.
data "aws_iam_policy_document" "cloudwatch_read" {
  statement {
    effect    = "Allow"
    actions   = ["cloudwatch:ListMetrics", "cloudwatch:GetMetricData", "cloudwatch:GetMetricStatistics"]
    resources = ["*"]
  }
}

resource "aws_iam_role_policy" "cloudwatch_read" {
  name   = "cloudwatch-read"
  role   = aws_iam_role.app.name
  policy = data.aws_iam_policy_document.cloudwatch_read.json
}

resource "aws_iam_instance_profile" "app" {
  name = "future-app-prod-ec2-profile"
  role = aws_iam_role.app.name
}
