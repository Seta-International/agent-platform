---
paths:
  - "packages/agent/**"
---

# Agent engine rules

`agent` is the engine tier — it composes module-owned agent tools/specs into a Mastra runtime and **may not import any feature or orchestrator module** (`agent-no-feature-imports`, CI-gated). Orchestrators like `staffing` compose feature modules; their workflow state lives in `agent.workflow_runs`.

For `@mastra/core` API names, read the sibling checkout at `../mastra/` — do not guess from npm types.

## HITL on every write tool

AI SDK v6 `needsApproval: true` + an assistant-ui Interactable confirmation card, wired via `registerToolPermission` from `@seta/agent-sdk`. Read tools execute directly. Native-suspend chat cards resume via `POST /chat/resume`; `/workflows/approvals/:id/decide` only records the decision (no resume).

## Debug the agent (dev)

`scripts/dev/trace-thread.sh <threadId>` dumps a chat turn's lifecycle (messages, approvals, snapshot status, spans). App logs persist to `logs/{server,worker}.log` (NDJSON). Per-turn tool-calls/suspends/resumes trace to `agent.mastra_ai_spans`; raise Mastra's logger with `MASTRA_LOG_LEVEL`.
