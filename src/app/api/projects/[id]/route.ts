import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/server/auth'
import { verifyProjectAccess } from '@/lib/server/project-auth'
import { successResponse, errorResponse } from '@/lib/server/response'
import { logAuditEvent } from '@/lib/server/audit'
import { logger } from '@/lib/server/logger'
import { validateGitHubRepoUrl, validateBranchName } from '@/lib/server/validation'

const UpdateProjectSchema = z.object({
  name: z.string().min(2).max(60).optional(),
  description: z.string().max(255).optional(),
  repository: z.string().min(1).optional(),
  branch: z.string().min(1).optional(),
  runtime: z.enum(['NODEJS_20', 'PYTHON_311', 'GO_122', 'RUST_175', 'DOCKERFILE']).optional(),
  buildCommand: z.string().optional(),
  startCommand: z.string().optional(),
  dockerfilePath: z.string().optional(),
  port: z.number().int().min(1).max(65535).optional(),
  environment: z.enum(['PRODUCTION', 'STAGING', 'PREVIEW']).optional(),
  region: z.string().optional(),
  target: z.enum(['ECS_FARGATE', 'EKS', 'APP_RUNNER']).optional(),
  status: z.enum(['ACTIVE', 'BUILDING', 'DEPLOYING', 'FAILED', 'PAUSED']).optional(),
  healthStatus: z.enum(['HEALTHY', 'DEGRADED', 'UNHEALTHY', 'UNKNOWN']).optional(),
  liveUrl: z.string().url().optional().nullable(),
  envVars: z
    .array(
      z.object({
        key: z.string().min(1),
        value: z.string().default(''),
        isSecret: z.boolean().default(true),
      })
    )
    .optional(),
})

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(req)
  if ('response' in auth) {
    return auth.response
  }

  const { id } = await params
  const { project, error } = await verifyProjectAccess(id, auth.user.id, {
    envVars: true,
    deployments: true,
  })

  if (error || !project) {
    return error || errorResponse('Project not found.', 404, 'NOT_FOUND')
  }

  // Mask secrets in response
  const sanitizedEnvVars = project.envVars.map((v) => ({
    id: v.id,
    key: v.key,
    value: v.isSecret ? '••••••••••••••••' : v.valueEncrypted,
    isSecret: v.isSecret,
    createdAt: v.createdAt,
  }))

  return successResponse({
    ...project,
    envVars: sanitizedEnvVars,
  })
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(req)
  if ('response' in auth) {
    return auth.response
  }

  const { id } = await params
  const { project, error } = await verifyProjectAccess(id, auth.user.id)
  if (error || !project) {
    return error || errorResponse('Project not found.', 404, 'NOT_FOUND')
  }

  try {
    const body = await req.json()
    const parsed = UpdateProjectSchema.safeParse(body)
    if (!parsed.success) {
      return errorResponse(
        parsed.error.errors[0]?.message || 'Invalid update data',
        400,
        'VALIDATION_ERROR',
        parsed.error.format()
      )
    }

    const { envVars, repository, branch, ...restUpdate } = parsed.data
    const updateData: Record<string, unknown> = { ...restUpdate }

    if (repository !== undefined) {
      const repoVal = validateGitHubRepoUrl(repository)
      if (!repoVal.valid) {
        return errorResponse(repoVal.error || 'Invalid repository URL', 400, 'INVALID_REPOSITORY')
      }
      updateData.repository = repoVal.fullName || repository
      updateData.repoOwner = repoVal.owner
      updateData.repoName = repoVal.repo
    }

    if (branch !== undefined) {
      const branchVal = validateBranchName(branch)
      if (!branchVal.valid) {
        return errorResponse(branchVal.error || 'Invalid branch name', 400, 'INVALID_BRANCH')
      }
      updateData.branch = branch
    }

    // If envVars are supplied, update them transactionally
    const updated = await prisma.$transaction(async (tx) => {
      if (envVars) {
        // Delete removed keys
        await tx.projectEnvVar.deleteMany({
          where: { projectId: id },
        })

        // Re-insert env vars
        if (envVars.length > 0) {
          await tx.projectEnvVar.createMany({
            data: envVars.map((v) => ({
              projectId: id,
              key: v.key,
              valueEncrypted: v.value,
              isSecret: v.isSecret,
            })),
          })
        }
      }

      return tx.project.update({
        where: { id },
        data: updateData,
        include: {
          envVars: {
            select: { id: true, key: true, isSecret: true, createdAt: true },
          },
        },
      })
    })

    await logAuditEvent({
      userId: auth.user.id,
      projectId: id,
      action: 'PROJECT_UPDATE',
      resourceType: 'project',
      resourceId: id,
      details: { updatedFields: Object.keys(updateData) },
      req,
    })

    logger.info('Projects', `Project updated: ${project.name} (${id})`, {
      userId: auth.user.id,
      projectId: id,
    })

    return successResponse(updated, 200, 'Project updated successfully')
  } catch (err) {
    logger.error('Projects', 'Failed to update project', err, { userId: auth.user.id, projectId: id })
    return errorResponse('Failed to update project.', 500, 'INTERNAL_ERROR')
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(req)
  if ('response' in auth) {
    return auth.response
  }

  const { id } = await params
  const { project, error } = await verifyProjectAccess(id, auth.user.id)
  if (error || !project) {
    return error || errorResponse('Project not found.', 404, 'NOT_FOUND')
  }

  try {
    await prisma.project.delete({
      where: { id },
    })

    await logAuditEvent({
      userId: auth.user.id,
      action: 'PROJECT_DELETE',
      resourceType: 'project',
      resourceId: id,
      details: { name: project.name, slug: project.slug },
      req,
    })

    logger.info('Projects', `Project deleted: ${project.name} (${id})`, {
      userId: auth.user.id,
      projectId: id,
    })

    return successResponse({ deletedId: id }, 200, 'Project deleted successfully')
  } catch (err) {
    logger.error('Projects', 'Failed to delete project', err, { userId: auth.user.id, projectId: id })
    return errorResponse('Failed to delete project.', 500, 'INTERNAL_ERROR')
  }
}
