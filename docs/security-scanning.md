# DeployForge — Container Security Scanning with Trivy

DeployForge provides integrated container image vulnerability scanning powered by [Aqua Security Trivy](https://trivy.dev/) (v0.76.1). Every deployment image built by DeployForge is verified through a controlled scanner worker and Jenkins pipeline before rollout, enforcing security governance and compliance.

---

## 1. Architecture Overview

```
                      +------------------------------------------+
                      |         DeployForge Pipeline             |
                      +------------------------------------------+
                                           |
                                  1. Build Docker Image
                                           |
                                           v
                      +------------------------------------------+
                      |    Immutable Image Reference Tag         |
                      |   e.g. deployforge-app:latest            |
                      +------------------------------------------+
                                           |
                                  2. Controlled Worker
                                           |
                                           v
                      +------------------------------------------+
                      |       Controlled Trivy Scanner (v0.76.1) |
                      |   - Isolated Worker / Agent              |
                      |   - Vulnerability & Secret Scanners      |
                      |   - Dedicated Vulnerability DB Cache     |
                      |   - Strict Timeout & Process Controls    |
                      +------------------------------------------+
                                           |
                    +----------------------+----------------------+
                    |                                             |
            3. Normalization                              4. Sanitization
                    |                                             |
                    v                                             v
     +------------------------------+             +------------------------------+
     | Standardized Findings:       |             | Redacted Artifacts:          |
     | - Normalized Severity        |             | - Scrubbed Host File Paths   |
     | - CVE ID & Primary Advisory  |             | - Redacted Tokens & Secrets  |
     | - Package & Installed Vers.  |             | - Clean Machine JSON Report  |
     | - Available Fixed Version    |             +------------------------------+
     +------------------------------+                             |
                    \                                            /
                     \                                          /
                      v                                        v
                      +------------------------------------------+
                      |         Policy Evaluation Engine         |
                      |    Compare Findings Against Threshold    |
                      |    HIGH & CRITICAL Block Deployment      |
                      +------------------------------------------+
                                           |
        +----------------------------------+----------------------------------+
        |                                  |                                  |
        v                                  v                                  v
+------------------+             +--------------------+             +--------------------+
|   Scan PASSED    |             |    Scan BLOCKED    |             |    Scan ERROR      |
| Clean or below   |             | Policy Violation   |             | Scanner Failure    |
| threshold.       |             | (e.g. Critical CVE |             | (DB error, timeout,|
| Stage: SUCCESS   |             |  found on policy)  |             |  worker missing)   |
| Pipeline rolls   |             | Stage: FAILED      |             | Stage: FAILED      |
| forward to AWS   |             | Pipeline stopped   |             | Pipeline stopped   |
+------------------+             +--------------------+             +--------------------+
```

---

## 2. Configurable Security-Gate Severities

DeployForge configures **HIGH and CRITICAL** as the initial security-gate severities:

| Severity Level | Numeric Rank | Behavior When Configured as Threshold |
| :--- | :---: | :--- |
| **`CRITICAL`** | 4 | Blocks deployments **only** if one or more `CRITICAL` severity CVEs or secrets are detected. `HIGH`, `MEDIUM`, and `LOW` issues are reported as warnings. |
| **`HIGH`** *(Initial Gate)* | 3 | Blocks deployments if any `CRITICAL` or `HIGH` vulnerabilities or secrets are found. |
| **`MEDIUM`** | 2 | Blocks deployments if any `CRITICAL`, `HIGH`, or `MEDIUM` vulnerabilities are found. |
| **`LOW`** | 1 | Zero-tolerance policy: blocks deployments if any vulnerability of any severity is detected. |

### How to Configure Thresholds

1. **Jenkins Pipeline Parameter**:
   The `Jenkinsfile` accepts `SEVERITY_THRESHOLD` (defaults to `HIGH,CRITICAL`).
   ```groovy
   parameters {
       choice(name: 'SEVERITY_THRESHOLD', choices: ['HIGH,CRITICAL', 'CRITICAL', 'MEDIUM,HIGH,CRITICAL', 'LOW,MEDIUM,HIGH,CRITICAL'], description: 'Security gate blocking threshold')
   }
   ```

2. **Database & Project Level**:
   ```prisma
   model Project {
     securityThreshold String @default("HIGH") // 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'
   }
   ```

3. **Environment Variable Fallback**:
   Set `DEFAULT_SECURITY_THRESHOLD=HIGH` in `.env`.

---

## 3. Jenkins Runtime & Docker Security Architecture

### Why Jenkins Should NOT Blindly Mount `/var/run/docker.sock`

A common but dangerous anti-pattern is mounting the host Docker daemon socket into the Jenkins controller:
```yaml
# DANGEROUS PATTERN - DO NOT USE IN PRODUCTION
volumes:
  - /var/run/docker.sock:/var/run/docker.sock
```

**Security Implications**:
1. **Root Equivalent Privilege**: Any user with permission to configure a Jenkins job or access the Script Console can spawn a container with `--privileged -v /:/host`, giving them unrestricted root read/write access to the host filesystem, Docker daemon, kernel parameters, and peer containers.
2. **Container Breakout & Cross-Tenant Compromise**: In a multi-tenant or shared CI/CD environment, malicious builds can inspect, alter, or terminate sibling containers on the host (e.g. access `deployforge-db`).
3. **Daemon Denial of Service**: Rogue builds can consume host disk space or restart the daemon, bringing down the entire platform.

### Safe Architecture in DeployForge

DeployForge implements a layered, safe architecture:

1. **Dedicated Worker / Agent with Controlled Docker Access**:
   - The Jenkins **controller** remains unprivileged without socket access.
   - Builds and scans execute on ephemeral, isolated agent nodes (or dedicated worker containers) with scoped API access.
2. **Scanner API / Daemonized Worker Container**:
   - When running lightweight controller containers, scans are delegated over the internal container network (`deployforge-net`) to a hardened scanner service or worker that isolates scanner execution.
3. **Air-Gapped / Ephemeral Scanner Binary**:
   - When running on a build node, Trivy executes as an unprivileged binary scanning the saved image tarball or local daemon without mounting the root host filesystem.
4. **Strict Failure Handling**:
   - If neither a scanner agent nor a scanner daemon is reachable, the pipeline reports `SCANNER_UNAVAILABLE` and **strictly halts**. It never silently ignores scanner errors.

---

## 4. Policy Violations vs. Scanner Errors

DeployForge **strictly isolates** security policy failures from operational scanner errors. A broken scanner is **never silently treated as a clean scan**.

### A. Policy Violation (`BLOCKED`) — Exit Code 1
- **What it means**: The scanner worker executed successfully and scanned the image, but the image contains vulnerabilities or secrets meeting or exceeding the project's configured threshold (e.g. HIGH or CRITICAL).
- **Pipeline Stage Outcome**: `SECURITY_SCAN` stage marks `FAILED`.
- **Deployment Status**: Marked `FAILED` with an explicit violation message (e.g. `Blocked: Security policy violation. 2 HIGH vulnerabilities exceed threshold HIGH,CRITICAL`).
- **Dashboard Representation**: Displayed with a red **Blocked** badge and full breakdown of blocking CVEs.

### B. Scanner Operational Error (`ERROR`) — Exit Code 2
- **What it means**: The scan could not be completed due to infrastructure or network conditions.
- **Categories Handled**:
  - `DB_DOWNLOAD_ERROR`: Scanner failed to update or download vulnerability database (e.g. rate limit, DNS failure, 403 Forbidden).
  - `TIMEOUT`: Scan exceeded maximum execution time (default 180s).
  - `SCANNER_UNAVAILABLE`: Neither the Docker Trivy daemon nor the Trivy binary could be reached.
  - `MALFORMED_OUTPUT`: Output from scanner was truncated or not valid JSON.
  - `MISSING_REPORT`: Report file was not generated by scanner.
- **Pipeline Stage Outcome**: `SECURITY_SCAN` stage marks `FAILED`.
- **Deployment Status**: Marked `FAILED` with failure details (e.g. `Scanner error (DB_DOWNLOAD_ERROR): Failed to download vulnerability database`).
- **Safety Guarantee**: Deployments are halted safely; images are not deployed when scanner integrity cannot be verified.

---

## 5. Artifact Archiving & Machine-Readable Reports

In the Jenkins pipeline, the `post` block guarantees that all security artifacts are archived **even when the security gate fails**:

```groovy
post {
    always {
        // Archives report artifacts on SUCCESS, UNSTABLE, and FAILURE
        archiveArtifacts artifacts: 'reports/security/**', allowEmptyArchive: true
        // Sends HMAC-signed callback to DeployForge webhook
    }
}
```

The workspace directory `reports/security/` stores:
1. `trivy-report.json`: Full machine-readable Trivy JSON report containing all target layers and detected CVEs/secrets.
2. `trivy-summary.txt`: Human-readable terminal summary with ASCII tables of findings.
3. `scan-summary.json`: Gate-normalized summary with status, severity counts, blocking list, and execution metadata.

---

## 6. Sanitization and Log Redaction

To prevent sensitive information leakage into application logs, audits, or dashboard reports:

1. **Path Scrubbing**:
   - Host Windows paths (e.g., `E:\DeployForge\...`) are replaced with `<sanitized-path>`.
   - Jenkins workspace paths (e.g., `/var/jenkins_home/workspace/...`) and Linux root directories are scrubbed.
2. **Secret Redaction**:
   - All passwords, API tokens, JWTs, private keys, and authorization headers (`Bearer ...`) in scanner outputs are redacted to `"[REDACTED]"`.
3. **Machine-Readable Storage**:
   - Raw scanner outputs are sanitized recursively before persisting to the `rawReportJson` column in PostgreSQL.

---

## 7. Credential Rotation Procedure (Stripe & Third-Party Secrets)

An earlier scan detected a secret pattern in `prisma/seed.ts`. In DeployForge:
- All seed keys have been replaced with safe placeholders (`stripe_placeholder_local_dev_only`).
- Production secrets are strictly sourced from server-side environment variables (`STRIPE_SECRET_KEY`).

### Step-by-Step Rotation Guide

If any real or test Stripe key was ever committed to version control or built into an image layer:

1. **Log in to Stripe Dashboard**:
   Navigate to [https://dashboard.stripe.com/apikeys](https://dashboard.stripe.com/apikeys).
2. **Locate the Exposed Key**:
   Under **Standard Keys**, locate the key corresponding to the exposed prefix (`sk_live_...` or `sk_test_...`).
3. **Roll the Key**:
   - Click the **...** menu next to the key and select **Roll key...**.
   - Choose the expiration window for the old key (e.g., *Immediately* if an active leak is suspected, or *12 hours* to allow zero-downtime reconfiguration).
4. **Update Server Environment**:
   - Update `STRIPE_SECRET_KEY` in DeployForge's production `.env` / AWS Secrets Manager / Parameter Store.
   - Do **NOT** commit the new key to Git or Docker images.
5. **Verify Webhooks & API Transactions**:
   - Send a test checkout or webhook ping to verify that the application successfully authenticates with the rolled key.
6. **Audit API Activity**:
   - In Stripe Dashboard ➔ **Developers** ➔ **Logs**, inspect requests made during the exposure window for unauthorized transactions.

---

## 8. Dashboard Presentation & Mock Distinction

When viewing the **Security** dashboard at `/security`:
- **Real Scans**: Display live scan timestamps, accurate image tags (`deployforge-app:latest`), pass/blocked status, and an interactive **Sanitized Raw JSON Report** modal.
- **Simulated / Mock Mode**: Any fallback or demonstration records are explicitly labeled with a visible amber **Simulated** badge (`isSimulated: true`) so that operators are never misled by placeholder data.
