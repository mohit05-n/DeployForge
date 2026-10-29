# DeployForge — Full-Stack Cloud Deployment Platform

**DeployForge** is a self-service cloud deployment platform for developers. It provides a single dashboard to connect GitHub repositories, configure deployments, build Docker images, scan them with Trivy, deploy to AWS, and monitor running applications.

The platform is built as a production-grade full-stack Next.js application backed by **PostgreSQL** with **Prisma ORM**, strict server-side authorization boundaries, secure session management, audit trails, and clean service abstractions.

---

## Architecture Overview

```
DeployForge Architecture
├── Frontend (Next.js 15 App Router + Tailwind CSS)
│   ├── /dashboard           - KPI metrics, active projects, deployment trends
│   ├── /projects            - Project catalog, filterable grid
│   ├── /projects/new        - 7-step deployment wizard with GitHub repo & branch selector
│   ├── /projects/[id]       - Project detail, env vars, commit history
│   ├── /deployments         - Pipeline runs, stage statuses, and logs
│   ├── /security            - Trivy vulnerability scanner & CVE findings
│   ├── /infrastructure      - AWS cloud inventory & Terraform plan viewer
│   ├── /logs                - Real-time application stdout/stderr streams
│   └── /settings            - GitHub OAuth integration, API tokens, cloud roles
│
├── Backend API (/api/*)
│   ├── /api/health          - Health check (PostgreSQL latency & uptime)
│   ├── /api/auth/*          - Register, login, session verify, logout
│   ├── /api/projects/*      - User-scoped Project CRUD & env var encryption
│   ├── /api/deployments/*   - Trigger, stage tracking, logs, retry, rollback
│   ├── /api/integrations/*  - Status records & sync
│   ├── /api/integrations/github/* - OAuth auth, callback, status, repos, branches, disconnect
│   ├── /api/webhooks/github - HMAC-SHA256 signature verification & push idempotency
│   └── /api/audit           - Security audit logging
│
├── Data Layer (PostgreSQL + Prisma 7 ORM)
│   ├── User                 - Developer accounts, bcrypt password hashing
│   ├── GitHubAccount        - AES-256-GCM encrypted OAuth tokens, profile metadata
│   ├── OAuthState           - Cryptographically random CSRF tokens with expiry
│   ├── WebhookDelivery      - Delivery UUIDs for push event idempotency
│   ├── Project              - User-owned configurations, repoOwner, repoName, branch
│   ├── ProjectEnvVar        - Server-side masked / encrypted environment vars
│   ├── RepositoryConnection - GitHub repository links
│   ├── Deployment           - Commit SHAs, status (PENDING on webhook push), trigger metadata
│   ├── DeploymentStage      - CLONE -> LINT_TEST -> DOCKER -> TRIVY -> AWS
│   ├── DeploymentLog        - Timestamped execution logs
│   ├── IntegrationRecord    - Cloud & CI integration status tracking
│   └── AuditEvent           - Security & operational event audit trail
│
└── Integration Service Abstractions (src/services/integrations/)
    ├── github.service.ts    - Repository and branch discovery
    ├── docker.service.ts    - Container builder engine (mock/real gated adapter)
    ├── jenkins.service.ts   - Standby CI pipeline runner
    ├── trivy.service.ts     - CVE vulnerability database & findings
    ├── terraform.service.ts - Dry-run plan generator (apply blocked by policy)
    └── aws.service.ts       - Read-only ECS/EKS/ALB/RDS cloud inventory
```

---

## Security & Architecture Principles

