<!-- PR title IS the squash commit: type(scope): FUT-123 subject -->

## What & why
<!-- One or two sentences. The diff shows the how. -->

Jira: https://all-it.atlassian.net/browse/FUT-XXX

## Evidence
<!-- Proof it works, not just a claim. Paste the relevant bits:
     - test/CI output (the run that covers this change)
     - before/after screenshots or a recording for UI changes
     - the command(s) you ran to verify, and their result -->

## Checklist
- [ ] `pnpm typecheck && pnpm lint && pnpm test` pass (`pnpm test:e2e` if UI changed)
- [ ] Docs updated, or N/A

---

## AI usage
- [ ] AI assisted → add label `ai-assisted`
- [ ] Agent created → add labels `ai-assisted` **and** `ai-agent`
