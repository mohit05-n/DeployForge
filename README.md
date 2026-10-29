<<<<<<< HEAD
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
│   ├── /projects/new        - 7-step deployment wizard
│   ├── /projects/[id]       - Project detail, env vars, commit history
│   ├── /deployments         - Pipeline runs, stage statuses, and logs
│   ├── /security            - Trivy vulnerability scanner & CVE findings
│   ├── /infrastructure      - AWS cloud inventory & Terraform plan viewer
│   ├── /logs                - Real-time application stdout/stderr streams
│   └── /settings            - Integrations, API tokens, security, cloud roles
│
├── Backend API (/api/*)
│   ├── /api/health          - Health check (PostgreSQL latency & uptime)
│   ├── /api/auth/*          - Register, login, session verify, logout
│   ├── /api/projects/*      - User-scoped Project CRUD & env var encryption
│   ├── /api/deployments/*   - Trigger, stage tracking, logs, retry, rollback
│   ├── /api/integrations/*  - Status records & sync (explicit mock contract)
│   └── /api/audit           - Security audit logging
│
├── Data Layer (PostgreSQL + Prisma 7 ORM)
│   ├── User                 - Developer accounts, bcrypt password hashing
│   ├── Project              - User-owned configurations & build settings
│   ├── ProjectEnvVar        - Server-side masked / encrypted environment vars
│   ├── RepositoryConnection - GitHub repository links
│   ├── Deployment           - Commit SHAs, status, docker tags, run metadata
│   ├── DeploymentStage      - CLONE -> LINT_TEST -> DOCKER -> TRIVY -> AWS
│   ├── DeploymentLog        - Timestamped execution logs
│   ├── IntegrationRecord    - Cloud & CI integration status tracking
│   └── AuditEvent           - Security & operational event audit trail
│
└── Integration Service Abstractions (src/services/integrations/)
    ├── github.service.ts    - Repository and branch discovery (mock mode)
    ├── docker.service.ts    - Container builder simulation (host safe)
    ├── jenkins.service.ts   - Standby CI pipeline runner
    ├── trivy.service.ts     - CVE vulnerability database & findings
    ├── terraform.service.ts - Dry-run plan generator (apply blocked by policy)
    └── aws.service.ts       - Read-only ECS/EKS/ALB/RDS cloud inventory
```

---

## Security & Architecture Principles

1. **Server-Side Authorization**: Every project, deployment, and configuration is strictly scoped to the authenticated user. Cross-tenant access is rejected with `404 Not Found` or `403 Forbidden`.
2. **Never Plaintext Passwords**: Passwords are securely hashed with `bcryptjs` using 10 salt rounds. Password hashes are strictly omitted from all API responses and logs.
3. **HTTP-Only Session Cookies**: Signed JWT session tokens are stored in `HttpOnly`, `SameSite=Lax`, and `Secure` (production) cookies.
4. **Secrets Kept Server-Side**: Environment variables marked as secret are masked (`••••••••••••••••`) in all client responses and never leaked in logs.
5. **Rate Limiting & Protection**: In-memory sliding window rate limiting protects sensitive endpoints (`/api/auth/login`, `/api/auth/register`, `/api/projects`) with `429 Too Many Requests` responses and `X-RateLimit-*` headers.
6. **Structured Logging**: Logs are emitted as structured JSON with automatic redaction of keys containing `password`, `secret`, `token`, `authorization`, or `key`.
7. **Explicit Integration Contracts**: External integrations (AWS, Terraform, Jenkins, Docker) explicitly report `isSimulated: true` and will never execute arbitrary host code or unconfirmed live AWS operations.

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

Default `.env` configuration for local development:
```env
DATABASE_URL="postgresql://postgres:deployforge_dev@localhost:54332/deployforge?schema=public"
JWT_SECRET="deployforge_dev_secret_key_98327498237498237498327498"
SESSION_COOKIE_NAME="deployforge_session"
SESSION_MAX_AGE_SECONDS=604800
PORT=3000
NODE_ENV=development
APP_URL="http://localhost:3000"
```

### 3. Start Local PostgreSQL Database
DeployForge includes an embedded native PostgreSQL 18 runner for Windows that requires no external software installation or admin privileges:
```powershell
# Start PostgreSQL background service on port 54332
node scripts/start-db.js --daemon
```

### 4. Run Migrations & Seed Database
Apply Prisma database migrations and load sample data (users, projects, deployments, integrations, and audit events):
```powershell
# Run Prisma migrations
npx prisma migrate dev

# Seed demo users and data
npx tsx prisma/seed.ts
```

### 5. Launch the Development Server
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

### Run Automated End-to-End API Test Suite
An automated verification test validates all 38 requirement points:
```powershell
npx tsx scripts/test-api.ts
```

Test coverage includes:
- System and database health (`/api/health`)
- User registration and login with bcrypt verification
- Session cookie validation (`/api/auth/me`)
- Unauthorized request rejection (`401 Unauthorized`)
- Project CRUD: Create, Read, Update, Delete, and listing
- Server-side secret env var masking
- Deployment trigger with 7-stage pipeline initialization
- Deployment log collection, retry, and rollback tracking
- Integrations status records with explicit mock verification
- Security audit event persistence in PostgreSQL
- Cross-tenant authorization isolation (multi-user protection)

### Production Build Validation
```powershell
# Strict TypeScript type-check
npm run type-check

# Optimized Next.js production build
npm run build
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
| `/api/projects` | GET | List user-owned projects | Yes |
| `/api/projects` | POST | Create a new user-owned project | Yes |
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
| `/api/audit` | GET | View security & operation audit logs | Yes |
=======
# DeployForge
>>>>>>> origin/main
