# Models the real future-app-prod EC2 box (i-0ea6b8e2668eb3245) and its
# security group (sg-0fae4934473ffc573). Adopted via import — a single
# aws_instance, NOT an ASG/launch template (there never was one).

resource "aws_security_group" "app" {
  name        = "future-app-prod-ec2-sg"
  description = "EC2 future-app-prod - SSH tu IP cong ty + rule bo sung"
  vpc_id      = aws_vpc.main.id
  tags        = { Name = "future-app-prod-ec2-sg" }
}

# --- ingress: SSH from the two office IPs ---
resource "aws_vpc_security_group_ingress_rule" "app_ssh_1" {
  security_group_id = aws_security_group.app.id
  description       = "SSH tu IP cong ty"
  cidr_ipv4         = "118.70.190.230/32"
  from_port         = 22
  to_port           = 22
  ip_protocol       = "tcp"
}

resource "aws_vpc_security_group_ingress_rule" "app_ssh_2" {
  security_group_id = aws_security_group.app.id
  description       = "SSH tu IP cong ty"
  cidr_ipv4         = "113.190.252.197/32"
  from_port         = 22
  to_port           = 22
  ip_protocol       = "tcp"
}

# --- ingress: public HTTPS for future.seta-international.com ---
resource "aws_vpc_security_group_ingress_rule" "app_https" {
  security_group_id = aws_security_group.app.id
  description       = "HTTPS public - future.seta-international.com"
  cidr_ipv4         = "0.0.0.0/0"
  from_port         = 443
  to_port           = 443
  ip_protocol       = "tcp"
}

resource "aws_vpc_security_group_egress_rule" "app_all_ipv4" {
  security_group_id = aws_security_group.app.id
  description       = "Allow all outbound"
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "-1"
}

resource "aws_instance" "app" {
  ami                    = "ami-0ef5fc922c3794ed9" # Ubuntu 24.04 noble amd64
  instance_type          = var.instance_type
  key_name               = "future-app-prod-key"
  subnet_id              = aws_subnet.public[0].id # ap-southeast-1a
  vpc_security_group_ids = [aws_security_group.app.id]
  iam_instance_profile   = aws_iam_instance_profile.app.name

  metadata_options {
    http_tokens                 = "required" # IMDSv2 only
    http_endpoint               = "enabled"
    http_put_response_hop_limit = 2
  }

  root_block_device {
    volume_size = 40
    volume_type = "gp3"
    encrypted   = true
    kms_key_id  = "arn:aws:kms:ap-southeast-1:555146423830:key/e8cbd487-07e9-448d-bf09-65d94b0172de"
    tags        = local.tags # volume carries only the account default tags, no Name
  }

  user_data_replace_on_change = false

  tags = { Name = "future-app-prod-ec2" }

  lifecycle {
    # AMI updates and any future user-data are applied by replacing the
    # box out-of-band (ClickOps/SSM), not by Terraform recreating it.
    ignore_changes = [ami, user_data]
  }
}
