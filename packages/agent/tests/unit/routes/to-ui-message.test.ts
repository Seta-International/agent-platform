import { describe, expect, it } from 'vitest';
import { toUIMessage } from '../../../src/backend/routes/_shared.ts';

function stored(parts: unknown[]) {
  return { id: 'm-1', role: 'assistant', content: { parts } } as never;
}

describe('toUIMessage', () => {
  it('replays the approval anchor so a reloaded card keeps its place in the turn', () => {
    const msg = toUIMessage(
      stored([
        { type: 'text', text: 'Assigning.' },
        { type: 'data-approval', id: 'tc-9', data: { toolCallId: 'tc-9' } },
      ]),
      0,
    );
    expect(msg?.parts).toContainEqual({
      type: 'data-approval',
      id: 'tc-9',
      data: { toolCallId: 'tc-9' },
    });
  });

  it('drops an approval anchor with no toolCallId rather than rendering an orphan card', () => {
    const msg = toUIMessage(stored([{ type: 'text', text: 'hi' }, { type: 'data-approval' }]), 0);
    expect(msg?.parts.some((p) => p.type === 'data-approval')).toBe(false);
  });
});
