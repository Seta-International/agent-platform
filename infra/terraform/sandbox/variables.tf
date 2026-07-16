variable "region" {
  type    = string
  default = "ap-southeast-1"
}

variable "db_master_password" {
  type      = string
  sensitive = true
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
variable "monitoring_username" {
  description = "Basic-auth username for the central monitoring ingest."
  type        = string
}
variable "monitoring_password" {
  description = "Basic-auth password for the central monitoring ingest (GH secret REMOTE_WRITE_PASSWORD)."
  type        = string
  sensitive   = true
}
