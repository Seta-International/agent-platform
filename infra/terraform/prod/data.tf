# Models the real future-app-prod RDS instance (future-app-prod-db) and its
# security group (sg-011f7437a3dc43691). Adopted via import.
#
# NOTE: the real DB subnet group (future-app-prod-db-subnet-group) uses the
# two PUBLIC subnets, not the private ones — the instance is deliberately
# publicly_accessible = true. Faithfully modeled as-is, not "fixed".

resource "aws_db_subnet_group" "main" {
  name        = "future-app-prod-db-subnet-group"
  description = "Managed by Terraform"
  subnet_ids  = [aws_subnet.public[0].id, aws_subnet.public[1].id]
  tags        = { Name = "future-app-prod-db-subnet-group" }
}

resource "aws_security_group" "db" {
  name        = "future-app-prod-db-sg"
  description = "RDS future-app-prod-db - chi allow IP cong ty toi cong Postgres"
  vpc_id      = aws_vpc.main.id
  tags        = { Name = "future-app-prod-db-sg" }
}

# --- ingress: Postgres from the two office IPs ---
resource "aws_vpc_security_group_ingress_rule" "db_postgres_1" {
  security_group_id = aws_security_group.db.id
  description       = "Postgres tu IP cong ty"
  cidr_ipv4         = "113.190.252.197/32"
  from_port         = 5432
  to_port           = 5432
  ip_protocol       = "tcp"
}

resource "aws_vpc_security_group_ingress_rule" "db_postgres_2" {
  security_group_id = aws_security_group.db.id
  description       = "Postgres tu IP cong ty"
  cidr_ipv4         = "118.70.190.230/32"
  from_port         = 5432
  to_port           = 5432
  ip_protocol       = "tcp"
}

# --- ingress: Postgres from the app box ---
resource "aws_vpc_security_group_ingress_rule" "db_from_app" {
  security_group_id            = aws_security_group.db.id
  description                  = "future-prod app box to RDS 5432"
  referenced_security_group_id = aws_security_group.app.id
  from_port                    = 5432
  to_port                      = 5432
  ip_protocol                  = "tcp"
}

resource "aws_vpc_security_group_egress_rule" "db_all_ipv4" {
  security_group_id = aws_security_group.db.id
  description       = "Allow all outbound"
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "-1"
}

resource "aws_db_instance" "main" {
  identifier     = "future-app-prod-db"
  engine         = "postgres"
  engine_version = "18.3"
  instance_class = var.db_instance_class

  allocated_storage = 20
  storage_type      = "gp3"
  storage_encrypted = true
  kms_key_id        = "arn:aws:kms:ap-southeast-1:555146423830:key/1256983a-4633-4462-becf-6a7ba114ef5a"

  db_name  = "future_app"
  username = "future_admin"
  password = var.db_master_password

  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.db.id]
  multi_az               = false
  publicly_accessible    = true

  backup_retention_period = 7
  copy_tags_to_snapshot   = false
  deletion_protection     = false
  # Real deletion_protection is off; skip_final_snapshot = true matches the
  # state Terraform populates on import (this argument has no AWS-side
  # attribute — it only governs `terraform destroy`, which prevent_destroy
  # below already blocks).
  skip_final_snapshot = true

  auto_minor_version_upgrade = true

  tags = { Name = "future-app-prod-db" }

  lifecycle {
    prevent_destroy = true # Terraform-side guard; real deletion_protection is off
    ignore_changes  = [password]
  }
}
