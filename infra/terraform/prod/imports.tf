# Adopts the real ClickOps-created future-app-prod infra (account
# 555146423830, ap-southeast-1) into Terraform state. No prior state
# exists anywhere for these resources — importing is safe.
#
# Run `terraform plan` (never apply, in this pass) after `terraform init`
# with local state to verify every block below imports cleanly with no
# destroy/replace/forces-new-resource.

import {
  to = aws_vpc.main
  id = "vpc-0d6bc53f62dde02e0"
}

import {
  to = aws_subnet.public[0]
  id = "subnet-05b1dc2e924500875" # ap-southeast-1a
}

import {
  to = aws_subnet.public[1]
  id = "subnet-008f6da7122646d98" # ap-southeast-1b
}

import {
  to = aws_subnet.private[0]
  id = "subnet-000cb7cc6818d3f8e" # ap-southeast-1a
}

import {
  to = aws_subnet.private[1]
  id = "subnet-05ca61cc6dc986859" # ap-southeast-1b
}

import {
  to = aws_internet_gateway.main
  id = "igw-0d4876ea65e770a68"
}

import {
  to = aws_route_table.public
  id = "rtb-0e2e555dc7459ab76"
}

import {
  to = aws_route_table.private
  id = "rtb-0e597be41ceb7b7e4"
}

import {
  to = aws_route_table_association.public[0]
  id = "subnet-05b1dc2e924500875/rtb-0e2e555dc7459ab76"
}

import {
  to = aws_route_table_association.public[1]
  id = "subnet-008f6da7122646d98/rtb-0e2e555dc7459ab76"
}

import {
  to = aws_route_table_association.private[0]
  id = "subnet-000cb7cc6818d3f8e/rtb-0e597be41ceb7b7e4"
}

import {
  to = aws_route_table_association.private[1]
  id = "subnet-05ca61cc6dc986859/rtb-0e597be41ceb7b7e4"
}

# --- security groups ---

import {
  to = aws_security_group.app
  id = "sg-0fae4934473ffc573"
}

import {
  to = aws_vpc_security_group_ingress_rule.app_ssh_1
  id = "sgr-0610b81bc8692a989"
}

import {
  to = aws_vpc_security_group_ingress_rule.app_ssh_2
  id = "sgr-0342f7a911973455d"
}

import {
  to = aws_vpc_security_group_ingress_rule.app_https
  id = "sgr-0f4fc33a20a8da61f"
}

import {
  to = aws_vpc_security_group_egress_rule.app_all_ipv4
  id = "sgr-03581565b0ad90f0a"
}

import {
  to = aws_security_group.db
  id = "sg-011f7437a3dc43691"
}

import {
  to = aws_vpc_security_group_ingress_rule.db_postgres_1
  id = "sgr-0de353c1390a0f13f"
}

import {
  to = aws_vpc_security_group_ingress_rule.db_postgres_2
  id = "sgr-0b7d02775c5fe133c"
}

import {
  to = aws_vpc_security_group_ingress_rule.db_from_app
  id = "sgr-0c88925e68dbd9236"
}

import {
  to = aws_vpc_security_group_egress_rule.db_all_ipv4
  id = "sgr-012dd70ecabdf1986"
}

# --- compute ---

import {
  to = aws_instance.app
  id = "i-0ea6b8e2668eb3245"
}

# --- database ---

import {
  to = aws_db_subnet_group.main
  id = "future-app-prod-db-subnet-group"
}

import {
  to = aws_db_instance.main
  id = "future-app-prod-db"
}

# --- storage ---

import {
  to = aws_s3_bucket.app
  id = "future-app-bucket-prod-seta"
}

import {
  to = aws_s3_bucket_versioning.app
  id = "future-app-bucket-prod-seta"
}

import {
  to = aws_s3_bucket_server_side_encryption_configuration.app
  id = "future-app-bucket-prod-seta"
}

import {
  to = aws_s3_bucket_public_access_block.app
  id = "future-app-bucket-prod-seta"
}

import {
  to = aws_s3_bucket_lifecycle_configuration.app
  id = "future-app-bucket-prod-seta"
}

import {
  to = aws_ecr_repository.app
  id = "future-app"
}

# --- IAM ---

import {
  to = aws_iam_role.app
  id = "future-app-prod-ec2-role"
}

import {
  to = aws_iam_role_policy_attachment.ecr_read_only
  id = "future-app-prod-ec2-role/arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly"
}

import {
  to = aws_iam_instance_profile.app
  id = "future-app-prod-ec2-profile"
}
