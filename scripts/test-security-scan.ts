/**
 * DeployForge Trivy Security Scanning Automated Verification Test Suite
 *
 * Verifies:
 * 1. Normalization & Sanitization (file paths, secrets, CVE fields)
 * 2. Clean Image Scan (Passed)
 * 3. Blocking Findings (Policy Violation, pipeline fails)
 * 4. Non-Blocking Findings (Warnings allowed, pipeline succeeds)
 * 5. Scanner Database Download Error (Isolated error, not clean)
 * 6. Scanner Timeout Handling
 * 7. Scanner Unavailable Handling (Not silently treated as clean)
 * 8. Malformed Report Handling
 * 9. Database & Pipeline Stage Integration (Exact image tag, deployment association)
 * 10. Real Docker Trivy Container Scan
 */

import { prisma } from '../src/lib/prisma'
import {
  normalizeTrivyReport,
  sanitizeLog,
  sanitizeReportObject,
} from '../src/lib/server/security/normalizer'
import { MockTrivyScanner } from '../src/lib/server/security/mock-scanner'
import { DockerTrivyScanner } from '../src/lib/server/security/docker-scanner'
import {
  executeSecurityScanForDeployment,
  executeDirectSecurityScan,
} from '../src/lib/server/security'

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

async function runSecurityTests() {
  console.log('\n======================================================')
  console.log('   DeployForge Trivy Security Scanning Test Suite    ')
  console.log('======================================================\n')

  // --------------------------------------------------------------------------
  // TEST 1: Sanitizer & Log Redaction
  // --------------------------------------------------------------------------
  console.log('--- 1. Testing Sanitizer & Log Redaction ---')
  const rawLogWithPathsAndSecrets =
    'Loaded secret: password="my_super_secret_pw123!" in file E:\\DeployForge\\src\\app.ts and /var/jenkins_home/workspace/build'
  const sanitized = sanitizeLog(rawLogWithPathsAndSecrets)

  assert(
    !sanitized.includes('my_super_secret_pw123!'),
    'Passwords and secrets are redacted from logs'
  )
  assert(
    !sanitized.includes('E:\\DeployForge'),
    'Windows host paths are scrubbed from logs'
  )
  assert(
    !sanitized.includes('/var/jenkins_home'),
    'Jenkins internal paths are scrubbed from logs'
  )
  assert(
    sanitized.includes('<sanitized-path>'),
    'Sensitive paths replaced with <sanitized-path>'
  )

  const rawObj = {
    cve: 'CVE-2023-1234',
    filePath: 'E:\\DeployForge\\package.json',
    nested: { internalDir: '/app/node_modules/foo' },
  }
  const cleanObj = sanitizeReportObject(rawObj)
  assert(
    cleanObj.filePath === '<sanitized-path>',
    'Object file paths recursively sanitized'
  )

  // --------------------------------------------------------------------------
  // TEST 2: Normalization & Severity Threshold Logic
  // --------------------------------------------------------------------------
  console.log('\n--- 2. Testing Report Normalization & Severity Thresholds ---')
  const sampleReport = {
    Results: [
      {
        Target: 'app:latest',
        Vulnerabilities: [
          {
            VulnerabilityID: 'CVE-2023-45853',
            PkgName: 'zlib',
            InstalledVersion: '1.2.11',
            FixedVersion: '1.2.12',
            Severity: 'CRITICAL',
            Title: 'zlib overflow',
            Description: 'Integer overflow in MiniZip',
          },
          {
            VulnerabilityID: 'CVE-2023-5363',
            PkgName: 'openssl',
            InstalledVersion: '3.0.8',
            Severity: 'HIGH',
            Title: 'openssl key length',
          },
          {
            VulnerabilityID: 'CVE-2024-1111',
            PkgName: 'curl',
            InstalledVersion: '7.8.0',
            Severity: 'MEDIUM',
            Title: 'curl medium issue',
          },
        ],
      },
    ],
  }

  // Threshold: CRITICAL -> Policy violated because 1 CRITICAL exists
  const normCrit = normalizeTrivyReport(sampleReport, 'CRITICAL')
  assert(normCrit.summary.critical === 1, 'Summary correctly counts 1 Critical')
  assert(normCrit.summary.high === 1, 'Summary correctly counts 1 High')
  assert(normCrit.summary.medium === 1, 'Summary correctly counts 1 Medium')
  assert(normCrit.summary.total === 3, 'Summary total is 3')
  assert(normCrit.blockingPolicyViolated === true, 'Policy violation flagged when CRITICAL >= CRITICAL')

  // Normalization extracts all standard fields
  const v1 = normCrit.vulnerabilities[0]
  assert(v1.cveId === 'CVE-2023-45853', 'Normalized CVE ID matches')
  assert(v1.packageName === 'zlib', 'Normalized Package matches')
  assert(v1.installedVersion === '1.2.11', 'Normalized Installed version matches')
  assert(v1.fixedVersion === '1.2.12', 'Normalized Fixed version matches')
  assert(v1.severity === 'CRITICAL', 'Normalized Severity matches')

  // --------------------------------------------------------------------------
  // TEST 3: Mock Scanner - Clean Image (Passed)
  // --------------------------------------------------------------------------
  console.log('\n--- 3. Testing Clean Image Scan ---')
  const mockScanner = new MockTrivyScanner('clean')
  const cleanResult = await mockScanner.scan({
    imageTag: 'deployforge-clean:v1.0.0',
    projectId: 'test-proj',
    commitSha: 'a1b2c3d4',
    severityThreshold: 'CRITICAL',
  })

  assert(cleanResult.success === true, 'Clean scan success is true')
  assert(cleanResult.status === 'COMPLETED', 'Clean scan status is COMPLETED')
  assert(cleanResult.scanResult === 'PASSED', 'Clean scan result is PASSED')
  assert(cleanResult.blockingPolicyViolated === false, 'Clean scan policy violation is false')
  assert(cleanResult.summary.total === 0, 'Clean scan total vulnerabilities is 0')
  assert(cleanResult.vulnerabilities.length === 0, 'No vulnerabilities in clean image')

  // --------------------------------------------------------------------------
  // TEST 4: Mock Scanner - Blocking Policy Violation
  // --------------------------------------------------------------------------
  console.log('\n--- 4. Testing Blocking Policy Violation ---')
  const blockingScanner = new MockTrivyScanner('blocking')
  const blockResult = await blockingScanner.scan({
    imageTag: 'deployforge-vuln:v1.0.0',
    projectId: 'test-proj',
    commitSha: 'b2c3d4e5',
    severityThreshold: 'CRITICAL',
  })

  assert(blockResult.success === false, 'Blocking scan success is false')
  assert(blockResult.status === 'COMPLETED', 'Blocking scan status is COMPLETED (scan executed)')
  assert(blockResult.scanResult === 'BLOCKED', 'Blocking scan result is BLOCKED')
  assert(blockResult.blockingPolicyViolated === true, 'Blocking policy violation is true')
  assert(
    Boolean(blockResult.errorMessage?.includes('Policy violation')),
    'Error message clearly states policy violation'
  )

  // --------------------------------------------------------------------------
  // TEST 5: Mock Scanner - Non-Blocking Findings (Below Threshold)
  // --------------------------------------------------------------------------
  console.log('\n--- 5. Testing Non-Blocking Findings ---')
  const nonBlockScanner = new MockTrivyScanner('non_blocking')
  // Medium/Low findings scanned against HIGH threshold -> Passes without blocking
  const nonBlockResult = await nonBlockScanner.scan({
    imageTag: 'deployforge-warn:v1.0.0',
    projectId: 'test-proj',
    commitSha: 'c3d4e5f6',
    severityThreshold: 'HIGH',
  })

  assert(nonBlockResult.success === true, 'Non-blocking scan success is true')
  assert(nonBlockResult.scanResult === 'PASSED', 'Non-blocking scan result is PASSED')
  assert(nonBlockResult.blockingPolicyViolated === false, 'Policy violation is false')
  assert(nonBlockResult.summary.medium > 0, 'Medium vulnerabilities detected but non-blocking')

  // --------------------------------------------------------------------------
  // TEST 6: Scanner DB Download Error (Scanner Error vs Policy Failure)
  // --------------------------------------------------------------------------
  console.log('\n--- 6. Testing Scanner Database Download Error Handling ---')
  const dbErrorScanner = new MockTrivyScanner('db_download_error')
  const dbErrResult = await dbErrorScanner.scan({
    imageTag: 'deployforge-target:v1.0.0',
    projectId: 'test-proj',
    commitSha: 'd4e5f6a1',
  })

  assert(dbErrResult.success === false, 'DB error scan success is false')
  assert(dbErrResult.status === 'FAILED', 'DB error status is FAILED')
  assert(dbErrResult.scanResult === 'ERROR', 'DB error result is ERROR (distinct from BLOCKED)')
  assert(dbErrResult.errorCategory === 'DB_DOWNLOAD_ERROR', 'Error category is DB_DOWNLOAD_ERROR')
  assert(
    Boolean(dbErrResult.errorMessage?.includes('database update failed')),
    'Error message describes DB download failure'
  )
  assert(dbErrResult.blockingPolicyViolated === false, 'Scanner error is NOT confused with policy violation')

  // --------------------------------------------------------------------------
  // TEST 7: Scanner Timeout Handling
  // --------------------------------------------------------------------------
  console.log('\n--- 7. Testing Scanner Timeout Handling ---')
  const timeoutScanner = new MockTrivyScanner('timeout')
  const timeoutResult = await timeoutScanner.scan(
    {
      imageTag: 'deployforge-slow:v1.0.0',
      projectId: 'test-proj',
      commitSha: 'e5f6a1b2',
    },
    { timeoutSeconds: 5 }
  )

  assert(timeoutResult.success === false, 'Timeout scan success is false')
  assert(timeoutResult.status === 'FAILED', 'Timeout status is FAILED')
  assert(timeoutResult.scanResult === 'ERROR', 'Timeout result is ERROR')
  assert(timeoutResult.errorCategory === 'TIMEOUT', 'Error category is TIMEOUT')
  assert(timeoutResult.durationSeconds === 5, 'Duration matches timeout threshold')

  // --------------------------------------------------------------------------
  // TEST 8: Unavailable Scanner (Never silently treat as clean!)
  // --------------------------------------------------------------------------
  console.log('\n--- 8. Testing Scanner Unavailable Handling ---')
  const unavailScanner = new MockTrivyScanner('scanner_unavailable')
  const unavailResult = await unavailScanner.scan({
    imageTag: 'deployforge-missing:v1.0.0',
    projectId: 'test-proj',
    commitSha: 'f6a1b2c3',
  })

  assert(unavailResult.success === false, 'Unavailable scanner success is false')
  assert(unavailResult.status === 'FAILED', 'Unavailable scanner status is FAILED')
  assert(unavailResult.scanResult === 'ERROR', 'Unavailable scanner result is ERROR')
  assert(
    unavailResult.errorCategory === 'SCANNER_UNAVAILABLE',
    'Error category is SCANNER_UNAVAILABLE'
  )
  assert(
    unavailResult.summary.total === 0 && unavailResult.success === false,
    'Unavailable scanner is NOT silently treated as a clean scan'
  )

  // --------------------------------------------------------------------------
  // TEST 9: Malformed Report Handling
  // --------------------------------------------------------------------------
  console.log('\n--- 9. Testing Malformed Report Handling ---')
  const malformedScanner = new MockTrivyScanner('malformed_report')
  const malformedResult = await malformedScanner.scan({
    imageTag: 'deployforge-corrupt:v1.0.0',
    projectId: 'test-proj',
    commitSha: 'a2b3c4d5',
  })

  assert(malformedResult.success === false, 'Malformed report success is false')
  assert(malformedResult.status === 'FAILED', 'Malformed report status is FAILED')
  assert(malformedResult.errorCategory === 'MALFORMED_OUTPUT', 'Error category is MALFORMED_OUTPUT')

  // --------------------------------------------------------------------------
  // TEST 10: Database Pipeline Integration & Stage Tracking
  // --------------------------------------------------------------------------
  console.log('\n--- 10. Testing Database Pipeline Stage Integration ---')

  // Find or create test user and project
  let testUser = await prisma.user.findFirst()
  if (!testUser) {
    testUser = await prisma.user.create({
      data: {
        email: 'trivy.tester@deployforge.io',
        name: 'Trivy Tester',
        passwordHash: 'dummyhash',
      },
    })
  }

  const testProject = await prisma.project.create({
    data: {
      userId: testUser.id,
      name: 'Security Test App',
      slug: `sec-test-${Date.now()}`,
      repository: 'https://github.com/deployforge/security-test',
      securityThreshold: 'CRITICAL',
    },
  })

  const testDeployment = await prisma.deployment.create({
    data: {
      projectId: testProject.id,
      commitSha: '7f9a8b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a',
      commitMessage: 'feat: add security scanning test',
      branch: 'main',
      author: 'SecurityBot',
      status: 'RUNNING',
      dockerImageTag: `deployforge-test:${testProject.slug}-img`,
    },
  })

  // 10A: Execute Scan with Blocking Policy Violation on Deployment
  const dbScanResult = await executeSecurityScanForDeployment(testDeployment.id, {
    scannerType: 'mock',
    mockScenario: 'blocking',
  })

  assert(dbScanResult.blockingPolicyViolated === true, 'Deployment scan flagged policy violation')

  // Verify Deployment updated to FAILED with policy explanation
  const updatedDeployment = await prisma.deployment.findUnique({
    where: { id: testDeployment.id },
    include: { stages: true, logs: true },
  })

  assert(updatedDeployment?.status === 'FAILED', 'Deployment status updated to FAILED on policy violation')

  const scanStage = updatedDeployment?.stages.find((s) => s.name === 'SECURITY_SCAN')
  assert(Boolean(scanStage), 'SECURITY_SCAN stage created in deployment')
  assert(scanStage?.status === 'FAILED', 'SECURITY_SCAN stage marked FAILED')
  assert(
    Boolean(scanStage?.errorMessage?.includes('Policy violation')),
    'Stage error message clearly cites policy violation'
  )

  // Verify SecurityScan and VulnerabilityRecord rows in PostgreSQL
  const savedScan = await prisma.securityScan.findFirst({
    where: { deploymentId: testDeployment.id },
    include: { vulnerabilities: true },
  })

  assert(Boolean(savedScan), 'SecurityScan record saved in database')
  assert(savedScan?.scanResult === 'BLOCKED', 'Saved scan result is BLOCKED')
  assert(savedScan?.commitSha === testDeployment.commitSha, 'Scan associated with exact commit SHA')
  assert(savedScan?.imageTag === testDeployment.dockerImageTag, 'Scan associated with exact immutable image tag')
  assert(savedScan?.vulnerabilities.length === 3, 'All 3 normalized vulnerabilities saved in DB')
  assert(Boolean(savedScan?.rawReportJson), 'Sanitized machine-readable report JSON persisted')

  // Verify deployment logs exist
  const scanLogs = updatedDeployment?.logs.filter((l) => l.stageName === 'SECURITY_SCAN')
  assert((scanLogs?.length || 0) > 0, 'Audit logs recorded for SECURITY_SCAN stage')

  // 10B: Execute Direct Security Scan (Clean)
  const directResult = await executeDirectSecurityScan(
    testProject.id,
    'deployforge-direct:clean',
    {
      scannerType: 'mock',
      mockScenario: 'clean',
    }
  )
  assert(directResult.success === true, 'Direct on-demand scan succeeded')
  assert(directResult.scanResult === 'PASSED', 'Direct scan result is PASSED')

  // --------------------------------------------------------------------------
  // TEST 11: Real Docker Trivy Container Worker (Local Image Scan)
  // --------------------------------------------------------------------------
  console.log('\n--- 11. Testing Real Local Docker Trivy Container Worker ---')
  const dockerScanner = new DockerTrivyScanner()
  const dockerAvailable = await dockerScanner.isAvailable()

  if (dockerAvailable.available) {
    console.log(`  Docker Trivy Version detected: ${dockerAvailable.version}`)
    assert(true, 'Docker Trivy worker is available locally')

    // Scan the local lightweight alpine/node image
    console.log('  Running real Trivy container scan on node:20-alpine...')
    const realScan = await dockerScanner.scan(
      {
        imageTag: 'node:20-alpine',
        projectId: testProject.id,
        commitSha: 'head-real',
        severityThreshold: 'CRITICAL',
      },
      { timeoutSeconds: 180 }
    )

    console.log(`  Real Scan Finished: Status=${realScan.status}, Result=${realScan.scanResult}`)
    console.log(`  Findings: ${realScan.summary.critical} Crit, ${realScan.summary.high} High, ${realScan.summary.medium} Med, ${realScan.summary.low} Low (Total: ${realScan.summary.total})`)

    if (realScan.status !== 'COMPLETED') {
      console.error(`  Scan Error Details: ${realScan.errorMessage} (Category: ${realScan.errorCategory})`)
      console.error(`  Scan Logs:`, realScan.logs)
    }

    assert(
      realScan.status === 'COMPLETED',
      'Real Docker Trivy scan completed successfully'
    )
    assert(
      realScan.rawSanitizedReport.length > 50,
      'Real machine-readable JSON report generated'
    )
    assert(
      !realScan.rawSanitizedReport.includes('E:\\'),
      'Real report is free of host file paths'
    )
  } else {
    console.log(`  Docker Trivy unavailable: ${dockerAvailable.error} (Skipping live container scan)`)
  }

  // Cleanup test records
  await prisma.project.delete({ where: { id: testProject.id } }).catch(() => {})

  // --------------------------------------------------------------------------
  // Summary
  // --------------------------------------------------------------------------
  console.log('\n======================================================')
  console.log('                 TEST SUMMARY')
  console.log('======================================================')
  const passedCount = results.filter((r) => r.passed).length
  const failedCount = results.filter((r) => !r.passed).length

  console.log(`Total Tests : ${results.length}`)
  console.log(`Passed      : ${passedCount}`)
  console.log(`Failed      : ${failedCount}`)

  if (failedCount > 0) {
    console.error('\n❌ SOME TESTS FAILED!')
    process.exit(1)
  } else {
    console.log('\n✅ ALL SECURITY SCANNING INTEGRATION TESTS PASSED!')
  }
}

runSecurityTests()
  .catch((err) => {
    console.error('Unhandled test suite error:', err)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
