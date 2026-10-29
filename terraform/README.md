# DeployForge — Modular AWS Terraform Infrastructure (Phase 7)

This directory contains the production-reviewed, modular Terraform configuration for DeployForge's minimal AWS deployment environment.

---

## 1. Architecture Topology

```
+-----------------------------------------------------------------------------------------+
|                                        AWS Cloud                                        |
|                                                                                         |
|  +-------------------------------------+      +--------------------------------------+  |
|  |       AWS Systems Manager (SSM)     |      |       Amazon ECR (Container Reg)     |  |
|  |   - Encrypted Session Manager shell |      |   - Immutable Image Tags             |  |
|  |   - Zero Open Inbound Ports         |      |   - Automated Scan on Push           |  |
|  |   - Audit Logging & MFA support     |      |   - 7-Day Untagged Lifecycle Rule    |  |
|  +-------------------------------------+      +--------------------------------------+  |
|                     ^                                             ^                     |
|                     | (Outbound HTTPS only)                       | (Pull Auth)         |
|                     v                                             v                     |
|  +-----------------------------------------------------------------------------------+  |
|  |   VPC: 10.0.0.0/16                                                                |  |
|  |                                                                                   |  |
|  |   +---------------------------------------------------------------------------+   |  |
|  |   |   Public Subnet: 10.0.1.0/24 (Route: 0.0.0.0/0 -> Internet Gateway)       |   |  |
|  |   |                                                                           |   |  |
|  |   |   +-------------------------------------------------------------------+   |   |  |
|  |   |   |   EC2 Deployment Host (t3.small / Amazon Linux 2023)              |   |   |  |
|  |   |   |   - IAM Instance Profile: AmazonSSMManagedInstanceCore            |   |   |  |
|  |   |   |   - Scoped ECR Pull Policy (Zero AWS Access Keys)                 |   |   |  |
|  |   |   |   - Enforced IMDSv2 (Blocks SSRF credential exfiltration)         |   |   |  |
|  |   |   |   - Encrypted gp3 Root EBS Volume (30 GB)                         |   |   |  |
|  |   |   |   - Docker Engine daemon + systemd service bootstrap              |   |   |  |
|  |   |   +-------------------------------------------------------------------+   |   |  |
|  |   |                                 |                                         |   |  |
|  |   +---------------------------------|-----------------------------------------+   |  |
|  |                                     v                                             |  |
|  |   +---------------------------------------------------------------------------+   |  |
|  |   |   Security Group: deployforge-dev-app-sg                                  |   |  |
|  |   |   - Ingress: Port 3000 (Next.js Application) from 0.0.0.0/0               |   |  |
|  |   |   - Ingress: Port 80 (HTTP Web) from 0.0.0.0/0                            |   |  |
|  |   |   - Ingress: Port 22 (SSH) CLOSED BY DEFAULT (Conditional on admin_cidr)  |   |  |
|  |   |   - BLOCKED: PostgreSQL (5432/54332), Jenkins (8080/8081), Internal APIs  |   |  |
|  |   |   - Egress: 0.0.0.0/0 (Required for ECR pull, packages, and SSM agent)   |   |  |
|  |   +---------------------------------------------------------------------------+   |  |
|  |                                                                                   |  |
|  +-----------------------------------------------------------------------------------+  |
|                                                                                         |
+-----------------------------------------------------------------------------------------+
```

---

## 2. Directory Structure

```
terraform/
├── README.md                      <- This documentation
├── .gitignore                     <- State, tfplan, and secret tfvars exclusion rules
├── bootstrap/                     <- Remote state S3 bucket & DynamoDB lock table
│   ├── main.tf
│   ├── variables.tf
│   ├── outputs.tf
│   ├── versions.tf
│   └── README.md
├── environments/
│   └── dev/                       <- Target dev deployment environment
│       ├── main.tf                <- Module composition
│       ├── variables.tf           <- Environment variables with validation rules
│       ├── outputs.tf             <- Host IP, registry URL, and SSM connect commands
│       ├── terraform.tfvars.example <- Safe placeholder variables template
│       └── versions.tf            <- Terraform, AWS provider, and backend definitions
└── modules/
    ├── vpc/                       <- VPC, subnets, route tables, and Internet Gateway
    ├── security/                  <- Application and restricted admin security groups
    ├── iam/                       <- Least-privilege roles, instance profiles, and policies
    ├── ecr/                       <- Container registry with scan-on-push and lifecycle rules
    └── compute/                   <- EC2 deployment host, IMDSv2, EBS encryption, user_data
```

