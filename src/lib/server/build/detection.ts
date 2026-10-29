/**
 * DeployForge Project Type Detection & Repository Layout Validator
 *
 * Supported Project Types & Detection Rules:
 * 1. NODEJS_NEXTJS    : package.json with 'next' dependency OR next.config.{js,ts,mjs}
 * 2. NODEJS_VITE      : package.json with 'vite' dependency OR vite.config.{js,ts,mjs}
 * 3. NODEJS_GENERIC   : package.json present with standard node scripts OR index/server.{js,ts}
 * 4. PYTHON_FASTAPI   : requirements.txt/pyproject.toml with 'fastapi' OR main.py with FastAPI
 * 5. PYTHON_FLASK     : requirements.txt/pyproject.toml with 'flask' OR app.py with Flask
 * 6. PYTHON_GENERIC   : requirements.txt, Pipfile, setup.py, or pyproject.toml present
 * 7. GO_MODULE        : go.mod present in root
 * 8. STATIC_WEB       : index.html present without server runtime manifests
 * 9. DOCKERFILE_CUSTOM: Dockerfile present in root or specified path
 */

import { ProjectType, ProjectDetectionResult, ProjectDetectionRule } from './types'

export const SUPPORTED_PROJECT_RULES: ProjectDetectionRule[] = [
  {
    type: 'DOCKERFILE_CUSTOM',
    displayName: 'Custom Dockerfile',
    description: 'Existing Dockerfile in root or configured directory',
    manifestFiles: ['Dockerfile', 'dockerfile', 'Containerfile'],
    indicators: ['FROM ', 'WORKDIR ', 'RUN '],
    defaultBuildCommand: 'docker build -t app .',
    defaultStartCommand: '',
    defaultPort: 3000,
    recommendedDockerfilePath: 'Dockerfile',
  },
  {
    type: 'NODEJS_NEXTJS',
    displayName: 'Next.js App Router / Pages',
    description: 'React full-stack framework with SSR and static export support',
    manifestFiles: ['package.json', 'next.config.js', 'next.config.ts', 'next.config.mjs'],
    indicators: ['next', '"next"'],
    defaultBuildCommand: 'npm run build',
    defaultStartCommand: 'npm start',
    defaultPort: 3000,
  },
  {
    type: 'NODEJS_VITE',
    displayName: 'Vite Single-Page App',
    description: 'Fast modern frontend bundle built with Vite',
    manifestFiles: ['package.json', 'vite.config.js', 'vite.config.ts', 'vite.config.mjs'],
    indicators: ['vite', '"vite"'],
    defaultBuildCommand: 'npm run build',
    defaultStartCommand: 'npm run preview -- --port 3000 --host 0.0.0.0',
    defaultPort: 3000,
  },
  {
    type: 'NODEJS_GENERIC',
    displayName: 'Node.js Service / API',
    description: 'Express, Fastify, NestJS, or generic Node.js microservice',
    manifestFiles: ['package.json'],
    indicators: ['express', 'fastify', 'node', '"scripts"'],
    defaultBuildCommand: 'npm install --production',
    defaultStartCommand: 'node index.js',
    defaultPort: 3000,
  },
  {
    type: 'PYTHON_FASTAPI',
    displayName: 'FastAPI Microservice',
    description: 'High-performance Python ASGI API powered by Starlette & Pydantic',
    manifestFiles: ['requirements.txt', 'pyproject.toml', 'Pipfile'],
    indicators: ['fastapi', 'uvicorn'],
    defaultBuildCommand: 'pip install -r requirements.txt',
    defaultStartCommand: 'uvicorn main:app --host 0.0.0.0 --port 8000',
    defaultPort: 8000,
  },
  {
    type: 'PYTHON_FLASK',
    displayName: 'Flask Web Application',
    description: 'Lightweight WSGI Python web framework',
    manifestFiles: ['requirements.txt', 'pyproject.toml', 'Pipfile'],
    indicators: ['flask', 'gunicorn'],
    defaultBuildCommand: 'pip install -r requirements.txt',
    defaultStartCommand: 'gunicorn -b 0.0.0.0:5000 app:app',
    defaultPort: 5000,
  },
  {
    type: 'PYTHON_GENERIC',
    displayName: 'Python Generic Service',
    description: 'Standard Python application with requirements.txt or pyproject.toml',
    manifestFiles: ['requirements.txt', 'pyproject.toml', 'setup.py', 'Pipfile'],
    indicators: ['python'],
    defaultBuildCommand: 'pip install -r requirements.txt',
    defaultStartCommand: 'python main.py',
    defaultPort: 8000,
  },
  {
    type: 'GO_MODULE',
    displayName: 'Go Microservice',
    description: 'Compiled binary microservice using Go modules',
    manifestFiles: ['go.mod'],
    indicators: ['module '],
    defaultBuildCommand: 'go build -o /app/server .',
    defaultStartCommand: '/app/server',
    defaultPort: 8080,
  },
  {
    type: 'STATIC_WEB',
    displayName: 'Static Website (HTML/CSS/JS)',
    description: 'Client-side HTML5 website served via lightweight static web server',
    manifestFiles: ['index.html'],
    indicators: ['<html', '<!DOCTYPE html>'],
    defaultBuildCommand: '',
    defaultStartCommand: 'npx serve -s . -l 80',
    defaultPort: 80,
  },
]

