-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'DEVELOPER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "repository" TEXT NOT NULL,
    "branch" TEXT NOT NULL DEFAULT 'main',
    "runtime" TEXT NOT NULL DEFAULT 'NODEJS_20',
    "buildCommand" TEXT NOT NULL DEFAULT 'npm run build',
    "startCommand" TEXT NOT NULL DEFAULT 'npm start',
    "dockerfilePath" TEXT DEFAULT 'Dockerfile',
    "port" INTEGER NOT NULL DEFAULT 3000,
    "environment" TEXT NOT NULL DEFAULT 'PRODUCTION',
    "region" TEXT NOT NULL DEFAULT 'us-east-1',
    "target" TEXT NOT NULL DEFAULT 'ECS_FARGATE',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "healthStatus" TEXT NOT NULL DEFAULT 'HEALTHY',
    "liveUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_env_vars" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "valueEncrypted" TEXT NOT NULL,
    "isSecret" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_env_vars_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "repository_connections" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'GITHUB',
    "repoFullName" TEXT NOT NULL,
    "repoUrl" TEXT NOT NULL,
    "defaultBranch" TEXT NOT NULL DEFAULT 'main',
    "status" TEXT NOT NULL DEFAULT 'CONNECTED',
    "lastSyncAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "repository_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deployments" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "commitSha" TEXT NOT NULL,
    "commitMessage" TEXT NOT NULL,
    "branch" TEXT NOT NULL,
    "author" TEXT NOT NULL,
    "trigger" TEXT NOT NULL DEFAULT 'MANUAL',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "targetEnvironment" TEXT NOT NULL DEFAULT 'PRODUCTION',
    "dockerImageTag" TEXT,
    "durationSeconds" INTEGER,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "deployments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deployment_stages" (
    "id" TEXT NOT NULL,
    "deploymentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "durationSeconds" INTEGER,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "errorMessage" TEXT,

    CONSTRAINT "deployment_stages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deployment_logs" (
    "id" TEXT NOT NULL,
    "deploymentId" TEXT NOT NULL,
    "stageName" TEXT,
    "level" TEXT NOT NULL DEFAULT 'INFO',
    "message" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deployment_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integration_records" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DISCONNECTED',
    "configJson" TEXT,
    "lastSyncAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "integration_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_events" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "projectId" TEXT,
    "action" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT,
    "details" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "projects_userId_slug_key" ON "projects"("userId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "project_env_vars_projectId_key_key" ON "project_env_vars"("projectId", "key");

-- CreateIndex
CREATE INDEX "deployments_projectId_createdAt_idx" ON "deployments"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "deployment_stages_deploymentId_order_idx" ON "deployment_stages"("deploymentId", "order");

-- CreateIndex
CREATE INDEX "deployment_logs_deploymentId_timestamp_idx" ON "deployment_logs"("deploymentId", "timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "integration_records_userId_type_key" ON "integration_records"("userId", "type");

-- CreateIndex
CREATE INDEX "audit_events_userId_createdAt_idx" ON "audit_events"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_events_projectId_createdAt_idx" ON "audit_events"("projectId", "createdAt");

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_env_vars" ADD CONSTRAINT "project_env_vars_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repository_connections" ADD CONSTRAINT "repository_connections_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deployments" ADD CONSTRAINT "deployments_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deployment_stages" ADD CONSTRAINT "deployment_stages_deploymentId_fkey" FOREIGN KEY ("deploymentId") REFERENCES "deployments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deployment_logs" ADD CONSTRAINT "deployment_logs_deploymentId_fkey" FOREIGN KEY ("deploymentId") REFERENCES "deployments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_records" ADD CONSTRAINT "integration_records_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
