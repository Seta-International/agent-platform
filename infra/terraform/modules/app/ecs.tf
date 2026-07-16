data "aws_region" "current" {}

resource "aws_ecs_cluster" "main" {
  name = var.name
  setting {
    # Off: Container Insights writes to CloudWatch Logs, and nothing may land
    # there (docs/hosting/aws.md §7). Basic ECS metrics exist regardless.
    name  = "containerInsights"
    value = "disabled"
  }
}

# Egress-only SG for all tasks. Zero inbound: nothing can reach the tasks;
# they reach OUT (ECR, Secrets Manager, RDS, the central Loki/Prometheus
# ingest, Cloudflare) over the IGW.
resource "aws_security_group" "tasks" {
  name        = "${var.name}-tasks-sg"
  description = "ECS tasks - egress only"
  vpc_id      = aws_vpc.main.id
  tags        = { Name = "${var.name}-tasks-sg" }
}

resource "aws_vpc_security_group_egress_rule" "tasks_all" {
  security_group_id = aws_security_group.tasks.id
  description       = "Allow all outbound"
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "-1"
}

locals {
  region = data.aws_region.current.region

  # Plain (non-secret) env shared by server + worker. The module injects only
  # what it provisions itself (S3 bucket/region, crypto mode); everything
  # app-level (PUBLIC_URL, CORS_ORIGINS, AGENT_MODELS, MAILER_*, ...) comes
  # from var.extra_env / var.extra_secret_arns — see .env.example for the
  # full runtime contract.
  base_env = concat(
    [
      { name = "NODE_ENV", value = "production" },
      { name = "CRYPTO_KEY_PROVIDER", value = "env" },
      { name = "AWS_REGION", value = local.region },
      { name = "S3_REGION", value = local.region },
      { name = "S3_BUCKET", value = aws_s3_bucket.app.bucket },
    ],
    [for k in sort(keys(var.extra_env)) : { name = k, value = var.extra_env[k] }],
  )

  secret_defs = concat(
    [for k, arn in local.app_secret_arns : { name = k, valueFrom = arn }],
    [for k in sort(keys(var.extra_secret_arns)) : { name = k, valueFrom = var.extra_secret_arns[k] }],
  )

  # No CloudWatch Logs (docs/hosting/aws.md §7): FireLens pushes every container
  # to the central Loki, labeled like the compose obs-agent (env + container).
  loki_log_config = { for c in ["server", "worker", "cloudflared", "migrator"] : c => {
    logDriver = "awsfirelens"
    options = {
      Name         = "loki"
      host         = var.loki_host
      port         = "443"
      tls          = "on"
      "tls.verify" = "on"
      http_user    = var.monitoring_username
      labels       = "env=${var.monitoring_env},container=${c}"
      # Strip the FireLens wrapper keys → push the bare app line, matching
      # what loki.source.docker ships from the compose boxes.
      remove_keys     = "container_id,container_name,source"
      drop_single_key = "raw"
    }
    secretOptions = [{ name = "http_passwd", valueFrom = aws_secretsmanager_secret.monitoring_password.arn }]
  } }

  # FireLens router. essential (a task that logs nowhere must fail loud); hard
  # memory cap so buffering through a Loki outage can't eat the app's headroom;
  # no logConfiguration (its own stdout must not land in CloudWatch).
  log_router_container = {
    name              = "log_router"
    image             = var.fluentbit_image
    essential         = true
    memoryReservation = 50
    memory            = 128
    firelensConfiguration = {
      type    = "fluentbit"
      options = { enable-ecs-log-metadata = "false" }
    }
  }

  # Metrics: Alloy scrapes the app's :9464 over the task loopback and pushes to
  # central Prometheus (task SG is zero-inbound — central can't scrape in).
  # Non-essential: metrics loss must not take the app down. The image has no
  # config-from-env flag, so the entrypoint writes $ALLOY_CONFIG to a file.
  alloy_container = { for c in ["server", "worker"] : c => {
    name              = "alloy"
    image             = var.alloy_image
    essential         = false
    memoryReservation = 128
    memory            = 256
    entryPoint        = ["/bin/sh", "-c"]
    command           = ["printf '%s' \"$ALLOY_CONFIG\" > /tmp/ecs.alloy && exec /bin/alloy run --storage.path=/tmp/alloy /tmp/ecs.alloy"]
    environment = [
      { name = "ALLOY_CONFIG", value = templatefile("${path.module}/alloy-ecs.alloy.tpl", { container = c }) },
      { name = "MONITORING_ENV", value = var.monitoring_env },
      { name = "REMOTE_WRITE_URL", value = var.remote_write_url },
      { name = "REMOTE_WRITE_USERNAME", value = var.monitoring_username },
    ]
    secrets = [{ name = "REMOTE_WRITE_PASSWORD", valueFrom = aws_secretsmanager_secret.monitoring_password.arn }]
  } }

  server_container = {
    name             = "server"
    image            = var.image_uri
    essential        = true
    command          = ["serve"]
    environment      = concat(local.base_env, [{ name = "PORT", value = "3000" }])
    secrets          = local.secret_defs
    portMappings     = [{ containerPort = 3000, protocol = "tcp" }]
    logConfiguration = local.loki_log_config["server"]
    healthCheck = {
      command  = ["CMD-SHELL", "wget -qO- http://localhost:3000/health/live || exit 1"]
      interval = 30
      timeout  = 5
      retries  = 3
      # tsx compiles the whole graph on boot; give it generous startup grace.
      startPeriod = 120
    }
  }

  cloudflared_container = {
    name             = "cloudflared"
    image            = "cloudflare/cloudflared:latest"
    essential        = true
    command          = ["tunnel", "--no-autoupdate", "run"]
    secrets          = [{ name = "TUNNEL_TOKEN", valueFrom = var.cloudflared_token_secret_arn }]
    logConfiguration = local.loki_log_config["cloudflared"]
  }

  api_containers = [
    for c in [
      local.server_container,
      var.enable_cloudflared ? local.cloudflared_container : null,
      local.log_router_container,
      local.alloy_container["server"],
    ] : c if c != null
  ]

  worker_container = {
    name      = "worker"
    image     = var.image_uri
    essential = true
    command   = ["worker"]
    # Give in-flight jobs time to drain on SIGTERM (deploy / scale-in) before ECS
    # SIGKILLs the container. graphile-worker stops claiming new jobs on SIGTERM.
    stopTimeout      = 120
    environment      = local.base_env
    secrets          = local.secret_defs
    logConfiguration = local.loki_log_config["worker"]
  }

  worker_containers = [
    local.worker_container,
    local.log_router_container,
    local.alloy_container["worker"],
  ]

  # One-off migration task (deploy-prod-ecs.yml run-task). Router is
  # non-essential here so the task stops when migrate exits.
  migrator_containers = [
    {
      name             = "migrator"
      image            = var.image_uri
      essential        = true
      command          = ["migrate"]
      environment      = local.base_env
      secrets          = local.secret_defs
      logConfiguration = local.loki_log_config["migrator"]
    },
    merge(local.log_router_container, { essential = false }),
  ]
}

