// Standalone thread-title generation for the orchestration chat.
//
// Why this exists: the orchestrator runs with `memory: { options: { readOnly:
// true } }` so Mastra does NOT auto-persist messages on top of our curated
// tool-trace timeline. But `readOnly` also disables Mastra's built-in
// `generateTitle` — both `createThread` and the title call sit behind the same
// `!readOnlyMemory` guard (see `@mastra/core` agent.ts: the
// `if (memory && resourceId && thread && !readOnlyMemory)` block). So to keep
// supervisor parity (auto-titled threads) we generate the title ourselves,
// reusing Mastra's own `Agent.generateTitleFromUserMessage` (which carries the
// same default 80-char, no-quotes title instructions) and write it via the
// store's `updateThread`.

import { Agent } from '@mastra/core/agent';
import type { MastraModelConfig } from '@mastra/core/llm';

/** Defensive cleanup of a model-produced title. The default Mastra title
 *  instructions already steer the model, but models occasionally wrap the
 *  title in quotes, add a stray newline, or (for r1-style models) leak a
 *  `<think>` block — so we normalize and bound the result, falling back to the
 *  caller's deterministic label when nothing usable remains. */
export function cleanThreadTitle(raw: string, fallback: string): string {
  const cleaned = raw
    .replace(/<think>[\s\S]*?<\/think>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^["']+|["']+$/g, '')
    .trim()
    .slice(0, 80);
  return cleaned || fallback;
}

/** Generate a concise thread title from the user's first message, reusing
 *  Mastra's title logic. Returns the cleaned title, or `fallback` if the model
 *  yields nothing usable. Never throws — a titling failure must not break the
 *  chat turn; callers log and move on. */
export async function generateThreadTitle(opts: {
  userText: string;
  model: MastraModelConfig;
  fallback: string;
}): Promise<string> {
  const agent = new Agent({
    id: 'agent.thread-title',
    name: 'Thread Title',
    instructions: 'Generate concise conversation titles.',
    model: opts.model,
  });
  const raw = await agent.generateTitleFromUserMessage({ message: opts.userText });
  return cleanThreadTitle(raw ?? '', opts.fallback);
}
