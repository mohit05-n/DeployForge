variable "aws_region" {
  description = "The target AWS region for deployment"
  type        = string
  default     = "us-east-1"
}

variable "environment" {
  description = "Deployment environment name (e.g., dev, staging, prod)"
  type        = string
  default     = "dev"

  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "Environment must be one of: 'dev', 'staging', or 'prod'."
  }
}

variable "project_name" {
  description = "Project name prefix applied to all resources"
  type        = string
  default     = "deployforge"
}

variable "vpc_cidr" {
  description = "CIDR block for the VPC"
  type        = string
  default     = "10.0.0.0/16"
}

variable "public_subnet_cidr" {
  description = "CIDR block for the public subnet"
  type        = string
  default     = "10.0.1.0/24"
}

variable "allowed_app_cidrs" {
  description = "CIDRs permitted to access application port 3000 and port 80"
  type        = list(string)
  default     = ["0.0.0.0/0"]
}

variable "admin_cidr" {
  description = "Explicit administrator IP/CIDR permitted for SSH port 22 (e.g. 203.0.113.50/32). Default is empty string, keeping port 22 closed and utilizing AWS Systems Manager Session Manager."
  type        = string
  default     = ""

  validation {
    condition     = var.admin_cidr == "" || var.admin_cidr != "0.0.0.0/0"
    error_message = "SSH port 22 must never be open to 0.0.0.0/0. Specify your explicit IP (x.x.x.x/32) or leave empty to use AWS Systems Manager."
  }
}

variable "instance_type" {
  description = "EC2 instance type for the deployment host"
  type        = string
  default     = "t3.small"
}

variable "root_volume_size" {
  description = "Size of the encrypted gp3 root volume in GB"
  type        = number
  default     = 30
}

variable "key_name" {
  description = "Optional EC2 Key Pair name for SSH. Leave blank to rely strictly on AWS Systems Manager Session Manager (recommended)."
  type        = string
  default     = ""
}

variable "app_port" {
  description = "Port on which the DeployForge application listens"
  type        = number
  default     = 3000
}

variable "custom_tags" {
  description = "Optional custom tags merged with standard platform tags"
  type        = map(string)
  default     = {}
}
