variable "region" {
  description = "AWS region."
  type        = string
  default     = "ap-southeast-1"
}

# Real prod KMS key ARN for the adopted RDS instance. Kept as a variable rather
# than inline so the account-specific ARN lives in one labelled place.
variable "db_kms_key_id" {
  description = "KMS key ARN for RDS storage (adopted prod key)."
  type        = string
  default     = "arn:aws:kms:ap-southeast-1:555146423830:key/1256983a-4633-4462-becf-6a7ba114ef5a"
}

variable "db_master_password" {
  description = "RDS master password for future_admin. ignore_changes on the DB password means this is write-only on import; any placeholder works."
  type        = string
  sensitive   = true
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
  type      = string
  sensitive = true
}

variable "image_uri" {
  type = string
}

variable "cloudflared_token_secret_arn" {
  type    = string
  default = null
}
