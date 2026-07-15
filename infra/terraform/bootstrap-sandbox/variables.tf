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
