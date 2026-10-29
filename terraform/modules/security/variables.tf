variable "vpc_id" {
  description = "The ID of the VPC where the security group is created"
  type        = string
}

variable "app_port" {
  description = "The application service port (e.g. 3000 for DeployForge app)"
  type        = number
  default     = 3000
}

variable "allowed_app_cidrs" {
  description = "CIDR blocks allowed to access the application port and port 80"
  type        = list(string)
  default     = ["0.0.0.0/0"]
}

variable "admin_cidr" {
  description = "Explicit administrator IP/CIDR for SSH access (e.g. 203.0.113.50/32). Leave empty to keep port 22 closed and use AWS SSM Session Manager."
  type        = string
  default     = ""

  validation {
    condition     = var.admin_cidr == "" || var.admin_cidr != "0.0.0.0/0"
    error_message = "Administrative SSH access must not be opened to 0.0.0.0/0. Specify your specific IP (e.g. x.x.x.x/32) or leave empty to use AWS Systems Manager."
  }
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
