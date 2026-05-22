import {
  IDENTITY_FAILED_LOGIN_ALERT_THRESHOLD_REACHED,
  IDENTITY_FAILED_LOGIN_ALERT_THRESHOLD_REACHED_VERSION,
  type IdentityFailedLoginAlertThresholdReachedPayload,
} from '@seta/identity';
import type { Mailer } from '@seta/shared-mailer';
import type { DomainEvent, SubscriberCtx, SubscriberDef } from '@seta/shared-types';

export function failedLoginAlertSubscriber(deps: {
  getMailer: () => Mailer;
}): SubscriberDef<IdentityFailedLoginAlertThresholdReachedPayload> {
  return {
    subscription: 'apps.server.failed-login-alert.send',
    event: IDENTITY_FAILED_LOGIN_ALERT_THRESHOLD_REACHED,
    eventVersion: IDENTITY_FAILED_LOGIN_ALERT_THRESHOLD_REACHED_VERSION,
    handler: async (
      event: DomainEvent<IdentityFailedLoginAlertThresholdReachedPayload>,
      _ctx: SubscriberCtx,
    ) => {
      const { email, ip, geo_country, attempted_at, reset_url } = event.payload;
      if (!reset_url) return;
      await deps.getMailer().send({
        template: 'failed-login-alert',
        to: email,
        tenantId: event.tenantId,
        dedupeKey: event.id,
        props: {
          displayName: email,
          ip,
          geo: geo_country,
          attemptedAt: attempted_at,
          resetUrl: reset_url,
        },
      });
    },
  };
}
