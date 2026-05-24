export const COPILOT_COPY = {
  threadsTitle: 'Chat',
  newThread: 'New chat',
  searchThreads: 'Search chats…',
  emptyThreads: {
    title: 'Ask me anything',
    body: 'I can answer questions and take action on your behalf. You’ll review every change before it goes through.',
  },
  composerPlaceholder: 'Ask anything…',
  composerHint: 'Every change waits for your OK',
  modelUnavailable: 'No model is configured yet. Ask your admin to set this up.',
  rateLimited: (s: number) => `You’re going a bit fast — try again in ${s}s.`,
  hitlExpired: 'This request timed out. Ask again to continue.',
  permissionRevoked: 'You don’t have permission for this anymore, so nothing changed.',
} as const;