---

## 3. Security Highlights & Architectural Guarantees

1. **Zero Hardcoded Secrets or Credentials**:
   - No AWS access keys, secret keys, or private SSH keys are stored in code.
   - All account-specific parameters use variables or dynamic data lookups.
2. **Least-Privilege IAM Instance Profile**:
   - The EC2 host authenticates to AWS services via an attached IAM Instance Profile.
   - ECR permissions are scoped **strictly to the target repository ARN** (`ecr:GetDownloadUrlForLayer`, `ecr:BatchGetImage`).
   - CloudWatch logging is scoped strictly to `log-group:/deployforge/dev/*`.
3. **Zero-Open-Port Administrative Shell (AWS Systems Manager)**:
   - Port 22 (SSH) is **completely closed** by default (`admin_cidr = ""`).
   - Operators connect through encrypted, audited sessions via AWS Systems Manager Session Manager:
     ```bash
     aws ssm start-session --target <instance-id> --region us-east-1
     ```
   - If SSH is required by policy, `admin_cidr` enforces strict IP validation and rejects `0.0.0.0/0`.
4. **IMDSv2 Enforced**:
   - The instance requires IMDSv2 (`http_tokens = "required"`), preventing Server-Side Request Forgery (SSRF) vulnerabilities from harvesting instance profile credentials.
5. **No Exposure of Internal Services**:
   - Security groups allow ingress **only** on application port 3000 and HTTP port 80.
   - Internal PostgreSQL databases, Jenkins controllers, and management endpoints are never assigned public ingress rules.
6. **Encrypted Storage & Tag Immutability**:
   - ECR repositories enforce `IMMUTABLE` image tags (matching DeployForge’s build tagging policy).
   - Root EBS volumes are encrypted with AWS-managed keys on high-performance `gp3`.

---

## 4. Remote State & Locking: Bootstrap Procedure

To prevent circular dependencies where Terraform cannot initialize because the remote state backend bucket does not exist yet:

### Step 1: Provision Bootstrap Storage (Local State)
```bash
cd terraform/bootstrap

# Initialize with local state
terraform init

# Review and apply (creates 1 S3 bucket + 1 DynamoDB table)
terraform apply -var="state_bucket_name=deployforge-tfstate-$(aws sts get-caller-identity --query Account --output text)"
```

### Step 2: Enable Remote Backend in Dev Environment
1. In `terraform/environments/dev/versions.tf`, uncomment the `backend "s3"` block:
   ```hcl
   backend "s3" {
     bucket         = "deployforge-tfstate-<YOUR_ACCOUNT_ID>"
     key            = "environments/dev/terraform.tfstate"
     region         = "us-east-1"
     dynamodb_table = "deployforge-terraform-locks"
     encrypt        = true
   }
   ```
2. Migrate state to the remote S3 backend:
   ```bash
   cd terraform/environments/dev
   terraform init -migrate-state
   ```

---

## 5. Standard Operating Workflow

