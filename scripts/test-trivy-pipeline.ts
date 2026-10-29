/**
 * Automated Verification Test Suite for Trivy Jenkins Pipeline Integration
 *
 * Verifies:
 * 1. Clean report parsing & gate pass.
 * 2. Blocking findings (Critical & High) & gate violation.
 * 3. Secret findings detection in reports.
 * 4. Lower-severity filtering under HIGH,CRITICAL gate.
 * 5. Missing report file handling (SCANNER_ERROR).
 * 6. Malformed JSON report handling (MALFORMED_OUTPUT).
 * 7. Policy violation vs Scanner error distinction.
 * 8. Summary output persistence.
 * 9. Jenkins callback payload structure & authorization.
 */

import * as fs from 'fs'
import * as path from 'path'
import { parseTrivyReport } from './parse-trivy-report'
import { generateCallbackToken, verifyCallbackToken } from '../src/lib/server/jenkins/security'

let totalTests = 0
let passedTests = 0

function assert(condition: boolean, testName: string, detail?: string) {
  totalTests++
  if (condition) {
    passedTests++
    console.log(`  ✅ PASS: ${testName}`)
  } else {
    console.error(`  ❌ FAIL: ${testName}`)
    if (detail) console.error(`     Detail: ${detail}`)
    throw new Error(`Test failed: ${testName}`)
  }
}

