import { describe, expect, it } from 'vitest';
import { normalizeInput, rawCall } from '../../src/backend/scoring/raw-call.ts';
import { resolveModel } from '../../src/backend/scoring/resolve-model.ts';

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
    // Mock model returns canned text deterministically (offline).
    const model = resolveModel('mock/test');
    const res = await rawCall(model, 'What is 2+2?');
    expect(typeof res.output).toBe('string');
    expect(res.latencyMs).toBeGreaterThanOrEqual(0);
  });
});
