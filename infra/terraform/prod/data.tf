resource "aws_db_subnet_group" "main" {
  name       = "${var.name}-db"
  subnet_ids = aws_subnet.private[*].id
  tags       = { Name = "${var.name}-db" }
}

# DB security group: 5432 from the app SG only. No CIDR ingress.
resource "aws_security_group" "db" {
  name        = "${var.name}-db"
  description = "RDS: 5432 from app SG only."
  vpc_id      = aws_vpc.main.id
  tags        = { Name = "${var.name}-db" }
}

resource "aws_vpc_security_group_ingress_rule" "db_from_app" {
  security_group_id            = aws_security_group.db.id
  referenced_security_group_id = aws_security_group.app.id
  from_port                    = 5432
  to_port                      = 5432
  ip_protocol                  = "tcp"
}

resource "aws_db_instance" "main" {
  identifier     = "${var.name}-pg"
  engine         = "postgres"
  instance_class = var.db_instance_class

  allocated_storage     = 20
  max_allocated_storage = 100
  storage_type          = "gp3"
  storage_encrypted     = true

  db_name  = "seta"
  username = var.db_master_username
  password = var.db_master_password

  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.db.id]
  multi_az               = false
  publicly_accessible    = false

  backup_retention_period   = 7
  copy_tags_to_snapshot     = true
  delete_automated_backups  = false
  deletion_protection       = true
  skip_final_snapshot       = false
  final_snapshot_identifier = "${var.name}-pg-final-${random_id.snap.hex}" # unique → no collision on recreate

  auto_minor_version_upgrade = true
  apply_immediately          = false

  tags = { Name = "${var.name}-pg" }

  lifecycle {
    prevent_destroy = true # guard prod data against destroy/replace
  }
}

resource "random_id" "snap" {
  byte_length = 4
}
