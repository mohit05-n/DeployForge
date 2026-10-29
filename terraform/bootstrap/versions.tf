terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 5.30.0"
    }
  }

  # Local state is deliberately used here to break the circular dependency.
  # This module creates the S3 bucket and DynamoDB table used by subsequent environments.
}
