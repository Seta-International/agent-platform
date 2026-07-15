resource "aws_db_subnet_group" "main" {
  name       = "${var.name}-db-subnet-group"
  subnet_ids = aws_subnet.public[*].id
  tags       = { Name = "${var.name}-db-subnet-group" }
}

resource "aws_security_group" "db" {
  name        = "${var.name}-db-sg"
  description = "Postgres access for ${var.name}"
  vpc_id      = aws_vpc.main.id
  tags        = { Name = "${var.name}-db-sg" }
}

resource "aws_vpc_security_group_ingress_rule" "db_from_tasks" {
  security_group_id            = aws_security_group.db.id
  description                  = "ECS tasks to RDS 5432"
  referenced_security_group_id = aws_security_group.tasks.id
  from_port                    = 5432
  to_port                      = 5432
  ip_protocol                  = "tcp"
}

resource "aws_vpc_security_group_egress_rule" "db_all" {
  security_group_id = aws_security_group.db.id
  description       = "Allow all outbound"
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "-1"
}

resource "aws_db_instance" "main" {
  identifier     = "${var.name}-db"
  engine         = "postgres"
  engine_version = var.db_engine_version
  instance_class = var.db_instance_class

  allocated_storage = var.db_allocated_storage
  storage_type      = "gp3"
  storage_encrypted = true
  kms_key_id        = var.db_kms_key_id

  db_name  = var.db_name
  username = var.db_username
  password = var.db_master_password

  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.db.id]
  multi_az               = false
  publicly_accessible    = var.db_publicly_accessible

  backup_retention_period    = 7
  deletion_protection        = var.db_deletion_protection
  skip_final_snapshot        = true
  auto_minor_version_upgrade = true

  tags = { Name = "${var.name}-db" }

  lifecycle {
    ignore_changes = [password]
  }
}
