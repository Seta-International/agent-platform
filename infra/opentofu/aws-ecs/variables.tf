# Variables shared by both examples. Each example's `variables.tf` re-declares
# only the variables it consumes; this file is a reference, not a global.
#
# When the follow-up PR lands the example HCL, the canonical definitions below
# are imported via `-var-file=../../variables.tf` from each example directory.

variable "name" {
  description = "Stack name prefix (lowercase, used in every resource name)."
  type        = string
  default     = "seta"
}

variable "region" {
  description = "AWS region (e.g. us-east-1)."
  type        = string
}

variable "tags" {
  description = "Tags applied to every resource the module creates."
  type        = map(string)
  default     = {}
}

variable "image_uri" {
  description = "Full image reference for seta-server (GHCR or ECR). Required at apply."
  type        = string
}

variable "domain" {
  description = "Public hostname (e.g. seta.example.com). Used in ALB rules and ACM cert."
  type        = string
}

variable "enable_web_tier" {
  description = "When true, provisions S3 + CloudFront for the seta-web bundle."
  type        = bool
  default     = true
}

variable "enable_private_ca" {
  description = "When true, provisions AWS Private CA for east-west mTLS via Service Connect."
  type        = bool
  default     = false
}
