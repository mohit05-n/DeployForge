output "instance_profile_name" {
  description = "The name of the IAM instance profile for the deployment host"
  value       = aws_iam_instance_profile.deployment_host.name
}

output "instance_profile_arn" {
  description = "The ARN of the IAM instance profile"
  value       = aws_iam_instance_profile.deployment_host.arn
}

output "role_name" {
  description = "The name of the IAM role"
  value       = aws_iam_role.deployment_host.name
}

output "role_arn" {
  description = "The ARN of the IAM role"
  value       = aws_iam_role.deployment_host.arn
}
