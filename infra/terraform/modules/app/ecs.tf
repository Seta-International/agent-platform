data "aws_region" "current" {}

resource "aws_ecs_cluster" "main" {
  name = var.name
  setting {
    name  = "containerInsights"
    value = "enabled"
  }
}

resource "aws_cloudwatch_log_group" "api" {
  name              = "/ecs/${var.name}/api"
  retention_in_days = 30
}

resource "aws_cloudwatch_log_group" "worker" {
  name              = "/ecs/${var.name}/worker"
  retention_in_days = 30
}

# Egress-only SG for all tasks. Zero inbound: nothing can reach the tasks;
# they reach OUT (ECR, Secrets Manager, RDS, CloudWatch, Cloudflare) over the IGW.
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

  # Plain (non-secret) env shared by server + worker.
  base_env = [
    { name = "NODE_ENV", value = "production" },
    { name = "CRYPTO_KEY_PROVIDER", value = "env" },
    { name = "AWS_REGION", value = local.region },
  ]

  secret_defs = [for k, arn in local.app_secret_arns : { name = k, valueFrom = arn }]

  server_container = {
    name         = "server"
    image        = var.image_uri
    essential    = true
    command      = ["serve"]
    environment  = concat(local.base_env, [{ name = "PORT", value = "3000" }])
    secrets      = local.secret_defs
    portMappings = [{ containerPort = 3000, protocol = "tcp" }]
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = aws_cloudwatch_log_group.api.name
        "awslogs-region"        = local.region
        "awslogs-stream-prefix" = "server"
      }
    }
    healthCheck = {
      command     = ["CMD-SHELL", "wget -qO- http://localhost:3000/health/live || exit 1"]
      interval    = 30
      timeout     = 5
      retries     = 3
      startPeriod = 30
    }
  }

  cloudflared_container = {
    name      = "cloudflared"
    image     = "cloudflare/cloudflared:latest"
    essential = true
    command   = ["tunnel", "--no-autoupdate", "run"]
    secrets   = [{ name = "TUNNEL_TOKEN", valueFrom = var.cloudflared_token_secret_arn }]
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = aws_cloudwatch_log_group.api.name
        "awslogs-region"        = local.region
        "awslogs-stream-prefix" = "cloudflared"
      }
    }
  }

  api_containers = [
    for c in [
      local.server_container,
      var.enable_cloudflared ? local.cloudflared_container : null,
    ] : c if c != null
  ]

  worker_container = {
    name      = "worker"
    image     = var.image_uri
    essential = true
    command   = ["worker"]
    # Give in-flight jobs time to drain on SIGTERM (deploy / scale-in) before ECS
    # SIGKILLs the container. graphile-worker stops claiming new jobs on SIGTERM.
    stopTimeout = 120
    environment = local.base_env
    secrets     = local.secret_defs
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = aws_cloudwatch_log_group.worker.name
        "awslogs-region"        = local.region
        "awslogs-stream-prefix" = "worker"
      }
    }
  }
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
  container_definitions = jsonencode([local.worker_container])
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
