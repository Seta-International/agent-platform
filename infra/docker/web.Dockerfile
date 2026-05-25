# syntax=docker/dockerfile:1.7

# ---- builder ----
FROM node:24-alpine AS builder

# `git` is required by the root package.json `prepare: lefthook install`
# script even though we don't want hooks installed in the image.
RUN corepack enable \
 && apk add --no-cache git

WORKDIR /repo

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY turbo.json ./
COPY apps/web/package.json            apps/web/package.json
COPY apps/server/package.json         apps/server/package.json
COPY apps/cli/package.json            apps/cli/package.json
COPY packages/                        packages/
COPY sdks/                            sdks/

# LEFTHOOK=0 short-circuits the `prepare: lefthook install` script so we
# don't end up with a stray hook config in the image.
ENV LEFTHOOK=0

RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

COPY apps/web/  apps/web/

RUN pnpm --filter=@seta/web build

# ---- runtime ----
FROM nginxinc/nginx-unprivileged:alpine AS runtime

USER root
RUN addgroup -g 10001 seta && adduser -D -u 10001 -G seta seta \
 && chown -R 10001:10001 /usr/share/nginx/html /var/cache/nginx /etc/nginx/conf.d

COPY --from=builder --chown=10001:10001 /repo/apps/web/dist/ /usr/share/nginx/html/
COPY --chown=10001:10001 infra/docker/web-nginx.conf /etc/nginx/conf.d/default.conf

USER 10001

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/healthz || exit 1

CMD ["nginx", "-g", "daemon off;"]
