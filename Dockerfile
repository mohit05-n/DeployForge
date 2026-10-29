# ==============================================================================
# DeployForge Multi-Stage Production Dockerfile
# ==============================================================================

# --- Stage 1: Base Alpine Environment ---
FROM node:20-alpine AS base
WORKDIR /app
# Install OpenSSL and libc6-compat for Prisma ORM compatibility on Alpine
RUN apk add --no-cache libc6-compat openssl

# --- Stage 2: Dependencies ---
FROM base AS deps
WORKDIR /app

# Copy dependency manifests
COPY package.json package-lock.json ./
COPY prisma ./prisma/

# Install exact dependencies
RUN npm ci

# --- Stage 3: Builder ---
FROM base AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Generate Prisma Client for Linux (Alpine)
RUN npx prisma generate

# Ensure Next.js telemetry is disabled during build
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

# Next.js standalone build
RUN npm run build

# --- Stage 4: Production Runner ---
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Create unprivileged system user and group
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Remove unnecessary development/packaging tooling (npm, npx, corepack) from final runtime image
RUN rm -rf /usr/local/lib/node_modules/npm \
           /usr/local/bin/npm \
           /usr/local/bin/npx \
           /usr/local/bin/corepack

# Ensure public folder exists
RUN mkdir -p public

# Copy built standalone server and static assets from builder
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma

USER nextjs

EXPOSE 3000

# Container healthcheck against DeployForge's /api/health endpoint
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3000/api/health || exit 1

CMD ["node", "server.js"]
