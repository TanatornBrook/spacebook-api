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

RUN apk add --no-cache curl \
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
