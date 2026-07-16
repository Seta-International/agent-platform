output "vpc_id" { value = aws_vpc.main.id }
output "public_subnet_ids" { value = aws_subnet.public[*].id }
output "cluster_arn" { value = aws_ecs_cluster.main.arn }
output "cluster_name" { value = aws_ecs_cluster.main.name }
output "api_service_name" { value = aws_ecs_service.api.name }
output "worker_service_name" { value = aws_ecs_service.worker.name }
output "task_security_group_id" { value = aws_security_group.tasks.id }
output "db_endpoint" { value = "${aws_db_instance.main.address}:${aws_db_instance.main.port}" }
output "db_address" { value = aws_db_instance.main.address }
output "s3_bucket" { value = aws_s3_bucket.app.id }
output "web_bucket" { value = aws_s3_bucket.web.id }
output "web_distribution_id" { value = aws_cloudfront_distribution.web.id }
output "web_domain" { value = aws_cloudfront_distribution.web.domain_name }
output "migrator_task_family" { value = aws_ecs_task_definition.migrator.family }
output "web_acm_validation_records" {
  description = "DNS records to add in Cloudflare to validate the web ACM cert."
  value = var.web_domain == null ? [] : [
    for o in aws_acm_certificate.web[0].domain_validation_options :
    { name = o.resource_record_name, type = o.resource_record_type, value = o.resource_record_value }
  ]
}
output "ecr_repository_url" { value = aws_ecr_repository.app.repository_url }
output "task_execution_role_arn" { value = aws_iam_role.task_execution.arn }
