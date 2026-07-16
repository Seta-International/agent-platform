module "app" {
  source = "../modules/app"

  name = local.name

  # Real prod KMS key for RDS storage (adopted resource). See variables.tf.
  db_kms_key_id          = var.db_kms_key_id
  db_deletion_protection = false # matches the real instance; prevent_destroy guard dropped with the EC2 rewrite
  db_instance_class      = "db.t3.micro"
  db_engine_version      = "18.3"
  # Live description of adopted sg-011f7437a3dc43691 — must match exactly:
  # SG descriptions are immutable, a mismatch destroys/replaces the live SG.
  db_sg_description = "RDS future-app-prod-db - chi allow IP cong ty toi cong Postgres"

  s3_bucket_name = "future-app-bucket-prod-seta"
  ecr_repo_name  = "future-app"

  db_master_password      = var.db_master_password
  better_auth_secret      = var.better_auth_secret
  crypto_local_master_key = var.crypto_local_master_key
  openai_api_key          = var.openai_api_key
  image_uri               = var.image_uri

  # Graviton for prod (per docs/hosting/aws.md). Sandbox uses the X86_64 default
  # so its image builds natively on standard runners.
  cpu_architecture = "ARM64"

  enable_cloudflared           = true
  cloudflared_token_secret_arn = var.cloudflared_token_secret_arn

  # Central observability on the self-hosted monitoring box — ECS only pushes.
  # Same ingest + creds the compose boxes use (GH prod env REMOTE_WRITE_* vars).
  monitoring_env      = "prod"
  loki_host           = "future-ingest.seta-international.com"
  remote_write_url    = "https://future-ingest.seta-international.com/api/v1/write"
  monitoring_username = var.monitoring_username
  monitoring_password = var.monitoring_password

  # Runtime app config beyond the module's boot set — see .env.example for the
  # full contract. Values that are secrets go through extra_secret_arns.
  # Still to wire at cutover (values are operator decisions, not infra):
  # AGENT_MODELS, MAILER_* (smtp), MICROSOFT_*/M365_* (SSO + Graph), and a
  # dedicated RLS-bound DATABASE_APP_URL secret (web pool currently falls back
  # to the master DATABASE_URL when unset).
  extra_env = {
    PUBLIC_URL   = "https://${var.public_domain}"
    CORS_ORIGINS = "https://${var.public_domain}"
  }
  extra_secret_arns = var.extra_app_secret_arns
}
