output "gha_sandbox_role_arn" {
  description = "Set as GitHub sandbox-env secret AWS_SANDBOX_ROLE_ARN."
  value       = aws_iam_role.gha_sandbox.arn
}

output "tfstate_bucket" {
  value = aws_s3_bucket.tfstate.id
}
