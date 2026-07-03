output "access_key_ids" {
  value = { for e, k in aws_iam_access_key.app : e => k.id }
}
output "secret_access_keys" {
  value     = { for e, k in aws_iam_access_key.app : e => k.secret }
  sensitive = true
}
output "buckets" {
  value = { for e, b in aws_s3_bucket.app : e => b.id }
}
