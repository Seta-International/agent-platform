data "aws_caller_identity" "current" {}

module "app" {
  source = "../modules/app"

  name = "future-app-sandbox"

  # sandbox is disposable — everything destroyable, AWS-managed KMS.
  db_kms_key_id          = null
  db_deletion_protection = false
  s3_force_destroy       = true
  ecr_force_delete       = true

  # Account id comes from the caller identity (never hardcoded); the S3 bucket
  # name must be globally unique so the account id is appended.
  s3_bucket_name = "future-app-sandbox-${data.aws_caller_identity.current.account_id}"
  ecr_repo_name  = "future-app-sandbox"

  db_master_password      = var.db_master_password
  better_auth_secret      = var.better_auth_secret
  crypto_local_master_key = var.crypto_local_master_key
  openai_api_key          = var.openai_api_key
  image_uri               = var.image_uri

  enable_cloudflared = false
}
