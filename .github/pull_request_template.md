<!-- PR title IS the squash commit: type(scope): FUT-123 subject -->

## What & why
<!-- One or two sentences. The diff shows the how. -->

Jira: FUT-XXX

## Tier
<!-- T1: own feature module · T2: multiple modules / shared-* / sdks / contracts · T3: core, identity, shared-ui, migrations, CI (gets its own PR, lead reviews) -->
T1 / T2 / T3

## Risk / affected modules
<!-- What could break and which modules are touched.
     Big diff? Add a review map:
     Hot (~N lines): files the reviewer must read — logic, contracts, auth, data.
     Cold (~N lines): generated / boilerplate / renames — and WHY it's safe to skim. -->

## Evidence
<!-- Proof it works, not just a claim. Paste the relevant bits:
     - test/CI output (the run that covers this change)
     - before/after screenshots or a recording for UI changes
     - the command(s) you ran to verify, and their result -->

## Checklist
- [ ] `pnpm typecheck && pnpm lint && pnpm test` pass (`pnpm test:e2e` if UI changed)
- [ ] Docs updated, or N/A
- [ ] I read my own full diff, including anything AI-generated
- [ ] Reviewable in ~30 min, or review map included (hot / cold)
- [ ] No core changes hiding in here (those get their own PR)

---

## AI usage
- [ ] AI assisted → add label `ai-assisted`
- [ ] Agent created → add labels `ai-assisted` **and** `ai-agent`
- AI time saved (hours): <!-- derive from the ticket's story points via docs/guides/estimation.md (points × velocity − actual), don't guess; human value in Jira wins -->

