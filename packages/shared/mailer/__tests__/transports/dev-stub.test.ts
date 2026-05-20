import { describe, expect, it } from 'vitest';
import { createDevStubTransport } from '../../src/transports/dev-stub.ts';

describe('dev-stub transport', () => {
  it('captures sent messages in memory and returns a fake message id', async () => {
    const t = createDevStubTransport();
    const res = await t.send({
      from: 'noreply@seta.example',
      to: 'a@example.com',
      subject: 's',
      html: '<p>x</p>',
      text: 'x',
    });
    expect(res.messageId).toMatch(/^dev-stub:/);
    expect(t.sent).toHaveLength(1);
    expect(t.sent[0]).toMatchObject({
      from: 'noreply@seta.example',
      to: 'a@example.com',
      subject: 's',
    });
  });
});