resource "aws_ecs_task_definition" "api" {
  family                   = "${var.name}-api"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.api_cpu
  memory                   = var.api_memory
  execution_role_arn       = aws_iam_role.task_execution.arn
  task_role_arn            = aws_iam_role.api_task.arn
  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = var.cpu_architecture
  }
  container_definitions = jsonencode(local.api_containers)

  # The service must not launch tasks until the secret VALUES exist (they are
  # built from the RDS endpoint, so their versions land only after RDS is up).
  # Without this, tasks start against empty secrets, fail to fetch AWSCURRENT,
  # and trip the deployment circuit breaker.
  depends_on = [
    aws_secretsmanager_secret_version.database_url,
    aws_secretsmanager_secret_version.better_auth_secret,
    aws_secretsmanager_secret_version.crypto_local_master_key,
    aws_secretsmanager_secret_version.openai_api_key,
    aws_secretsmanager_secret_version.monitoring_password,
  ]
}

resource "aws_ecs_task_definition" "worker" {
  family                   = "${var.name}-worker"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.worker_cpu
  memory                   = var.worker_memory
  execution_role_arn       = aws_iam_role.task_execution.arn
  task_role_arn            = aws_iam_role.worker_task.arn
  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = var.cpu_architecture
  }
  container_definitions = jsonencode(local.worker_containers)

  # See api task def: don't launch worker tasks until secret values exist.
  depends_on = [
    aws_secretsmanager_secret_version.database_url,
    aws_secretsmanager_secret_version.better_auth_secret,
    aws_secretsmanager_secret_version.crypto_local_master_key,
    aws_secretsmanager_secret_version.openai_api_key,
    aws_secretsmanager_secret_version.monitoring_password,
  ]
}

