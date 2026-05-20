# syntax=docker/dockerfile:1.7

# ============================================================================
# Stage 1 — base
# ============================================================================
FROM node:24-alpine AS base

RUN corepack enable \
 && apk add --no-cache tini

WORKDIR /repo

# ============================================================================
# Stage 2 — deps
#
# Install the full workspace dep set, cached on lockfile changes only.
# We copy ONLY manifests at this stage so the install layer is cache-stable
# across source-only changes.
# ============================================================================
FROM base AS deps

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY turbo.json ./

COPY apps/server/package.json apps/server/package.json
COPY apps/cli/package.json    apps/cli/package.json
COPY apps/web/package.json    apps/web/package.json
COPY packages/                packages/

RUN --mount=type=cache,id=pnpm-store-server,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

# ============================================================================
# Stage 3 — sources
#
# This codebase runs TypeScript at runtime via tsx (no tsc emit). The
# "build" step is a typecheck-only gate; no dist/ artifact is produced.
# We copy source into a separate stage so prune can deploy from a clean tree.
# ============================================================================
FROM deps AS sources

COPY apps/server/  apps/server/
COPY apps/cli/     apps/cli/

# Typecheck-only — fail the image build if the TS doesn't pass.
RUN pnpm --filter=@seta/server exec tsc --noEmit \
 && pnpm --filter=@seta/cli    exec tsc --noEmit

# ============================================================================
# Stage 4 — prune
#
# `pnpm deploy --prod` flattens each workspace project into a self-contained
# tree under /out/apps/<name>/ with its own node_modules (production deps
# only, tsx included since it's a runtime dep).
#
# --ignore-scripts skips transitive postinstall scripts (esbuild version
# probes etc.) that fail in the deploy tree where the binary registry has
# already been resolved.
# ============================================================================
FROM sources AS prune

RUN pnpm deploy --filter=@seta/server --prod --ignore-scripts /out/apps/server \
 && pnpm deploy --filter=@seta/cli    --prod --ignore-scripts /out/apps/cli

# Copy source files into the deploy tree (pnpm deploy ships `files`, but
# these workspace apps don't declare `files`, so we explicitly include src/).
RUN cp -R apps/server/src /out/apps/server/src \
 && cp -R apps/cli/src    /out/apps/cli/src

# ============================================================================
# Stage 5 — runtime
#
# Minimal alpine + tini for PID 1 signal handling. Non-root UID 10001.
# ============================================================================
FROM node:24-alpine AS runtime

RUN apk add --no-cache tini \
 && addgroup -g 10001 seta \
 && adduser -D -u 10001 -G seta seta

ENV NODE_ENV=production \
    APP_HOME=/app \
    PORT=3000

WORKDIR /app

COPY --from=prune --chown=10001:10001 /out/apps/server /app/apps/server
COPY --from=prune --chown=10001:10001 /out/apps/cli    /app/apps/cli
COPY --chown=10001:10001 infra/docker/entrypoint.sh    /entrypoint.sh

RUN chmod +x /entrypoint.sh

USER 10001

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD /entrypoint.sh health || exit 1

ENTRYPOINT ["/sbin/tini", "--", "/entrypoint.sh"]
CMD ["serve"]
