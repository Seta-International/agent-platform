output "public_ip" {
  description = "Elastic IP of the demo EC2 instance. Point your DNS A-record here."
  value       = aws_eip.app.public_ip
}

output "public_dns" {
  description = "Public DNS hostname of the Elastic IP."
  value       = aws_eip.app.public_dns
}

output "backup_bucket" {
  description = "S3 bucket name used for daily pg_dump backups."
  value       = aws_s3_bucket.backup.bucket
}

output "instance_id" {
  description = "EC2 instance ID (useful for EBS snapshot and SSM Session Manager)."
  value       = aws_instance.app.id
}

output "ssh_command" {
  description = "SSH command to connect to the instance (requires key_name to be set)."
  value       = "ssh ubuntu@${aws_eip.app.public_ip}"
}

output "app_url" {
  description = "Demo app URL (DNS must be configured first)."
  value       = "https://${var.domain}"
}
