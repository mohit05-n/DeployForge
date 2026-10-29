const BASE_URL = process.env.APP_URL || 'http://localhost:3000'

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

async function runTests() {
  console.log(`\n========================================`)
  console.log(`   DeployForge Full-Stack Verification   `)
  console.log(`   Base URL: ${BASE_URL}                `)
  console.log(`========================================\n`)

  let sessionCookie = ''
  let createdProjectId = ''
  let deploymentId = ''

  // 1. Health Endpoint
  console.log('--- 1. Testing /api/health ---')
  const healthRes = await fetch(`${BASE_URL}/api/health`)
  const health = await healthRes.json()
  assert(healthRes.status === 200, 'Health endpoint status 200')
  assert(health.status === 'healthy', 'System status is healthy')
  assert(health.components.database.status === 'healthy', 'PostgreSQL database connected and responsive')
  assert(health.components.database.provider === 'PostgreSQL', 'Database provider is PostgreSQL')

  // 2. Authentication: Login
  console.log('\n--- 2. Testing Authentication ---')
  const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'alex.morgan@deployforge.io',
      password: 'Password123!',
    }),
  })
  const loginData = await loginRes.json()
  assert(loginRes.status === 200, 'Login succeeded with 200 OK')
  assert(loginData.success === true, 'Login response success is true')
  assert(loginData.data.user.email === 'alex.morgan@deployforge.io', 'User email returned correctly')
  assert(!('passwordHash' in loginData.data.user), 'Password hash is NEVER exposed in response')

  const setCookie = loginRes.headers.get('set-cookie')
  if (setCookie) {
    sessionCookie = setCookie.split(';')[0]
  }
  assert(Boolean(sessionCookie), 'HTTP-only session cookie issued')

  // 3. Auth Me
  console.log('\n--- 3. Testing Session Management (/api/auth/me) ---')
  const meRes = await fetch(`${BASE_URL}/api/auth/me`, {
    headers: { Cookie: sessionCookie },
  })
  const meData = await meRes.json()
  assert(meRes.status === 200, 'Session verified successfully')
  assert(meData.data.user.name === 'Alex Morgan', 'Active user profile resolved')

  // 4. Unauthorized Access Test
  console.log('\n--- 4. Testing Authorization Boundary (No Auth) ---')
  const unauthRes = await fetch(`${BASE_URL}/api/projects`)
  assert(unauthRes.status === 401, 'Unauthorized request without session rejected with 401')

  // 5. Project CRUD: List
  console.log('\n--- 5. Testing Project Operations (CRUD) ---')
  const listRes = await fetch(`${BASE_URL}/api/projects`, {
    headers: { Cookie: sessionCookie },
  })
  const listData = await listRes.json()
  assert(listRes.status === 200, 'List user-owned projects returned 200')
  assert(Array.isArray(listData.data), 'Projects returned as an array')
  assert(listData.data.length >= 4, `User owns ${listData.data.length} projects`)

  // 5b. Project CRUD: Create
  const uniqueSuffix = Date.now().toString(36)
  const newProjPayload = {
    name: `Order Orchestrator ${uniqueSuffix}`,
    description: 'Saga pattern distributed transaction coordinator',
    repository: `deployforge-demo/order-orchestrator-${uniqueSuffix}`,
    branch: 'main',
    runtime: 'NODEJS_20',
    buildCommand: 'npm run build',
    startCommand: 'npm start',
    port: 5050,
    environment: 'PRODUCTION',
    region: 'us-east-1',
    target: 'ECS_FARGATE',
    envVars: [
      { key: 'KAFKA_BROKERS', value: 'kafka.internal:9092', isSecret: false },
      { key: 'DB_SECRET_PASSWORD', value: 'my_top_secret_db_pass_123', isSecret: true },
    ],
  }

  const createRes = await fetch(`${BASE_URL}/api/projects`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: sessionCookie,
    },
    body: JSON.stringify(newProjPayload),
  })
  const createData = await createRes.json()
  assert(createRes.status === 201, 'Project created with 201 Created')
  createdProjectId = createData.data.id
  assert(Boolean(createdProjectId), `Created project ID: ${createdProjectId}`)

  // 5c. Project CRUD: Read Single
  const readRes = await fetch(`${BASE_URL}/api/projects/${createdProjectId}`, {
    headers: { Cookie: sessionCookie },
  })
  const readData = await readRes.json()
  assert(readRes.status === 200, 'Read project by ID succeeded with 200')
  assert(readData.data.name === newProjPayload.name, 'Project name matched')
  const secretVar = readData.data.envVars.find((v: any) => v.key === 'DB_SECRET_PASSWORD')
  assert(secretVar && secretVar.value.includes('•••'), 'Server-side secret env var is masked in response')

  // 5d. Project CRUD: Update
  const updateRes = await fetch(`${BASE_URL}/api/projects/${createdProjectId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Cookie: sessionCookie,
    },
    body: JSON.stringify({
      description: 'Updated Saga coordinator with OpenTelemetry tracing',
      port: 5051,
    }),
  })
  const updateData = await updateRes.json()
  assert(updateRes.status === 200, 'Project updated with 200 OK')
  assert(updateData.data.port === 5051, 'Updated port value verified in database')

  // 6. Deployments & Stage Tracking
  console.log('\n--- 6. Testing Deployment Pipeline & Stages ---')
  const deployRes = await fetch(`${BASE_URL}/api/deployments`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: sessionCookie,
    },
    body: JSON.stringify({
      projectId: createdProjectId,
      commitMessage: 'feat(saga): integrate traceparent context propagation',
    }),
  })
  const deployData = await deployRes.json()
  assert(deployRes.status === 201, 'Deployment initiated with 201 Created')
  deploymentId = deployData.data.id
  assert(Boolean(deploymentId), `Triggered deployment ID: ${deploymentId}`)
  assert(deployData.data.stages.length >= 6, `Initialized with ${deployData.data.stages.length} pipeline stages`)

  // 6b. Deployment Details & Logs
  const depDetailRes = await fetch(`${BASE_URL}/api/deployments/${deploymentId}`, {
    headers: { Cookie: sessionCookie },
  })
  const depDetailData = await depDetailRes.json()
  assert(depDetailRes.status === 200, 'Deployment details fetched with 200 OK')
  assert(depDetailData.data.logs.length > 0, `Captured ${depDetailData.data.logs.length} deployment log entries`)

  // 6c. Deployment Retry
  const retryRes = await fetch(`${BASE_URL}/api/deployments/${deploymentId}/retry`, {
    method: 'POST',
    headers: { Cookie: sessionCookie },
  })
  const retryData = await retryRes.json()
  assert(retryRes.status === 201, 'Deployment retry triggered with 201 Created')
  assert(retryData.data.commitMessage.startsWith('[Retry]'), 'Retry commit message tracked properly')

  // 7. Integrations (Preserving Mock Contract)
  console.log('\n--- 7. Testing Integrations & Explicit Mock Contract ---')
  const syncRes = await fetch(`${BASE_URL}/api/integrations/sync`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: sessionCookie,
    },
    body: JSON.stringify({}),
  })
  const syncData = await syncRes.json()
  assert(syncRes.status === 200, 'Integration sync completed with 200 OK')
  assert(syncData.data.every((i: any) => i.isSimulated === true), 'All external integrations explicitly report isSimulated: true')

  // 8. Audit Events
  console.log('\n--- 8. Testing Audit Logging ---')
  const auditRes = await fetch(`${BASE_URL}/api/audit`, {
    headers: { Cookie: sessionCookie },
  })
  const auditData = await auditRes.json()
  assert(auditRes.status === 200, 'Audit logs retrieved with 200 OK')
  assert(auditData.data.length >= 3, `Recorded ${auditData.data.length} security audit events in PostgreSQL`)
  const actions = auditData.data.map((a: any) => a.action)
  assert(actions.includes('PROJECT_CREATE'), 'Audit event includes PROJECT_CREATE')
  assert(actions.includes('DEPLOYMENT_TRIGGER'), 'Audit event includes DEPLOYMENT_TRIGGER')

  // 9. Multi-Tenant Authorization Enforcement
  console.log('\n--- 9. Testing Cross-Tenant Authorization Isolation ---')
  // Login as devUser
  const devLoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'dev@deployforge.io',
      password: 'Password123!',
    }),
  })
  const devCookie = devLoginRes.headers.get('set-cookie')?.split(';')[0] || ''

  // devUser tries to read Alex's project
  const crossTenantRes = await fetch(`${BASE_URL}/api/projects/${createdProjectId}`, {
    headers: { Cookie: devCookie },
  })
  assert(crossTenantRes.status === 404, 'Cross-user project access properly denied with 404/403')

  // 10. Project CRUD: Delete
  console.log('\n--- 10. Testing Project Deletion ---')
  const deleteRes = await fetch(`${BASE_URL}/api/projects/${createdProjectId}`, {
    method: 'DELETE',
    headers: { Cookie: sessionCookie },
  })
  assert(deleteRes.status === 200, 'Project deleted with 200 OK')

  // Verify deletion
  const verifyDeletedRes = await fetch(`${BASE_URL}/api/projects/${createdProjectId}`, {
    headers: { Cookie: sessionCookie },
  })
  assert(verifyDeletedRes.status === 404, 'Deleted project no longer accessible (404)')

  // Summary
  console.log(`\n========================================`)
  const passedCount = results.filter((r) => r.passed).length
  const failedCount = results.filter((r) => !r.passed).length
  console.log(`  Tests Passed: ${passedCount} / ${results.length}`)
  console.log(`  Tests Failed: ${failedCount}`)
  console.log(`========================================\n`)

  if (failedCount > 0) {
    process.exit(1)
  }
}

runTests().catch((err) => {
  console.error('Fatal test runner error:', err)
  process.exit(1)
})
