# Self-hosting Seta

Seta ships as two Docker images — `platform-server` (API + workers) and `platform-web` (static bundle) — both built from this repo. The same images run the OSS single-VPS deployment and Seta's AWS production. Pick a path below.

<a id="image-and-version-policy"></a>

## Pick a path

- I want to run Seta on one VPS in 5 minutes. → [`docker-compose.md`](docker-compose.md)
- I need the full list of environment variables. → [`configuration.md`](configuration.md)
- I'm deploying on AWS. → [`aws.md`](aws.md)
- I want the CI/CD flow (build once → ECR → pull-deploy to dev/UAT). → [`deploying.md`](deploying.md)
- I want to use Coolify / Dokploy / Kamal. → [`community.md`](community.md) (not supported, documented for clarity)

## What you will not find here

- **Kubernetes / Helm.** Deferred.
- **One-click Render / Railway / Hetzner templates.** Not first-party.
- **Multi-region active-active.** Single-region per environment in v1.
- **Custom backup tooling.** Use standard Postgres patterns (`pg_dump`, RDS PITR).

## Image and version policy

This is the single source of truth for image references and tags; other pages link here rather than restate it.

Images are published to **Amazon ECR**. `compose.yaml` resolves each image as `${ECR_REGISTRY}/${ECR_REPOSITORY}:server-${PLATFORM_VERSION}` and `…:web-${PLATFORM_VERSION}` (overridable via `PLATFORM_IMAGE_SERVER` / `PLATFORM_IMAGE_WEB`). Set `ECR_REGISTRY`, `ECR_REPOSITORY`, and `PLATFORM_VERSION` in `.env`.

Architecture: CI currently builds **`linux/amd64`** (the `build-images` action stays multi-arch-capable for when prod needs `arm64`).

Tag scheme: the server and web images share one repository, distinguished by a `server-` / `web-` prefix on the version tag. CI publishes an immutable `git-<sha>` plus a moving `latest` per image; `PLATFORM_VERSION` selects which (`git-<sha>` to pin/roll back, `latest` for newest). See [`deploying.md`](deploying.md) for the build→deploy flow.

## Layout of this directory

| File | Purpose |
|---|---|
| `README.md` | Decision tree: which path do you want? |
| `docker-compose.md` | 5-minute self-host quickstart (the §19.3 contract). |
| `configuration.md` | Exhaustive env var reference; mirrors `.env.example`. CI gate enforces. |
| `aws.md` | AWS production: single-box Terraform (EC2 ASG + RDS + S3, Cloudflare Tunnel). |
| `deploying.md` | CI/CD: `build.yml`/`deploy.yml`/`e2e.yml`, GitHub Environments, run/rollback. |
| `community.md` | Coolify / Dokploy / Kamal mentions. Explicit "not supported" framing. |
