import { prisma } from '@/lib/prisma'
import { errorResponse } from './response'

export async function verifyProjectAccess(
  projectId: string,
  userId: string,
  includeRelations?: { envVars?: boolean; deployments?: boolean }
) {
  const project = await prisma.project.findFirst({
    where: {
      id: projectId,
      userId: userId, // Strict tenant / user ownership boundary
    },
    include: {
      envVars: includeRelations?.envVars ?? false,
      deployments: includeRelations?.deployments
        ? {
            orderBy: { createdAt: 'desc' },
            take: 10,
            include: { stages: true },
          }
        : false,
    },
  })

  if (!project) {
    return {
      project: null,
      error: errorResponse('Project not found or you do not have permission to access it.', 404, 'PROJECT_NOT_FOUND'),
    }
  }

  return { project, error: null }
}
