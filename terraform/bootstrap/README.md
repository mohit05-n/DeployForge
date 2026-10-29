# DeployForge — Remote State Bootstrap Guide

This module provisions the foundational AWS resources required for remote Terraform state management:
1. **S3 Bucket**: Encrypted (AES256), versioned, with all public access strictly blocked.
2. **DynamoDB Table**: On-demand (`PAY_PER_REQUEST`) with `LockID` string key for distributed execution locking.

---

## Why a Separate Bootstrap Module? (Breaking Circular Dependencies)

When using the `s3` remote backend in Terraform, Terraform checks for the existence of the S3 bucket and DynamoDB table **before** evaluating any resource blocks in your configuration.

If the S3 bucket is defined inside the same configuration that uses it as a backend, `terraform init` fails with a chicken-and-egg error:
```
Error: Failed to get existing workspaces: S3 bucket does not exist.
```

By separating bootstrap into this standalone folder:
1. You run `terraform init` and `terraform apply` here with **local state**.
2. Once the S3 bucket and DynamoDB table are created, you configure the `backend "s3"` block in `environments/dev/versions.tf`.
3. You run `terraform init -migrate-state` in `environments/dev/` to push the dev environment's state into the newly created S3 backend.

---

## Bootstrap Execution Steps

```bash
cd terraform/bootstrap

# 1. Initialize with local state
terraform init

# 2. Review the plan (creates 1 S3 bucket, versioning, encryption, public access block, and 1 DynamoDB table)
terraform plan -var="state_bucket_name=deployforge-tfstate-$(aws sts get-caller-identity --query Account --output text)"

# 3. Apply when authorized
terraform apply -var="state_bucket_name=deployforge-tfstate-$(aws sts get-caller-identity --query Account --output text)"
```
