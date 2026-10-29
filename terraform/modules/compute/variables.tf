variable "instance_type" {
  description = "The EC2 instance type for the deployment host"
  type        = string
  default     = "t3.small"
}

variable "root_volume_size" {
  description = "Root EBS gp3 volume size in GB"
  type        = number
  default     = 30
}

variable "subnet_id" {
  description = "The subnet ID to launch the instance into"
  type        = string
}

variable "security_group_id" {
  description = "The security group ID to attach to the instance"
  type        = string
}

variable "instance_profile_name" {
  description = "The IAM instance profile name for SSM and ECR access"
  type        = string
}

variable "key_name" {
  description = "Optional EC2 Key Pair name for SSH. Leave empty if using AWS Systems Manager Session Manager."
  type        = string
  default     = ""
}

variable "project_name" {
  description = "Name of the project prefix for resources"
  type        = string
}

variable "environment" {
  description = "Deployment environment name (e.g., dev, staging, prod)"
  type        = string
}

variable "tags" {
  description = "Resource tags to merge onto all resources"
  type        = map(string)
  default     = {}
}
