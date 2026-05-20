import { describe, expect, it } from 'vitest';
import { createSmtpTransport } from '../../src/transports/smtp.ts';

const MAILHOG = process.env.SETA_MAILHOG_URL ?? '';
const run = MAILHOG ? describe : describe.skip;

run('smtp transport — mailhog e2e', () => {
  it('delivers a real SMTP message that mailhog accepts', async () => {
    const t = createSmtpTransport({
      host: new URL(MAILHOG).hostname,
      port: 1025,
      username: '',
      password: '',
      requireTls: false,
    });
    const r = await t.send({
      from: 'noreply@seta.test',
      to: 'recipient@example.com',
      subject: 'mailhog test',
      html: '<p>hello</p>',
      text: 'hello',
    });
    expect(r.messageId).toBeTruthy();

    const httpUrl = MAILHOG.replace(':1025', ':8025').replace('smtp://', 'http://');
    const res = await fetch(`${httpUrl}/api/v2/messages`);
    const json = (await res.json()) as {
      items: Array<{ Content: { Headers: Record<string, string[]> } }>;
    };
    const found = json.items.some((m) => m.Content.Headers.Subject?.[0] === 'mailhog test');
    expect(found).toBe(true);
  });
});
