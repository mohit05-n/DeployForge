/**
 * DeployForge — Security Groups Module
 * Restricts ingress strictly to application traffic and optional admin-specific SSH.
 * Internal management interfaces (Jenkins, PostgreSQL, internal APIs) are never exposed.
 */

resource "aws_security_group" "app" {
  name        = "${var.project_name}-${var.environment}-app-sg"
  description = "DeployForge application host security group"
  vpc_id      = var.vpc_id

  # Application Ingress (e.g. Next.js on port 3000)
  ingress {
    description = "Allow inbound application traffic"
    from_port   = var.app_port
    to_port     = var.app_port
    protocol    = "tcp"
    cidr_blocks = var.allowed_app_cidrs
  }

  # Standard HTTP Ingress (port 80) for reverse proxy / redirect
  ingress {
    description = "Allow inbound HTTP web traffic"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = var.allowed_app_cidrs
  }

  # Outbound Egress (Required for SSM agent, package updates, and pulling images from ECR)
  egress {
    description = "Allow all outbound traffic"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(var.tags, {
    Name = "${var.project_name}-${var.environment}-app-sg"
  })
}

# Administrative SSH Access Rule (Port 22)
# Strictly conditional: Only created if an explicit admin_cidr is provided.
# When admin_cidr is empty, port 22 is completely closed and administrators use AWS SSM Session Manager.
resource "aws_security_group_rule" "ssh_ingress" {
  count = var.admin_cidr != "" ? 1 : 0

  type              = "ingress"
  from_port         = 22
  to_port           = 22
  protocol          = "tcp"
  cidr_blocks       = [var.admin_cidr]
  description       = "Restricted administrative SSH from explicitly supplied IP"
  security_group_id = aws_security_group.app.id
}
