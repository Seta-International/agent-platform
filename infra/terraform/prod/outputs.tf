output "app_asg_name" {
  description = "Auto Scaling Group name (for instance-refresh / SSM targeting)."
  value       = aws_autoscaling_group.app.name
}

output "db_endpoint" {
  description = "RDS endpoint host:port for DATABASE_URL."
  value       = "${aws_db_instance.main.address}:${aws_db_instance.main.port}"
}

output "s3_bucket" {
  description = "App S3 bucket name."
  value       = aws_s3_bucket.app.id
}

output "vpc_id" {
  value = aws_vpc.main.id
}
