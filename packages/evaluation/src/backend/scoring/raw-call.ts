import { Agent } from '@mastra/core/agent';
import type { MastraModelConfig } from '@mastra/core/llm';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface RawCallResult {
  output: string;
  latencyMs: number;
}

export function normalizeInput(input: unknown): ChatMessage[] {
  if (typeof input === 'string') return [{ role: 'user', content: input }];
  if (Array.isArray(input)) return input as ChatMessage[];
  if (
    input &&
    typeof input === 'object' &&
    Array.isArray((input as { messages?: unknown }).messages)
  ) {
    return (input as { messages: ChatMessage[] }).messages;
  }
  return [{ role: 'user', content: JSON.stringify(input) }];
}

/**
 * Run the model under test on a case input. Empty `instructions` so we test the
 * bare model, not an injected system prompt.
 */
export async function rawCall(model: MastraModelConfig, input: unknown): Promise<RawCallResult> {
  const messages = normalizeInput(input);
  const agent = new Agent({
    id: 'evaluation.raw-call',
    name: 'Evaluation Raw Call',
    instructions: '',
    model,
  });
  const start = performance.now();
  const r = await agent.generate(messages as never);
  const latencyMs = Math.round(performance.now() - start);
  return { output: r.text ?? '', latencyMs };
}
