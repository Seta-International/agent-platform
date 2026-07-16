locals {
  # sslmode=no-verify: encrypt in transit but skip CA verification (RDS uses the
  # Amazon RDS CA, not in the default trust store; matches prod, which the app's
  # `pg` client connects with — `require` would make pg verify and fail).
  database_url = "postgres://${var.db_username}:${var.db_master_password}@${aws_db_instance.main.address}:${aws_db_instance.main.port}/${var.db_name}?sslmode=no-verify"
}

resource "aws_secretsmanager_secret" "database_url" {
  name                    = "${var.name}/DATABASE_URL"
  recovery_window_in_days = var.secret_recovery_window_days
}
resource "aws_secretsmanager_secret_version" "database_url" {
  secret_id     = aws_secretsmanager_secret.database_url.id
  secret_string = local.database_url
}

resource "aws_secretsmanager_secret" "better_auth_secret" {
  name                    = "${var.name}/BETTER_AUTH_SECRET"
  recovery_window_in_days = var.secret_recovery_window_days
}
resource "aws_secretsmanager_secret_version" "better_auth_secret" {
  secret_id     = aws_secretsmanager_secret.better_auth_secret.id
  secret_string = var.better_auth_secret
}

resource "aws_secretsmanager_secret" "crypto_local_master_key" {
  name                    = "${var.name}/CRYPTO_LOCAL_MASTER_KEY"
  recovery_window_in_days = var.secret_recovery_window_days
}
resource "aws_secretsmanager_secret_version" "crypto_local_master_key" {
  secret_id     = aws_secretsmanager_secret.crypto_local_master_key.id
  secret_string = var.crypto_local_master_key
}

# Required at boot: resolveEmbeddingProvider() defaults EMBED_MODEL to
# openai/text-embedding-3-small and throws if OPENAI_API_KEY is unset. Only the
# key's presence is checked at boot (no API call), so sandbox can use a dummy.
resource "aws_secretsmanager_secret" "openai_api_key" {
  name                    = "${var.name}/OPENAI_API_KEY"
  recovery_window_in_days = var.secret_recovery_window_days
}
resource "aws_secretsmanager_secret_version" "openai_api_key" {
  secret_id     = aws_secretsmanager_secret.openai_api_key.id
  secret_string = var.openai_api_key
}

# Central-ingest basic-auth password. Injected only into the log_router and
# alloy sidecars — never the app, so it stays out of app_secret_arns below.
resource "aws_secretsmanager_secret" "monitoring_password" {
  name                    = "${var.name}/MONITORING_PASSWORD"
  recovery_window_in_days = var.secret_recovery_window_days
}
resource "aws_secretsmanager_secret_version" "monitoring_password" {
  secret_id     = aws_secretsmanager_secret.monitoring_password.id
  secret_string = var.monitoring_password
}

locals {
  # name → Secrets Manager ARN, injected as container `secrets`.
  app_secret_arns = {
    DATABASE_URL            = aws_secretsmanager_secret.database_url.arn
    BETTER_AUTH_SECRET      = aws_secretsmanager_secret.better_auth_secret.arn
    CRYPTO_LOCAL_MASTER_KEY = aws_secretsmanager_secret.crypto_local_master_key.arn
    OPENAI_API_KEY          = aws_secretsmanager_secret.openai_api_key.arn
  }
  # ARNs the execution role may read (app secrets + caller-supplied extras +
  # the sidecars' monitoring password + optional cloudflared token).
  readable_secret_arns = concat(
    values(local.app_secret_arns),
    values(var.extra_secret_arns),
    [aws_secretsmanager_secret.monitoring_password.arn],
    var.cloudflared_token_secret_arn == null ? [] : [var.cloudflared_token_secret_arn],
  )
}
