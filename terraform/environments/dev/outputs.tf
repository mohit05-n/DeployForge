# -----------------------------------------------------------------------------
# Registry Outputs
# -----------------------------------------------------------------------------
output "ecr_repository_url" {
  description = "The URL of the ECR repository for pushing DeployForge container images"
  value       = module.ecr.repository_url
}

output "ecr_repository_arn" {
  description = "The ARN of the ECR repository"
  value       = module.ecr.repository_arn
}

output "ecr_registry_id" {
  description = "The AWS account ID owning the ECR registry"
  value       = module.ecr.registry_id
}

# -----------------------------------------------------------------------------
# Deployment Host Outputs
# -----------------------------------------------------------------------------
output "deployment_host_instance_id" {
  description = "EC2 Instance ID of the deployment host"
  value       = module.compute.instance_id
}

output "deployment_host_public_ip" {
  description = "Public IPv4 address of the deployment host"
  value       = module.compute.public_ip
}

output "deployment_host_public_dns" {
  description = "Public DNS hostname of the deployment host"
  value       = module.compute.public_dns
}

output "application_url" {
  description = "Direct HTTP URL to access the deployed application"
  value       = "http://${module.compute.public_ip}:${var.app_port}"
}

# -----------------------------------------------------------------------------
# Administrative Access (SSM Zero-Open-Port Command)
# -----------------------------------------------------------------------------
output "ssm_connect_command" {
  description = "AWS CLI command to open an encrypted shell session via AWS Systems Manager without SSH keys or open ports"
  value       = "aws ssm start-session --target ${module.compute.instance_id} --region ${var.aws_region}"
}

output "ecr_login_command" {
  description = "AWS CLI command to authenticate Docker to the ECR registry"
  value       = "aws ecr get-login-password --region ${var.aws_region} | docker login --username AWS --password-stdin ${module.ecr.repository_url}"
}
