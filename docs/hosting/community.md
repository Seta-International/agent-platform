# Community platforms

Seta is not officially supported on Coolify, Dokploy, Kamal, or other compose-wrapping deployment platforms. The published Docker images (`ghcr.io/seta-io/seta-server`, `ghcr.io/seta-io/seta-web`) are standard OCI artifacts and *will* run on any of these — but we do not test against them, will not accept bug reports specific to them, and will not adapt our compose file to platform-specific conventions. This page exists so you can make an informed choice.

## What "not supported" means here

- We do not run CI against these platforms.
- Issues whose root cause is the platform's compose-wrapping behavior will be closed with a pointer to the upstream platform's support.
- Compose YAML is treated as a portable contract; platform-specific extensions (`x-coolify-*`, `x-dokploy-*`) will not be added to the supported `compose.yml`.

## What you can do

- Treat Seta's `compose.yml` as a starting point. Most compose-wrappers ingest standard compose files cleanly.
- Map env vars to the platform's secret store. Do not commit `.env` to the platform's UI as plain config if it offers a separate secrets surface.
- For traffic routing, prefer the platform's own reverse-proxy if it has one (Coolify ships Traefik; Dokploy ships Caddy) — strip the `proxy` service from `compose.yml` and let the platform terminate TLS.

## Coolify

- Coolify's compose support handles `pull_policy: always` and `depends_on` cleanly.
- The `migrator` one-shot pattern works as a Coolify "Run Command" in the resource UI.
- Persistent volumes: declare them in `compose.yml`; Coolify provisions backing storage.
- Coolify ships its own Traefik. Remove Seta's `proxy` service and let Coolify route to `seta-web` and `seta-server` directly.

## Dokploy

- Similar story; Caddy handles TLS.
- Watch for memory limits — Dokploy's defaults are tight. Raise to ≥1 GB for `seta-server`.
- Migrations: invoke `migrate` via Dokploy's command runner against the `server` service.

## Kamal

- Kamal is push-based deploy, not platform-as-a-service. It copies your config plus runs `docker pull` and `docker run` on remote hosts.
- Bigger fit gap: Kamal expects a single app container per host; the multi-service compose model needs more glue.
- Possible but uncommon. If you go this route, treat each Seta service as a separate Kamal app and wire them together with a private network.

## If you want first-party support

Open a discussion (not an issue) describing your platform, scale, and what's broken on the standard compose path. If a critical mass of users converges on one platform, we'll reassess. Tracked in `docs/superpowers/specs/2026-05-20-deployment-strategy-design.md` Deferred Work table.
