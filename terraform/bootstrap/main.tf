/**
 * DeployForge — Terraform Remote State Bootstrap
 * Provisions an encrypted, versioned S3 bucket and DynamoDB locking table
 * for shared team environments, breaking circular dependencies.
 */

provider "aws" {
  region = var.aws_region
}

# S3 Bucket for Remote Terraform State
resource "aws_s3_bucket" "terraform_state" {
  bucket        = var.state_bucket_name
  force_destroy = false

  tags = merge(var.tags, {
    Name    = var.state_bucket_name
    Purpose = "TerraformRemoteState"
  })
}

# Enable Object Versioning for state recovery and rollbacks
resource "aws_s3_bucket_versioning" "terraform_state" {
  bucket = aws_s3_bucket.terraform_state.id

  versioning_configuration {
    status = "Enabled"
  }
}

# Enforce Server-Side Encryption (AES256)
resource "aws_s3_bucket_server_side_encryption_configuration" "terraform_state" {
  bucket = aws_s3_bucket.terraform_state.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# Strictly block all public access to the state bucket
resource "aws_s3_bucket_public_access_block" "terraform_state" {
  bucket = aws_s3_bucket.terraform_state.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# DynamoDB Table for Distributed State Locking
resource "aws_dynamodb_table" "terraform_locks" {
  name         = var.lock_table_name
  billing_mode = "PAY_PER_REQUEST" # Zero idle cost
  hash_key     = "LockID"

  attribute {
    name = "LockID"
    type = "S"
  }

  point_in_time_recovery {
    enabled = true
  }

  tags = merge(var.tags, {
    Name    = var.lock_table_name
    Purpose = "TerraformStateLocks"
  })
}
