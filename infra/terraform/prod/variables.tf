variable "name" {
  description = "Resource name prefix."
  type        = string
  default     = "seta-prod"
}

variable "region" {
  description = "AWS region."
  type        = string
  default     = "ap-southeast-1"
}

variable "vpc_cidr" {
  description = "VPC CIDR block."
  type        = string
  default     = "10.20.0.0/16"
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

variable "db_master_username" {
  description = "RDS master username."
  type        = string
  default     = "seta"
}

variable "db_master_password" {
  description = "RDS master password. Same value as the GitHub prod secret DATABASE_PASSWORD. Lands in (encrypted) state."
  type        = string
  sensitive   = true
}

variable "github_runner_url" {
  description = "GitHub repo URL the self-hosted runner registers against (used by user-data)."
  type        = string
}

variable "ecr_repository_arn" {
  description = "ARN of the shared ECR repository the box pulls images from."
  type        = string
}
