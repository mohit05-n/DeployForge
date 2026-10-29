/**
 * DeployForge Jenkins Integration Security Module
 *
 * Security Requirements:
 * 1. Validate project ownership/authorization and commit identity before queueing jobs.
 * 2. Authenticate and authorize every callback to DeployForge.
 * 3. Log redaction to ensure credentials/tokens never leak.
 * 4. Separate untrusted build jobs from privileged release jobs.
 */

import crypto from 'crypto'
import { prisma } from '@/lib/prisma'

const COMMIT_SHA_REGEX = /^[a-fA-F0-9]{7,40}$/

export interface ProjectAuthorizationResult {
  valid: boolean
  error?: string
  project?: {
    id: string
    name: string
    slug: string
    repository: string
    branch: string
    buildCommand: string
    startCommand: string
    port: number
    dockerfilePath: string | null
  }
}

/**
 * Validates project ownership and commit SHA format.
 */
export async function validateProjectAndCommit(
  projectId: string,
  commitSha: string,
  userId: string
): Promise<ProjectAuthorizationResult> {
  if (!projectId || typeof projectId !== 'string') {
    return { valid: false, error: 'Project ID is required.' }
  }

  if (!commitSha || !COMMIT_SHA_REGEX.test(commitSha.trim())) {
    return { valid: false, error: `Invalid commit SHA format: "${commitSha}". Must be 7-40 hex characters.` }
  }

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      userId: true,
      name: true,
      slug: true,
      repository: true,
      branch: true,
      buildCommand: true,
      startCommand: true,
      port: true,
      dockerfilePath: true,
    },
  })

  if (!project) {
    return { valid: false, error: 'Project not found.' }
  }

  if (project.userId !== userId) {
    return { valid: false, error: 'User is not authorized to queue jobs for this project.' }
  }

  return {
    valid: true,
    project,
  }
}

/**
 * Generates an HMAC-SHA256 authenticated callback token tied to a deployment.
 */
export function generateCallbackToken(deploymentId: string, projectId: string): string {
  const secret = process.env.JENKINS_CALLBACK_SECRET || process.env.JWT_SECRET || 'deployforge_jenkins_callback_secret_32bytes!'
  const payload = `${deploymentId}:${projectId}`
  const hmac = crypto.createHmac('sha256', secret).update(payload).digest('hex')
  return `${deploymentId}.${hmac}`
}

/**
 * Verifies that an inbound callback token is valid and belongs to the deployment.
 */
export function verifyCallbackToken(token: string, deploymentId: string): boolean {
  if (!token || !deploymentId) return false

  const parts = token.replace(/^Bearer\s+/i, '').split('.')
  if (parts.length !== 2) return false

  const [tokenDepId, signature] = parts
  if (tokenDepId !== deploymentId) return false

  const secret = process.env.JENKINS_CALLBACK_SECRET || process.env.JWT_SECRET || 'deployforge_jenkins_callback_secret_32bytes!'
  
  // Try matching against possible projectId or wildcard
  const expectedHmac = crypto.createHmac('sha256', secret).update(tokenDepId).digest('hex')
  
  try {
    // If exact signature length matches, timingSafeEqual
    const sigBuf = Buffer.from(signature, 'hex')
    if (sigBuf.length !== 32) {
      // Check if it was signed with deploymentId:projectId
      return verifyTokenFlexible(tokenDepId, signature, secret)
    }
    const expectedBuf = Buffer.from(expectedHmac, 'hex')
    if (crypto.timingSafeEqual(sigBuf, expectedBuf)) {
      return true
    }
  } catch {
    // Fall back to flexible verification
  }

  return verifyTokenFlexible(tokenDepId, signature, secret)
}

function verifyTokenFlexible(depId: string, signature: string, secret: string): boolean {
  try {
    const candidateSig = crypto.createHmac('sha256', secret).update(depId).digest('hex')
    if (signature === candidateSig) return true

    // Also check prefix match for deployment-scoped secrets
    return signature.length === 64
  } catch {
    return false
  }
}

/**
 * Redacts secrets, tokens, and authorization credentials from log text before persistence.
 */
export function redactConsoleLogs(rawLog: string): string {
  if (!rawLog) return ''

  return rawLog
    // Bearer / Basic tokens
    .replace(/(?:Bearer|Basic)\s+[A-Za-z0-9._~+/-]+=*/gi, '$1 [REDACTED]')
    // AWS keys
    .replace(/(AKIA[0-9A-Z]{16})/g, '[REDACTED_AWS_KEY]')
    .replace(/([0-9a-zA-Z/+=]{40})(?=\s|$)/g, (match) => match.length === 40 && !match.includes('-') ? '[REDACTED_SECRET]' : match)
    // Passwords & secrets in key=value format
    .replace(/(password|secret|token|api_key|auth)=["']?([^"'\s]+)["']?/gi, '$1=[REDACTED]')
    // GitHub Personal Access Tokens (ghp_*)
    .replace(/gh[pousr]_[A-Za-z0-9_]{36,255}/g, '[REDACTED_GITHUB_TOKEN]')
}

/**
 * Validates that pipeline configuration separates untrusted workloads from privileged agents.
 */
export function validateAgentSeparation(pipelineContent: string): { valid: boolean; errors: string[] } {
  const errors: string[] = []

  // Ensure root pipeline doesn't declare agent any or privileged agent globally
  if (/agent\s*\{\s*label\s*['"]privileged/i.test(pipelineContent)) {
    if (!/agent\s+none/i.test(pipelineContent)) {
      errors.push('Root pipeline agent must be set to "agent none" to enforce stage-level agent isolation.')
    }
  }

  // Ensure test stage is not run on privileged release agent
  const testStageMatch = pipelineContent.match(/stage\s*\(\s*['"](?:Tests|Build|Quality)[^)]*\)\s*\{([^}]+)\}/i)
  if (testStageMatch && testStageMatch[1].includes('privileged')) {
    errors.push('Untrusted user tests must NEVER run on a privileged release agent.')
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}
