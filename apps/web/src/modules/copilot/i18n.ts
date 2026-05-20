export const COPILOT_COPY = {
  threadsTitle: 'Chat',
  newThread: 'New thread',
  searchThreads: 'Search threads…',
  emptyThreads: {
    title: 'Start a conversation',
    body: 'Ask anything about your work. Changes that affect data will pause for your review.',
  },
  composerPlaceholder: 'Message your assistant…',
  composerHint: 'You’ll review any change before it’s applied',
  modelUnavailable: 'Set COPILOT_MODEL + key in .env to enable the assistant.',
  rateLimited: (s: number) => `You hit your per-minute limit — retry in ${s}s`,
  hitlExpired: 'This request expired. Try again to continue.',
  permissionRevoked: 'Your role no longer permits this — the change was not applied.',
} as const;
