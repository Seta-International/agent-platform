# Upgrading Seta

Seta uses immutable semver tags (`vX.Y.Z`) and forward-only schema migrations. Upgrades are: pull the new image, run `migrate`, restart `server`. Downgrades require a database restore. Plan accordingly.

## Versioning policy

- Tag `vX.Y.Z` is immutable — the same tag always pulls the same image digest.
- Tags `vX.Y` and `vX` are moving pointers, updated on every `Z` and `Y` bump.
- Tag `latest` is the most recent stable tag — never pin to it in production.
- Tag `edge` is built on every `main` push for previewing unreleased work. Not supported.
- A minor bump (`vX.Y → vX.{Y+1}`) is backwards-compatible at the API and env-var level. A major bump (`vX → vX+1`) may require config changes — release notes flag them.

## The supported upgrade path

1. Read the release notes for every intermediate version. Do not skip majors.
2. Back up Postgres: `pg_dump` for self-host, RDS snapshot for AWS.
3. Update `SETA_VERSION` in `.env` (or your IaC variable).
4. Pull the new image:
   ```bash
   docker compose pull
   ```
   On AWS, `tofu apply` updates the ECS task definition image reference.
5. Run migrations one-shot:
   ```bash
   docker compose run --rm migrator
   ```
   On AWS, `aws ecs run-task --task-definition seta-migrator`.
6. Restart the `server` service:
   ```bash
   docker compose up -d server
   ```
   On AWS, the rolling deploy runs once the task definition is updated.
7. Verify:
   ```bash
   curl -sf https://${SETA_DOMAIN}/healthz
   ```
   Returns `{"status":"ok"}`.

## Migration discipline (why this is forward-only)

Migrations are generated via `pnpm drizzle-kit generate` (see `CLAUDE.md`'s engineering discipline section) and applied in lexical filename order. The migration runner is idempotent — running `migrate` twice is safe. But migrations are forward-only by policy: a `vX.Y.Z` release never includes a "rollback" SQL file. Reverting code without restoring the database leaves the schema ahead of the running binary, which is undefined behavior.

If a migration in a release has an unrecoverable bug, the fix is a new patch release with a *forward-correcting* migration, not a downgrade. Self-hosters who must roll back: stop the upgraded `server`, restore the pre-upgrade Postgres backup, pull the previous image tag, start it.

## Split-mode considerations

Each container's `migrate` subcommand runs only the schemas it owns (its `SETA_MODULES`). Because `CLAUDE.md` forbids cross-schema foreign keys, containers can migrate in any order — there is no lockstep requirement. The one constraint: if module A's subscriber consumes events from module B, A must tolerate B publishing the new event shape *before* A's projection migration runs. This is standard event-versioning hygiene, not a deploy ordering constraint.

Practical rule of thumb: deploy `core` (the bus owner) last, so consumers of new event shapes are already running their new projections when `core` starts emitting them. For pure within-module schema changes, ordering doesn't matter.

## Rollback constraints (read before deploying)

- Database state is not reversible from an upgrade alone. The only supported "rollback" is restore-from-backup.
- Cookies and tokens signed with a rotated `BETTER_AUTH_SECRET` are unrecoverable — users re-authenticate.
- If you change `EVENTS_RETENTION_DAYS` downward, the partition manager will drop matching partitions on the next sweep. Schedule with care.

## ADR reference

See `docs/project-plan.md §7` D34 — "Single image, mode-selectable runtime" — for the architectural decision that makes the upgrade story work the same for the monolith and split deploys.

## Verifying image signatures

Every published image is signed keylessly via [Sigstore Cosign](https://docs.sigstore.dev/cosign/) using GitHub Actions OIDC. There is no Seta-controlled signing key — verification anchors on Sigstore's public transparency log (Rekor) and the GitHub workflow identity that produced the image.

### One-time install

```bash
# macOS
brew install cosign
# linux
curl -sSLo cosign https://github.com/sigstore/cosign/releases/latest/download/cosign-linux-amd64
chmod +x cosign && sudo mv cosign /usr/local/bin/
```

### Verify a release tag

Replace `<org>` with the GitHub org that hosts the repo (the OSS default is `seta-io`) and `vX.Y.Z` with the tag you pulled.

```bash
cosign verify ghcr.io/<org>/seta-server:vX.Y.Z \
  --certificate-identity-regexp='^https://github.com/<org>/agent-platform/\.github/workflows/release\.yml@refs/tags/v.*$' \
  --certificate-oidc-issuer='https://token.actions.githubusercontent.com'
```

A green output ends with `Verification for ghcr.io/<org>/seta-server:vX.Y.Z --` followed by the signed claim JSON. A red output means *don't run that image* — either the tag was tampered with or it wasn't built by this repository's workflow.

### Verify the SBOM attestation

```bash
cosign verify-attestation --type spdxjson \
  --certificate-identity-regexp='^https://github.com/<org>/agent-platform/\.github/workflows/release\.yml@refs/tags/v.*$' \
  --certificate-oidc-issuer='https://token.actions.githubusercontent.com' \
  ghcr.io/<org>/seta-server:vX.Y.Z
```

## Local pre-release verification (maintainers)

Before pushing a tag, run:

```bash
pnpm release:check:full
```

This builds both images locally (single-arch, your host's native), runs the `health` subcommand against `seta-server`, and runs Trivy with the same severity gate the CI workflow uses. A green exit is the green light for `git tag vX.Y.Z && git push origin vX.Y.Z`.

For a deeper simulation of the workflow itself, run the GitHub Actions runner locally with [`nektos/act`](https://github.com/nektos/act):

```bash
act push -e /tmp/act-tag-event.json -W .github/workflows/release.yml -j metadata
```

See the `act` docs for matrix overrides and credential injection if you need to exercise the full pipeline.
