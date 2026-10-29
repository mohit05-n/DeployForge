terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 5.30.0"
    }
  }

  # --------------------------------------------------------------------------
  # Remote State & Locking Configuration (S3 + DynamoDB)
  # --------------------------------------------------------------------------
  # Before enabling this block, run the standalone bootstrap module in:
  #   terraform/bootstrap/
  # to provision the S3 bucket and DynamoDB locking table.
  #
  # Once bootstrap is complete, uncomment the block below, replace the bucket
  # name with your bootstrapped bucket, and run:
  #   terraform init -migrate-state
  # --------------------------------------------------------------------------
  # backend "s3" {
  #   bucket         = "deployforge-tfstate-REPLACE_WITH_ACCOUNT_ID"
  #   key            = "environments/dev/terraform.tfstate"
  #   region         = "us-east-1"
  #   dynamodb_table = "deployforge-terraform-locks"
  #   encrypt        = true
  # }
}
