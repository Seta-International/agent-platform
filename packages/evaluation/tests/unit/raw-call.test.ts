import { MockLanguageModelV3 } from 'ai/test';
import { describe, expect, it } from 'vitest';
import { normalizeInput, rawCall } from '../../src/backend/scoring/raw-call.ts';

describe('normalizeInput', () => {
  it('wraps a bare string as a single user message', () => {
    expect(normalizeInput('hello')).toEqual([{ role: 'user', content: 'hello' }]);
  });

  it('passes through a { messages } array', () => {
    const msgs = [{ role: 'user', content: 'hi' }];
    expect(normalizeInput({ messages: msgs })).toEqual(msgs);
  });

  it('passes through a bare message array', () => {
    const msgs = [
      { role: 'system', content: 's' },
      { role: 'user', content: 'u' },
    ];
    expect(normalizeInput(msgs)).toEqual(msgs);
  });
});

describe('rawCall', () => {
  it('calls the model and returns output text + latency', async () => {
    const model = new MockLanguageModelV3({
      doGenerate: async () =>
        ({
          content: [{ type: 'text', text: '4' }],
          finishReason: { type: 'stop', unified: 'stop', raw: 'stop' },
          usage: { inputTokens: 5, outputTokens: 1 },
          warnings: [],
        }) as never,
    }) as never;
    const res = await rawCall(model, 'What is 2+2?');
    expect(typeof res.output).toBe('string');
    expect(res.latencyMs).toBeGreaterThanOrEqual(0);
  });
});
