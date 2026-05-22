import { describe, expect, it, vi } from 'vitest';
import { failedLoginAlertSubscriber } from '../src/subscribers/failed-login-alert.ts';

describe('failedLoginAlertSubscriber', () => {
  it('calls mailer.send with the failed-login-alert template + props', async () => {
    const send = vi.fn().mockResolvedValue({ outgoingEmailId: 'mail-1', deduped: false });
    const sub = failedLoginAlertSubscriber({ getMailer: () => ({ send }) as never });

    // as never: minimal stub satisfying just the handler's read paths (id, tenantId, payload)
    await sub.handler(
      {
        id: 'evt-1',
        tenantId: 't-1',
        eventType: 'identity.failed_login.alert_threshold_reached',
        eventVersion: 1,
        payload: {
          email: 'victim@example.com',
          ip: '1.2.3.4',
          geo_country: null,
          attempted_at: '2026-05-22T00:00:00.000Z',
          reset_url: 'https://app.example.com/reset?token=abc',
        },
      } as never,
      {} as never,
    );

    expect(send).toHaveBeenCalledWith({
      template: 'failed-login-alert',
      to: 'victim@example.com',
      tenantId: 't-1',
      dedupeKey: 'evt-1',
      props: {
        displayName: 'victim@example.com',
        ip: '1.2.3.4',
        geo: null,
        attemptedAt: '2026-05-22T00:00:00.000Z',
        resetUrl: 'https://app.example.com/reset?token=abc',
      },
    });
  });

  it('skips send when reset_url is null (unknown email)', async () => {
    const send = vi.fn();
    const sub = failedLoginAlertSubscriber({ getMailer: () => ({ send }) as never });

    // as never: minimal stub satisfying just the handler's read paths (id, tenantId, payload)
    await sub.handler(
      {
        id: 'evt-2',
        tenantId: 't-1',
        eventType: 'identity.failed_login.alert_threshold_reached',
        eventVersion: 1,
        payload: {
          email: 'nobody@example.com',
          ip: '1.2.3.4',
          geo_country: null,
          attempted_at: '2026-05-22T00:00:00.000Z',
          reset_url: null,
        },
      } as never,
      {} as never,
    );
    expect(send).not.toHaveBeenCalled();
  });
});
