import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/server/auth'
import { successResponse, errorResponse } from '@/lib/server/response'
import { checkRateLimit, getClientIp } from '@/lib/server/rate-limiter'
import { logAuditEvent } from '@/lib/server/audit'
import { logger } from '@/lib/server/logger'
import { validateGitHubRepoUrl, validateBranchName } from '@/lib/server/validation'

const CreateProjectSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(60),
  description: z.string().max(255).optional(),
  repository: z.string().min(3, 'Repository is required'),
  branch: z.string().min(1).default('main'),
  runtime: z.enum(['NODEJS_20', 'PYTHON_311', 'GO_122', 'RUST_175', 'DOCKERFILE']).default('NODEJS_20'),
  buildCommand: z.string().default('npm run build'),
  startCommand: z.string().default('npm start'),
  dockerfilePath: z.string().optional().default('Dockerfile'),
  port: z.number().int().min(1).max(65535).default(3000),
  environment: z.enum(['PRODUCTION', 'STAGING', 'PREVIEW']).default('PRODUCTION'),
  region: z.string().default('us-east-1'),
  target: z.enum(['ECS_FARGATE', 'EKS', 'APP_RUNNER']).default('ECS_FARGATE'),
  envVars: z
    .array(
      z.object({
        key: z.string().min(1, 'Key is required').regex(/^[A-Z0-9_]+$/, 'Key must be uppercase alphanumeric and underscores'),
        value: z.string().default(''),
        isSecret: z.boolean().default(true),
      })
    )
    .optional(),
})

export async function GET(req: Request) {
  const auth = await requireAuth(req)
  if ('response' in auth) {
    return auth.response
  }

  const { searchParams } = new URL(req.url)
  const search = searchParams.get('search')?.toLowerCase() || ''
  const status = searchParams.get('status') || ''

  try {
    const projects = await prisma.project.findMany({
      where: {
        userId: auth.user.id,
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: 'insensitive' } },
                { repository: { contains: search, mode: 'insensitive' } },
                { description: { contains: search, mode: 'insensitive' } },
              ],
            }
          : {}),
        ...(status ? { status } : {}),
      },
      include: {
        deployments: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            id: true,
            status: true,
            commitSha: true,
            commitMessage: true,
            branch: true,
            createdAt: true,
          },
        },
        _count: {
          select: { deployments: true, envVars: true },
        },
      },
      orderBy: { updatedAt: 'desc' },
    })

    return successResponse(projects)
  } catch (err) {
    logger.error('Projects', 'Failed to list projects', err, { userId: auth.user.id })
    return errorResponse('Failed to retrieve projects.', 500, 'DATABASE_ERROR')
  }
}

export async function POST(req: Request) {
  const ip = getClientIp(req)
  const rateLimit = checkRateLimit(`project-create:${ip}`, 30, 60000)
  if (!rateLimit.success) {
    return errorResponse('Too many requests. Please try again later.', 429, 'RATE_LIMITED', undefined, rateLimit)
  }

  const auth = await requireAuth(req)
  if ('response' in auth) {
    return auth.response
  }

  try {
    const body = await req.json()
    const parsed = CreateProjectSchema.safeParse(body)
    if (!parsed.success) {
      return errorResponse(
        parsed.error.errors[0]?.message || 'Invalid project data',
        400,
        'VALIDATION_ERROR',
        parsed.error.format()
      )
    }

    const data = parsed.data

    // Validate repository URL security and format
    const repoValidation = validateGitHubRepoUrl(data.repository)
    if (!repoValidation.valid) {
      return errorResponse(repoValidation.error || 'Invalid repository URL', 400, 'INVALID_REPOSITORY')
    }

    // Validate branch name
    const branchValidation = validateBranchName(data.branch)
    if (!branchValidation.valid) {
      return errorResponse(branchValidation.error || 'Invalid branch name', 400, 'INVALID_BRANCH')
    }

    const slug = data.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')

    // Check slug collision for this user
    const existing = await prisma.project.findUnique({
      where: {
        userId_slug: {
          userId: auth.user.id,
          slug,
        },
      },
    })

    if (existing) {
      return errorResponse(
        `A project with the name or slug "${data.name}" already exists.`,
        409,
        'SLUG_EXISTS'
      )
    }

    const project = await prisma.project.create({
      data: {
        userId: auth.user.id,
        name: data.name,
        slug,
        description: data.description,
        repository: repoValidation.fullName || data.repository,
        repoOwner: repoValidation.owner,
        repoName: repoValidation.repo,
        branch: data.branch,
        runtime: data.runtime,
        buildCommand: data.buildCommand,
        startCommand: data.startCommand,
        dockerfilePath: data.dockerfilePath,
        port: data.port,
        environment: data.environment,
        region: data.region,
        target: data.target,
        status: 'ACTIVE',
        healthStatus: 'HEALTHY',
        liveUrl: `https://${slug}.deployforge.internal`,
        envVars: data.envVars?.length
          ? {
              create: data.envVars.map((v) => ({
                key: v.key,
                valueEncrypted: v.value, // stored server-side
                isSecret: v.isSecret,
              })),
            }
          : undefined,
      },
      include: {
        envVars: {
          select: {
            id: true,
            key: true,
            isSecret: true,
            createdAt: true,
            // value is masked for secrets
          },
        },
      },
    })

    await logAuditEvent({
      userId: auth.user.id,
      projectId: project.id,
      action: 'PROJECT_CREATE',
      resourceType: 'project',
      resourceId: project.id,
      details: { name: project.name, runtime: project.runtime, target: project.target },
      req,
    })

    logger.info('Projects', `Project created: ${project.name} (${project.id})`, {
      userId: auth.user.id,
      projectId: project.id,
    })

    return successResponse(project, 201, 'Project created successfully')
  } catch (err) {
    logger.error('Projects', 'Failed to create project', err, { userId: auth.user.id })
    return errorResponse('Failed to create project.', 500, 'INTERNAL_ERROR')
  }
}
