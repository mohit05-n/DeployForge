/**
 * DeployForge — IAM Module
 * Creates least-privilege IAM roles and an instance profile for the deployment host.
 * Enables AWS Systems Manager Session Manager for zero-open-port administrative access.
 */

# Trust policy allowing EC2 instances to assume this role
data "aws_iam_policy_document" "ec2_assume_role" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["ec2.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "deployment_host" {
  name               = "${var.project_name}-${var.environment}-ec2-role"
  description        = "Least-privilege role for DeployForge deployment host"
  assume_role_policy = data.aws_iam_policy_document.ec2_assume_role.json

  tags = merge(var.tags, {
    Name = "${var.project_name}-${var.environment}-ec2-role"
  })
}

# Attach AWS Systems Manager (SSM) managed policy for secure shell access without SSH
resource "aws_iam_role_policy_attachment" "ssm_managed" {
  role       = aws_iam_role.deployment_host.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

# Scoped ECR Read & Pull Policy
data "aws_iam_policy_document" "ecr_pull" {
  # GetAuthorizationToken cannot be scoped to a specific repository in AWS IAM
  statement {
    sid       = "ECRAuthToken"
    effect    = "Allow"
    actions   = ["ecr:GetAuthorizationToken"]
    resources = ["*"]
  }

  # Image layer download and batch operations scoped strictly to the target repository
  statement {
    sid    = "ECRScopedPull"
    effect = "Allow"
    actions = [
      "ecr:BatchCheckLayerAvailability",
      "ecr:GetDownloadUrlForLayer",
      "ecr:BatchGetImage",
      "ecr:DescribeRepositories",
      "ecr:ListImages"
    ]
    resources = [var.ecr_repository_arn]
  }
}

resource "aws_iam_policy" "ecr_pull" {
  name        = "${var.project_name}-${var.environment}-ecr-pull-policy"
  description = "Scoped policy allowing EC2 deployment host to pull images from DeployForge ECR"
  policy      = data.aws_iam_policy_document.ecr_pull.json

  tags = var.tags
}

resource "aws_iam_role_policy_attachment" "ecr_pull" {
  role       = aws_iam_role.deployment_host.name
  policy_arn = aws_iam_policy.ecr_pull.arn
}

# Scoped CloudWatch Logs Policy for application and system logging
data "aws_iam_policy_document" "cloudwatch_logs" {
  statement {
    sid    = "CloudWatchLogsScoped"
    effect = "Allow"
    actions = [
      "logs:CreateLogGroup",
      "logs:CreateLogStream",
      "logs:PutLogEvents",
      "logs:DescribeLogStreams"
    ]
    resources = [
      "arn:aws:logs:*:*:log-group:/${var.project_name}/${var.environment}/*",
      "arn:aws:logs:*:*:log-group:/${var.project_name}/${var.environment}"
    ]
  }
}

resource "aws_iam_policy" "cloudwatch_logs" {
  name        = "${var.project_name}-${var.environment}-cw-logs-policy"
  description = "Scoped policy allowing EC2 deployment host to stream logs to CloudWatch"
  policy      = data.aws_iam_policy_document.cloudwatch_logs.json

  tags = var.tags
}

resource "aws_iam_role_policy_attachment" "cloudwatch_logs" {
  role       = aws_iam_role.deployment_host.name
  policy_arn = aws_iam_policy.cloudwatch_logs.arn
}

# EC2 Instance Profile
resource "aws_iam_instance_profile" "deployment_host" {
  name = "${var.project_name}-${var.environment}-ec2-profile"
  role = aws_iam_role.deployment_host.name

  tags = var.tags
}
