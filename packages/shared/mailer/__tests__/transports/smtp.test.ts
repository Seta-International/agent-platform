import nodemailer from 'nodemailer';
import { describe, expect, it } from 'vitest';
import { createSmtpTransportFromTransporter } from '../../src/transports/smtp.ts';

describe('smtp transport', () => {
  it('builds a properly-shaped envelope via nodemailer.jsonTransport', async () => {
    const inner = nodemailer.createTransport({ jsonTransport: true });
    const t = createSmtpTransportFromTransporter(inner);
    const out = await t.send({
      from: 'noreply@seta.example',
      fromDisplayName: 'Seta',
      to: 'a@example.com',
      replyTo: 'help@seta.example',
      subject: 's',
      html: '<p>x</p>',
      text: 'x',
    });
    expect(out.messageId).toBeTruthy();
  });

  it('classifies a 5xx-class auth failure as permanent', async () => {
    const failing = {
      sendMail: async () => {
        const err = new Error('Invalid login') as Error & {
          responseCode?: number;
          code?: string;
        };
        err.responseCode = 535;
        err.code = 'EAUTH';
        throw err;
      },
    } as unknown as nodemailer.Transporter;
    const t = createSmtpTransportFromTransporter(failing);
    await expect(
      t.send({ from: 'a', to: 'b', subject: 's', html: 'x', text: 'x' }),
    ).rejects.toMatchObject({
      classification: 'permanent',
      code: 'EAUTH',
    });
  });

  it('classifies ECONNREFUSED as transient', async () => {
    const failing = {
      sendMail: async () => {
        const err = new Error('connect ECONNREFUSED') as Error & { code?: string };
        err.code = 'ECONNREFUSED';
        throw err;
      },
    } as unknown as nodemailer.Transporter;
    const t = createSmtpTransportFromTransporter(failing);
    await expect(
      t.send({ from: 'a', to: 'b', subject: 's', html: 'x', text: 'x' }),
    ).rejects.toMatchObject({
      classification: 'transient',
      code: 'ECONNREFUSED',
    });
  });
});