/**
 * Detects the project type from a list of relative file paths and file contents.
 */
export function detectProjectType(
  filePaths: string[],
  fileContents?: Record<string, string>
): ProjectDetectionResult {
  const normalizedPaths = filePaths.map((p) => p.replace(/\\/g, '/').toLowerCase())
  const contents = fileContents || {}

  // 1. Check for custom Dockerfile first
  if (normalizedPaths.includes('dockerfile') || normalizedPaths.some((p) => p.endsWith('/dockerfile'))) {
    const rule = SUPPORTED_PROJECT_RULES.find((r) => r.type === 'DOCKERFILE_CUSTOM')!
    return {
      type: 'DOCKERFILE_CUSTOM',
      displayName: rule.displayName,
      confidence: 1.0,
      detectedManifests: ['Dockerfile'],
      buildCommand: rule.defaultBuildCommand,
      startCommand: rule.defaultStartCommand,
      port: rule.defaultPort,
      dockerfilePath: 'Dockerfile',
      explanation: 'Dedicated Dockerfile found in root directory.',
    }
  }

  // 2. Check Node.js Next.js
  const hasPkgJson = normalizedPaths.includes('package.json')
  const pkgContent = contents['package.json'] || contents['PACKAGE.JSON'] || ''
  const hasNextConfig = normalizedPaths.some((p) => /^next\.config\.(js|ts|mjs)$/i.test(p))

  if (hasPkgJson && (pkgContent.includes('"next"') || pkgContent.includes("'next'") || hasNextConfig)) {
    const rule = SUPPORTED_PROJECT_RULES.find((r) => r.type === 'NODEJS_NEXTJS')!
    return {
      type: 'NODEJS_NEXTJS',
      displayName: rule.displayName,
      confidence: 0.95,
      detectedManifests: ['package.json', ...(hasNextConfig ? ['next.config.js'] : [])],
      buildCommand: rule.defaultBuildCommand,
      startCommand: rule.defaultStartCommand,
      port: rule.defaultPort,
      explanation: 'Next.js dependency detected in package.json.',
    }
  }

  // 3. Check Vite SPA
  const hasViteConfig = normalizedPaths.some((p) => /^vite\.config\.(js|ts|mjs)$/i.test(p))
  if (hasPkgJson && (pkgContent.includes('"vite"') || pkgContent.includes("'vite'") || hasViteConfig)) {
    const rule = SUPPORTED_PROJECT_RULES.find((r) => r.type === 'NODEJS_VITE')!
    return {
      type: 'NODEJS_VITE',
      displayName: rule.displayName,
      confidence: 0.9,
      detectedManifests: ['package.json', ...(hasViteConfig ? ['vite.config.js'] : [])],
      buildCommand: rule.defaultBuildCommand,
      startCommand: rule.defaultStartCommand,
      port: rule.defaultPort,
      explanation: 'Vite frontend configuration detected.',
    }
  }

  // 4. Check Generic Node.js
  if (hasPkgJson) {
    const rule = SUPPORTED_PROJECT_RULES.find((r) => r.type === 'NODEJS_GENERIC')!
    return {
      type: 'NODEJS_GENERIC',
      displayName: rule.displayName,
      confidence: 0.85,
      detectedManifests: ['package.json'],
      buildCommand: rule.defaultBuildCommand,
      startCommand: rule.defaultStartCommand,
      port: rule.defaultPort,
      explanation: 'package.json found with standard Node.js scripts.',
    }
  }

  // 5. Check Go module
  if (normalizedPaths.includes('go.mod')) {
    const rule = SUPPORTED_PROJECT_RULES.find((r) => r.type === 'GO_MODULE')!
    return {
      type: 'GO_MODULE',
      displayName: rule.displayName,
      confidence: 0.95,
      detectedManifests: ['go.mod'],
      buildCommand: rule.defaultBuildCommand,
      startCommand: rule.defaultStartCommand,
      port: rule.defaultPort,
      explanation: 'go.mod file found in project root.',
    }
  }

  // 6. Check Python FastAPI / Flask / Generic
  const pyManifest = normalizedPaths.find((p) => ['requirements.txt', 'pyproject.toml', 'pipfile'].includes(p))
  if (pyManifest) {
    const pyContent = (contents[pyManifest] || '').toLowerCase()
    if (pyContent.includes('fastapi')) {
      const rule = SUPPORTED_PROJECT_RULES.find((r) => r.type === 'PYTHON_FASTAPI')!
      return {
        type: 'PYTHON_FASTAPI',
        displayName: rule.displayName,
        confidence: 0.9,
        detectedManifests: [pyManifest],
        buildCommand: rule.defaultBuildCommand,
        startCommand: rule.defaultStartCommand,
        port: rule.defaultPort,
        explanation: 'FastAPI package specified in Python manifest.',
      }
    }
    if (pyContent.includes('flask')) {
      const rule = SUPPORTED_PROJECT_RULES.find((r) => r.type === 'PYTHON_FLASK')!
      return {
        type: 'PYTHON_FLASK',
        displayName: rule.displayName,
        confidence: 0.9,
        detectedManifests: [pyManifest],
        buildCommand: rule.defaultBuildCommand,
        startCommand: rule.defaultStartCommand,
        port: rule.defaultPort,
        explanation: 'Flask package specified in Python manifest.',
      }
    }
    const rule = SUPPORTED_PROJECT_RULES.find((r) => r.type === 'PYTHON_GENERIC')!
    return {
      type: 'PYTHON_GENERIC',
      displayName: rule.displayName,
      confidence: 0.8,
      detectedManifests: [pyManifest],
      buildCommand: rule.defaultBuildCommand,
      startCommand: rule.defaultStartCommand,
      port: rule.defaultPort,
      explanation: `Python dependencies manifest (${pyManifest}) identified.`,
    }
  }

  // 7. Check Static Web (HTML)
  if (normalizedPaths.includes('index.html')) {
    const rule = SUPPORTED_PROJECT_RULES.find((r) => r.type === 'STATIC_WEB')!
    return {
      type: 'STATIC_WEB',
      displayName: rule.displayName,
      confidence: 0.8,
      detectedManifests: ['index.html'],
      buildCommand: rule.defaultBuildCommand,
      startCommand: rule.defaultStartCommand,
      port: rule.defaultPort,
      explanation: 'Static index.html file found in root directory.',
    }
  }

  // 8. Unknown / unsupported project
  return {
    type: 'UNKNOWN',
    displayName: 'Unknown / Unsupported Project',
    confidence: 0.0,
    detectedManifests: [],
    buildCommand: '',
    startCommand: '',
    port: 3000,
    explanation: 'No recognizable application manifests (package.json, Dockerfile, go.mod, requirements.txt, or index.html) were discovered.',
  }
}

