# ---------- Stage 1: install production dependencies only ----------
FROM node:18-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# ---------- Stage 2: runtime image ----------
FROM node:18-alpine AS runtime

# Build metadata is passed in by Jenkins so a running container can be traced
# back to the pipeline run and the Git commit that produced it.
ARG BUILD_NUMBER=local
ARG GIT_COMMIT=unknown
ARG APP_VERSION=1.0.0

LABEL org.opencontainers.image.title="SpaceBook API" \
      org.opencontainers.image.version="${APP_VERSION}" \
      org.opencontainers.image.revision="${GIT_COMMIT}" \
      build.number="${BUILD_NUMBER}"

ENV NODE_ENV=production \
    PORT=3000 \
    APP_VERSION=${APP_VERSION}

# Three things happen here, and each one closes findings the Security stage
# reported against the base image:
#   1. apk upgrade pulls the patched openssl, musl and zlib packages.
#   2. npm, npx and corepack are deleted. The container only ever runs
#      "node src/server.js", so a package manager has no business being in a
#      production image, and npm's own bundled dependencies (tar, minimatch,
#      glob, cross-spawn, pacote, sigstore) were the source of every
#      language-level finding.
#   3. curl is kept, because the HEALTHCHECK below depends on it.
RUN apk update && apk upgrade --no-cache \
    && apk add --no-cache curl \
    && rm -rf /usr/local/lib/node_modules/npm \
              /usr/local/lib/node_modules/corepack \
              /usr/local/bin/npm \
              /usr/local/bin/npx \
              /usr/local/bin/corepack \
              /root/.npm \
    && addgroup -S spacebook && adduser -S spacebook -G spacebook

WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package*.json ./
COPY src ./src
COPY scripts ./scripts

RUN mkdir -p dist && node scripts/build.js && chown -R spacebook:spacebook /app

# Running as an unprivileged user keeps a container escape from landing on root.
USER spacebook

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -fsS http://localhost:3000/health || exit 1

CMD ["node", "src/server.js"]
