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
variable "extra_env" {
  description = "Additional plain env vars injected into both app containers (name => value). App-level config (PUBLIC_URL, CORS_ORIGINS, AGENT_MODELS, MAILER_*, ...) belongs here, not in the module."
  type        = map(string)
  default     = {}
}
variable "extra_secret_arns" {
  description = "Additional secret env vars for both app containers (name => Secrets Manager ARN). The execution role is granted read on these."
  type        = map(string)
  default     = {}
}
variable "db_sg_description" {
  description = "DB security-group description. Immutable in AWS — when adopting an existing SG, set this to the live description or the plan will destroy/replace it. null => \"Postgres access for <name>\"."
  type        = string
  default     = null
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
# The app runs TypeScript via tsx at runtime, which compiles the full module
# graph on boot — a large transient memory/CPU spike well above steady state
# (prod server idles ~425 MB but the box has no per-container limit to absorb the
# boot spike). 0.5 vCPU / 1 GB OOM-kills the api mid-boot; 1 vCPU / 2 GB boots it.
# The observability sidecars share task memory but are hard-capped at 384 MB
# combined (see ecs.tf); bump these if the boot spike ever OOMs beside them.
variable "api_cpu" {
  type    = number
  default = 1024
}
variable "api_memory" {
  type    = number
  default = 2048
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

# --- central observability (self-hosted Grafana stack; docs/hosting/aws.md §7) ---
# No CloudWatch Logs: FireLens → Loki for logs, Alloy sidecar → remote_write for
# metrics. Fargate has no docker.sock, so the compose obs-agent can't run here.
variable "monitoring_env" {
  description = "env label stamped on logs/metrics pushed to the central stack (e.g. prod / sandbox)."
  type        = string
}
variable "loki_host" {
  description = "Central Loki push hostname, e.g. future-ingest.seta-international.com (TLS :443, path /loki/api/v1/push)."
  type        = string
}
variable "remote_write_url" {
  description = "Full Prometheus remote_write URL on the central stack, e.g. https://<ingest>/api/v1/write."
  type        = string
}
variable "monitoring_username" {
  description = "Basic-auth username for the central ingest (Loki push + remote_write) — GH env var REMOTE_WRITE_USERNAME."
  type        = string
}
variable "monitoring_password" {
  description = "Basic-auth password for the central ingest — GH secret REMOTE_WRITE_PASSWORD. Injected only into the sidecars, never the app."
  type        = string
  sensitive   = true
}
variable "fluentbit_image" {
  description = "FireLens log-router image."
  type        = string
  default     = "public.ecr.aws/aws-observability/aws-for-fluent-bit:stable"
}
variable "alloy_image" {
  description = "Alloy metrics-sidecar image. Keep in step with the alloy service in compose.yaml."
  type        = string
  default     = "grafana/alloy:v1.10.0"
}

# --- app secrets (Secrets Manager) ---
variable "secret_recovery_window_days" {
  description = "Recovery window on secret deletion. 0 = delete immediately (needed so an ephemeral env can be re-provisioned; a scheduled-for-deletion name blocks re-create for the whole window)."
  type        = number
  default     = 0
}
variable "better_auth_secret" {
  type      = string
  sensitive = true
}
variable "crypto_local_master_key" {
  type      = string
  sensitive = true
}
variable "openai_api_key" {
  description = "Required at boot by the embedding provider (presence-checked only). Sandbox may pass a dummy."
  type        = string
  sensitive   = true
}