1. **Server-Side Authorization**: Every project, deployment, and configuration is strictly scoped to the authenticated user. Cross-tenant access is rejected with `404 Not Found` or `403 Forbidden`.
2. **Encrypted Token Storage**: GitHub access tokens are encrypted at rest using **AES-256-GCM** with authenticated checksums. Plaintext tokens are strictly forbidden in database storage, client-facing responses, and logs.
3. **OAuth CSRF & Replay Protection**: OAuth authorization flows generate cryptographically secure state tokens (`crypto.randomBytes(32)`), persisted with a 10-minute TTL and atomically consumed upon callback verification to prevent replay attacks.
4. **Webhook HMAC-SHA256 Verification**: Inbound GitHub webhook requests verify `X-Hub-Signature-256` headers using `crypto.timingSafeEqual` over the raw payload buffer.
5. **Idempotent Webhook Processing**: Each webhook delivery (`X-GitHub-Delivery`) is recorded in the `WebhookDelivery` table. Duplicate delivery attempts are acknowledged safely without creating duplicate deployments.
6. **Isolated Build Worker Interface**: Repository build commands are **never run on the main application server**. Builds are dispatched to an isolated build worker with strict resource boundaries:
   - **CPU Limit**: 2.0 cores (capped at 4.0 cores)
   - **Memory Limit**: 2 GB (capped at 4 GB)
   - **Execution Timeout**: 600s / 10m (capped at 1800s / 30m)
   - **Disk Space Limit**: 10 GB workspace
   - **Process Limit (PIDs)**: 256 processes (prevents fork-bombs)
   - **Network Mode**: Isolated / restricted during build phases
7. **Zero Host Socket Exposure**: Untrusted workloads and builder containers are strictly prohibited from mounting `/var/run/docker.sock` or `\\.\pipe\docker_engine`.
8. **No Secrets in Docker Images**: Sensitive environment variables (`KEY`, `SECRET`, `TOKEN`, `PASSWORD`, `DATABASE_URL`) are automatically stripped from `--build-arg` options. Secrets are only injected at runtime, never baked into image layers.
9. **Unique, Immutable Image Tags**: Container images are tagged strictly in the format `deployforge/<project-slug>:<shortSha>-<deploymentId>`, ensuring zero tag collision and strict immutability (mutable `latest` tag is rejected).
10. **Dual-Adapter Build System**:
    - **Mock Build Worker (`BUILD_RUNNER_TYPE=mock`)**: Fast, deterministic multi-stage simulation with realistic log streams, failure handling, and timeouts for local development and UI testing.
    - **Gated Real Docker Engine Worker (`BUILD_RUNNER_TYPE=docker`)**: Spawns isolated container builds via the local Docker daemon, gated by `ENABLE_REAL_DOCKER_BUILDS=true`.

---

## Supported Project Types & Detection Rules

DeployForge supports a defined set of project types, automatically detected by inspecting repository manifests:

| Project Type | Manifest Files | Detection Rule | Default Build Command | Default Start Command | Port |
|--------------|----------------|----------------|-----------------------|-----------------------|------|
| **Custom Dockerfile** (`DOCKERFILE_CUSTOM`) | `Dockerfile`, `Containerfile` | Dockerfile in repository root or configured path | `docker build -t app .` | (From Dockerfile CMD) | 3000 |
| **Next.js App/Pages** (`NODEJS_NEXTJS`) | `package.json`, `next.config.*` | `next` in dependencies or Next.js config | `npm run build` | `npm start` | 3000 |
| **Vite SPA** (`NODEJS_VITE`) | `package.json`, `vite.config.*` | `vite` in dependencies or Vite config | `npm run build` | `npm run preview` | 3000 |
| **Node.js Service** (`NODEJS_GENERIC`) | `package.json` | `package.json` with scripts/main | `npm install --production` | `node index.js` | 3000 |
| **FastAPI API** (`PYTHON_FASTAPI`) | `requirements.txt`, `pyproject.toml` | `fastapi` in requirements or main.py | `pip install -r requirements.txt` | `uvicorn main:app --port 8000` | 8000 |
| **Flask Web App** (`PYTHON_FLASK`) | `requirements.txt`, `pyproject.toml` | `flask` in requirements or app.py | `pip install -r requirements.txt` | `gunicorn -b 0.0.0.0:5000 app:app` | 5000 |
| **Python Generic** (`PYTHON_GENERIC`) | `requirements.txt`, `Pipfile` | Python dependency manifest found | `pip install -r requirements.txt` | `python main.py` | 8000 |
| **Go Microservice** (`GO_MODULE`) | `go.mod` | `go.mod` in project root | `go build -o /app/server .` | `/app/server` | 8080 |
| **Static Website** (`STATIC_WEB`) | `index.html` | `index.html` without server manifest | (None required) | `npx serve -s . -l 80` | 80 |

