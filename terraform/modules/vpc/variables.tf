variable "vpc_cidr" {
  description = "The CIDR block for the VPC"
  type        = string
  default     = "10.0.0.0/16"
}

variable "public_subnet_cidr" {
  description = "The CIDR block for the public subnet"
  type        = string
  default     = "10.0.1.0/24"
}

variable "availability_zone" {
  description = "The availability zone to deploy subnets into (defaults to first available AZ in region)"
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
