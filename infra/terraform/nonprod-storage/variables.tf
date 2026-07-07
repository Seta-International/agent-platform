variable "envs" {
  description = "Non-prod envs to provision buckets + IAM users for."
  type        = set(string)
  default     = ["dev", "uat"]
}