### Prerequisites
- [Terraform CLI](https://developer.hashicorp.com/terraform/install) `>= 1.5.0`
- [AWS CLI v2](https://aws.amazon.com/cli/) `>= 2.15.0`
- Configured AWS credentials or AWS SSO profile:
  ```bash
  aws sts get-caller-identity
  ```

### Step 1: Configuration & Variables
```bash
cd terraform/environments/dev
cp terraform.tfvars.example terraform.tfvars
```
Edit `terraform.tfvars` to customize settings (e.g., `aws_region`, `instance_type`).

### Step 2: Format & Validate
```bash
# Check code formatting
terraform fmt -check -recursive

# Validate syntax and module inputs
terraform validate
```

### Step 3: Plan & Review (Dry-Run Only)
```bash
# Generate a detailed execution plan without modifying AWS
terraform plan -out=tfplan
```

### Step 4: Apply (When Authorized)
> **IMPORTANT**: In accordance with project policy, do not run apply until this plan has been reviewed and authorized by the team.
```bash
terraform apply tfplan
```

### Step 5: Inspect Outputs
```bash
terraform output
```

### Step 6: Teardown & Destruction
```bash
terraform destroy
```

---

## 6. Complete Inventory of Resources Created

When `terraform apply` is executed in `environments/dev`, the following **14 resources** are created:

| # | Terraform Resource Address | Resource Type | Purpose / Description |
|---|----------------------------|---------------|-----------------------|
| 1 | `module.vpc.aws_vpc.main` | `aws_vpc` | Isolated VPC with DNS hostnames and resolution enabled (`10.0.0.0/16`). |
| 2 | `module.vpc.aws_internet_gateway.main` | `aws_internet_gateway` | Enables internet communication for the public subnet. |
| 3 | `module.vpc.aws_subnet.public` | `aws_subnet` | Public subnet with public IP mapping (`10.0.1.0/24`). |
| 4 | `module.vpc.aws_route_table.public` | `aws_route_table` | Route table routing `0.0.0.0/0` out through the Internet Gateway. |
| 5 | `module.vpc.aws_route_table_association.public` | `aws_route_table_association` | Associates the public subnet with the public route table. |
| 6 | `module.security.aws_security_group.app` | `aws_security_group` | Ingress for application port 3000 & 80; egress for updates and SSM. |
| 7 | `module.ecr.aws_ecr_repository.app` | `aws_ecr_repository` | Encrypted, immutable Docker container registry with scan-on-push. |
| 8 | `module.ecr.aws_ecr_lifecycle_policy.cleanup` | `aws_ecr_lifecycle_policy` | Automatically expires untagged layers (>7 days) and limits releases to 30. |
| 9 | `module.iam.aws_iam_role.deployment_host` | `aws_iam_role` | IAM assume role for EC2 instance. |
| 10 | `module.iam.aws_iam_role_policy_attachment.ssm_managed` | `aws_iam_role_policy_attachment` | Attaches `AmazonSSMManagedInstanceCore` for zero-open-port shell access. |
| 11 | `module.iam.aws_iam_policy.ecr_pull` | `aws_iam_policy` | Least-privilege policy scoped strictly to the project's ECR repository ARN. |
| 12 | `module.iam.aws_iam_role_policy_attachment.ecr_pull` | `aws_iam_role_policy_attachment` | Attaches scoped ECR pull policy to the host role. |
| 13 | `module.iam.aws_iam_policy.cloudwatch_logs` | `aws_iam_policy` | Least-privilege policy scoped to `/deployforge/dev/*` log groups. |
| 14 | `module.iam.aws_iam_role_policy_attachment.cloudwatch_logs` | `aws_iam_role_policy_attachment` | Attaches scoped CloudWatch policy to the host role. |
| 15 | `module.iam.aws_iam_instance_profile.deployment_host` | `aws_iam_instance_profile` | Instance profile delivering credentials to the EC2 host. |
| 16 | `module.compute.aws_instance.deployment_host` | `aws_instance` | EC2 deployment host running Docker on Amazon Linux 2023 with IMDSv2. |

*(Note: If `admin_cidr` is non-empty, resource #17 `module.security.aws_security_group_rule.ssh_ingress` is also created for restricted SSH).*

---

## 7. Estimated Ongoing Monthly Costs (Minimal MVP)

DeployForge is intentionally designed for cost efficiency. The minimal MVP avoids expensive multi-AZ NAT Gateways and managed database clusters during early phases:

| Component | AWS Resource | Sizing / Configuration | Estimated Monthly Cost |
| :--- | :--- | :--- | :---: |
| **Compute** | EC2 Instance | `t3.small` (2 vCPU, 2.0 GiB RAM, on-demand) | ~$15.18 |
| **Storage** | EBS Root Volume | 30 GB gp3 encrypted (3,000 IOPS, 125 MB/s included) | ~$2.40 |
| **Networking** | Public IPv4 Address | In-use public IPv4 ($0.005/hour) | ~$3.65 |
| **Container Registry**| Amazon ECR | 10 GB container storage (lifecycle pruned) | ~$1.00 |
| **State Storage** | Amazon S3 + DynamoDB | S3 Standard (<1 GB state) + DynamoDB On-Demand | ~$0.50 |
| **Management** | AWS Systems Manager | Session Manager & SSM Agent | **$0.00 (Free)** |
| **VPC & Gateway** | VPC & Internet Gateway | Default Internet Gateway | **$0.00 (Free)** |
| **Total Estimated MVP Cost** | | | **~$22.73 / month** |

### Deferred Architectural Costs (Savings Analysis)
- **AWS NAT Gateway**: Provisioning a managed NAT Gateway adds **$32.40/month** plus data processing ($0.045/GB). By placing the initial single-node MVP host in a public subnet with outbound internet access and restricting inbound traffic via Security Groups, we save **~$35/month**.
- **Multi-AZ Amazon RDS PostgreSQL**: A multi-AZ RDS `db.t4g.small` costs **~$70 - $115/month**. For dev/MVP environments, running PostgreSQL containerized on the host volume or using an embedded runner saves over **$100/month**.