Repositories lacking recognized manifests are classified as `UNKNOWN` and rejected with clear diagnostic guidance before any build is scheduled.

---

## Windows Quickstart Setup Guide

### 1. Prerequisites
- **Node.js** v20+ or v22+
- **npm** v9+ or v10+
- **PowerShell** 5.1+ or 7+

Verify tools in PowerShell:
```powershell
node --version
npm --version
```

### 2. Configure Environment Variables
Copy the template configuration file:
```powershell
Copy-Item .env.example .env
```

Configuration variables in `.env`:
```env
# Database connection (PostgreSQL 18 embedded runner)
DATABASE_URL="postgresql://postgres:deployforge_dev@localhost:54332/deployforge?schema=public"

# Auth and Cryptography
JWT_SECRET="deployforge_dev_secret_key_98327498237498237498327498"
ENCRYPTION_KEY="deployforge_master_aes256_encryption_key_32bytes!"
SESSION_COOKIE_NAME="deployforge_session"
SESSION_MAX_AGE_SECONDS=604800
PORT=3000
NODE_ENV=development
APP_URL="http://localhost:3000"

# GitHub OAuth Application Credentials
GITHUB_CLIENT_ID="your_github_oauth_client_id"
GITHUB_CLIENT_SECRET="your_github_oauth_client_secret"

# GitHub Webhook Secret
GITHUB_WEBHOOK_SECRET="your_github_webhook_secret_key"
```

### 3. Setting Up GitHub OAuth & Webhooks

#### A. Create a GitHub OAuth App
1. Go to your GitHub account: **Settings** > **Developer settings** > **OAuth Apps** > **New OAuth App**.
2. Fill in the application details:
   - **Application name**: `DeployForge Local`
   - **Homepage URL**: `http://localhost:3000`
   - **Authorization callback URL**: `http://localhost:3000/api/integrations/github/callback`
3. Click **Register application**.
4. Copy the **Client ID** and generate a **Client Secret**.
5. Paste them into your `.env`:
   ```env
   GITHUB_CLIENT_ID="<client-id>"
   GITHUB_CLIENT_SECRET="<client-secret>"
   ```

#### B. Configure GitHub Repository Webhook
1. In your GitHub repository, navigate to **Settings** > **Webhooks** > **Add webhook**.
2. Configure webhook settings:
   - **Payload URL**: `https://<your-public-url>/api/webhooks/github` (or `http://localhost:3000/api/webhooks/github` via ngrok / Smee for local dev).
   - **Content type**: `application/json`
   - **Secret**: Set a random secret string matching `GITHUB_WEBHOOK_SECRET` in `.env`.
   - **Which events would you like to trigger this webhook?**: Select **Just the push event** (or **Pushes**).
3. Save the webhook. DeployForge will verify the HMAC signature and enqueue pending deployments automatically when commits are pushed.

### 4. Start Local PostgreSQL Database
DeployForge includes an embedded native PostgreSQL 18 runner for Windows:
```powershell
# Start PostgreSQL background service on port 54332
node scripts/start-db.js --daemon
```

### 5. Run Migrations & Seed Database
```powershell
# Run Prisma migrations
npx prisma migrate dev

# Seed demo users and data
npx tsx prisma/seed.ts
```

