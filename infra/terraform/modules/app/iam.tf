data "aws_iam_policy_document" "ecs_assume" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

# --- execution role: pull image, read secrets, write logs ---
resource "aws_iam_role" "task_execution" {
  name               = "${var.name}-task-exec"
  assume_role_policy = data.aws_iam_policy_document.ecs_assume.json
}

resource "aws_iam_role_policy_attachment" "task_execution_managed" {
  role       = aws_iam_role.task_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

data "aws_iam_policy_document" "task_execution_secrets" {
  statement {
    effect    = "Allow"
    actions   = ["secretsmanager:GetSecretValue"]
    resources = local.readable_secret_arns
  }
}

resource "aws_iam_role_policy" "task_execution_secrets" {
  name   = "read-secrets"
  role   = aws_iam_role.task_execution.name
  policy = data.aws_iam_policy_document.task_execution_secrets.json
}

# --- api task role ---
resource "aws_iam_role" "api_task" {
  name               = "${var.name}-api-task"
  assume_role_policy = data.aws_iam_policy_document.ecs_assume.json
}

# --- worker task role ---
resource "aws_iam_role" "worker_task" {
  name               = "${var.name}-worker-task"
  assume_role_policy = data.aws_iam_policy_document.ecs_assume.json
}

# Both task roles get S3 access to the app bucket (uploads/knowledge files).
data "aws_iam_policy_document" "app_s3" {
  statement {
    effect    = "Allow"
    actions   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject", "s3:ListBucket"]
    resources = [aws_s3_bucket.app.arn, "${aws_s3_bucket.app.arn}/*"]
  }
}

resource "aws_iam_role_policy" "api_s3" {
  name   = "app-s3"
  role   = aws_iam_role.api_task.name
  policy = data.aws_iam_policy_document.app_s3.json
}

resource "aws_iam_role_policy" "worker_s3" {
  name   = "app-s3"
  role   = aws_iam_role.worker_task.name
  policy = data.aws_iam_policy_document.app_s3.json
}

# ECS Exec (SSM channel) for both task roles — needed by the sandbox verify.
data "aws_iam_policy_document" "ecs_exec" {
  statement {
    effect = "Allow"
    actions = [
      "ssmmessages:CreateControlChannel",
      "ssmmessages:CreateDataChannel",
      "ssmmessages:OpenControlChannel",
      "ssmmessages:OpenDataChannel",
    ]
    resources = ["*"]
  }
}

resource "aws_iam_role_policy" "api_exec" {
  name   = "ecs-exec"
  role   = aws_iam_role.api_task.name
  policy = data.aws_iam_policy_document.ecs_exec.json
}

resource "aws_iam_role_policy" "worker_exec" {
  name   = "ecs-exec"
  role   = aws_iam_role.worker_task.name
  policy = data.aws_iam_policy_document.ecs_exec.json
}
