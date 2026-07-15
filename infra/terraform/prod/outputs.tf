output "db_endpoint" {
  description = "RDS endpoint host:port for DATABASE_URL."
  value       = module.app.db_endpoint
}

output "s3_bucket" {
  description = "App S3 bucket name."
  value       = module.app.s3_bucket
}

output "ecr_repository_url" {
  description = "future-app ECR repository URI."
  value       = module.app.ecr_repository_url
}

output "vpc_id" {
  value = module.app.vpc_id
}

output "cluster_name" {
  value = module.app.cluster_name
}
