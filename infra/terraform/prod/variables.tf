variable "region" {
  description = "AWS region."
  type        = string
  default     = "ap-southeast-1"
}

variable "instance_type" {
  description = "EC2 instance type for the app box."
  type        = string
  default     = "t3.medium"
}

variable "db_instance_class" {
  description = "RDS instance class."
  type        = string
  default     = "db.t3.micro"
}

variable "db_master_password" {
  description = "RDS master password for future_admin. lifecycle.ignore_changes on aws_db_instance.main means this value is write-only on import — any placeholder works; Terraform never diffs or reapplies it afterward."
  type        = string
  sensitive   = true
}
