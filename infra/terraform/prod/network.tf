# Models the real future-app-prod VPC (vpc-0d6bc53f62dde02e0), created by
# ClickOps in ap-southeast-1. Adopted via import, not created fresh.

locals {
  vpc_cidr = "10.0.0.0/16"
  azs      = ["ap-southeast-1a", "ap-southeast-1b"]
}

resource "aws_vpc" "main" {
  cidr_block           = local.vpc_cidr
  enable_dns_support   = true
  enable_dns_hostnames = true
  tags                 = { Name = "${local.name}-vpc" }
}

resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id
  tags   = { Name = "${local.name}-igw" }
}

# 2 public subnets — app box lives in AZ-a (subnet_public[0]).
resource "aws_subnet" "public" {
  count                   = 2
  vpc_id                  = aws_vpc.main.id
  cidr_block              = cidrsubnet(local.vpc_cidr, 8, count.index) # 10.0.0.0/24, 10.0.1.0/24
  availability_zone       = local.azs[count.index]
  map_public_ip_on_launch = true
  tags = {
    Name = "${local.name}-public-${count.index + 1}"
    Tier = "public"
  }
}

# 2 private subnets — RDS subnet group requires >= 2 AZs, though the
# real DB instance actually sits in the public subnet group (see data.tf);
# these are provisioned but currently unused by any resource.
resource "aws_subnet" "private" {
  count             = 2
  vpc_id            = aws_vpc.main.id
  cidr_block        = cidrsubnet(local.vpc_cidr, 8, count.index + 10) # 10.0.10.0/24, 10.0.11.0/24
  availability_zone = local.azs[count.index]
  tags = {
    Name = "${local.name}-private-${count.index + 1}"
    Tier = "private"
  }
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id
  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.main.id
  }
  tags = { Name = "${local.name}-public-rt" }
}

resource "aws_route_table_association" "public" {
  count          = 2
  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

# Private route table: local-only, no NAT gateway (RDS lives in the
# public subnet group and needs no egress; see data.tf).
resource "aws_route_table" "private" {
  vpc_id = aws_vpc.main.id
  tags   = { Name = "${local.name}-private-rt" }
}

resource "aws_route_table_association" "private" {
  count          = 2
  subnet_id      = aws_subnet.private[count.index].id
  route_table_id = aws_route_table.private.id
}

# NOTE: the VPC main route table (rtb-05a1ea4b9554439e6) is intentionally
# NOT managed here — it has no Name tag / association beyond the implicit
# VPC default and was never touched by whatever created this VPC.
