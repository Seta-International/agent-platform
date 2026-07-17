export const AGENT_COPY = {
  threadsTitle: 'Chat',
  newThread: 'New chat',
  searchThreads: 'Search chats…',
  emptyThreads: {
    title: 'Ask me anything',
    body: 'I can answer questions and take action on your behalf. You’ll review every change before it goes through.',
  },
  emptySuggestions: ['Summarize this plan', 'Who’s assigned to what?', 'What’s blocked?'] as const,
  composerPlaceholder: 'Ask anything…',
  composerHint: 'Every change waits for your OK',
  modelUnavailable: 'No model is configured yet. Ask your admin to set this up.',
  rateLimited: (s: number) => `You’re going a bit fast — try again in ${s}s.`,
  hitlExpired: 'This request timed out. Ask again to continue.',
  permissionRevoked: 'You don’t have permission for this anymore, so nothing changed.',
} as const;

export type EmptyLaneId = 'general' | 'planner' | 'people' | 'knowledge';

export interface EmptyCard {
  /** Short card title (the bold line). */
  title: string;
  /** One-line hint shown under the title; sent verbatim to the composer on click. */
  prompt: string;
}

export interface EmptyLane {
  id: EmptyLaneId;
  label: string;
  cards: readonly [EmptyCard, EmptyCard, EmptyCard];
}

// Empty-state suggestion lanes. Order is LOCKED (General default, first):
// General → Planner → People → Knowledge. Copy is locked by the Slice C spec and
// every prompt maps to a real agent tool. Guardrails baked in: Knowledge is
// search-only (upload is UI-only, never a chat prompt); People "available" =
// presence + in-progress task load, not calendar.
export const EMPTY_LANES: readonly [EmptyLane, EmptyLane, EmptyLane, EmptyLane] = [
  {
    id: 'general',
    label: 'General',
    cards: [
      { title: 'What can you do', prompt: 'List everything you help with' },
      { title: 'My access', prompt: 'What am I allowed to do?' },
      { title: 'Who am I', prompt: 'My profile & server time' },
    ],
  },
  {
    id: 'planner',
    label: 'Planner',
    cards: [
      { title: 'Plan my week', prompt: 'Build a schedule from my open tasks' },
      { title: 'What’s overdue', prompt: 'Overdue & blocked tasks in this plan' },
      { title: 'Create a task', prompt: 'Add one & flag duplicates' },
    ],
  },
  {
    id: 'people',
    label: 'People',
    cards: [
      { title: 'Find an expert', prompt: 'Who on the team knows Kubernetes?' },
      { title: 'Skilled in a group', prompt: 'Backend devs with Docker here' },
      { title: 'Who’s available', prompt: 'Recommend someone to own this task' },
    ],
  },
  {
    id: 'knowledge',
    label: 'Knowledge',
    cards: [
      { title: 'Ask the handbook', prompt: 'What does our leave policy say?' },
      { title: 'Find a policy', prompt: 'Does security cover data retention?' },
      { title: 'Search docs', prompt: 'Onboarding: equipment section' },
    ],
  },
] as const;
