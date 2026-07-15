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
variable "image_uri" {
  type = string
}
