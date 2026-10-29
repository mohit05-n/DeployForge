import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import bcrypt from 'bcryptjs'

const connectionString =
  process.env.DATABASE_URL ||
  'postgresql://postgres:deployforge_dev@localhost:54332/deployforge?schema=public'

const pool = new Pool({ connectionString })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

async function main() {
  console.log('Seeding DeployForge database...')

  // Clear existing records to ensure clean state
  await prisma.webhookDelivery.deleteMany()
  await prisma.oAuthState.deleteMany()
  await prisma.gitHubAccount.deleteMany()
  await prisma.auditEvent.deleteMany()
  await prisma.deploymentLog.deleteMany()
  await prisma.deploymentStage.deleteMany()
  await prisma.deployment.deleteMany()
  await prisma.projectEnvVar.deleteMany()
  await prisma.project.deleteMany()
  await prisma.repositoryConnection.deleteMany()
  await prisma.integrationRecord.deleteMany()
  await prisma.user.deleteMany()

  const passwordHash = await bcrypt.hash('Password123!', 10)

  // 1. Create Users
  const alex = await prisma.user.create({
    data: {
      email: 'alex.morgan@deployforge.io',
      name: 'Alex Morgan',
      passwordHash,
      role: 'ADMIN',
    },
  })

  const devUser = await prisma.user.create({
    data: {
      email: 'dev@deployforge.io',
      name: 'Dev User',
      passwordHash,
      role: 'DEVELOPER',
    },
  })

  console.log('Created users: alex.morgan@deployforge.io and dev@deployforge.io')

  // 2. Create Repository Connections
  await prisma.repositoryConnection.createMany({
    data: [
      {
        userId: alex.id,
        provider: 'GITHUB',
        repoFullName: 'deployforge-demo/payment-service',
        repoUrl: 'https://github.com/deployforge-demo/payment-service',
        defaultBranch: 'main',
        status: 'CONNECTED',
        lastSyncAt: new Date(),
      },
      {
        userId: alex.id,
        provider: 'GITHUB',
        repoFullName: 'deployforge-demo/auth-service',
        repoUrl: 'https://github.com/deployforge-demo/auth-service',
        defaultBranch: 'main',
        status: 'CONNECTED',
        lastSyncAt: new Date(),
      },
      {
        userId: alex.id,
        provider: 'GITHUB',
        repoFullName: 'deployforge-demo/inventory-api',
        repoUrl: 'https://github.com/deployforge-demo/inventory-api',
        defaultBranch: 'main',
        status: 'CONNECTED',
        lastSyncAt: new Date(),
      },
      {
        userId: alex.id,
        provider: 'GITHUB',
        repoFullName: 'deployforge-demo/analytics-worker',
        repoUrl: 'https://github.com/deployforge-demo/analytics-worker',
        defaultBranch: 'main',
        status: 'CONNECTED',
        lastSyncAt: new Date(),
      },
    ],
  })

  // 3. Create Projects for Alex
  const p1 = await prisma.project.create({
    data: {
      userId: alex.id,
      name: 'Payment Service',
      slug: 'payment-service',
      description: 'Core payment processing microservice handling Stripe & PayPal webhooks',
      repository: 'deployforge-demo/payment-service',
      branch: 'main',
      runtime: 'NODEJS_20',
      buildCommand: 'npm run build',
      startCommand: 'npm run start',
      dockerfilePath: 'Dockerfile',
      port: 8080,
      environment: 'PRODUCTION',
      region: 'us-east-1',
      target: 'ECS_FARGATE',
      status: 'ACTIVE',
      healthStatus: 'HEALTHY',
      liveUrl: 'https://pay.deployforge.internal',
      envVars: {
        create: [
          { key: 'NODE_ENV', valueEncrypted: 'production', isSecret: false },
          { key: 'DATABASE_URL', valueEncrypted: process.env.PAYMENT_DATABASE_URL || 'postgresql://payment_dev_user:payment_dev_placeholder@localhost:5432/payment_dev', isSecret: true },
          { key: 'STRIPE_SECRET_KEY', valueEncrypted: process.env.STRIPE_SECRET_KEY || 'stripe_placeholder_local_dev_only', isSecret: true },
          { key: 'PAYPAL_CLIENT_ID', valueEncrypted: process.env.PAYPAL_CLIENT_ID || 'paypal_placeholder_client_id_dev_only', isSecret: true },
        ],
      },
    },
  })

  const p2 = await prisma.project.create({
    data: {
      userId: alex.id,
      name: 'Auth Service',
      slug: 'auth-service',
      description: 'OAuth2 and OpenID Connect identity provider for all internal services',
      repository: 'deployforge-demo/auth-service',
      branch: 'main',
      runtime: 'GO_122',
      buildCommand: 'go build -o auth-server main.go',
      startCommand: './auth-server',
      dockerfilePath: 'Dockerfile',
      port: 4000,
      environment: 'PRODUCTION',
      region: 'us-west-2',
      target: 'EKS',
      status: 'ACTIVE',
      healthStatus: 'DEGRADED',
      liveUrl: 'https://id.deployforge.internal',
      envVars: {
        create: [
          { key: 'PORT', valueEncrypted: '4000', isSecret: false },
          { key: 'JWT_SIGNING_KEY', valueEncrypted: process.env.AUTH_JWT_SIGNING_KEY || 'dev_placeholder_jwt_signing_key_not_real', isSecret: true },
          { key: 'REDIS_URL', valueEncrypted: process.env.AUTH_REDIS_URL || 'redis://localhost:6379', isSecret: true },
        ],
      },
    },
  })

  const p3 = await prisma.project.create({
    data: {
      userId: alex.id,
      name: 'Inventory API',
      slug: 'inventory-api',
      description: 'Catalog management and real-time stock balance tracking API',
      repository: 'deployforge-demo/inventory-api',
      branch: 'main',
      runtime: 'PYTHON_311',
      buildCommand: 'pip install -r requirements.txt',
      startCommand: 'uvicorn main:app --host 0.0.0.0 --port 8000',
      dockerfilePath: 'Dockerfile',
      port: 8000,
      environment: 'PRODUCTION',
      region: 'eu-west-1',
      target: 'APP_RUNNER',
      status: 'ACTIVE',
      healthStatus: 'HEALTHY',
      liveUrl: 'https://inventory.deployforge.internal',
      envVars: {
        create: [
          { key: 'PYTHONUNBUFFERED', valueEncrypted: '1', isSecret: false },
          { key: 'DATABASE_URL', valueEncrypted: process.env.INVENTORY_DATABASE_URL || 'postgresql://inventory_dev_user:inventory_dev_placeholder@localhost:5432/inventory_dev', isSecret: true },
        ],
      },
    },
  })

  const p4 = await prisma.project.create({
    data: {
      userId: alex.id,
      name: 'Analytics Worker',
      slug: 'analytics-worker',
      description: 'High-throughput Kafka stream processor for real-time telemetry events',
      repository: 'deployforge-demo/analytics-worker',
      branch: 'main',
      runtime: 'RUST_175',
      buildCommand: 'cargo build --release',
      startCommand: './target/release/worker',
      dockerfilePath: 'Dockerfile',
      port: 9090,
      environment: 'PRODUCTION',
      region: 'us-east-1',
      target: 'ECS_FARGATE',
      status: 'ACTIVE',
      healthStatus: 'HEALTHY',
      liveUrl: 'https://metrics.deployforge.internal',
    },
  })

  console.log('Created 4 projects with environment variables.')

  // 4. Create Deployments for Payment Service
  const dep1 = await prisma.deployment.create({
    data: {
      projectId: p1.id,
      commitSha: 'a8f3b2c',
      commitMessage: 'feat(webhook): add idempotency header check for stripe retries',
      branch: 'main',
      author: 'Alex Morgan',
      trigger: 'GIT_PUSH',
      status: 'SUCCESS',
      targetEnvironment: 'PRODUCTION',
      dockerImageTag: 'payment-service:v2.4.1',
      durationSeconds: 142,
      startedAt: new Date(Date.now() - 3600000),
      finishedAt: new Date(Date.now() - 3458000),
      stages: {
        create: [
          { name: 'CLONE', order: 1, status: 'SUCCESS', durationSeconds: 6, startedAt: new Date(Date.now() - 3600000), finishedAt: new Date(Date.now() - 3594000) },
          { name: 'LINT_TEST', order: 2, status: 'SUCCESS', durationSeconds: 24, startedAt: new Date(Date.now() - 3594000), finishedAt: new Date(Date.now() - 3570000) },
          { name: 'DOCKER_BUILD', order: 3, status: 'SUCCESS', durationSeconds: 45, startedAt: new Date(Date.now() - 3570000), finishedAt: new Date(Date.now() - 3525000) },
          { name: 'TRIVY_SCAN', order: 4, status: 'SUCCESS', durationSeconds: 18, startedAt: new Date(Date.now() - 3525000), finishedAt: new Date(Date.now() - 3507000) },
          { name: 'TERRAFORM_PLAN', order: 5, status: 'SUCCESS', durationSeconds: 14, startedAt: new Date(Date.now() - 3507000), finishedAt: new Date(Date.now() - 3493000) },
          { name: 'DEPLOY_AWS', order: 6, status: 'SUCCESS', durationSeconds: 28, startedAt: new Date(Date.now() - 3493000), finishedAt: new Date(Date.now() - 3465000) },
          { name: 'HEALTH_CHECK', order: 7, status: 'SUCCESS', durationSeconds: 7, startedAt: new Date(Date.now() - 3465000), finishedAt: new Date(Date.now() - 3458000) },
        ],
      },
      logs: {
        create: [
          { stageName: 'CLONE', level: 'INFO', message: 'Cloning repository deployforge-demo/payment-service at commit a8f3b2c...' },
          { stageName: 'CLONE', level: 'INFO', message: 'Checked out branch main successfully.' },
          { stageName: 'LINT_TEST', level: 'INFO', message: 'Running test suite: 42 passed, 0 failed.' },
          { stageName: 'DOCKER_BUILD', level: 'INFO', message: 'Building image tag payment-service:v2.4.1 using multi-stage Dockerfile...' },
          { stageName: 'DOCKER_BUILD', level: 'INFO', message: 'Docker image built and pushed to ECR: size 142MB.' },
          { stageName: 'TRIVY_SCAN', level: 'INFO', message: 'Trivy security scan complete: 0 Critical, 0 High vulnerabilities found.' },
          { stageName: 'TERRAFORM_PLAN', level: 'INFO', message: 'Terraform plan evaluated: 0 to add, 1 to change (task definition revision), 0 to destroy.' },
          { stageName: 'DEPLOY_AWS', level: 'INFO', message: 'Updating ECS service payment-service in cluster production-core...' },
          { stageName: 'DEPLOY_AWS', level: 'INFO', message: 'New tasks registered, drained existing tasks safely.' },
          { stageName: 'HEALTH_CHECK', level: 'INFO', message: 'HTTP GET https://pay.deployforge.internal/health returned 200 OK in 14ms.' },
        ],
      },
    },
  })

  // Create a deployment for Auth Service
  await prisma.deployment.create({
    data: {
      projectId: p2.id,
      commitSha: '9e1c4d2',
      commitMessage: 'fix(jwks): cache JWKS public keys in Redis for 10 minutes',
      branch: 'main',
      author: 'Alex Morgan',
      trigger: 'MANUAL',
      status: 'SUCCESS',
      targetEnvironment: 'PRODUCTION',
      dockerImageTag: 'auth-service:v1.12.0',
      durationSeconds: 110,
      startedAt: new Date(Date.now() - 7200000),
      finishedAt: new Date(Date.now() - 7090000),
      stages: {
        create: [
          { name: 'CLONE', order: 1, status: 'SUCCESS', durationSeconds: 5 },
          { name: 'LINT_TEST', order: 2, status: 'SUCCESS', durationSeconds: 20 },
          { name: 'DOCKER_BUILD', order: 3, status: 'SUCCESS', durationSeconds: 38 },
          { name: 'TRIVY_SCAN', order: 4, status: 'SUCCESS', durationSeconds: 15 },
          { name: 'DEPLOY_AWS', order: 5, status: 'SUCCESS', durationSeconds: 25 },
          { name: 'HEALTH_CHECK', order: 6, status: 'SUCCESS', durationSeconds: 7 },
        ],
      },
    },
  })

  console.log('Created deployments and stages.')

  // 5. Create Integration Records (Preserving explicit mock/disabled contract)
  await prisma.integrationRecord.createMany({
    data: [
      {
        userId: alex.id,
        type: 'GITHUB',
        name: 'GitHub App Connection',
        status: 'DISCONNECTED',
        configJson: JSON.stringify({
          configured: false,
          mode: 'oauth_required',
        }),
        lastSyncAt: null,
      },
      {
        userId: alex.id,
        type: 'AWS',
        name: 'AWS Cloud Account',
        status: 'CONNECTED',
        configJson: JSON.stringify({
          accountIdMasked: '1234****9012',
          roleArn: 'arn:aws:iam::123456789012:role/DeployForgeExecutionRole',
          region: 'us-east-1',
          mode: 'mock_sandbox',
        }),
        lastSyncAt: new Date(),
      },
      {
        userId: alex.id,
        type: 'JENKINS',
        name: 'Jenkins CI Master',
        status: 'DISCONNECTED',
        configJson: JSON.stringify({
          configured: false,
          serverUrl: 'https://jenkins.internal.disabled',
          mode: 'disabled_standby',
        }),
        lastSyncAt: null,
      },
      {
        userId: alex.id,
        type: 'TRIVY',
        name: 'Trivy Container Security Scanner',
        status: 'CONNECTED',
        configJson: JSON.stringify({
          dbVersion: '2026.10-v2',
          severityLevels: ['CRITICAL', 'HIGH'],
          mode: 'mock_scanner',
        }),
        lastSyncAt: new Date(),
      },
      {
        userId: alex.id,
        type: 'TERRAFORM',
        name: 'HashiCorp Terraform IaC',
        status: 'CONNECTED',
        configJson: JSON.stringify({
          version: '1.9.4',
          stateBackend: 's3-remote-state-mock',
          mode: 'plan_only_no_exec',
        }),
        lastSyncAt: new Date(),
      },
      {
        userId: alex.id,
        type: 'DOCKER',
        name: 'Docker Engine & ECR',
        status: 'CONNECTED',
        configJson: JSON.stringify({
          engineVersion: '29.8.1-mock',
          registry: '123456789012.dkr.ecr.us-east-1.amazonaws.com',
          mode: 'simulated_builder',
        }),
        lastSyncAt: new Date(),
      },
    ],
  })

  console.log('Created integration records with explicit mock/status contract.')

  // 6. Create Audit Events
  await prisma.auditEvent.createMany({
    data: [
      {
        userId: alex.id,
        action: 'USER_REGISTER',
        resourceType: 'user',
        resourceId: alex.id,
        details: JSON.stringify({ email: alex.email, role: 'ADMIN' }),
        ipAddress: '127.0.0.1',
        userAgent: 'DeployForge/1.0 Initial Setup Seed',
      },
      {
        userId: alex.id,
        action: 'PROJECT_CREATE',
        projectId: p1.id,
        resourceType: 'project',
        resourceId: p1.id,
        details: JSON.stringify({ name: p1.name, runtime: p1.runtime, target: p1.target }),
        ipAddress: '127.0.0.1',
        userAgent: 'DeployForge/1.0 Web Console',
      },
      {
        userId: alex.id,
        action: 'DEPLOYMENT_TRIGGER',
        projectId: p1.id,
        resourceType: 'deployment',
        resourceId: dep1.id,
        details: JSON.stringify({ commitSha: dep1.commitSha, target: dep1.targetEnvironment }),
        ipAddress: '127.0.0.1',
        userAgent: 'DeployForge/1.0 CI/CD Engine',
      },
    ],
  })

  console.log('Created audit events.')
  console.log('Seed completed successfully!')
}

main()
  .catch((e) => {
    console.error('Seed error:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
    await pool.end()
  })
