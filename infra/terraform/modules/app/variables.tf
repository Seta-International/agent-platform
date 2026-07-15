variable "name" {
  description = "Resource name prefix, e.g. future-app-prod / future-app-sandbox."
  type        = string
}

variable "vpc_cidr" {
  type    = string
  default = "10.0.0.0/16"
}

variable "azs" {
  type    = list(string)
  default = ["ap-southeast-1a", "ap-southeast-1b"]
}

# --- database ---
variable "db_instance_class" {
  type    = string
  default = "db.t3.micro"
}
variable "db_allocated_storage" {
  type    = number
  default = 20
}
variable "db_engine_version" {
  type    = string
  default = "18.3"
}
variable "db_name" {
  type    = string
  default = "future_app"
}
variable "db_username" {
  type    = string
  default = "future_admin"
}
variable "db_master_password" {
  type      = string
  sensitive = true
}
variable "db_kms_key_id" {
  description = "KMS key ARN for RDS storage. null => AWS-managed key."
  type        = string
  default     = null
}
variable "db_deletion_protection" {
  type    = bool
  default = true
}
variable "db_publicly_accessible" {
  type    = bool
  default = true
}

# --- storage ---
variable "s3_bucket_name" {
  type = string
}
variable "s3_force_destroy" {
  type    = bool
  default = false
}
variable "ecr_repo_name" {
  type    = string
  default = "future-app"
}
variable "ecr_force_delete" {
  type    = bool
  default = false
}

# --- image / ecs sizing ---
variable "image_uri" {
  description = "Full image ref incl. tag, e.g. <acct>.dkr.ecr.<region>.amazonaws.com/future-app:<sha>."
  type        = string
}
variable "cpu_architecture" {
  description = "Fargate CPU architecture: X86_64 or ARM64 (Graviton). Must match the pushed image's arch."
  type        = string
  default     = "X86_64"
  validation {
    condition     = contains(["X86_64", "ARM64"], var.cpu_architecture)
    error_message = "cpu_architecture must be X86_64 or ARM64."
  }
}
variable "api_cpu" {
  type    = number
  default = 512
}
variable "api_memory" {
  type    = number
  default = 1024
}
variable "api_desired" {
  type    = number
  default = 1
}
variable "api_min" {
  type    = number
  default = 1
}
variable "api_max" {
  type    = number
  default = 2
}
variable "worker_cpu" {
  type    = number
  default = 1024
}
variable "worker_memory" {
  type    = number
  default = 3072
}
variable "worker_desired" {
  type    = number
  default = 1
}
variable "worker_min" {
  type    = number
  default = 1
}
variable "worker_max" {
  type    = number
  default = 2
}

# --- cloudflared sidecar (prod only) ---
variable "enable_cloudflared" {
  type    = bool
  default = false
}
variable "cloudflared_token_secret_arn" {
  description = "Secrets Manager ARN holding the Cloudflare tunnel token. Required when enable_cloudflared."
  type        = string
  default     = null
}

# --- worker queue-depth autoscaling scaffold (off until a metric publisher exists) ---
variable "enable_worker_queue_scaling" {
  type    = bool
  default = false
}
variable "worker_queue_target" {
  description = "Target backlog jobs per task for queue-depth scaling."
  type        = number
  default     = 50
}

# --- app secrets (Secrets Manager) ---
variable "better_auth_secret" {
  type      = string
  sensitive = true
}
variable "crypto_local_master_key" {
  type      = string
  sensitive = true
}
