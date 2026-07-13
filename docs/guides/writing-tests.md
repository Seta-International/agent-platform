# Writing tests

Tests are the executable form of the acceptance criteria. In our test-driven loop the tests come first, written by the test-driven-development tool from the spec and plan (their success criteria trace back to the [ticket](ticket-template.md)), and they fail before any code exists. When the code arrives, "done" is not a judgement call — it is the test going green.

This guide is for agents and engineers writing tests in this repo. It covers ordinary code (deterministic, tested) and AI behavior (non-deterministic, evaluated).

---

## Principles

1. **Test first.** The failing test is the spec. The test-driven-development tool writes it from the spec and plan before the code it checks exists.
2. **Real dependencies, no mocks.** Tests run against a real Postgres through `testcontainers`. Do not mock the database. A test that passes against a mock proves nothing about production.
3. **One criterion, at least one test.** Each Given/When/Then criterion on the ticket maps to a test. The test asserts the observable behavior, not the function that implements it.
4. **Kill the mutant, not the coverage number.** A test earns its place only if it fails when the behavior breaks. High coverage with tests that never fail is theatre.
5. **Test the criteria, not the current code.** Never write a test that asserts whatever the code does today. That locks in bugs behind a green check.

---

## The loop

Red, green, refactor — anchored to the ticket:

1. Read the spec, the plan, and the acceptance criteria.
2. Write a test for one criterion. Run it. It must fail, and fail for the reason the criterion is not met yet (red).
3. Write the smallest code that makes it pass (green — this is the coding stage).
4. Refactor with the test holding the behavior in place.
5. Repeat for the next criterion and the edge cases around it.

The order matters. A test written after the code tends to describe the code; a test written first describes the requirement.

---

## What to test, and where

- **Unit** — domain rules and pure functions. Fast, no database. The rules a criterion states ("an extreme score requires a written note") live here.
- **Integration** — anything that touches the schema, events, or access control. Runs against real Postgres via `testcontainers`. Two things to always cover:
  - **Idempotency.** Event subscribers are at-least-once and keyed on `event_id`. Assert that re-delivering the same event twice yields exactly one row, not two.
  - **Isolation.** A row seeded in one org is never returned to another org's session. Assert the boundary, do not assume it.
- **End-to-end** — user-visible flows, through Playwright (`pnpm test:e2e`). Use these for the journeys a stakeholder would click through, not for rules a unit test already covers.

---

## Edge cases and anti-patterns

| Anti-pattern | What it looks like | Fix |
|---|---|---|
| Tautological test | asserts the code calls the function it calls | assert the outcome the criterion describes |
| Happy-path only | tests the one input that works | test the empty, the invalid, the boundary, the duplicate |
| Asserting current behavior | test written to match today's output | write it from the criterion, before the code |
| Coverage theatre | high percentage, nothing ever fails | check a test fails when you break the behavior |
| Mocked database | a stub stands in for Postgres | use `testcontainers`; no DB mocks |

---

## Testing the agent

The agent has two kinds of surface, tested two different ways.

**Its tools and plumbing are code.** The tools a module exposes to the agent, the model registry, the orchestration stream, schema and config — all deterministic. Test them like any other code: unit tests for the logic, integration tests against real Postgres for anything that touches the database, and always cover the human-in-the-loop path (a write tool waits for approval, a read tool does not). This is what the agent's current unit tests already do.

**Its answers are not deterministic.** The same question can produce two different, both-acceptable replies. The risk is a fluent answer that is wrong, calls the wrong tool, or invents a fact. A pass-or-fail test cannot grade that. Score it with an eval.

## Evals with Mastra scorers

We build on Mastra, so we do not write an eval framework — we use its scorers. A scorer grades an output from 0 to 1 with a reason. `runEvals` runs a set of inputs against a target agent and its scorers.

Use the built-in scorers for the failure modes that matter:

- **hallucination** — did it invent facts not in the given context?
- **answer relevancy** — did it actually answer the question?
- **tool-call accuracy / trajectory accuracy** — did it call the right tools, in a sane order?
- **faithfulness, completeness, noise sensitivity** — grounding, coverage, and resistance to misleading input.

Batch eval against an agent:

```typescript
import { runEvals } from '@mastra/core/evals'
import { createHallucinationScorer } from '@mastra/evals/scorers/prebuilt'
import { myAgent } from './agent'

const scorer = createHallucinationScorer({ model, options: { context: ['known fact 1', 'known fact 2'] } })

const result = await runEvals({
  target: myAgent,
  data: [{ input: 'Tell me about A' }, { input: 'Tell me about B' }],
  scorers: [scorer],
})
```

When no built-in fits, write one with `createScorer(...).generateScore(...)`.

Gate it in CI. A scorer run is an assertion like any other test:

```typescript
import { describe, it, expect } from 'vitest'
// ...run the agent on a noisy query, then score the output...
expect(evaluation.score).toBeGreaterThan(0.8)
```

Set the bar at the eval, not at one passing demo: a demo shows it worked once; an eval shows it holds across a labelled set. Review and version a rubric like any other spec.

**Current state.** The agent's tools and plumbing are unit-tested today. Evals for its answers are not wired yet; adopting Mastra scorers in CI is the next step. Say that plainly rather than imply the agent's behavior is already gated.

---

## Verify before done

```bash
pnpm typecheck && pnpm lint && pnpm test      # always
pnpm test:e2e                                  # if the UI changed
```

A change is not done until these pass locally. CI runs them again on the pull request.

---

## Definition of done for tests

- [ ] Every acceptance criterion on the ticket has a test.
- [ ] The tests failed first, for the right reason, before the code existed.
- [ ] Edge cases covered: empty, invalid, boundary, duplicate.
- [ ] Integration tests hit real Postgres; event handlers proven idempotent; org isolation asserted.
- [ ] No database mocks anywhere.
- [ ] The agent's tools and plumbing are unit- and integration-tested, including the human-in-the-loop path.
- [ ] For the agent's answers, a Mastra scorer eval exists or is explicitly deferred — not just a single example.
- [ ] `pnpm typecheck && pnpm lint && pnpm test` pass (and `pnpm test:e2e` if the UI changed).
