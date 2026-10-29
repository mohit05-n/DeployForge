export interface RepoValidationResult {
  valid: boolean
  owner?: string
  repo?: string
  fullName?: string
  canonicalUrl?: string
  error?: string
}

/**
 * Validates a GitHub repository URL against security risks:
 * - Rejects non-HTTPS schemes
 * - Rejects non-github.com hosts (SSRF, external redirects)
 * - Rejects URLs containing credentials (user:pass@)
 * - Rejects non-standard ports
 * - Rejects path traversal and control characters
 * - Validates GitHub owner and repository naming constraints
 */
export function validateGitHubRepoUrl(rawUrl: string): RepoValidationResult {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return { valid: false, error: 'Repository URL is required.' }
  }

  let trimmed = rawUrl.trim()

  // Pre-check for control characters, null bytes, and traversal
  if (/[\x00-\x1F\x7F]|\.\./.test(trimmed)) {
    return { valid: false, error: 'Repository URL contains unsafe characters or directory traversal sequences.' }
  }

  // If provided as owner/repo shorthand (no scheme), prepend https://github.com/
  if (!trimmed.includes('://')) {
    trimmed = `https://github.com/${trimmed}`
  }

  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch (_) {
    return { valid: false, error: 'Malformed repository URL. Please provide a valid HTTPS URL.' }
  }

  // 1. Strict Protocol Check
  if (parsed.protocol !== 'https:') {
    return {
      valid: false,
      error: `Unsupported protocol "${parsed.protocol}". Only secure "https://" GitHub URLs are accepted.`,
    }
  }

  // 2. Strict Host Check (case-insensitive, no subdomains like raw.github.com or attacker.github.com)
  const hostname = parsed.hostname.toLowerCase()
  if (hostname !== 'github.com') {
    return {
      valid: false,
      error: `Unsupported host "${hostname}". Only repositories hosted on "github.com" are supported.`,
    }
  }

  // 3. Reject Credentials in URL
  if (parsed.username || parsed.password) {
    return { valid: false, error: 'Repository URLs containing embedded user credentials are not permitted.' }
  }

  // 4. Reject Non-standard Ports
  if (parsed.port && parsed.port !== '443') {
    return { valid: false, error: 'Non-standard port numbers are not allowed in repository URLs.' }
  }

  // 5. Parse and Validate Owner / Repo Path
  // Path format: /<owner>/<repo> or /<owner>/<repo>.git
  let path = parsed.pathname.replace(/^\/+|\/+$/g, '')
  if (path.endsWith('.git')) {
    path = path.slice(0, -4)
  }

  const segments = path.split('/')
  if (segments.length !== 2) {
    return {
      valid: false,
      error: 'Invalid GitHub repository path. Expected format: https://github.com/owner/repository',
    }
  }

  const [owner, repo] = segments

  // GitHub username/org regex: 1-39 alphanumeric or single hyphens, cannot start or end with hyphen
  const GITHUB_OWNER_REGEX = /^[a-zA-Z0-9](?:[a-zA-Z0-9]|-(?=[a-zA-Z0-9])){0,38}$/
  // GitHub repo regex: 1-100 alphanumeric, hyphen, underscore, period
  const GITHUB_REPO_REGEX = /^[a-zA-Z0-9_.-]{1,100}$/

  if (!GITHUB_OWNER_REGEX.test(owner)) {
    return { valid: false, error: `Invalid GitHub owner or organization name: "${owner}".` }
  }

  if (!GITHUB_REPO_REGEX.test(repo)) {
    return { valid: false, error: `Invalid GitHub repository name: "${repo}".` }
  }

  const fullName = `${owner}/${repo}`
  const canonicalUrl = `https://github.com/${fullName}`

  return {
    valid: true,
    owner,
    repo,
    fullName,
    canonicalUrl,
  }
}

/**
 * Validates a Git branch name according to git-check-ref-format rules
 */
export function validateBranchName(branch: string): { valid: boolean; error?: string } {
  if (!branch || typeof branch !== 'string') {
    return { valid: false, error: 'Branch name is required.' }
  }

  const trimmed = branch.trim()

  if (trimmed.length > 255) {
    return { valid: false, error: 'Branch name exceeds maximum length of 255 characters.' }
  }

  // Git ref naming constraints
  // Cannot have: .. | control chars | ? * [ \ ^ ~ : space | cannot start/end with / | cannot end with .lock
  if (
    trimmed.includes('..') ||
    /[\s\x00-\x1F\x7F~^:?*\[\\]/.test(trimmed) ||
    trimmed.startsWith('/') ||
    trimmed.endsWith('/') ||
    trimmed.endsWith('.lock') ||
    trimmed.includes('@{')
  ) {
    return { valid: false, error: `Invalid Git branch name "${trimmed}". Branch names cannot contain spaces or special characters.` }
  }

  return { valid: true }
}
