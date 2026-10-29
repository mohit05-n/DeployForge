/**
 * DeployForge Immutable Docker Image Tag Generator
 *
 * Requirements:
 * - Unique, immutable image tags tied to deployment ID and commit SHA
 * - Complies with Docker image naming and tagging specification (RFC 1123 / OCI tag spec)
 * - Lowercase alphanumeric characters, hyphens, periods, and underscores only
 */

export function sanitizeSlug(slug: string): string {
  return slug
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'app'
}

/**
 * Generates an immutable, unique image tag tied to the deployment ID and commit SHA.
 *
 * Example: deployforge/api-gateway:a3f912c-cmvt1w8wm
 */
export function generateImageTag(
  projectSlug: string,
  commitSha: string,
  deploymentId: string,
  registryPrefix?: string
): string {
  const cleanSlug = sanitizeSlug(projectSlug)
  const shortSha = commitSha.slice(0, 7).toLowerCase()
  const cleanDeploymentId = deploymentId.slice(-10).toLowerCase().replace(/[^a-z0-9]/g, '')
  const repoName = registryPrefix ? `${registryPrefix.replace(/\/$/, '')}/${cleanSlug}` : `deployforge/${cleanSlug}`
  const tagVersion = `${shortSha}-${cleanDeploymentId}`

  return `${repoName}:${tagVersion}`
}

/**
 * Validates whether an image tag string satisfies Docker / OCI tag standards.
 */
export function validateImageTag(tag: string): { valid: boolean; error?: string } {
  if (!tag || tag.trim().length === 0) {
    return { valid: false, error: 'Image tag cannot be empty.' }
  }

  if (tag.length > 256) {
    return { valid: false, error: 'Image tag exceeds maximum length of 256 characters.' }
  }

  // Docker tag must have repository:tag format
  const parts = tag.split(':')
  if (parts.length !== 2) {
    return { valid: false, error: 'Image tag must be in [registry/]repository:tag format.' }
  }

  const [repo, tagPart] = parts

  // Validate repository name (lowercase letters, digits, separators: '.', '_', '-', '/')
  const repoRegex = /^[a-z0-9]+(?:[._\/-][a-z0-9]+)*$/
  if (!repoRegex.test(repo)) {
    return { valid: false, error: 'Repository name contains invalid characters or consecutive separators.' }
  }

  // Validate tag portion (max 128 characters, valid chars: [a-zA-Z0-9_.-])
  const tagRegex = /^[a-zA-Z0-9_.-]{1,128}$/
  if (!tagRegex.test(tagPart)) {
    return { valid: false, error: 'Tag version contains invalid characters or exceeds 128 characters.' }
  }

  // Must not be mutable tag "latest"
  if (tagPart.toLowerCase() === 'latest') {
    return { valid: false, error: 'Mutable tag "latest" is forbidden; tags must be immutable and tied to a deployment.' }
  }

  return { valid: true }
}
