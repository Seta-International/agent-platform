# ─────────────────────────────────────────────────────────────────────────────
# Platform hackathon / demo stack
#
# Topology: 1 EC2 (Docker Compose, public IP) + S3 backup bucket.
# PostgreSQL runs as a container on the same host — no RDS.
# Backup: daily pg_dump → S3 (via cron in user_data) + EBS snapshot via DLM.
#
# NOT for production. For the full ECS topology see infra/opentofu/aws-ecs/.
# ─────────────────────────────────────────────────────────────────────────────

locals {
  prefix = var.name
}

# ── Data ─────────────────────────────────────────────────────────────────────

data "aws_availability_zones" "available" {
  state = "available"
}

# Default VPC — avoids VPC provisioning overhead for a demo stack.
data "aws_vpc" "default" {
  default = true
}

data "aws_subnets" "default_public" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default.id]
  }
}

# ── S3 backup bucket ─────────────────────────────────────────────────────────

resource "random_id" "bucket_suffix" {
  byte_length = 4
}

resource "aws_s3_bucket" "backup" {
  bucket        = "${local.prefix}-backup-${random_id.bucket_suffix.hex}"
  force_destroy = true # demo bucket; allow teardown without emptying manually
}

resource "aws_s3_bucket_versioning" "backup" {
  bucket = aws_s3_bucket.backup.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_public_access_block" "backup" {
  bucket                  = aws_s3_bucket.backup.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "backup" {
  bucket = aws_s3_bucket.backup.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "backup" {
  bucket = aws_s3_bucket.backup.id

  rule {
    id     = "expire-old-dumps"
    status = "Enabled"
    filter { prefix = "db/" }
    expiration {
      days = var.backup_retention_days
    }
  }
}

# ── IAM: EC2 instance role ────────────────────────────────────────────────────

resource "aws_iam_role" "ec2" {
  name = "${local.prefix}-ec2-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "ec2.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy" "backup_s3" {
  name = "${local.prefix}-backup-s3"
  role = aws_iam_role.ec2.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        # Allow upload/list only on the backup bucket — principle of least privilege.
        Effect = "Allow"
        Action = [
          "s3:PutObject",
          "s3:GetObject",
          "s3:ListBucket",
          "s3:DeleteObject"
        ]
        Resource = [
          aws_s3_bucket.backup.arn,
          "${aws_s3_bucket.backup.arn}/*"
        ]
      }
    ]
  })
}

resource "aws_iam_role_policy" "ecr_pull" {
  name = "${local.prefix}-ecr-pull"
  role = aws_iam_role.ec2.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = ["ecr:GetAuthorizationToken"]
        Resource = "*"
      },
      {
        Effect = "Allow"
        Action = [
          "ecr:GetDownloadUrlForLayer",
          "ecr:BatchGetImage",
          "ecr:BatchCheckLayerAvailability"
        ]
        Resource = "arn:aws:ecr:${var.region}:*:repository/${var.ecr_repository}"
      }
    ]
  })
}

resource "aws_iam_instance_profile" "ec2" {
  name = "${local.prefix}-ec2-profile"
  role = aws_iam_role.ec2.name
}

# ── Security group ────────────────────────────────────────────────────────────

resource "aws_security_group" "ec2" {
  name        = "${local.prefix}-ec2-sg"
  description = "Platform hackathon EC2: HTTPS public, SSH office-only, all egress."
  vpc_id      = data.aws_vpc.default.id

  dynamic "ingress" {
    for_each = length(var.allowed_ssh_cidrs) > 0 ? [1] : []
    content {
      description = "SSH from allowed CIDRs only"
      from_port   = 22
      to_port     = 22
      protocol    = "tcp"
      cidr_blocks = var.allowed_ssh_cidrs
    }
  }

  ingress {
    description      = "HTTPS"
    from_port        = 443
    to_port          = 443
    protocol         = "tcp"
    cidr_blocks      = [for c in var.allowed_https_cidrs : c if !strcontains(c, ":")]
    ipv6_cidr_blocks = [for c in var.allowed_https_cidrs : c if strcontains(c, ":")]
  }

  # Port 80 open only for ACME HTTP-01 challenge redirect; Traefik redirects to 443.
  ingress {
    description = "HTTP (ACME challenge redirect only)"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    description = "All outbound"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

# ── EC2 instance ──────────────────────────────────────────────────────────────

resource "aws_instance" "app" {
  ami                    = var.ami_id
  instance_type          = var.instance_type
  key_name               = var.key_name != "" ? var.key_name : null
  iam_instance_profile   = aws_iam_instance_profile.ec2.name
  subnet_id              = data.aws_subnets.default_public.ids[0]
  vpc_security_group_ids = [aws_security_group.ec2.id]

  root_block_device {
    volume_type           = "gp3"
    volume_size           = var.ebs_volume_size_gb
    encrypted             = true
    delete_on_termination = true
  }

  user_data = templatefile("${path.module}/user_data.sh", {
    ecr_registry         = var.ecr_registry
    ecr_repository       = var.ecr_repository
    aws_region           = var.region
    domain               = var.domain
    acme_email           = var.acme_email
    postgres_password    = var.postgres_password
    better_auth_secret   = var.better_auth_secret
    openai_api_key       = var.openai_api_key
    copilot_model        = var.copilot_model
    backup_bucket        = aws_s3_bucket.backup.bucket
    jaeger_auth_user     = var.jaeger_auth_user
    jaeger_auth_password = var.jaeger_auth_password
  })

  metadata_options {
    http_tokens                 = "required" # IMDSv2 only — prevents SSRF to instance metadata
    http_put_response_hop_limit = 1
  }

  lifecycle {
    # Replacing the instance destroys Postgres data. Use snapshots to recover.
    prevent_destroy = false
  }
}

# Elastic IP keeps the public address stable across stop/start cycles.
resource "aws_eip" "app" {
  instance = aws_instance.app.id
  domain   = "vpc"
}

# ── EBS snapshot: Data Lifecycle Manager ─────────────────────────────────────

resource "aws_iam_role" "dlm" {
  name = "${local.prefix}-dlm-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "dlm.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "dlm" {
  role       = aws_iam_role.dlm.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSDataLifecycleManagerServiceRole"
}

resource "aws_dlm_lifecycle_policy" "ebs_backup" {
  description        = "${local.prefix} daily EBS snapshot"
  execution_role_arn = aws_iam_role.dlm.arn
  state              = "ENABLED"

  policy_details {
    resource_types = ["INSTANCE"]

    target_tags = {
      Name = "${local.prefix}-app"
    }

    schedule {
      name = "daily"
      create_rule {
        interval      = 24
        interval_unit = "HOURS"
        times         = ["03:00"]
      }
      retain_rule {
        count = var.ebs_snapshot_retention_days
      }
      copy_tags = true
    }
  }
}

resource "aws_ec2_tag" "app_name" {
  resource_id = aws_instance.app.id
  key         = "Name"
  value       = "${local.prefix}-app"
}
