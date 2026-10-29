variable "ecr_repository_arn" {
  description = "The ARN of the ECR repository to grant image pull access to"
  type        = string
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
