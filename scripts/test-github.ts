import crypto from 'crypto'
import { prisma } from '../src/lib/prisma'
import { encryptToken, decryptToken } from '../src/lib/server/crypto'
import { validateGitHubRepoUrl, validateBranchName } from '../src/lib/server/validation'

const BASE_URL = process.env.APP_URL || 'http://localhost:3000'
const WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET || 'deployforge_dev_webhook_secret_key_12345'

interface TestResult {
  name: string
  passed: boolean
  details?: string
}

const results: TestResult[] = []

function assert(condition: boolean, name: string, details?: string) {
  if (condition) {
    console.log(`  ✅ PASS: ${name}`)
    results.push({ name, passed: true })
  } else {
    console.error(`  ❌ FAIL: ${name} - ${details || 'Assertion failed'}`)
    results.push({ name, passed: false, details })
  }
}

function computeSignature(payload: string, secret: string): string {
  const hmac = crypto.createHmac('sha256', secret)
  hmac.update(payload, 'utf8')
  return `sha256=${hmac.digest('hex')}`
}

async function runGitHubTests() {
  console.log(`\n======================================================`)
  console.log(`   DeployForge GitHub Integration Test Suite          `)
  console.log(`   Base URL: ${BASE_URL}                              `)
  console.log(`======================================================\n`)

  let sessionCookie = ''
  let testUserId = ''
  let testProjectId = ''

  // 0. Setup: Authenticate as Alex Morgan
  console.log('--- 0. Authentication Setup ---')
  const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'alex.morgan@deployforge.io',
      password: 'Password123!',
    }),
  })
  const loginData = await loginRes.json()
  assert(loginRes.status === 200, 'Login succeeded')
  testUserId = loginData.data.user.id
  sessionCookie = loginRes.headers.get('set-cookie')?.split(';')[0] || ''
  assert(Boolean(sessionCookie), 'Retrieved authenticated session cookie')

  // Clean any prior GitHubAccount for clean test baseline
  await prisma.webhookDelivery.deleteMany()
  await prisma.gitHubAccount.deleteMany({ where: { userId: testUserId } })
  await prisma.integrationRecord.updateMany({
    where: { userId: testUserId, type: 'GITHUB' },
    data: { status: 'DISCONNECTED' },
  })

  // 1. Connection Status (Must NOT claim connected before OAuth)
  console.log('\n--- 1. Testing Connection Status Contract ---')
  const statusRes = await fetch(`${BASE_URL}/api/integrations/github/status`, {
    headers: { Cookie: sessionCookie },
  })
  const statusData = await statusRes.json()
  assert(statusRes.status === 200, 'Status check returned 200 OK')
  assert(statusData.data.connected === false, 'Strictly reports connected: false prior to OAuth')
  assert(statusData.data.webhookUrl.includes('/api/webhooks/github'), 'Webhook endpoint URL returned in status payload')

  // 2. Authorization Failures on Repository Listing
  console.log('\n--- 2. Testing Repository Listing Authorization Boundaries ---')
  // 2a. Unauthenticated request
  const unauthReposRes = await fetch(`${BASE_URL}/api/integrations/github/repositories`)
  assert(unauthReposRes.status === 401, 'Unauthenticated repository listing rejected with 401')

  // 2b. Authenticated but disconnected user
  const disconnectedReposRes = await fetch(`${BASE_URL}/api/integrations/github/repositories`, {
    headers: { Cookie: sessionCookie },
  })
  const disconnectedData = await disconnectedReposRes.json()
  assert(disconnectedReposRes.status === 400, 'Disconnected user repository listing rejected with 400')
  assert(disconnectedData.error.code === 'GITHUB_NOT_CONNECTED', 'Returns GITHUB_NOT_CONNECTED error code')

  // 3. Repository URL and Branch Validation
  console.log('\n--- 3. Testing Repository URL & Branch Security Validation ---')
  // 3a. Insecure HTTP scheme
  const httpVal = validateGitHubRepoUrl('http://github.com/deployforge/app')
  assert(!httpVal.valid && Boolean(httpVal.error?.includes('https://')), 'Rejects non-HTTPS HTTP URL')

  // 3b. Non-github host / SSRF target
  const ssrfVal = validateGitHubRepoUrl('https://169.254.169.254/latest/meta-data')
  assert(!ssrfVal.valid && Boolean(ssrfVal.error?.includes('github.com')), 'Rejects internal IP / SSRF target')

  // 3c. Malicious host
  const evilVal = validateGitHubRepoUrl('https://evil-github.com/org/repo')
  assert(!evilVal.valid && Boolean(evilVal.error?.includes('github.com')), 'Rejects external non-github host')

  // 3d. Directory traversal attempt
  const traversalVal = validateGitHubRepoUrl('https://github.com/../../etc/passwd')
  assert(!traversalVal.valid, 'Rejects directory traversal sequences')

  // 3e. Embedded credentials
  const credsVal = validateGitHubRepoUrl('https://user:pass@github.com/owner/repo')
  assert(!credsVal.valid && Boolean(credsVal.error?.includes('credentials')), 'Rejects embedded URL credentials')

  // 3f. Valid GitHub URLs
  const validFull = validateGitHubRepoUrl('https://github.com/deployforge-demo/webhook-test-app.git')
  assert(validFull.valid && validFull.owner === 'deployforge-demo' && validFull.repo === 'webhook-test-app', 'Accepts valid full GitHub HTTPS URL')

  const validShort = validateGitHubRepoUrl('deployforge-demo/webhook-test-app')
  assert(validShort.valid && validShort.fullName === 'deployforge-demo/webhook-test-app', 'Accepts owner/repo shorthand and normalizes to canonical')

  // 3g. Branch name validation
  const validBranch = validateBranchName('main')
  assert(validBranch.valid, 'Accepts valid branch name "main"')

  const featureBranch = validateBranchName('feature/v2.0-payment')
  assert(featureBranch.valid, 'Accepts valid branch name "feature/v2.0-payment"')

  const invalidBranch1 = validateBranchName('bad branch with spaces')
  assert(!invalidBranch1.valid, 'Rejects branch name with spaces')

  const invalidBranch2 = validateBranchName('refs/../traversal')
  assert(!invalidBranch2.valid, 'Rejects branch name with traversal')

  // 4. Token Encryption & Decryption
  console.log('\n--- 4. Testing AES-256-GCM Token Encryption ---')
  const sampleToken = 'gho_16C7e42F292c6912E7710c838347Ae178B4a'
  const encrypted = encryptToken(sampleToken)
  assert(encrypted !== sampleToken, 'Token is transformed to ciphertext')
  assert(encrypted.split(':').length === 3, 'Ciphertext formatted as iv:tag:cipher')

  const decrypted = decryptToken(encrypted)
  assert(decrypted === sampleToken, 'Decrypted token matches original secret')

  let tamperFailed = false
  try {
    const parts = encrypted.split(':')
    const tampered = `${parts[0]}:${parts[1]}:deadbeef${parts[2].slice(8)}`
    decryptToken(tampered)
  } catch (_) {
    tamperFailed = true
  }
  assert(tamperFailed, 'Tampered ciphertext rejected during decryption')

  // 5. OAuth State Management & Validation
  console.log('\n--- 5. Testing OAuth State Validation & Replay Protection ---')
  const testState = crypto.randomBytes(32).toString('hex')
  const expiredState = crypto.randomBytes(32).toString('hex')

  // Create active and expired states
  await prisma.oAuthState.create({
    data: {
      userId: testUserId,
      state: testState,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    },
  })
  await prisma.oAuthState.create({
    data: {
      userId: testUserId,
      state: expiredState,
      expiresAt: new Date(Date.now() - 1000), // Expired in the past
    },
  })

  // 5a. Non-existent state in callback
  const fakeStateRes = await fetch(`${BASE_URL}/api/integrations/github/callback?code=mock_code&state=non_existent_state`, {
    redirect: 'manual',
  })
  const fakeLocation = fakeStateRes.headers.get('location') || ''
  assert(fakeLocation.includes('error=invalid_state'), 'Non-existent state redirected with invalid_state error')

  // 5b. Expired state in callback
  const expiredStateRes = await fetch(`${BASE_URL}/api/integrations/github/callback?code=mock_code&state=${expiredState}`, {
    redirect: 'manual',
  })
  const expiredLocation = expiredStateRes.headers.get('location') || ''
  assert(expiredLocation.includes('error=expired_state') || expiredLocation.includes('error=invalid_state'), 'Expired state rejected')

  // 5c. Valid state consumed atomically
  // Verify state exists before
  const stateBefore = await prisma.oAuthState.findUnique({ where: { state: testState } })
  assert(Boolean(stateBefore), 'OAuth state verified in database prior to callback')

  // Trigger callback with testState (exchange will fail because mock credentials, but state consumption is verified)
  await fetch(`${BASE_URL}/api/integrations/github/callback?code=mock_code&state=${testState}`, {
    redirect: 'manual',
  })

  // Verify state is deleted (single-use)
  const stateAfter = await prisma.oAuthState.findUnique({ where: { state: testState } })
  assert(stateAfter === null, 'OAuth state was consumed and deleted (replay attack prevented)')

  // 6. Project Setup with Repository Metadata
  console.log('\n--- 6. Creating Project with Selected Repository & Branch ---')
  const projectRes = await fetch(`${BASE_URL}/api/projects`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: sessionCookie,
    },
    body: JSON.stringify({
      name: `Webhook Test App ${Date.now()}`,
      description: 'Test application for GitHub webhook triggers',
      repository: 'https://github.com/deployforge-demo/webhook-test-app',
      branch: 'main',
      runtime: 'NODEJS_20',
      buildCommand: 'npm run build',
      startCommand: 'npm start',
      port: 8080,
    }),
  })
  const projectData = await projectRes.json()
  assert(projectRes.status === 201, 'Project created with valid repository URL')
  testProjectId = projectData.data.id

  const dbProject = await prisma.project.findUnique({ where: { id: testProjectId } })
  assert(dbProject?.repoOwner === 'deployforge-demo', 'Stored repoOwner correctly in database')
  assert(dbProject?.repoName === 'webhook-test-app', 'Stored repoName correctly in database')
  assert(dbProject?.repository === 'deployforge-demo/webhook-test-app', 'Normalized repository full name stored')

  // 7. Webhook Signature Verification
  console.log('\n--- 7. Testing GitHub Webhook Signature Verification ---')
  const pingPayload = JSON.stringify({
    zen: 'Design for failure.',
    hook_id: 12345678,
    repository: {
      name: 'webhook-test-app',
      full_name: 'deployforge-demo/webhook-test-app',
    },
  })

  // 7a. Missing signature header
  const noSigRes = await fetch(`${BASE_URL}/api/webhooks/github`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-GitHub-Event': 'ping',
      'X-GitHub-Delivery': crypto.randomUUID(),
    },
    body: pingPayload,
  })
  assert(noSigRes.status === 401, 'Webhook request missing signature rejected with 401')

  // 7b. Invalid / forged signature
  const badSigRes = await fetch(`${BASE_URL}/api/webhooks/github`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-GitHub-Event': 'ping',
      'X-GitHub-Delivery': crypto.randomUUID(),
      'X-Hub-Signature-256': 'sha256=0000000000000000000000000000000000000000000000000000000000000000',
    },
    body: pingPayload,
  })
  assert(badSigRes.status === 401, 'Webhook request with invalid HMAC signature rejected with 401')

  // 7c. Valid signature on ping event
  const pingDeliveryId = crypto.randomUUID()
  const validPingSig = computeSignature(pingPayload, WEBHOOK_SECRET)
  const pingRes = await fetch(`${BASE_URL}/api/webhooks/github`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-GitHub-Event': 'ping',
      'X-GitHub-Delivery': pingDeliveryId,
      'X-Hub-Signature-256': validPingSig,
    },
    body: pingPayload,
  })
  assert(pingRes.status === 200, 'Webhook ping with valid HMAC-SHA256 signature accepted with 200 OK')

  // 8. Webhook Push Event & Pending Deployment Queueing
  console.log('\n--- 8. Testing Push Event Handling & Idempotency ---')
  const pushCommitSha = 'b7e419c8f2a10493821049281734918204918274'
  const pushPayload = JSON.stringify({
    ref: 'refs/heads/main',
    repository: {
      name: 'webhook-test-app',
      full_name: 'deployforge-demo/webhook-test-app',
      html_url: 'https://github.com/deployforge-demo/webhook-test-app',
    },
    head_commit: {
      id: pushCommitSha,
      message: 'feat: add idempotent webhook test handler',
      author: {
        name: 'Alex Morgan',
        email: 'alex@example.com',
      },
      timestamp: new Date().toISOString(),
    },
    sender: {
      login: 'alexmorgan',
    },
  })

  const pushDeliveryId = crypto.randomUUID()
  const validPushSig = computeSignature(pushPayload, WEBHOOK_SECRET)

  const pushRes = await fetch(`${BASE_URL}/api/webhooks/github`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-GitHub-Event': 'push',
      'X-GitHub-Delivery': pushDeliveryId,
      'X-Hub-Signature-256': validPushSig,
    },
    body: pushPayload,
  })
  const pushData = await pushRes.json()
  assert(pushRes.status === 202, 'Push event accepted with 202 Accepted')
  assert(pushData.data.enqueuedDeployments.length === 1, 'Enqueued exactly 1 deployment for matching project')

  const enqueuedDepId = pushData.data.enqueuedDeployments[0]

  // Verify deployment status is strictly PENDING
  const queuedDep = await prisma.deployment.findUnique({
    where: { id: enqueuedDepId },
    include: { stages: true, logs: true },
  })
  assert(queuedDep?.status === 'PENDING', 'Enqueued deployment status is strictly PENDING (no build executed)')
  assert(queuedDep?.trigger === 'WEBHOOK_PUSH', 'Deployment trigger recorded as WEBHOOK_PUSH')
  assert(queuedDep?.commitSha === pushCommitSha, 'Deployment commitSha matches pushed commit')
  assert(Boolean(queuedDep?.stages.every((s) => s.status === 'PENDING')), 'All 7 stages are initialized in PENDING state')
  assert(Boolean(queuedDep?.logs[0]?.message.includes('Isolated build worker in standby')), 'Logged standby message; no host code executed')

  // 8b. Idempotency Test: Resend identical delivery ID
  const duplicatePushRes = await fetch(`${BASE_URL}/api/webhooks/github`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-GitHub-Event': 'push',
      'X-GitHub-Delivery': pushDeliveryId,
      'X-Hub-Signature-256': validPushSig,
    },
    body: pushPayload,
  })
  const duplicateData = await duplicatePushRes.json()
  assert(duplicatePushRes.status === 200, 'Duplicate delivery returns 200 OK')
  assert(duplicateData.data.idempotent === true, 'Duplicate delivery recognized as idempotent')

  // Verify no second deployment was created for this commit
  const depCount = await prisma.deployment.count({
    where: { projectId: testProjectId, commitSha: pushCommitSha },
  })
  assert(depCount === 1, 'Idempotency guaranteed: exactly 1 deployment created despite repeated delivery')

  // 9. Testing Disconnect Operation
  console.log('\n--- 9. Testing Disconnect Operation ---')
  // Seed a GitHubAccount to test disconnection
  await prisma.gitHubAccount.create({
    data: {
      userId: testUserId,
      githubUserId: '12345678',
      githubUsername: 'alexmorgan',
      avatarUrl: 'https://avatars.githubusercontent.com/u/12345678',
      accessTokenEncrypted: encryptToken('gho_sample_token_for_disconnect_test'),
      scope: 'repo,read:user',
    },
  })

  // Verify status is connected
  const connectedCheck = await fetch(`${BASE_URL}/api/integrations/github/status`, {
    headers: { Cookie: sessionCookie },
  })
  const connectedData = await connectedCheck.json()
  assert(connectedData.data.connected === true, 'Status verified as connected')
  assert(connectedData.data.username === 'alexmorgan', 'GitHub username returned')

  // Execute disconnect
  const disconnectRes = await fetch(`${BASE_URL}/api/integrations/github/disconnect`, {
    method: 'POST',
    headers: { Cookie: sessionCookie },
  })
  const disconnectData = await disconnectRes.json()
  assert(disconnectRes.status === 200, 'Disconnect executed with 200 OK')
  assert(disconnectData.data.disconnected === true, 'Response confirms account disconnected')

  // Verify database record removed
  const deletedAccount = await prisma.gitHubAccount.findUnique({ where: { userId: testUserId } })
  assert(deletedAccount === null, 'GitHubAccount credentials removed from database')

  // Verify status is disconnected again
  const postDisconnectStatus = await fetch(`${BASE_URL}/api/integrations/github/status`, {
    headers: { Cookie: sessionCookie },
  })
  const postDisconnectData = await postDisconnectStatus.json()
  assert(postDisconnectData.data.connected === false, 'Status verified as disconnected after disconnect')

  // 10. Cleanup test project
  await prisma.deploymentLog.deleteMany({ where: { deploymentId: enqueuedDepId } })
  await prisma.deploymentStage.deleteMany({ where: { deploymentId: enqueuedDepId } })
  await prisma.deployment.deleteMany({ where: { projectId: testProjectId } })
  await prisma.project.delete({ where: { id: testProjectId } })

  // Summary
  console.log(`\n======================================================`)
  const passedCount = results.filter((r) => r.passed).length
  const failedCount = results.filter((r) => !r.passed).length
  console.log(`  Tests Passed: ${passedCount} / ${results.length}`)
  console.log(`  Tests Failed: ${failedCount}`)
  console.log(`======================================================\n`)

  if (failedCount > 0) {
    process.exit(1)
  }
}

runGitHubTests().catch((err) => {
  console.error('Fatal test runner error:', err)
  process.exit(1)
})
