import {
  IDENTITY_USER_DEACTIVATED,
  IDENTITY_USER_DEACTIVATED_VERSION,
  type IdentityUserDeactivatedPayload,
  listUserSessions,
  revokeUserSession,
} from '@seta/identity';
import type { DomainEvent, SubscriberCtx, SubscriberDef } from '@seta/shared-types';

/**
 * When admin deactivates a user, every live session for that user must die
 * within one dispatcher tick so the deactivated account can't continue making
 * authenticated requests. Re-uses revokeUserSession so each revocation lands
 * in core.events as an audited identity.session.revoked, keyed off the
 * delivered event_id for idempotency at the subscription level.
 */
export function revokeSessionsOnDeactivationSubscriber(): SubscriberDef<IdentityUserDeactivatedPayload> {
  return {
    subscription: 'apps.server.revoke-sessions-on-deactivation',
    event: IDENTITY_USER_DEACTIVATED,
    eventVersion: IDENTITY_USER_DEACTIVATED_VERSION,
    handler: async (event: DomainEvent<IdentityUserDeactivatedPayload>, _ctx: SubscriberCtx) => {
      const { user_id, tenant_id } = event.payload;
      const systemActor = { type: 'system' as const, user_id: null };

      const sessions = await listUserSessions(
        { tenant_id, user_id, current_session_id: null },
        systemActor,
      );

      for (const sess of sessions) {
        try {
          await revokeUserSession(
            {
              tenant_id,
              user_id,
              session_id: sess.session_id,
              current_session_id: null,
            },
            systemActor,
          );
        } catch (err) {
          // If a session was already deleted (rare race), keep going.
          if (err instanceof Error && /Session not found/i.test(err.message)) continue;
          throw err;
        }
      }
    },
  };
}
