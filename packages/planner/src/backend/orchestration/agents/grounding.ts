// Shared anti-fabrication guardrail for the planner query sub-agents.
//
// Self-hosted models will happily answer "how many open tasks do I have?" with a
// confident number (PQ-003 fabricated "14") or derive a member count from a group
// name pre-injected for routing (PQ-012 fabricated "5 / 8 / 6"). The common cause
// is the model treating identity/context metadata — or nothing at all — as
// sufficient grounding for a live figure. Every sub-agent that can state a number
// embeds this policy so the discipline is uniform, not per-prompt.
export const GROUNDING_POLICY = `Grounding policy (mandatory):
- Names and ids in this prompt (groups, plans, tasks) are identity metadata for
  routing only — never infer a member count, task count, workload, status total,
  ownership, or deadline from them.
- Never state a count, number, total, percentage, or date unless it appears in a
  successful tool result or in the user's own message.
- If you need such a value and do not have it, call the appropriate tool. If no
  tool can supply it, say what is missing — do NOT guess a figure.`;
