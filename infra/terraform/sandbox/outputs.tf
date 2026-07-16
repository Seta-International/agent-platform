output "cluster_name" { value = module.app.cluster_name }
output "api_service_name" { value = module.app.api_service_name }
output "worker_service_name" { value = module.app.worker_service_name }
output "db_endpoint" { value = module.app.db_endpoint }
output "ecr_repository_url" { value = module.app.ecr_repository_url }
output "task_security_group_id" { value = module.app.task_security_group_id }
output "public_subnet_ids" { value = module.app.public_subnet_ids }
