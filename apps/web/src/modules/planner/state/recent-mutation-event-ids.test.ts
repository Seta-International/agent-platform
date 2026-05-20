import { afterEach, describe, expect, it } from 'vitest';
import { __resetRingForTests, isOwnEcho, rememberEventId } from './recent-mutation-event-ids';

afterEach(__resetRingForTests);

describe('recent-mutation-event-ids ring buffer', () => {
  it('remembers ids and reports own echoes', () => {
    rememberEventId('42');
    expect(isOwnEcho('42')).toBe(true);
    expect(isOwnEcho('43')).toBe(false);
  });

  it('evicts oldest past RING_SIZE', () => {
    for (let i = 0; i < 200; i++) rememberEventId(String(i));
    expect(isOwnEcho('0')).toBe(false);
    expect(isOwnEcho('199')).toBe(true);
  });
});
