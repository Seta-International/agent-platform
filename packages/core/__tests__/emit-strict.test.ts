import { describe, expect, it } from 'vitest';
import { EmitContextRequired, emit } from '../src/events/index.ts';

describe('emit() strict contract', () => {
  it('throws EmitContextRequired when called outside emitContext', async () => {
    await expect(
      emit({
        tenantId: crypto.randomUUID(),
        aggregateType: 'test.entity',
        aggregateId: crypto.randomUUID(),
        eventType: 'test.entity.happened',
        eventVersion: 1,
        payload: {},
      }),
    ).rejects.toBeInstanceOf(EmitContextRequired);
  });
});
