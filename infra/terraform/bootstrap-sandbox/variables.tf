variable "region" {
  description = "AWS region for the sandbox account."
  type        = string
  default     = "ap-southeast-1"
}

variable "github_org_repo" {
  description = "owner/repo allowed to assume the sandbox deploy role."
  type        = string
  default     = "Seta-International/agent-platform"
}

variable "environment_name" {
  description = "GitHub Actions environment the OIDC trust is scoped to."
  type        = string
  default     = "sandbox"
}

variable "state_bucket_prefix" {
  description = "Prefix for the tfstate bucket. Account id is appended for global uniqueness."
  type        = string
  default     = "seta-tfstate-sandbox"
}