# api-sized: migrate runs the CLI through tsx, which compiles the module graph
# on boot like the server.
resource "aws_ecs_task_definition" "migrator" {
  family                   = "${var.name}-migrator"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.api_cpu
  memory                   = var.api_memory
  execution_role_arn       = aws_iam_role.task_execution.arn
  task_role_arn            = aws_iam_role.api_task.arn
  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = var.cpu_architecture
  }
  container_definitions = jsonencode(local.migrator_containers)

  depends_on = [
    aws_secretsmanager_secret_version.database_url,
    aws_secretsmanager_secret_version.better_auth_secret,
    aws_secretsmanager_secret_version.crypto_local_master_key,
    aws_secretsmanager_secret_version.openai_api_key,
    aws_secretsmanager_secret_version.monitoring_password,
  ]
}

resource "aws_ecs_service" "api" {
  name                   = "${var.name}-api"
  cluster                = aws_ecs_cluster.main.id
  task_definition        = aws_ecs_task_definition.api.arn
  desired_count          = var.api_desired
  launch_type            = "FARGATE"
  enable_execute_command = true

  deployment_minimum_healthy_percent = 100
  deployment_maximum_percent         = 200

  # Auto-rollback a deployment that can't reach steady state instead of leaving
  # the service stuck on failing tasks.
  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  network_configuration {
    subnets          = aws_subnet.public[*].id
    security_groups  = [aws_security_group.tasks.id]
    assign_public_ip = true
  }

  lifecycle {
    ignore_changes = [desired_count] # autoscaling owns this after create
  }
}

resource "aws_ecs_service" "worker" {
  name                   = "${var.name}-worker"
  cluster                = aws_ecs_cluster.main.id
  task_definition        = aws_ecs_task_definition.worker.arn
  desired_count          = var.worker_desired
  launch_type            = "FARGATE"
  enable_execute_command = true

  deployment_minimum_healthy_percent = 100
  deployment_maximum_percent         = 200

  # Auto-rollback a deployment that can't reach steady state instead of leaving
  # the service stuck on failing tasks.
  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  network_configuration {
    subnets          = aws_subnet.public[*].id
    security_groups  = [aws_security_group.tasks.id]
    assign_public_ip = true
  }

  lifecycle {
    ignore_changes = [desired_count]
  }
}

resource "aws_appautoscaling_target" "api" {
  service_namespace  = "ecs"
  resource_id        = "service/${aws_ecs_cluster.main.name}/${aws_ecs_service.api.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  min_capacity       = var.api_min
  max_capacity       = var.api_max
}

resource "aws_appautoscaling_policy" "api_cpu" {
  name               = "${var.name}-api-cpu"
  policy_type        = "TargetTrackingScaling"
  service_namespace  = aws_appautoscaling_target.api.service_namespace
  resource_id        = aws_appautoscaling_target.api.resource_id
  scalable_dimension = aws_appautoscaling_target.api.scalable_dimension
  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
    target_value = 60
  }
}

resource "aws_appautoscaling_target" "worker" {
  service_namespace  = "ecs"
  resource_id        = "service/${aws_ecs_cluster.main.name}/${aws_ecs_service.worker.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  min_capacity       = var.worker_min
  max_capacity       = var.worker_max
}

resource "aws_appautoscaling_policy" "worker_cpu" {
  name               = "${var.name}-worker-cpu"
  policy_type        = "TargetTrackingScaling"
  service_namespace  = aws_appautoscaling_target.worker.service_namespace
  resource_id        = aws_appautoscaling_target.worker.resource_id
  scalable_dimension = aws_appautoscaling_target.worker.scalable_dimension
  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
    target_value = 65
  }
}

# Queue-depth policy — scaffolded, OFF until a publisher emits the custom
# CloudWatch metric future-app/worker JobQueueBacklogPerTask.
resource "aws_appautoscaling_policy" "worker_queue" {
  count              = var.enable_worker_queue_scaling ? 1 : 0
  name               = "${var.name}-worker-queue"
  policy_type        = "TargetTrackingScaling"
  service_namespace  = aws_appautoscaling_target.worker.service_namespace
  resource_id        = aws_appautoscaling_target.worker.resource_id
  scalable_dimension = aws_appautoscaling_target.worker.scalable_dimension
  target_tracking_scaling_policy_configuration {
    customized_metric_specification {
      metric_name = "JobQueueBacklogPerTask"
      namespace   = "future-app/worker"
      statistic   = "Average"
    }
    target_value = var.worker_queue_target
  }
}
