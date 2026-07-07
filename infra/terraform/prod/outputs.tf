output "instance_id" {
  description = "future-app-prod EC2 instance id."
  value       = aws_instance.app.id
}

output "instance_public_ip" {
  description = "future-app-prod EC2 public IP."
  value       = aws_instance.app.public_ip
}

output "db_endpoint" {
  description = "RDS endpoint host:port for DATABASE_URL."
  value       = "${aws_db_instance.main.address}:${aws_db_instance.main.port}"
}

output "s3_bucket" {
  description = "App S3 bucket name."
  value       = aws_s3_bucket.app.id
}

output "ecr_repository_url" {
  description = "future-app ECR repository URI."
  value       = aws_ecr_repository.app.repository_url
}

output "vpc_id" {
  value = aws_vpc.main.id
}
