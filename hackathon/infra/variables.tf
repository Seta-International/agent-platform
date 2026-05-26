variable "name" {
  description = "Stack name prefix (lowercase, used in every resource name)."
  type        = string
  default     = "platform-hackathon"
}

variable "region" {
  description = "AWS region for the demo deployment."
  type        = string
  default     = "ap-southeast-1"
}

variable "tags" {
  description = "Tags applied to every resource."
  type        = map(string)
  default = {
    Project     = "platform"
    Environment = "hackathon"
  }
}

# ── Compute ───────────────────────────────────────────────────────────────────

variable "instance_type" {
  description = "EC2 instance type. t4g.small (ARM) is the cost-optimised default."
  type        = string
  default     = "t4g.small"
}

variable "ami_id" {
  description = "Ubuntu 24.04 LTS ARM64 AMI ID for ap-southeast-1. Find latest at https://cloud-images.ubuntu.com/locator/ec2/"
  type        = string
  # ubuntu/images/hvm-ssd-gp3/ubuntu-noble-24.04-arm64-server-20250515
  default = "ami-0497a974f8d5dcef8"
}

variable "key_name" {
  description = "EC2 SSH key pair name (must already exist in the target region). Leave empty to disable SSH key login."
  type        = string
  default     = ""
}

variable "ebs_volume_size_gb" {
  description = "Root EBS volume size in GB. Holds OS + Docker images + Postgres data."
  type        = number
  default     = 40
}

# ── Networking ────────────────────────────────────────────────────────────────

variable "allowed_ssh_cidrs" {
  description = "CIDR blocks allowed to reach port 22. Restrict to your office/VPN IP."
  type        = list(string)
  default     = []
}

variable "allowed_https_cidrs" {
  description = "CIDR blocks allowed to reach port 443. Default: internet."
  type        = list(string)
  default     = ["0.0.0.0/0", "::/0"]
}

# ── App ───────────────────────────────────────────────────────────────────────

variable "ecr_registry" {
  description = "ECR registry hostname (e.g. YOUR_ACCOUNT_ID.dkr.ecr.YOUR_REGION.amazonaws.com)."
  type        = string
}

variable "ecr_repository" {
  description = "ECR repository name that holds the server and web images."
  type        = string
}

variable "domain" {
  description = "Public domain for the demo (e.g. demo.example.com). Used in Traefik TLS config."
  type        = string
}

variable "acme_email" {
  description = "Email for Let's Encrypt certificate registration."
  type        = string
}

variable "postgres_password" {
  description = "Postgres superuser password. Store in a secret manager; never commit."
  type        = string
  sensitive   = true
}

variable "better_auth_secret" {
  description = "better-auth signing secret (min 32 chars). Generate: openssl rand -hex 32"
  type        = string
  sensitive   = true
}

variable "openai_api_key" {
  description = "OpenAI API key for copilot testing. Hard-cap spend in the OpenAI dashboard."
  type        = string
  sensitive   = true
  default     = ""
}

variable "copilot_model" {
  description = "Model identifier for the copilot module (e.g. openai/gpt-4o-mini). Leave empty to disable copilot chat."
  type        = string
  default     = ""
}

variable "jaeger_auth_user" {
  description = "Username for Jaeger traces UI BasicAuth at traces.<domain>."
  type        = string
  default     = "admin"
}

variable "jaeger_auth_password" {
  description = "Password for Jaeger traces UI BasicAuth. Store in a secret manager; never commit."
  type        = string
  sensitive   = true
}

# ── Backup ────────────────────────────────────────────────────────────────────

variable "backup_retention_days" {
  description = "Number of days to keep daily pg_dump files in S3 before expiry."
  type        = number
  default     = 14
}

variable "ebs_snapshot_retention_days" {
  description = "Number of days to retain automated EBS snapshots via Data Lifecycle Manager."
  type        = number
  default     = 7
}
