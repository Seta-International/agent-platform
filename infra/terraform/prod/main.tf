module "app" {
  source = "../modules/app"

  name = local.name

  # Real prod KMS key for RDS storage (adopted resource). See variables.tf.
  db_kms_key_id          = var.db_kms_key_id
  db_deletion_protection = false # matches the real instance; prevent_destroy guard dropped with the EC2 rewrite
  db_instance_class      = "db.t3.micro"
  db_engine_version      = "18.3"

  s3_bucket_name = "future-app-bucket-prod-seta"
  ecr_repo_name  = "future-app"

  db_master_password      = var.db_master_password
  better_auth_secret      = var.better_auth_secret
  crypto_local_master_key = var.crypto_local_master_key
  image_uri               = var.image_uri

  # Graviton for prod (per docs/hosting/aws.md). Sandbox uses the X86_64 default
  # so its image builds natively on standard runners.
  cpu_architecture = "ARM64"

  enable_cloudflared           = true
  cloudflared_token_secret_arn = var.cloudflared_token_secret_arn
}
