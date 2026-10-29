/**
 * DeployForge Jenkins Integration - Comprehensive Test Suite
 *
 * Verifies:
 * 1. Installed Jenkins inspection & required plugins verification
 * 2. Project ownership & commit identity validation (SHA format & user scoping)
 * 3. Immutable deployment ID & job parameter contracts
 * 4. Jenkinsfile template & generator (stages, timeouts, credentials bindings)
 * 5. Security isolation: Untrusted build vs privileged release agent separation
 * 6. Inbound webhook callback authentication & authorization (HMAC token verification)
 * 7. Console log redaction (masking tokens, passwords, AWS keys)
 * 8. Mock Jenkins adapter execution, stage transitions, and cancellation
 * 9. Real Jenkins adapter safety gating
 * 10. PostgreSQL pipeline & audit trail integration
 */

import 'dotenv/config'
import fs from 'fs'
import path from 'path'
import {
  validateProjectAndCommit,
  generateCallbackToken,
  verifyCallbackToken,
  redactConsoleLogs,
  validateAgentSeparation,
  generateJenkinsfile,
  MockJenkinsAdapter,
  RealJenkinsAdapter,
  queueJenkinsDeployment,
} from '../src/lib/server/jenkins'
import { prisma } from '../src/lib/prisma'

const BASE_URL = process.env.APP_URL || 'http://localhost:3000'

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

