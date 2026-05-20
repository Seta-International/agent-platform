# Backend is intentionally commented out so `tofu init` works against a local
# state file by default. To switch to remote state:
#   1. Create the bucket + DynamoDB lock table once per AWS account:
#        aws s3 mb s3://seta-opentofu-state-<account-id>
#        aws s3api put-bucket-versioning --bucket seta-opentofu-state-<account-id> \
#          --versioning-configuration Status=Enabled
#        aws s3api put-bucket-encryption --bucket seta-opentofu-state-<account-id> \
#          --server-side-encryption-configuration '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}'
#        aws dynamodb create-table --table-name seta-opentofu-locks \
#          --attribute-definitions AttributeName=LockID,AttributeType=S \
#          --key-schema AttributeName=LockID,KeyType=HASH \
#          --billing-mode PAY_PER_REQUEST
#   2. Uncomment and customize the block below per example.
#   3. Re-run `tofu init -migrate-state` from the example directory.
#
# terraform {
#   backend "s3" {
#     bucket         = "seta-opentofu-state-<account-id>"
#     key            = "aws-ecs/<example-name>.tfstate"
#     region         = "us-east-1"
#     dynamodb_table = "seta-opentofu-locks"
#     encrypt        = true
#   }
# }
