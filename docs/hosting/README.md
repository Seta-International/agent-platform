# Self-hosting Seta

Seta ships as two Docker images — `seta-server` (API + workers) and `seta-web` (static bundle) — both built from this repo. The same images run the OSS single-VPS deployment and Seta's AWS production. Pick a path below.

## Pick a path

- I want to run Seta on one VPS in 5 minutes. → [`docker-compose.md`](docker-compose.md)
- I need the full list of environment variables. → [`configuration.md`](configuration.md)
- I'm deploying on AWS. → [`aws.md`](aws.md)
- I'm upgrading from an earlier version. → [`upgrading.md`](upgrading.md)
- My single VPS is hitting limits and I want to split modules. → [`scaling.md`](scaling.md)
- I want to use Coolify / Dokploy / Kamal. → [`community.md`](community.md) (not supported, documented for clarity)

## What you will not find here

- **Kubernetes / Helm.** Deferred. See [`scaling.md`](scaling.md) for the supported split-deploy approach via ECS.
- **One-click Render / Railway / Hetzner templates.** Not first-party.
- **Multi-region active-active.** Single-region per environment in v1.
- **Custom backup tooling.** Use standard Postgres patterns (`pg_dump`, RDS PITR).

## Image and version policy

Images are published to GHCR: `ghcr.io/seta-io/seta-server` and `ghcr.io/seta-io/seta-web`.

Multi-arch: `linux/amd64` + `linux/arm64`.

Tag scheme: `vX.Y.Z` (immutable), `vX.Y`, `vX`, `latest`. Self-hosters should pin to `vX.Y.Z` and upgrade deliberately — see [`upgrading.md`](upgrading.md).

## Layout of this directory

| File | Purpose |
|---|---|
| `README.md` | Decision tree: which path do you want? |
| `docker-compose.md` | 5-minute self-host quickstart (the §19.3 contract). |
| `configuration.md` | Exhaustive env var reference; mirrors `.env.example`. CI gate enforces. |
| `aws.md` | Points at `infra/opentofu/aws-ecs/`, sketches the topology. |
| `upgrading.md` | Version policy, migration discipline, rollback constraints. |
| `scaling.md` | When and how to split modules. User-facing entry to the dispatch shim. |
| `community.md` | Coolify / Dokploy / Kamal mentions. Explicit "not supported" framing. |
