# syntax=docker/dockerfile:1
ARG NODE_IMAGE=node:24-bookworm-slim

# ---- deps: full install for the build ----
FROM ${NODE_IMAGE} AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# ---- prod-deps: runtime dependencies only ----
FROM ${NODE_IMAGE} AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund \
    && npm cache clean --force

# ---- build ----
FROM ${NODE_IMAGE} AS build
WORKDIR /app
# next.config.mjs resolves its /api/v1 rewrite target during `next build`, so it must be set here
ARG CUEFX_API_ORIGIN
ENV CUEFX_API_ORIGIN=${CUEFX_API_ORIGIN} \
    NEXT_TELEMETRY_DISABLED=1 \
    NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN test -n "$CUEFX_API_ORIGIN" || { echo "build arg CUEFX_API_ORIGIN is required" >&2; exit 1; } \
    && npm run build

# ---- runtime ----
FROM ${NODE_IMAGE} AS runtime
LABEL org.opencontainers.image.title="cuefx-web" \
      org.opencontainers.image.description="CueFX v2 editor (Next.js)"
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1

COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/package.json /app/next.config.mjs ./
COPY --from=build --chown=1000:1000 /app/.next ./.next
# `next start` serves public/ from disk; it is not bundled into .next
COPY --from=build /app/public ./public

# the base image's built-in "node" user is UID/GID 1000
USER 1000:1000

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:3000/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Same as `npm start`, without npm as PID 1 so SIGTERM reaches the server
CMD ["node", "node_modules/next/dist/bin/next", "start", "-p", "3000"]
