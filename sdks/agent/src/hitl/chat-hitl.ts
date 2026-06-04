import type { ApprovalCard } from './card.ts';

// ─────────────────────────────────────────────────────────────────────────────
// Chat-flow HITL injection types
//
// BACKGROUND
// ----------
// Mastra exposes two distinct suspension mechanisms:
//
//   1. Workflow step suspend  (ctx.workflow.suspend / ctx.suspend in spec steps)
//      Used by: assignBySkill evented workflow (packages/planner/…/spec.ts)
//      Effect:  Mastra publishes a `workflow.suspend` event on the 'workflows'
//               pubsub channel → the agent lifecycle hook (packages/agent/…/
//               lifecycle-hook.ts) writes agent.workflow_approvals + runs rows.
//
//   2. Agentic execution suspend  (ctx.agent.suspend in agent tools)
//      Used by: chat-flow tools that previously tried to suspend mid-turn
//      Effect:  Mastra emits a `tool-call-suspended` SSE chunk internally — it
//               does NOT publish to the 'workflows' pubsub channel, so the
//               lifecycle hook NEVER fires and NO DB row is created.
//
// Because path 2 produces no DB row, the frontend's useThreadPendingApprovals
// hook (which polls agent.workflow_approvals) never sees the card.
//
// SOLUTION
// --------
// Chat-flow HITL tools must:
//   a) Write the approval record themselves, via a ChatHitlRecorder injected
//      into Mastra's requestContext by the chat route before agent.stream().
//   b) Return a `pending-approval` result (not suspend) so the agent turn
//      completes and the agent can tell the user to review the card.
//
// When the user decides, the decide-approval endpoint calls the registered
// ChatHitlDecider for the matching tool ID to execute the action directly —
// without any Mastra workflow resume.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * requestContext key under which the chat route stores the ChatHitlRecorder.
 * Tools read this key to obtain the recorder without importing agent internals.
 */
export const RC_CHAT_HITL_RECORDER = '__seta_chat_hitl_recorder__';

/**
 * Injected by the chat route into Mastra requestContext before agent.stream().
 * Tools call this to atomically create a workflow_approvals row (plus the
 * required synthetic workflow_runs row) so the approval card surfaces in-thread.
 *
 * Returns the stable IDs of both rows so the tool can include them in its
 * output (useful for the agent to reference in its reply).
 *
 * `cardInThread` is false when the returned approval does NOT surface in the
 * caller's chat thread — an idempotent recorder may reuse a pending approval
 * that belongs to another approver (and therefore stays in that approver's
 * thread). Callers must not tell the user to look for an in-thread card when
 * it is false. Absent means true (legacy recorders always bind to the thread).
 */
export type ChatHitlRecorder = (
  card: ApprovalCard,
) => Promise<{ runId: string; approvalId: string; cardInThread?: boolean }>;

/**
 * Registered per tool-ID in AgentRouteDeps.chatHitlDeciders.
 *
 * The decide-approval handler invokes the matching decider when it detects
 * a chat-HITL approval (workflow_id starts with '__chat_hitl:'). The decider
 * executes the actual domain action (e.g. assignTask) directly — no Mastra
 * workflow resume is needed or possible in the chat flow.
 */
export interface ChatHitlDeciderOpts {
  decision: 'approve' | 'reject' | 'modify';
  /** The ApprovalCard stored as proposed_payload when the approval was created. */
  proposedPayload: unknown;
  overrideUserIds?: string[];
  note?: string;
  session: { user_id: string; tenant_id: string };
}

export type ChatHitlDecider = (opts: ChatHitlDeciderOpts) => Promise<void>;

/**
 * Prefix applied to workflow_id for synthetic workflow_runs rows created by
 * the ChatHitlRecorder. The suffix is the tool ID (e.g. `planner_proposeAssignment`).
 * decide-approval uses this prefix to detect chat-HITL rows and skip
 * mastra.getWorkflow().resume() (which would throw — no such workflow exists).
 */
export const CHAT_HITL_WORKFLOW_ID_PREFIX = '__chat_hitl:';