### 6. Launch the Development Server
```powershell
npm run dev
```
Open **[http://localhost:3000](http://localhost:3000)** in your browser.

---

## Default Seed Credentials

| Role | Email | Password |
|------|-------|----------|
| **Admin** | `alex.morgan@deployforge.io` | `Password123!` |
| **Developer** | `dev@deployforge.io` | `Password123!` |

---

## Verification & Testing

### 1. Run Jenkins Integration Test Suite
Validates Jenkins environment, Declarative pipeline template, project authorization, commit identity validation (SHA formats), immutable deployment ID parameters, agent isolation (untrusted vs privileged), callback HMAC authentication, log redaction, mock adapter execution, and PostgreSQL audit integration:
```powershell
npx tsx scripts/test-jenkins.ts
```
*Total: 46 assertions across 10 security, isolation, and operational test categories.*

### 2. Run Docker Build Integration Test Suite
Validates project type detection rules, repository layout traversal validation, command safety, host Docker socket isolation, build-arg secret stripping, immutable image tag generation, mock worker simulation, failure handling, timeouts, cancellation, and PostgreSQL pipeline persistence:
```powershell
npx tsx scripts/test-docker-build.ts
```
*Total: 69 assertions across 11 security, isolation, and operational test categories.*

### 3. Run GitHub Integration Test Suite
Validates OAuth state management, URL validation, HMAC-SHA256 signature verification, push event idempotency, pending deployment creation, and disconnect:
```powershell
npx tsx scripts/test-github.ts
```
*Total: 50 assertions across 10 security and operational test categories.*

### 4. Run Core Full-Stack API Test Suite
Validates user authentication, sessions, project CRUD, masked environment variables, multi-stage pipelines, audit logging, and tenant isolation:
```powershell
npx tsx scripts/test-api.ts
```
*Total: 38 assertions across 10 test categories.*

### 5. Production Build & Type Checking
```powershell
# Strict TypeScript type-check
npm run type-check

# Optimized Next.js standalone production build
npm run build
```

---

## Jenkins CI/CD Integration & Pipeline Setup

DeployForge integrates with Jenkins for enterprise CI/CD orchestration.

### 1. Installed Environment & Verified Plugins
- **Jenkins Controller Version**: `2.580.2 LTS` (OpenJDK 21) running locally on `http://127.0.0.1:8081` (via Docker Compose).
- **Required & Installed Plugins**:
  - `workflow-aggregator`: Pipeline execution engine
  - `pipeline-model-definition`: Declarative pipeline support
  - `credentials-binding`: `withCredentials` secret injection
  - `git` & `git-client`: Git SCM provider
  - `build-timeout`: Hard pipeline timeout enforcement (`options { timeout(...) }`)
  - `timestamper`: Timestamped execution logs
  - `ws-cleanup`: Guaranteed workspace cleanup in `post { always { cleanWs() } }`
  - `plain-credentials`: Secret text storage

### 2. Jenkins Setup & Architecture Topology
DeployForge connects to Jenkins via a server-side `JenkinsClient` supporting both local host execution and Docker Compose container networks:

- **Jenkins Container**: `deployforge-jenkins` (image `jenkins/jenkins:lts-jdk21`)
- **Shared Docker Network**: `deployforge-net`
- **Jenkins Browser Access URL**: `http://localhost:8081` (mapped to container port `8080`)
- **Internal Docker Network URL**: `http://jenkins:8080` (for containerized app-to-jenkins traffic)
- **DeployForge Web App**: `http://localhost:3001` (containerized) or `http://localhost:3000` (host development)
- **Target Pipeline Job**: `DeployForge-Build`
- **Root Repository Pipeline**: `Jenkinsfile` (implements safe validation, ESLint, TypeScript check, automated tests, isolated Docker build, and image verification)

### 3. Service Account & Least-Privilege Credentials
DeployForge communicates with Jenkins using a dedicated service account:
- **Least-Privilege Role Permissions**:
  - `Job/Build`: Queue parameterized builds
  - `Job/Cancel`: Abort/cancel running jobs
  - `Job/Read`: Read job configuration and console logs
  - `Item/Discover`: Discover job existence
  - *(Do NOT grant Administrator, Script Execution, or System Configuration rights)*
- **Generate API Token**:
  1. In Jenkins, log in and navigate to: **Manage Jenkins** > **Users** (or user profile `deployforge-agent`).
  2. Click **Configure** > **API Token** > **Add new Token**.
  3. Configure your local `.env` file (never commit credentials):
     ```env
     # Jenkins Server Connection
     JENKINS_URL="http://localhost:8081"
     JENKINS_JOB_NAME="DeployForge-Build"
     JENKINS_USERNAME="deployforge-agent"
     JENKINS_API_TOKEN="<generated_api_token>"
     JENKINS_CALLBACK_SECRET="<random_32byte_secret>"

     # Adapter Mode: "false" for deterministic mock simulation (default); "true" for real Jenkins
     ENABLE_REAL_JENKINS="false"
     ```

### 4. Connection Status & API Endpoints
The backend provides dedicated endpoints adhering to DeployForge conventions:

| Endpoint | Method | Description | Auth Required |
|----------|--------|-------------|---------------|
| `/api/integrations/jenkins/status` | GET | Connection status (`unconfigured`, `reachable`, `unreachable`) | Yes |
| `/api/integrations/jenkins/trigger` | POST | Trigger parameterized Jenkins job with commit & project authorization | Yes (Owner) |
| `/api/integrations/jenkins/build` | GET | Query build status & queue progression (`?jobName=&buildNumber=`) | Yes (Owner) |
| `/api/integrations/jenkins/console` | GET | Stream redacted console output (`?jobName=&buildNumber=&offset=`) | Yes (Owner) |
| `/api/webhooks/jenkins` | POST | Authenticated webhook callback receiver for stage updates | HMAC Token |

*(Direct `/api/jenkins/*` alias endpoints are also available for backward compatibility).*

### 5. Pipeline Security & Agent Separation
- **Root Pipeline Policy**: Declarative pipelines use `agent none` at the root level.
- **Untrusted User Workloads**: Customer test commands (`BUILD_COMMAND`) and container builds run exclusively on `untrusted-build-agent`.
- **Privileged Release Operations**: Image publication to container registries is restricted to `privileged-release-agent` with credentials binding.
- **Zero Docker Socket Exposure**: The host Docker socket is never mounted into untrusted containers.
- **Automated Console Log Redaction**: Bearer tokens, passwords, AWS keys, and GitHub PATs are automatically masked before saving to PostgreSQL.
- **Preserved Mock Mode Default**: Real Jenkins execution is gated behind `ENABLE_REAL_JENKINS=true`. Mock mode is preserved as the default for local development and CI testing.

### 6. Running Jenkins Verification Tests
Execute the comprehensive automated test suite (verifying Jenkinsfile parsing, credentials binding, commit SHA checks, agent separation, log redaction, HMAC callbacks, and client states):
```powershell
npx tsx scripts/test-jenkins.ts
```

### 7. Troubleshooting & FAQ
- **"Authentication required. Please sign in." on Dashboard**:
  - DeployForge backend endpoints (`/api/integrations/jenkins/*`) require an active user session.
  - Sign in at `/auth/signin` using default seeded developer credentials: `alex.morgan@deployforge.io` / `Password123!`.
- **Container-to-Container Communication (`http://jenkins:8080`)**:
  - Inside Docker Compose (`deployforge-app`), communication must use `http://jenkins:8080` over the `deployforge-net` bridge network.
  - When running locally on the Windows host outside Docker (`npm run dev`), the app connects via `http://127.0.0.1:8081` (host-mapped port).
- **Jenkins Authentication Failure (401/403)**:
  - Verify that `JENKINS_USERNAME` and `JENKINS_API_TOKEN` in `.env` match a valid Jenkins user and active API token generated under Jenkins *User > Configure > API Token*.
- **"Unconfigured" vs "Connection Failed"**:
  - `Configuration Required`: Missing `JENKINS_URL`, `JENKINS_USERNAME`, or `JENKINS_API_TOKEN`.
  - `Connection Failed`: Host unreachable, network failure, or invalid Basic Auth credentials.
  - `Connected`: Successfully authenticated with 200 OK and verified target job existence.

---

## Testing DeployForge in Docker (Local Container & Compose)

DeployForge includes a multi-stage production `Dockerfile` (with Alpine Linux, OpenSSL, non-root user `nextjs`, and standalone build optimization) and a `docker-compose.yml` for local container testing.

### 1. Build the DeployForge Production Image
```powershell
docker build -t deployforge:latest .
```

### 2. Run with Docker Compose
Start both PostgreSQL 16 and the DeployForge container with automated healthcheck dependencies:
```powershell
# Start container stack in background
docker compose up -d

# Check running container statuses
docker compose ps

# View application logs
docker compose logs -f app
```

### 3. Verify Container Health
```powershell
# Check container health status (checks /api/health)
docker inspect --format='{{json .State.Health}}' deployforge-app

# Probe endpoint in PowerShell
Invoke-RestMethod -Uri http://localhost:3000/api/health
```

### 4. Stop Docker Compose
```powershell
docker compose down
```

---

## API Reference

| Endpoint | Method | Description | Auth Required |
|----------|--------|-------------|---------------|
| `/api/health` | GET | System uptime, database latency & status | No |
| `/api/auth/register` | POST | Register new developer account | No |
| `/api/auth/login` | POST | Sign in with email and password | No |
| `/api/auth/logout` | POST | Clear HTTP-only session cookie | Yes |
| `/api/auth/me` | GET | Current session user profile | Yes |
| `/api/integrations/github/auth` | GET | Initialize OAuth flow with secure CSRF state | Yes |
| `/api/integrations/github/callback` | GET | Validate CSRF state & exchange token safely | No (OAuth flow) |
| `/api/integrations/github/status` | GET | Current connection status, avatar & username | Yes |
| `/api/integrations/github/repositories` | GET | List repositories accessible to authorized user | Yes |
| `/api/integrations/github/branches` | GET | List branches for selected repository | Yes |
| `/api/integrations/github/disconnect` | POST | Revoke & wipe stored credentials | Yes |
| `/api/webhooks/github` | POST | Verified push event receiver & deployment enqueue | No (HMAC signed) |
| `/api/projects` | GET | List user-owned projects | Yes |
| `/api/projects` | POST | Create project with validated repo & branch | Yes |
| `/api/projects/:id` | GET | Retrieve project details & masked env vars | Yes (Owner) |
| `/api/projects/:id` | PATCH | Update project settings & env vars | Yes (Owner) |
| `/api/projects/:id` | DELETE | Delete project and related data | Yes (Owner) |
| `/api/deployments` | GET | List deployments (optional `?projectId=`) | Yes (Owner) |
| `/api/deployments` | POST | Trigger deployment pipeline for project | Yes (Owner) |
| `/api/deployments/:id` | GET | Deployment stages & execution logs | Yes (Owner) |
| `/api/deployments/:id/retry` | POST | Retry failed or previous deployment | Yes (Owner) |
| `/api/deployments/:id/rollback` | POST | Rollback to target deployment commit | Yes (Owner) |
| `/api/integrations` | GET | List integration records and statuses | Yes |
| `/api/integrations/sync` | POST | Test & refresh integration status records | Yes |
| `/api/integrations/jenkins/status` | GET | Inspect Jenkins connection status (unconfigured/reachable/unreachable) | Yes |
| `/api/integrations/jenkins/trigger` | POST | Authenticated & authorized trigger for configured Jenkins job | Yes (Owner) |
| `/api/integrations/jenkins/build` | GET | Check Jenkins job build and queue status | Yes (Owner) |
| `/api/integrations/jenkins/console` | GET | Retrieve sanitized and redacted console logs | Yes (Owner) |
| `/api/webhooks/jenkins` | POST | Inbound webhook callback receiver for Jenkins pipeline stages | HMAC Token |
| `/api/audit` | GET | View security & operation audit logs | Yes |