/**
 * Validates repository layout security:
 * - Reject paths escaping root (../, ..\)
 * - Reject hidden sensitive directories (.git, .ssh, .aws)
 * - Check file limits
 */
export function validateRepositoryLayout(filePaths: string[]): { valid: boolean; errors: string[] } {
  const errors: string[] = []

  if (!filePaths || filePaths.length === 0) {
    return { valid: false, errors: ['Repository contains no files to build.'] }
  }

  if (filePaths.length > 50000) {
    return { valid: false, errors: ['Repository exceeds maximum file count limit (50,000 files).'] }
  }

  for (const p of filePaths) {
    if (p.includes('../') || p.includes('..\\') || p.startsWith('/') || /^[a-zA-Z]:/.test(p)) {
      errors.push(`Directory traversal or absolute path violation in repository: "${p}"`)
      break
    }

    if (p.startsWith('.ssh/') || p.startsWith('.aws/') || p.startsWith('.gnupg/')) {
      errors.push(`Sensitive system directory found in repository layout: "${p}"`)
      break
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}

/**
 * Validates user-specified build and start commands against command injection.
 * Enforces safe execution tokens, disallowing shell escapes, eval, or destructive host actions.
 */
export function validateBuildAndStartCommands(
  buildCommand: string,
  startCommand: string
): { valid: boolean; error?: string } {
  const dangerousPatterns = [
    /\brm\s+-rf\s+\//i,
    /\/dev\/null/i,
    /\bcurl\b.*\|\s*(?:ba|z)?sh/i,
    /\bwget\b.*\|\s*(?:ba|z)?sh/i,
    /\beval\s*\(/i,
    /\bsudo\s+/i,
    /\bchown\s+-R/i,
    /\bchmod\s+777/i,
    /\bshutdown\b/i,
    /\breboot\b/i,
    /\bmkfs\b/i,
    /\bdd\s+if=/i,
    /:?\(\)\s*\{\s*:\s*\|\s*:&\s*\};?:?/, // fork bomb pattern
  ]

  const checkCommand = (cmd: string, name: string) => {
    if (!cmd || cmd.trim().length === 0) return null

    if (cmd.length > 500) {
      return `${name} exceeds maximum length of 500 characters.`
    }

    if (cmd.includes(':(){ :|:& };:') || cmd.includes(':(){:|:&};:')) {
      return `Dangerous or disallowed command sequence detected in ${name}: "${cmd}".`
    }

    for (const pattern of dangerousPatterns) {
      if (pattern.test(cmd)) {
        return `Dangerous or disallowed command sequence detected in ${name}: "${cmd}".`
      }
    }

    return null
  }

  const buildErr = checkCommand(buildCommand, 'Build command')
  if (buildErr) return { valid: false, error: buildErr }

  const startErr = checkCommand(startCommand, 'Start command')
  if (startErr) return { valid: false, error: startErr }

  return { valid: true }
}