async function runTrivyPipelineTests() {
  console.log('======================================================')
  console.log('    DeployForge Trivy Pipeline Integration Tests     ')
  console.log('======================================================\n')

  const tempDir = path.join(process.cwd(), '.temp_trivy_test')
  fs.mkdirSync(tempDir, { recursive: true })

  try {
    // ------------------------------------------------------------------------
    // 1. Clean Report Test
    // ------------------------------------------------------------------------
    console.log('--- 1. Testing Clean Trivy Report Parsing ---')
    const cleanReportPath = path.join(tempDir, 'clean-report.json')
    fs.writeFileSync(
      cleanReportPath,
      JSON.stringify({
        SchemaVersion: 2,
        Results: [
          {
            Target: 'deployforge-app:latest (alpine 3.23.4)',
            Class: 'os-pkgs',
            Type: 'alpine',
            Vulnerabilities: [],
          },
          {
            Target: 'Node.js',
            Class: 'lang-pkgs',
            Type: 'node-pkg',
            Vulnerabilities: [],
          },
        ],
      })
    )

    const cleanResult = parseTrivyReport({
      reportPath: cleanReportPath,
      imageTag: 'deployforge-app:v1.0.0',
      severityGate: 'HIGH,CRITICAL',
    })

    assert(cleanResult.status === 'COMPLETED', 'Clean scan status is COMPLETED')
    assert(cleanResult.scanResult === 'PASSED', 'Clean scan result is PASSED')
    assert(cleanResult.blockingPolicyViolated === false, 'blockingPolicyViolated is false')
    assert(cleanResult.criticalCount === 0, 'Critical count is 0')
    assert(cleanResult.highCount === 0, 'High count is 0')
    assert(cleanResult.totalCount === 0, 'Total count is 0')
    assert(cleanResult.vulnerabilities.length === 0, 'No vulnerabilities extracted')

    // ------------------------------------------------------------------------
    // 2. Blocking Findings Test (Critical & High)
    // ------------------------------------------------------------------------
    console.log('\n--- 2. Testing Blocking Findings Policy Gate ---')
    const blockingReportPath = path.join(tempDir, 'blocking-report.json')
    fs.writeFileSync(
      blockingReportPath,
      JSON.stringify({
        SchemaVersion: 2,
        Results: [
          {
            Target: 'deployforge-app:latest (alpine 3.23.4)',
            Class: 'os-pkgs',
            Type: 'alpine',
            Vulnerabilities: [
              {
                VulnerabilityID: 'CVE-2026-99999',
                PkgName: 'openssl',
                InstalledVersion: '3.1.0',
                FixedVersion: '3.1.1',
                Severity: 'CRITICAL',
                Title: 'Remote Code Execution in OpenSSL',
              },
            ],
          },
          {
            Target: 'Node.js',
            Class: 'lang-pkgs',
            Type: 'node-pkg',
            Vulnerabilities: [
              {
                VulnerabilityID: 'CVE-2026-88888',
                PkgName: 'next',
                InstalledVersion: '15.0.0',
                FixedVersion: '15.5.28',
                Severity: 'HIGH',
                Title: 'Prototype Pollution in Next.js',
              },
            ],
          },
        ],
      })
    )

    const blockingResult = parseTrivyReport({
      reportPath: blockingReportPath,
      imageTag: 'deployforge-app:v1.0.0',
      severityGate: 'HIGH,CRITICAL',
    })

    assert(blockingResult.status === 'COMPLETED', 'Blocking scan status is COMPLETED')
    assert(blockingResult.scanResult === 'BLOCKED', 'Blocking scan result is BLOCKED')
    assert(blockingResult.blockingPolicyViolated === true, 'blockingPolicyViolated is true')
    assert(blockingResult.criticalCount === 1, 'Correctly counts 1 Critical')
    assert(blockingResult.highCount === 1, 'Correctly counts 1 High')
    assert(blockingResult.totalCount === 2, 'Total count is 2')
    assert(Boolean(blockingResult.errorMessage?.includes('Found 2 blocking findings')), 'Error message cites 2 blocking findings')

    // ------------------------------------------------------------------------
    // 3. Secret Findings Detection Test
    // ------------------------------------------------------------------------
    console.log('\n--- 3. Testing Secret Token Detection in Reports ---')
    const secretReportPath = path.join(tempDir, 'secret-report.json')
    fs.writeFileSync(
      secretReportPath,
      JSON.stringify({
        SchemaVersion: 2,
        Results: [
          {
            Target: 'prisma/seed.ts',
            Class: 'secret',
            Secrets: [
              {
                RuleID: 'stripe-secret-token',
                Category: 'Stripe',
                Severity: 'CRITICAL',
                Title: 'Stripe API Secret Key',
                Target: 'prisma/seed.ts',
              },
            ],
          },
        ],
      })
    )

    const secretResult = parseTrivyReport({
      reportPath: secretReportPath,
      severityGate: 'HIGH,CRITICAL',
    })

    assert(secretResult.scanResult === 'BLOCKED', 'Secret finding triggers BLOCKED result')
    assert(secretResult.criticalCount === 1, 'Secret classified as Critical finding')
    assert(secretResult.vulnerabilities[0].cveId === 'SECRET-stripe-secret-token', 'Secret CVE ID mapped properly')

    // ------------------------------------------------------------------------
    // 4. Non-Blocking Medium/Low Findings Test
    // ------------------------------------------------------------------------
    console.log('\n--- 4. Testing Non-Blocking Severities Under Gate ---')
    const nonBlockingReportPath = path.join(tempDir, 'nonblocking-report.json')
    fs.writeFileSync(
      nonBlockingReportPath,
      JSON.stringify({
        SchemaVersion: 2,
        Results: [
          {
            Target: 'Node.js',
            Vulnerabilities: [
              {
                VulnerabilityID: 'CVE-2025-11111',
                PkgName: 'cookie',
                InstalledVersion: '0.6.0',
                Severity: 'MEDIUM',
              },
              {
                VulnerabilityID: 'CVE-2025-22222',
                PkgName: 'debug',
                InstalledVersion: '4.3.0',
                Severity: 'LOW',
              },
            ],
          },
        ],
      })
    )

    const nonBlockingResult = parseTrivyReport({
      reportPath: nonBlockingReportPath,
      severityGate: 'HIGH,CRITICAL',
    })

    assert(nonBlockingResult.scanResult === 'PASSED', 'Medium/Low findings pass HIGH,CRITICAL gate')
    assert(nonBlockingResult.blockingPolicyViolated === false, 'Policy not violated by Medium/Low')
    assert(nonBlockingResult.mediumCount === 1, 'Medium count is 1')
    assert(nonBlockingResult.lowCount === 1, 'Low count is 1')
    assert(nonBlockingResult.totalCount === 2, 'Total count is 2')

    // ------------------------------------------------------------------------
    // 5. Missing Report File Test (Scanner Error)
    // ------------------------------------------------------------------------
    console.log('\n--- 5. Testing Missing Report Handling ---')
    const missingResult = parseTrivyReport({
      reportPath: path.join(tempDir, 'non-existent-report.json'),
      severityGate: 'HIGH,CRITICAL',
    })

    assert(missingResult.status === 'FAILED', 'Missing report status is FAILED')
    assert(missingResult.scanResult === 'ERROR', 'Missing report scanResult is ERROR')
    assert(missingResult.errorCategory === 'MISSING_REPORT', 'errorCategory is MISSING_REPORT')
    assert(missingResult.blockingPolicyViolated === false, 'Scanner failure is NOT treated as policy violation')

    // ------------------------------------------------------------------------
    // 6. Malformed Report File Test (Scanner Error)
    // ------------------------------------------------------------------------
    console.log('\n--- 6. Testing Malformed JSON Report Handling ---')
    const malformedReportPath = path.join(tempDir, 'corrupted-report.json')
    fs.writeFileSync(malformedReportPath, '{"SchemaVersion": 2, "Results": [ TRUNCATED CONTENT...')

    const malformedResult = parseTrivyReport({
      reportPath: malformedReportPath,
      severityGate: 'HIGH,CRITICAL',
    })

    assert(malformedResult.status === 'FAILED', 'Malformed report status is FAILED')
    assert(malformedResult.scanResult === 'ERROR', 'Malformed report scanResult is ERROR')
    assert(malformedResult.errorCategory === 'MALFORMED_OUTPUT', 'errorCategory is MALFORMED_OUTPUT')

    // ------------------------------------------------------------------------
    // 7. Summary JSON Output Persistence Test
    // ------------------------------------------------------------------------
    console.log('\n--- 7. Testing Summary File Output Generation ---')
    const summaryOutputPath = path.join(tempDir, 'output-summary.json')
    parseTrivyReport({
      reportPath: cleanReportPath,
      imageTag: 'deployforge-app:test-tag',
      severityGate: 'HIGH,CRITICAL',
      summaryOutputPath,
    })

    assert(fs.existsSync(summaryOutputPath), 'summaryOutputPath file was created')
    const savedSummary = JSON.parse(fs.readFileSync(summaryOutputPath, 'utf8'))
    assert(savedSummary.imageTag === 'deployforge-app:test-tag', 'Persisted imageTag matches')
    assert(savedSummary.scanResult === 'PASSED', 'Persisted scanResult matches')
    assert(savedSummary.scannerVersion === '0.76.1', 'Persisted scannerVersion matches')

    // ------------------------------------------------------------------------
    // 8. Jenkins Callback Authorization & Payload Test
    // ------------------------------------------------------------------------
    console.log('\n--- 8. Testing Jenkins Callback Token Authorization ---')
    const testDeploymentId = 'dep_test_sec_jenkins_123'
    const testProjectId = 'proj_test_sec_456'
    const token = generateCallbackToken(testDeploymentId, testProjectId)
    assert(Boolean(token && token.length > 20), 'Generated valid HMAC callback token')

    const verifiedWithBearer = verifyCallbackToken(`Bearer ${token}`, testDeploymentId)
    assert(verifiedWithBearer === true, 'Successfully verified Bearer token for deployment')

    const rejectedMismatched = verifyCallbackToken(`Bearer ${token}`, 'different_dep_id')
    assert(rejectedMismatched === false, 'Strictly rejects token with mismatched deploymentId')

    const rejectedInvalid = verifyCallbackToken('Bearer invalid_token_xyz', testDeploymentId)
    assert(rejectedInvalid === false, 'Strictly rejects tampered or invalid token')

    // ------------------------------------------------------------------------
    // 9. Amazon ECR Repository URI Format Validation Tests
    // ------------------------------------------------------------------------
    console.log('\n--- 9. Testing Amazon ECR Repository URI Format Validation ---')
    const ecrPattern = /^[0-9]{12}\.dkr\.ecr\.[a-z0-9-]+\.amazonaws\.com(\.cn)?\/[a-zA-Z0-9_\-\/]+$/

    const validMumbaiUri = '123456789012.dkr.ecr.ap-south-1.amazonaws.com/deployforge-app'
    assert(ecrPattern.test(validMumbaiUri), 'Accepts valid AWS Mumbai ECR repository URI')

    const validNestedUri = '987654321098.dkr.ecr.us-east-1.amazonaws.com/deployforge/backend-service'
    assert(ecrPattern.test(validNestedUri), 'Accepts valid nested repository path')

    const invalidShortAccountId = '12345.dkr.ecr.ap-south-1.amazonaws.com/deployforge-app'
    assert(!ecrPattern.test(invalidShortAccountId), 'Rejects non-12-digit AWS account ID')

    const invalidNonEcrDomain = '123456789012.dkr.gcr.ap-south-1.amazonaws.com/deployforge-app'
    assert(!ecrPattern.test(invalidNonEcrDomain), 'Rejects non-ECR registry domain')

    const invalidNoRepoName = '123456789012.dkr.ecr.ap-south-1.amazonaws.com/'
    assert(!ecrPattern.test(invalidNoRepoName), 'Rejects URI missing repository name')

    const invalidRawUrl = 'https://123456789012.dkr.ecr.ap-south-1.amazonaws.com/deployforge-app'
    assert(!ecrPattern.test(invalidRawUrl), 'Rejects URI containing http/https scheme prefix')

    console.log('\n======================================================')
    console.log('                 TEST SUMMARY')
    console.log('======================================================')
    console.log(`Total Tests : ${totalTests}`)
    console.log(`Passed      : ${passedTests}`)
    console.log(`Failed      : 0`)
    console.log('\n✅ ALL TRIVY PIPELINE INTEGRATION TESTS PASSED!')
  } finally {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true })
    } catch (_) {}
  }
}

runTrivyPipelineTests().catch((err) => {
  console.error('Test suite failed:', err)
  process.exit(1)
})
