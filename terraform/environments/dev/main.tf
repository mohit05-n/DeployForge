/**
 * DeployForge — Dev Environment Root Configuration
 * Orchestrates modular VPC, Security Groups, IAM, ECR, and Compute resources.
 */

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = merge(
      {
        Project     = "DeployForge"
        Environment = var.environment
        ManagedBy   = "Terraform"
        Repository  = "https://github.com/mohit05-n/DeployForge"
      },
      var.custom_tags
    )
  }
}

locals {
  common_tags = merge(
    {
      Project     = "DeployForge"
      Environment = var.environment
      ManagedBy   = "Terraform"
    },
    var.custom_tags
  )
}

# 1. Minimal VPC & Networking
module "vpc" {
  source = "../../modules/vpc"

  project_name       = var.project_name
  environment        = var.environment
  vpc_cidr           = var.vpc_cidr
  public_subnet_cidr = var.public_subnet_cidr
  tags               = local.common_tags
}

# 2. Strict Security Groups
module "security" {
  source = "../../modules/security"

  project_name      = var.project_name
  environment       = var.environment
  vpc_id            = module.vpc.vpc_id
  app_port          = var.app_port
  allowed_app_cidrs = var.allowed_app_cidrs
  admin_cidr        = var.admin_cidr
  tags              = local.common_tags
}

# 3. Encrypted, Immutable ECR Repository
module "ecr" {
  source = "../../modules/ecr"

  project_name = var.project_name
  environment  = var.environment
  tags         = local.common_tags
}

# 4. Least-Privilege IAM & Instance Profile (SSM + Scoped ECR)
module "iam" {
  source = "../../modules/iam"

  project_name       = var.project_name
  environment        = var.environment
  ecr_repository_arn = module.ecr.repository_arn
  tags               = local.common_tags
}

# 5. EC2 Deployment Host (IMDSv2, gp3 encrypted, Docker bootstrap)
module "compute" {
  source = "../../modules/compute"

  project_name          = var.project_name
  environment           = var.environment
  instance_type         = var.instance_type
  root_volume_size      = var.root_volume_size
  subnet_id             = module.vpc.public_subnet_id
  security_group_id     = module.security.app_security_group_id
  instance_profile_name = module.iam.instance_profile_name
  key_name              = var.key_name
  tags                  = local.common_tags
}
