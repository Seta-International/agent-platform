# @seta/agent

AI agent module — Mastra agents, AI SDK v6 tool wrappers, and the
human-in-the-loop (HITL) approval flow. Every write tool sets
`needsApproval: true`; the web client renders an assistant-ui
Interactable confirmation card before execution. Read tools run
directly.

One domain per agent, ≤ ~15 tools each — overflowing the schema budget
burns prompt-cache hits and degrades tool selection.

## Exports

| Entry | Purpose |
|---|---|
| `@seta/agent` | Public surface — chat handler, agent factory |
| `@seta/agent/events` | `agent.message.*`, `agent.tool.*` events |
| `@seta/agent/testing` | Test fixtures for chat sessions and tool calls |
| `@seta/agent/register` | Module registration hook |
