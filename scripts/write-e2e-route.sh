#!/usr/bin/env bash
# Generate the Traefik dynamic config for the E2E report site:
#   https://e2e.<PUBLIC_DOMAIN>  -> e2e-report nginx, behind basic-auth.
# Inline htpasswd users (E2E_BASICAUTH_USERS) keep secrets out of the repo.
set -euo pipefail

: "${PUBLIC_DOMAIN:?PUBLIC_DOMAIN required}"
: "${E2E_BASICAUTH_USERS:?E2E_BASICAUTH_USERS required (htpasswd line)}"
OUT="infra/traefik/dynamic/e2e-report.yml"
host="e2e.${PUBLIC_DOMAIN}"

cat > "$OUT" <<EOF
http:
  middlewares:
    e2e-auth:
      basicAuth:
        users:
          - "${E2E_BASICAUTH_USERS}"
  routers:
    e2e-report:
      rule: "Host(\`${host}\`)"
      entryPoints: [websecure]
      service: e2e-report
      middlewares: [e2e-auth]
      priority: 200
      tls:
        certResolver: letsencrypt
  services:
    e2e-report:
      loadBalancer:
        servers:
          - url: "http://e2e-report:8080"
EOF
echo "wrote ${OUT} (host ${host})"
