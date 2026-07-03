data "aws_ami" "al2023" {
  most_recent = true
  owners      = ["amazon"]
  filter {
    name   = "name"
    values = ["al2023-ami-*-x86_64"]
  }
  filter {
    name   = "architecture"
    values = ["x86_64"]
  }
}

# Egress-only security group: ZERO inbound rules.
resource "aws_security_group" "app" {
  name        = "${var.name}-app"
  description = "App box: egress-only, no inbound (tunnel + SSM)."
  vpc_id      = aws_vpc.main.id
  tags        = { Name = "${var.name}-app" }
}

resource "aws_vpc_security_group_egress_rule" "app_all_ipv4" {
  security_group_id = aws_security_group.app.id
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "-1"
}

resource "aws_launch_template" "app" {
  name_prefix   = "${var.name}-"
  image_id      = data.aws_ami.al2023.id
  instance_type = var.instance_type

  iam_instance_profile {
    name = aws_iam_instance_profile.app.name
  }

  vpc_security_group_ids = [aws_security_group.app.id]

  metadata_options {
    http_tokens                 = "required" # IMDSv2 only
    http_endpoint               = "enabled"
    http_put_response_hop_limit = 2 # REQUIRED: app runs in a container (+1 hop) — hop_limit 1 blocks instance-role creds → prod S3 auth fails at runtime
  }

  block_device_mappings {
    device_name = "/dev/xvda"
    ebs {
      volume_size = 40
      volume_type = "gp3"
      encrypted   = true
    }
  }

  user_data = base64encode(templatefile("${path.module}/user-data.sh.tftpl", {
    github_runner_url = var.github_runner_url
    region            = var.region
  }))

  tag_specifications {
    resource_type = "instance"
    tags          = { Name = "${var.name}-app" }
  }
}

resource "aws_autoscaling_group" "app" {
  name                = "${var.name}-app"
  min_size            = 1
  max_size            = 1
  desired_capacity    = 1
  vpc_zone_identifier = aws_subnet.public[*].id
  health_check_type   = "EC2"

  launch_template {
    id      = aws_launch_template.app.id
    version = aws_launch_template.app.latest_version
  }

  instance_refresh {
    strategy = "Rolling"
    preferences {
      # Size 1: cannot keep half healthy during a roll.
      min_healthy_percentage = 0
    }
    # No `triggers` needed: because launch_template.version = latest_version,
    # a template change bumps the version and auto-triggers the refresh.
    # (`$Latest` would NOT — per AWS provider docs.)
  }

  tag {
    key                 = "Name"
    value               = "${var.name}-app"
    propagate_at_launch = true
  }
}
