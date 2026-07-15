# Adopts the real ClickOps future-app-prod shared infra (ap-southeast-1) onto the
# modules/app addresses. The live EC2 box + its role/profile are intentionally
# NOT imported — they stay running, unmanaged, until the EC2->ECS cutover
# (separate ticket).
#
# DO NOT APPLY this config in this ticket. `terraform plan` is expected to show:
#   - adopt (no change) of VPC / subnets / IGW / routes / DB / S3 / ECR
#   - CREATE of all ECS resources (cluster, services, task defs, IAM task roles,
#     Secrets Manager entries, autoscaling, log groups)
#   - REPLACE of the DB security-group rules: the old office-IP + app-box ingress
#     rules are gone from the module (which models only a tasks->DB rule). That
#     delta is correct for the ECS target and is one reason prod is plan-only here.

import {
  to = module.app.aws_vpc.main
  id = "vpc-0d6bc53f62dde02e0"
}
import {
  to = module.app.aws_subnet.public[0]
  id = "subnet-05b1dc2e924500875"
}
import {
  to = module.app.aws_subnet.public[1]
  id = "subnet-008f6da7122646d98"
}
import {
  to = module.app.aws_subnet.private[0]
  id = "subnet-000cb7cc6818d3f8e"
}
import {
  to = module.app.aws_subnet.private[1]
  id = "subnet-05ca61cc6dc986859"
}
import {
  to = module.app.aws_internet_gateway.main
  id = "igw-0d4876ea65e770a68"
}
import {
  to = module.app.aws_route_table.public
  id = "rtb-0e2e555dc7459ab76"
}
import {
  to = module.app.aws_route_table.private
  id = "rtb-0e597be41ceb7b7e4"
}
import {
  to = module.app.aws_route_table_association.public[0]
  id = "subnet-05b1dc2e924500875/rtb-0e2e555dc7459ab76"
}
import {
  to = module.app.aws_route_table_association.public[1]
  id = "subnet-008f6da7122646d98/rtb-0e2e555dc7459ab76"
}
import {
  to = module.app.aws_route_table_association.private[0]
  id = "subnet-000cb7cc6818d3f8e/rtb-0e597be41ceb7b7e4"
}
import {
  to = module.app.aws_route_table_association.private[1]
  id = "subnet-05ca61cc6dc986859/rtb-0e597be41ceb7b7e4"
}
import {
  to = module.app.aws_security_group.db
  id = "sg-011f7437a3dc43691"
}
import {
  to = module.app.aws_db_subnet_group.main
  id = "future-app-prod-db-subnet-group"
}
import {
  to = module.app.aws_db_instance.main
  id = "future-app-prod-db"
}
import {
  to = module.app.aws_s3_bucket.app
  id = "future-app-bucket-prod-seta"
}
import {
  to = module.app.aws_s3_bucket_versioning.app
  id = "future-app-bucket-prod-seta"
}
import {
  to = module.app.aws_s3_bucket_server_side_encryption_configuration.app
  id = "future-app-bucket-prod-seta"
}
import {
  to = module.app.aws_s3_bucket_public_access_block.app
  id = "future-app-bucket-prod-seta"
}
import {
  to = module.app.aws_s3_bucket_lifecycle_configuration.app
  id = "future-app-bucket-prod-seta"
}
import {
  to = module.app.aws_ecr_repository.app
  id = "future-app"
}
