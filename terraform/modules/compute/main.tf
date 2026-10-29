/**
 * DeployForge — Compute Module
 * Provisions the EC2 deployment host running Docker on Amazon Linux 2023.
 * Configures IMDSv2, EBS encryption, IAM instance profile, and cloud-init user_data.
 */

# Retrieve latest official Amazon Linux 2023 AMI
data "aws_ami" "amazon_linux_2023" {
  most_recent = true
  owners      = ["amazon"]

  filter {
    name   = "name"
    values = ["al2023-ami-2023.*-x86_64"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }

  filter {
    name   = "root-device-type"
    values = ["ebs"]
  }
}

# User data script to install Docker, enable SSM agent, and start services
locals {
  user_data = <<-EOF
    #!/bin/bash
    set -euo pipefail

    echo "==> DeployForge Node Bootstrap: Starting"

    # Update system packages
    dnf update -y

    # Install Docker and AWS CLI v2 tools
    dnf install -y docker aws-cli

    # Enable and start Docker service
    systemctl enable docker
    systemctl start docker

    # Add ec2-user to docker group
    usermod -aG docker ec2-user

    # Ensure Amazon SSM Agent is active (pre-installed on AL2023)
    systemctl enable amazon-ssm-agent
    systemctl restart amazon-ssm-agent

    echo "==> DeployForge Node Bootstrap: Complete"
  EOF
}

resource "aws_instance" "deployment_host" {
  ami                    = data.aws_ami.amazon_linux_2023.id
  instance_type          = var.instance_type
  subnet_id              = var.subnet_id
  vpc_security_group_ids = [var.security_group_id]
  iam_instance_profile   = var.instance_profile_name
  key_name               = var.key_name != "" ? var.key_name : null

  user_data_base64 = base64encode(local.user_data)

  # Root block device with mandatory gp3 encryption
  root_block_device {
    volume_type           = "gp3"
    volume_size           = var.root_volume_size
    encrypted             = true
    delete_on_termination = true

    tags = merge(var.tags, {
      Name = "${var.project_name}-${var.environment}-root-volume"
    })
  }

  # Security best practice: Enforce IMDSv2 to prevent SSRF credential exfiltration
  metadata_options {
    http_endpoint               = "enabled"
    http_tokens                 = "required"
    http_put_response_hop_limit = 1
    instance_metadata_tags      = "enabled"
  }

  tags = merge(var.tags, {
    Name = "${var.project_name}-${var.environment}-deployment-host"
    Role = "DeploymentHost"
  })

  lifecycle {
    ignore_changes = [
      ami # Prevent unintended instance replacement during routine AMI updates
    ]
  }
}
