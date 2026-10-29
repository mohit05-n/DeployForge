variable "aws_region" {
  description = "AWS region for the state bucket and lock table"
  type        = string
  default     = "us-east-1"
}

variable "state_bucket_name" {
  description = "Globally unique name for the S3 state bucket (e.g. deployforge-terraform-state-<account-id>)"
  type        = string
}

variable "lock_table_name" {
  description = "DynamoDB table name for Terraform state locking"
  type        = string
  default     = "deployforge-terraform-locks"
}

variable "tags" {
  description = "Resource tags"
  type        = map(string)
  default = {
    Project   = "DeployForge"
    ManagedBy = "Terraform-Bootstrap"
  }
}
