# @seta/shared-crypto

Envelope encryption helpers — AWS KMS-backed data-key wrapping for
credentials at rest, with a local dev key fallback so the
clone→install→migrate→seed→dev path works without AWS access.

## Exports

| Entry | Purpose |
|---|---|
| `@seta/shared-crypto` | `seal()`, `unseal()`, key resolution, KMS adapter |
| `@seta/shared-crypto/testing` | In-memory key provider for tests |

## Scripts

- `pnpm crypto:gen-local-key` — generate a dev-only data key for `.env`.