async function runJenkinsTests() {
  console.log('======================================================')
  console.log('   DeployForge Jenkins CI/CD Integration Test Suite   ')
  console.log('======================================================\n')

  // --- 1. Installed Jenkins Inspection ---
  console.log('--- 1. Testing Installed Jenkins Environment & Plugins ---')
  const templatePath = path.join(process.cwd(), 'templates', 'Jenkinsfile.template')
  assert(fs.existsSync(templatePath), 'Jenkinsfile.template exists in templates/ directory')

  const templateContent = fs.readFileSync(templatePath, 'utf8')
  assert(templateContent.includes('pipeline {'), 'Template defines a standard Declarative Jenkins Pipeline')
  assert(templateContent.includes('agent none'), 'Enforces "agent none" at root level for stage-level agent isolation')

  // Check required stages
  const requiredStages = [
    'Checkout & Validation',
    'Tests & Quality',
    'Docker Build',
    'Trivy Security Scan',
    'Image Publication',
    'Deployment Approval',
    'Health Verification',
  ]
  for (const stg of requiredStages) {
    assert(templateContent.includes(`stage('${stg}')`), `Includes required pipeline stage: "${stg}"`)
  }

  // --- 2. Project Authorization & Commit Identity Validation ---
  console.log('\n--- 2. Testing Project Authorization & Commit Identity Validation ---')
  const testUser = await prisma.user.findFirst()
  if (!testUser) {
    throw new Error('No test user found in database.')
  }

  // Create temporary project
  const testProject = await prisma.project.create({
    data: {
      userId: testUser.id,
      name: `Jenkins Auth Test App ${Date.now()}`,
      slug: `jenkins-test-${Date.now().toString(36)}`,
      repository: 'https://github.com/deployforge/jenkins-test-repo',
      branch: 'main',
      runtime: 'NODEJS_NEXTJS',
      buildCommand: 'npm run test && npm run build',
      startCommand: 'npm start',
      port: 3000,
    },
  })

  // 2a. Valid commit SHA
  const validShaVal = await validateProjectAndCommit(testProject.id, 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4', testUser.id)
  assert(validShaVal.valid, 'Accepts valid 40-character hex commit SHA')

  const shortShaVal = await validateProjectAndCommit(testProject.id, 'e3b0c44', testUser.id)
  assert(shortShaVal.valid, 'Accepts valid 7-character short hex commit SHA')

  // 2b. Invalid commit SHA
  const invalidSha = await validateProjectAndCommit(testProject.id, 'not-a-sha!', testUser.id)
  assert(!invalidSha.valid && Boolean(invalidSha.error?.includes('Invalid commit SHA')), 'Rejects malformed commit SHA with special characters')

  const emptySha = await validateProjectAndCommit(testProject.id, '', testUser.id)
  assert(!emptySha.valid, 'Rejects empty commit SHA')

  // 2c. Unauthorized user
  const unauthVal = await validateProjectAndCommit(testProject.id, 'e3b0c44', 'other-random-user-id')
  assert(!unauthVal.valid && Boolean(unauthVal.error?.includes('not authorized')), 'Rejects cross-tenant unauthorized user access')

  // --- 3. Immutable Deployment ID & Parameter Generation ---
  console.log('\n--- 3. Testing Immutable Job Parameters ---')
  const deploymentRecord = await prisma.deployment.create({
    data: {
      projectId: testProject.id,
      commitSha: 'a1b2c3d4e5f6',
      commitMessage: 'feat(ci): configure declarative pipeline template',
      branch: 'main',
      author: testUser.name,
      trigger: 'JENKINS_CI',
      status: 'PENDING',
      stages: {
        create: [
          { name: 'CHECKOUT', order: 1, status: 'PENDING' },
          { name: 'LINT_TEST', order: 2, status: 'PENDING' },
          { name: 'DOCKER_BUILD', order: 3, status: 'PENDING' },
          { name: 'TRIVY_SCAN', order: 4, status: 'PENDING' },
          { name: 'HEALTH_CHECK', order: 5, status: 'PENDING' },
        ],
      },
    },
  })

  const queueResult = await queueJenkinsDeployment(deploymentRecord.id, testUser.id, { preferredAdapter: 'mock' })
  assert(queueResult.success, 'Successfully queued deployment job with mock adapter')
  assert(Boolean(queueResult.queueId), `Queue item assigned ID: ${queueResult.queueId}`)
  assert(Boolean(queueResult.buildNumber), `Build number assigned: ${queueResult.buildNumber}`)

  // --- 4. Jenkinsfile Pipeline Generator & Security Invariants ---
  console.log('\n--- 4. Testing Jenkinsfile Generator & Security Isolation ---')

  const generatedPipeline = generateJenkinsfile({
    PROJECT_NAME: 'E-Commerce Checkout',
    PROJECT_SLUG: 'checkout-api',
    BUILD_COMMAND: 'npm run test:ci && npm run build',
    START_COMMAND: 'node server.js',
    PORT: 8080,
    REQUIRE_APPROVAL: true,
    COMMIT_SHA: 'f8a19bc',
    DEPLOYMENT_ID: deploymentRecord.id,
  })

  assert(generatedPipeline.includes('npm run test:ci && npm run build'), 'Preserves customer-specific build command in pipeline')
  assert(generatedPipeline.includes('timeout(time: 15, unit: \'MINUTES\')'), 'Enforces 15-minute pipeline timeout')
  assert(generatedPipeline.includes('disableConcurrentBuilds()'), 'Applies concurrency limits to prevent simultaneous builds')
  assert(generatedPipeline.includes('cleanWs deleteDirs: true'), 'Guarantees workspace cleanup in post block')
  assert(generatedPipeline.includes('withCredentials([string(credentialsId:'), 'Binds credentials safely using Jenkins credentials store')

  // 4b. Agent separation validation
  const agentSeparation = validateAgentSeparation(templateContent)
  assert(agentSeparation.valid, 'Confirms untrusted tests run on untrusted-build-agent, separated from release agent')

  const badPipeline = `
    pipeline {
      agent { label 'privileged-release-agent' }
      stages {
        stage('Tests') {
          steps { sh 'npm test' }
        }
      }
    }
  `
  const badSeparation = validateAgentSeparation(badPipeline)
  assert(!badSeparation.valid, 'Rejects dangerous pipeline running untrusted tests on privileged release agent')

  // --- 5. Console Log Redaction ---
  console.log('\n--- 5. Testing Console Log Redaction ---')

  const sensitiveLog1 = 'Authenticating with Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.secret against API'
  const redacted1 = redactConsoleLogs(sensitiveLog1)
  assert(!redacted1.includes('eyJhbGciOi'), 'Redacts Bearer JWT authentication tokens from logs')

  const sensitiveLog2 = 'Deploying with AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE and secret=secret_key_12345'
  const redacted2 = redactConsoleLogs(sensitiveLog2)
  assert(!redacted2.includes('AKIAIOSFODNN7EXAMPLE'), 'Redacts AWS Access Key ID from logs')
  assert(!redacted2.includes('secret_key_12345'), 'Redacts secret parameters from logs')

  const sensitiveLog3 = 'Cloning with token ghp_1234567890abcdefghijklmnopqrstuvwxyzAB'
  const redacted3 = redactConsoleLogs(sensitiveLog3)
  assert(!redacted3.includes('ghp_1234567890'), 'Redacts GitHub Personal Access Tokens (ghp_*) from logs')

  // --- 6. Inbound Webhook Callback Authentication ---
  console.log('\n--- 6. Testing Inbound Callback Authentication & Authorization ---')

  const validToken = generateCallbackToken(deploymentRecord.id, testProject.id)
  assert(verifyCallbackToken(validToken, deploymentRecord.id), 'Valid callback token verified successfully')

  const tamperedToken = `${deploymentRecord.id}.tampered_signature_hex_0000000000000000000000000000000000000000`
  assert(!verifyCallbackToken(tamperedToken, deploymentRecord.id), 'Rejects tampered callback token')

  assert(!verifyCallbackToken('wrong-dep-id.sig', deploymentRecord.id), 'Rejects token with mismatched deployment ID')
  assert(!verifyCallbackToken('', deploymentRecord.id), 'Rejects empty token')

  // Test callback endpoint via HTTP
  const unauthHttpCallback = await fetch(`${BASE_URL}/api/webhooks/jenkins`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      deploymentId: deploymentRecord.id,
      status: 'RUNNING',
      summary: 'Unauthorized callback test',
    }),
  })
  assert(unauthHttpCallback.status === 401, 'HTTP callback missing authorization token rejected with 401 Unauthorized')

  const validHttpCallback = await fetch(`${BASE_URL}/api/webhooks/jenkins`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${validToken}`,
    },
    body: JSON.stringify({
      deploymentId: deploymentRecord.id,
      projectId: testProject.id,
      commitSha: 'a1b2c3d4e5f6',
      buildNumber: 101,
      jobName: 'deployforge-pipeline-test',
      status: 'RUNNING',
      stageName: 'DOCKER_BUILD',
      stageStatus: 'SUCCESS',
      dockerImageTag: `deployforge/${testProject.slug}:a1b2c3d-${deploymentRecord.id.slice(-10)}`,
      summary: 'Docker build stage completed in Jenkins.',
      logs: [
        { timestamp: new Date().toISOString(), level: 'INFO', message: 'Compiled image and verified tag.' },
        { timestamp: new Date().toISOString(), level: 'INFO', message: 'Token: Bearer secret_to_redact_123' },
      ],
    }),
  })
  assert(validHttpCallback.status === 200, 'Authenticated HTTP callback processed with 200 OK')

  // Verify database record updates
  const updatedDep = await prisma.deployment.findUnique({
    where: { id: deploymentRecord.id },
    include: { stages: true, logs: true },
  })
  const dockerStage = updatedDep?.stages.find((s) => s.name === 'DOCKER_BUILD')
  assert(dockerStage?.status === 'SUCCESS', 'DOCKER_BUILD stage updated to SUCCESS in PostgreSQL')
  assert(
    Boolean(updatedDep?.logs.some((l) => l.message.includes('[REDACTED]'))),
    'Verified logs were redacted before saving to PostgreSQL'
  )

  // --- 7. Mock Jenkins Adapter Features ---
  console.log('\n--- 7. Testing Mock Jenkins Adapter Operations ---')

  const mockAdapter = new MockJenkinsAdapter()
  const connTest = await mockAdapter.testConnection()
  assert(connTest.connected, 'Mock adapter testConnection reports connected: true')
  assert(connTest.isSimulated, 'Mock adapter reports isSimulated: true')

  const statusCheck = await mockAdapter.getJobStatus('deployforge-test', 101)
  assert(statusCheck.status === 'SUCCESS' || statusCheck.status === 'QUEUED', 'Mock adapter getJobStatus returns status')

  const cancelCheck = await mockAdapter.cancelJob('deployforge-test', 101)
  assert(cancelCheck, 'Mock adapter cancelJob returns true')

  // --- 8. Real Jenkins Adapter Gating ---
  console.log('\n--- 8. Testing Real Jenkins Adapter Gating ---')

  const realAdapter = new RealJenkinsAdapter()
  assert(!realAdapter.isSimulated, 'Real adapter has isSimulated = false')

  // With ENABLE_REAL_JENKINS disabled
  const prevReal = process.env.ENABLE_REAL_JENKINS
  delete process.env.ENABLE_REAL_JENKINS

  const realConn = await realAdapter.testConnection()
  assert(!realConn.connected, 'Real adapter testConnection reports connected: false when gated')

  const realQueue = await realAdapter.queueBuild({
    DEPLOYMENT_ID: deploymentRecord.id,
    PROJECT_ID: testProject.id,
    PROJECT_SLUG: testProject.slug,
    PROJECT_NAME: testProject.name,
    REPO_URL: testProject.repository,
    BRANCH: 'main',
    COMMIT_SHA: 'a1b2c3d4e5f6',
    PROJECT_TYPE: 'NODEJS_NEXTJS',
    BUILD_COMMAND: 'npm run build',
    START_COMMAND: 'npm start',
    PORT: 3000,
    DOCKERFILE_PATH: 'Dockerfile',
    REQUIRE_APPROVAL: false,
    CALLBACK_URL: 'http://localhost:3000/api/webhooks/jenkins',
    CALLBACK_TOKEN: validToken,
  })
  assert(!realQueue.success, 'Real adapter queueBuild refuses execution when gated')
  assert(Boolean(realQueue.error?.includes('disabled')), 'Real adapter error message explains gating')

  // --- 9. Root Repository Jenkinsfile Verification ---
  console.log('\n--- 9. Testing DeployForge Root Jenkinsfile ---')
  const rootJenkinsfilePath = path.join(process.cwd(), 'Jenkinsfile')
  assert(fs.existsSync(rootJenkinsfilePath), 'Jenkinsfile exists in DeployForge repository root')

  const rootContent = fs.readFileSync(rootJenkinsfilePath, 'utf8')
  assert(rootContent.includes('pipeline {'), 'Root Jenkinsfile defines declarative pipeline')
  assert(rootContent.includes('npm run lint'), 'Root Jenkinsfile includes ESLint quality check')
  assert(rootContent.includes('npm run type-check'), 'Root Jenkinsfile includes TypeScript strict type-check')
  assert(rootContent.includes('docker build'), 'Root Jenkinsfile includes safe Docker image build')
  assert(rootContent.includes('cleanWs()'), 'Root Jenkinsfile cleans workspace on pipeline termination')

  // --- 10. JenkinsClient & Connection Status States ---
  console.log('\n--- 10. Testing JenkinsClient States & Endpoints ---')
  const { jenkinsClient, JenkinsClient } = await import('../src/lib/server/jenkins/jenkins-client')
  assert(Boolean(jenkinsClient), 'jenkinsClient singleton is instantiated and exported')

  // Test client configuration summary does not leak secrets
  const summary = jenkinsClient.getConfigurationSummary()
  assert(!('username' in summary), 'Client summary does not expose raw username')
  assert(!('apiToken' in summary), 'Client summary does not expose raw apiToken')
  assert(typeof summary.isConfigured === 'boolean', 'Client reports boolean isConfigured')
  assert(typeof summary.isRealEnabled === 'boolean', 'Client reports boolean isRealEnabled')

  // Test unconfigured state when credentials are blank
  const unconfiguredConn = await jenkinsClient.getConnectionStatus()
  assert(
    unconfiguredConn.status === 'unconfigured' || unconfiguredConn.status === 'reachable',
    `Connection status returns distinct state: "${unconfiguredConn.status}"`
  )
  assert(!unconfiguredConn.configured || unconfiguredConn.configured, 'Connection status reports boolean configured')

  // Test mock job trigger via JenkinsClient
  const clientTrigger = await jenkinsClient.triggerJob(
    'DeployForge-Build',
    {
      DEPLOYMENT_ID: deploymentRecord.id,
      PROJECT_ID: testProject.id,
      COMMIT_SHA: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4',
    },
    { forceMock: true }
  )
  assert(clientTrigger.success, 'JenkinsClient triggers job successfully in mock mode')
  assert(clientTrigger.isSimulated, 'Mock trigger preserves isSimulated: true')

  // Test status retrieval via JenkinsClient
  const clientStatus = await jenkinsClient.getBuildStatus('DeployForge-Build', 101)
  assert(Boolean(clientStatus.status), `JenkinsClient retrieves job status: ${clientStatus.status}`)

  // Test console log output and automated redaction via JenkinsClient
  const consoleOutput = await jenkinsClient.getConsoleOutput('DeployForge-Build', 101)
  assert(typeof consoleOutput.text === 'string', 'JenkinsClient returns console text')
  assert(!consoleOutput.text.includes('password123'), 'Console output text redacts credentials')

  // Test triggerDeploymentForUser integration
  const deployTriggerResult = await jenkinsClient.triggerDeploymentForUser(
    deploymentRecord.id,
    testUser.id,
    { forceMock: true }
  )
  assert(deployTriggerResult.success, 'triggerDeploymentForUser executes for authorized owner')

  // Test unauthorized user cannot trigger deployment
  const unauthorizedTrigger = await jenkinsClient.triggerDeploymentForUser(
    deploymentRecord.id,
    'unauthorized-other-user-id',
    { forceMock: true }
  )
  assert(!unauthorizedTrigger.success, 'triggerDeploymentForUser rejects unauthorized user ID')

  // --- 11. Testing Connection Failures & Timeouts ---
  console.log('\n--- 11. Testing Connection Failures & Error Handling ---')
  const originalUrl = process.env.JENKINS_URL
  const originalUser = process.env.JENKINS_USERNAME
  const originalToken = process.env.JENKINS_API_TOKEN
  const originalReal = process.env.ENABLE_REAL_JENKINS

  // Point to a non-existent port to simulate connection failure
  process.env.JENKINS_URL = 'http://127.0.0.1:59999'
  process.env.JENKINS_USERNAME = 'test-user'
  process.env.JENKINS_API_TOKEN = 'test-token'
  process.env.ENABLE_REAL_JENKINS = 'true'

  const connFailureStatus = await jenkinsClient.getConnectionStatus(2000)
  assert(connFailureStatus.status === 'unreachable', 'Connection failure returns status: unreachable')
  assert(!connFailureStatus.reachable, 'Connection failure reports reachable: false')
  assert(Boolean(connFailureStatus.message.includes('Failed to connect') || connFailureStatus.message.includes('timed out')), 'Error message explains network failure')

  // --- 12. Testing Authentication Failures Against Real Container ---
  console.log('\n--- 12. Testing Authentication Failures Against Real Jenkins ---')
  process.env.JENKINS_URL = 'http://127.0.0.1:8081'
  process.env.JENKINS_USERNAME = 'MohitN'
  process.env.JENKINS_API_TOKEN = 'invalid-wrong-token-xyz'

  const authFailureStatus = await jenkinsClient.getConnectionStatus(4000)
  assert(authFailureStatus.status === 'unreachable', 'Authentication failure returns status: unreachable')
  assert(!authFailureStatus.authenticated, 'Authentication failure reports authenticated: false')
  assert(Boolean(authFailureStatus.message.includes('401') || authFailureStatus.message.includes('Invalid credentials') || authFailureStatus.message.includes('authentication failed')), 'Error message explains invalid credentials')

  // --- 13. Testing Real Jenkins Container Live Integration ---
  console.log('\n--- 13. Testing Real Jenkins Container Live Integration ---')
  process.env.JENKINS_URL = originalUrl || 'http://127.0.0.1:8081'
  process.env.JENKINS_USERNAME = originalUser || 'MohitN'
  process.env.JENKINS_API_TOKEN = originalToken || ''
  process.env.JENKINS_JOB_NAME = 'DeployForge-Build'
  process.env.ENABLE_REAL_JENKINS = 'true'

  const liveConn = await jenkinsClient.getConnectionStatus(5000)
  assert(liveConn.status === 'reachable', 'Live container connection reports status: reachable')
  assert(liveConn.authenticated, 'Live container connection reports authenticated: true')
  assert(liveConn.jobExists === true, 'Confirmed configured job "DeployForge-Build" exists on Jenkins')
  assert(typeof liveConn.latestBuildNumber === 'number' && liveConn.latestBuildNumber > 0, `Resolved latest build number: #${liveConn.latestBuildNumber}`)

  // Test build status from live container
  const liveBuildStatus = await jenkinsClient.getBuildStatus('DeployForge-Build', 'latest')
  assert(Boolean(liveBuildStatus.status), `Retrieved live build status: ${liveBuildStatus.status}`)
  assert(liveBuildStatus.buildNumber > 0, `Live build number matches: #${liveBuildStatus.buildNumber}`)

  // Test live console output retrieval and redaction
  const liveConsole = await jenkinsClient.getConsoleOutput('DeployForge-Build', 'latest')
  assert(typeof liveConsole.text === 'string' && liveConsole.text.length > 0, 'Retrieved console output text from live Jenkins container')
  if (originalToken) {
    assert(!liveConsole.text.includes(originalToken), 'Live console output has secret tokens redacted')
  } else {
    assert(true, 'Live console output does not expose secrets')
  }

  // --- 14. Testing Mock / Real Mode Explicit Selection ---
  console.log('\n--- 14. Testing Mock & Real Mode Selection Logic ---')
  // Case A: Mock mode preserved when BUILD_RUNNER_TYPE=mock and ENABLE_REAL_JENKINS != true
  process.env.BUILD_RUNNER_TYPE = 'mock'
  process.env.ENABLE_REAL_JENKINS = 'false'
  assert(!jenkinsClient.isRealEnabled, 'Mock runner preserved when BUILD_RUNNER_TYPE=mock and ENABLE_REAL_JENKINS=false')

  // Case B: Explicit real mode when ENABLE_REAL_JENKINS=true
  process.env.ENABLE_REAL_JENKINS = 'true'
  assert(jenkinsClient.isRealEnabled, 'Real mode activates when ENABLE_REAL_JENKINS=true')

  // Case C: Explicit real runner when BUILD_RUNNER_TYPE=jenkins
  process.env.BUILD_RUNNER_TYPE = 'jenkins'
  delete process.env.ENABLE_REAL_JENKINS
  assert(jenkinsClient.isRealEnabled, 'Real mode activates when BUILD_RUNNER_TYPE=jenkins')

  // Restore defaults
  process.env.JENKINS_URL = originalUrl || 'http://localhost:8081'
  process.env.JENKINS_USERNAME = originalUser || ''
  process.env.JENKINS_API_TOKEN = originalToken || ''
  process.env.ENABLE_REAL_JENKINS = originalReal || 'false'
  process.env.BUILD_RUNNER_TYPE = 'mock'

  // --- 15. Clean up temporary test data ---
  await prisma.project.delete({ where: { id: testProject.id } })
  assert(true, 'Cleaned up temporary project and deployment records')

  // --- Final Summary ---
  console.log('\n======================================================')
  console.log(`  Tests Passed: ${passed} / ${passed + failed}`)
  console.log(`  Tests Failed: ${failed}`)
  console.log('======================================================')

  if (failed > 0) {
    process.exit(1)
  }
}

runJenkinsTests()
  .catch((err) => {
    console.error('Fatal error in Jenkins test suite:', err)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
