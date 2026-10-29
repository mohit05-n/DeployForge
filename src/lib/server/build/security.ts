/**
 * DeployForge Build Worker Security Policy Enforcer
 *
 * Requirements:
 * 1. Never mount the host Docker socket into an untrusted workload.
 * 2. Do not pass secrets into Docker build arguments or include them in image layers.
 * 3. Enforce CPU, memory, time, disk, network, and process bounds.
 */

import { BuildWorkerLimits, DEFAULT_BUILD_LIMITS, HARD_MAX_LIMITS } from './types'

const FORBIDDEN_SOCKET_PATTERNS = [
  /\/var\/run\/docker\.sock/i,
  /\/run\/docker\.sock/i,
  /docker\.sock/i,
  /docker_engine/i,
  /containerd\.sock/i,
  /\/var\/run\/containerd/i,
  /\/run\/containerd/i,
]

const SECRET_KEY_PATTERNS = [
  /secret/i,
  /password/i,
  /token/i,
  /private[_-]?key/i,
  /auth/i,
  /credential/i,
  /api[_-]?key/i,
  /jwt/i,
  /database[_-]?url/i,
  /postgres/i,
  /aws[_-]?(secret|access)/i,
  /github[_-]?(token|secret)/i,
]

export interface SecurityValidationResult {
  valid: boolean
  violations: string[]
}

/**
 * Validates volume mounts against host Docker socket mounts or sensitive system paths.
 */
export function validateMountSecurity(mounts: string[]): SecurityValidationResult {
  const violations: string[] = []

  for (const mount of mounts) {
    for (const pattern of FORBIDDEN_SOCKET_PATTERNS) {
      if (pattern.test(mount)) {
        violations.push(`Forbidden socket mount detected: "${mount}". Untrusted workloads must NEVER access host Docker/containerd sockets.`)
      }
    }

    // Disallow mounting host root or critical system directories
    const dangerousPaths = ['/:', '/etc:', '/proc:', '/sys:', '/root:', 'c:\\:', 'c:\\windows:']
    const lowerMount = mount.toLowerCase()
    for (const danger of dangerousPaths) {
      if (lowerMount.startsWith(danger)) {
        violations.push(`Forbidden host system mount detected: "${mount}".`)
      }
    }
  }

  return {
    valid: violations.length === 0,
    violations,
  }
}

/**
 * Strips secret variables from build arguments so they are NEVER baked into Docker image layers or history.
 * Runtime environment variables are injected at deployment execution time, NOT build time.
 */
export function sanitizeBuildArgs(
  envVars?: Record<string, string>,
  explicitSecrets?: Record<string, string>
): { safeArgs: Record<string, string>; strippedKeys: string[] } {
  const safeArgs: Record<string, string> = {}
  const strippedKeys: string[] = []

  // All explicit secrets are unconditionally excluded
  const explicitSecretKeys = new Set(Object.keys(explicitSecrets || {}))

  if (envVars) {
    for (const [key, value] of Object.entries(envVars)) {
      if (explicitSecretKeys.has(key)) {
        strippedKeys.push(key)
        continue
      }

      // Check key name against secret patterns
      const isSensitiveName = SECRET_KEY_PATTERNS.some((pattern) => pattern.test(key))
      if (isSensitiveName) {
        strippedKeys.push(key)
        continue
      }

      // Safe non-secret build arguments (e.g. NODE_ENV, PORT, BUILD_VERSION)
      safeArgs[key] = value
    }
  }

  return { safeArgs, strippedKeys }
}

/**
 * Validates and clamps worker resource limits within hard system safety ceilings.
 */
export function enforceWorkerLimits(requested?: Partial<BuildWorkerLimits>): BuildWorkerLimits {
  const limits: BuildWorkerLimits = {
    ...DEFAULT_BUILD_LIMITS,
    ...requested,
  }

  // Parse and enforce CPU cap
  const cpuNum = parseFloat(limits.cpuLimit)
  if (isNaN(cpuNum) || cpuNum <= 0 || cpuNum > HARD_MAX_LIMITS.maxCpu) {
    limits.cpuLimit = String(HARD_MAX_LIMITS.maxCpu)
  }

  // Timeout bounds
  if (!limits.timeoutSeconds || limits.timeoutSeconds < 10) {
    limits.timeoutSeconds = 60
  } else if (limits.timeoutSeconds > HARD_MAX_LIMITS.maxTimeoutSeconds) {
    limits.timeoutSeconds = HARD_MAX_LIMITS.maxTimeoutSeconds
  }

  // Process limits (PIDs)
  if (!limits.pidsLimit || limits.pidsLimit < 16) {
    limits.pidsLimit = 64
  } else if (limits.pidsLimit > HARD_MAX_LIMITS.maxPids) {
    limits.pidsLimit = HARD_MAX_LIMITS.maxPids
  }

  // Workspace disk limits
  if (!limits.diskLimitMb || limits.diskLimitMb < 512) {
    limits.diskLimitMb = 1024
  } else if (limits.diskLimitMb > HARD_MAX_LIMITS.maxDiskMb) {
    limits.diskLimitMb = HARD_MAX_LIMITS.maxDiskMb
  }

  // Network isolation
  if (!['none', 'isolated', 'bridge'].includes(limits.networkMode)) {
    limits.networkMode = 'isolated'
  }

  return limits
}
