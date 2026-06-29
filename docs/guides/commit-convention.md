# Branching & commit convention

Every change maps to a Jira ticket (`FUT-<n>`). Branch names and commit messages carry that key, so work auto-links in Jira and GitHub. `commitlint` + a branch-name guard enforce this locally (lefthook) and in CI.

## Branch

```
<type>/FUT-<n>-<slug>
```

`git checkout -b feat/FUT-123-group-viewer`. Never commit feature work on `main`.

- **type**: `feat fix chore docs refactor test ci build perf style revert`
- **slug**: short kebab-case, e.g. `group-viewer`
- Exempt (no key needed): `main`, `develop`, `release/*`, `dependabot/*`

## Commit

```
<type>(<scope>): FUT-<n> <subject>
```

The Jira key goes **right after the colon**, subject ≤ 100 chars.

```
feat(planner): FUT-123 add group viewer to the board
fix(identity): FUT-54 let any tenant member search the directory
```

- **scope** is optional (the module/area). Use `(deps)` for dependency bumps — no key required there.
- Wrong: `fix(planner):FUT-123 ...` (no space), `feat: add viewer` (no key), `Update stuff` (no type).
- A `.gitmessage` template is wired via `pnpm prepare` (`git config commit.template`).

## Pull request

PR **title** is the squash commit — it must follow the commit format above (CI lints it). Fill the template: what & why, the Jira link, and **evidence** (test/CI output, screenshots for UI, the verify commands you ran).

## Bypass (emergencies only)

`git commit --no-verify` skips the hooks. Use it only when genuinely necessary; CI still checks the PR title and branch name.
