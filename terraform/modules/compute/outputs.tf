output "instance_id" {
  description = "The ID of the deployment host EC2 instance"
  value       = aws_instance.deployment_host.id
}

output "public_ip" {
  description = "The public IPv4 address of the deployment host"
  value       = aws_instance.deployment_host.public_ip
}

output "private_ip" {
  description = "The private IPv4 address of the deployment host"
  value       = aws_instance.deployment_host.private_ip
}

output "public_dns" {
  description = "The public DNS name of the deployment host"
  value       = aws_instance.deployment_host.public_dns
}

output "arn" {
  description = "The ARN of the deployment host EC2 instance"
  value       = aws_instance.deployment_host.arn
}
