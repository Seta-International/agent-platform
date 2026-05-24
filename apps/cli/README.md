# @seta/cli

Operational CLI for the Seta platform — database lifecycle and
tenant/user provisioning. Used both interactively and by the standard
onboarding contract (`pnpm db:migrate`, `bash scripts/tenant-bootstrap.sh`).

## Commands

| Command | Purpose |
|---|---|
| `seta-cli migrate` | Apply Drizzle + hand-written migrations in lexical order |
| `seta-cli seed` | Load the SETA Future Org demo dataset from `data/planner/*.csv` (auto-creates the tenant + admin if missing; idempotent) |
| `seta-cli tenant-create` | Provision a new tenant |
| `seta-cli user-create` | Pre-provision a user (SSO requires pre-provisioning — no JIT) |
| `seta-cli user-deactivate` | Deactivate a user without deleting history |
| `seta-cli role-grant` | Bind a role to a user within a tenant |
| `seta-cli planner …` | Planner admin (re-sync, inspect) |
| `seta-cli integrations-mail-set` | Configure tenant SMTP credentials |
| `seta-cli integrations-mail-test` | Send a transport smoke-test message |

Run `seta-cli <command> --help` for flags.
