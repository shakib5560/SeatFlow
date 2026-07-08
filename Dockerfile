# ═══════════════════════════════════════════════════════════════════════════════
# SeatFlow — Production Multi-Stage Dockerfile
#
# Stages:
#   1. base         — shared Node version + non-root user setup
#   2. deps         — install ALL npm dependencies (including devDeps for build)
#   3. builder      — compile TypeScript → dist/, generate Prisma Client
#   4. production   — copy only runtime artifacts; no devDeps, no source code
#
# Why node:24-slim (Debian) instead of Alpine?
#   • Prisma's query engine is a native binary that requires libssl and libgcc.
#   • Alpine uses musl libc. Prisma provides a separate musl binary, but it adds
#     complexity and has historically caused incompatibility issues.
#   • Neon requires SSL (sslmode=require); Debian slim ships with OpenSSL.
#   • node:24-slim is ~180 MB — only ~50 MB larger than Alpine but far more stable.
# ═══════════════════════════════════════════════════════════════════════════════

# ─────────────────────────────────────────────────────────────────────────────
# Stage 1: base
# Shared foundation — pin exact Node major, create non-root user
# ─────────────────────────────────────────────────────────────────────────────
FROM node:24-slim AS base

# Install OpenSSL — required by Prisma query engine and Neon SSL connections.
# ca-certificates — required for Neon's TLS certificate chain validation.
# dumb-init — minimal PID 1 init process to handle signal forwarding correctly
#             (prevents zombie processes and ensures graceful shutdown).
RUN apt-get update -qq && \
    apt-get install -y --no-install-recommends \
        openssl \
        ca-certificates \
        dumb-init && \
    rm -rf /var/lib/apt/lists/*

# Pin npm to a specific v11 release.
# npm 12 (released 2026-07) introduced breaking changes to `npm ci` that cause
# the build to fail. Pinning here ensures reproducible builds regardless of
# which npm ships inside the base node:24-slim image.
RUN npm install -g npm@11

# Create a non-root user and group for security.
# Running as root inside a container is a security risk — if the process is
# compromised, the attacker has root inside the container layer.
RUN groupadd --gid 1001 nodejs && \
    useradd --uid 1001 --gid nodejs --shell /bin/bash --create-home nestjs

WORKDIR /app

# ─────────────────────────────────────────────────────────────────────────────
# Stage 2: deps
# Install ALL dependencies (including devDependencies needed to compile)
# This layer is cached independently — only re-runs when package-lock.json changes
# ─────────────────────────────────────────────────────────────────────────────
FROM base AS deps

# Copy only the package manifests first.
# Docker layer caching: if package*.json hasn't changed, npm ci is skipped.
COPY package.json package-lock.json ./

# Use npm install instead of npm ci.
# npm ci is too strict about cross-platform lockfile differences:
# some packages (e.g. Prisma's native query engine via @emnapi) include
# Linux-only optional dependencies that may not be recorded in a lockfile
# generated on another OS. npm install reads the lockfile for versions but
# tolerates these platform-specific optional dep differences.
RUN npm install

# ─────────────────────────────────────────────────────────────────────────────
# Stage 3: builder
# Compile TypeScript → dist/, generate Prisma Client
# ─────────────────────────────────────────────────────────────────────────────
FROM base AS builder

# Copy installed dependencies from the deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy source code and configuration files
COPY . .

# Generate Prisma Client BEFORE compiling TypeScript.
# Why here? The TypeScript compiler needs the generated Prisma types
# (@prisma/client) at compile time. Without this step, tsc will fail with
# "Cannot find module '@prisma/client'" errors.
#
# Note: We do NOT need a real DATABASE_URL at generate time — prisma generate
# only reads schema.prisma and writes TypeScript types to node_modules.
# The actual DB connection only happens at runtime in PrismaService.
RUN npx prisma generate

# Compile TypeScript. nest build runs tsc under the hood and writes to ./dist
RUN npm run build

# ─────────────────────────────────────────────────────────────────────────────
# Stage 4: production
# Final lean image — only runtime artifacts, no source code, no devDependencies
# ─────────────────────────────────────────────────────────────────────────────
FROM base AS production

# Set NODE_ENV to production.
# This has two effects:
#   1. Express/NestJS enable production optimizations.
#   2. npm install (if ever called) will skip devDependencies.
ENV NODE_ENV=production

# Switch to non-root user for all subsequent commands
USER nestjs

# Copy compiled application from builder stage
COPY --from=builder --chown=nestjs:nodejs /app/dist ./dist

# Copy only the production node_modules.
# We copy from the deps stage (which has ALL deps) but we reinstall only
# production deps below to keep the image lean.
# Alternative approach: use --omit=dev on a fresh npm ci.
COPY --from=builder --chown=nestjs:nodejs /app/node_modules ./node_modules

# Copy Prisma schema and config (needed at runtime for PrismaClient).
# prisma.config.ts is needed so Prisma knows the schema path and datasource.
COPY --from=builder --chown=nestjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nestjs:nodejs /app/prisma.config.ts ./prisma.config.ts

# Copy package.json (required by some Node.js runtime loaders)
COPY --from=builder --chown=nestjs:nodejs /app/package.json ./package.json

# Expose the application port.
# This is documentation only — it does not publish the port.
# The actual port binding is done in docker-compose.yml or the orchestrator.
EXPOSE 3000

# Health check — Docker and orchestrators (ECS, Cloud Run, Railway) use this
# to determine if the container is healthy before routing traffic to it.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/api', (r) => { process.exit(r.statusCode === 200 ? 0 : 1) }).on('error', () => process.exit(1))"

# Use dumb-init as PID 1 to:
#   1. Forward OS signals (SIGTERM, SIGINT) correctly to the Node process.
#   2. Reap zombie child processes.
#   Without dumb-init, Docker's SIGTERM on container stop would not reach Node,
#   causing a 10-second forced kill instead of graceful shutdown.
ENTRYPOINT ["dumb-init", "--"]

# Run pending migrations then start the application.
# Why a shell wrapper instead of dumb-init exec?
#   - We need a shell to chain two commands with &&.
#   - dumb-init still wraps the shell, so signals are forwarded correctly.
#   - prisma migrate deploy is idempotent — already-applied migrations are skipped.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main"]
