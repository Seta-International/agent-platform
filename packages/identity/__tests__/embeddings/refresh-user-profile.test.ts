/**
 * Unit tests for the refresh-user-profile CDC subscribers.
 *
 * No DB required — handlers are invoked with a fake ctx whose tx.execute spy
 * records the graphile_worker.add_job call arguments.
 */
import { describe, expect, it, vi } from 'vitest';
import {
  refreshUserProfileCreatedSubscriber,
  refreshUserProfileDeactivatedSubscriber,
  refreshUserProfileUpdatedSubscriber,
} from '../../src/backend/embeddings/subscribers/refresh-user-profile.ts';

// ── Fake ctx ────────────────────────────────────────────────────────────────

function makeFakeCtx() {
  const executeSpy = vi.fn().mockResolvedValue({ rows: [] });
  const ctx = {
    tx: {
      execute: executeSpy,
    },
  };
  return { ctx, executeSpy };
}

// ── Event factories ─────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-0000-0000-0000-000000000001';
const USER_ID = 'bbbbbbbb-0000-0000-0000-000000000002';
const EVENT_ID = 'cccccccc-0000-0000-0000-000000000003';

function makeCreatedEvent() {
  return {
    id: EVENT_ID,
    occurredAt: new Date(),
    tenantId: TENANT_ID,
    aggregateType: 'identity.user' as const,
    aggregateId: USER_ID,
    eventType: 'identity.user.created' as const,
    eventVersion: 1 as const,
    payload: {
      actor: { type: 'cli' as const, user_id: null },
      after: {
        user_id: USER_ID,
        tenant_id: TENANT_ID,
        email: 'test@example.com',
        name: 'Test User',
        created_via: 'admin' as const,
      },
    },
  };
}

function makeUpdatedEvent(after: Record<string, unknown>) {
  return {
    id: EVENT_ID,
    occurredAt: new Date(),
    tenantId: TENANT_ID,
    aggregateType: 'identity.user' as const,
    aggregateId: USER_ID,
    eventType: 'identity.user.profile.updated' as const,
    eventVersion: 1 as const,
    payload: {
      actor: { type: 'user' as const, user_id: USER_ID },
      user_id: USER_ID,
      before: {},
      after,
    },
  };
}

function makeDeactivatedEvent() {
  return {
    id: EVENT_ID,
    occurredAt: new Date(),
    tenantId: TENANT_ID,
    aggregateType: 'identity.user' as const,
    aggregateId: USER_ID,
    eventType: 'identity.user.deactivated' as const,
    eventVersion: 1 as const,
    payload: {
      actor: { type: 'cli' as const, user_id: null },
      user_id: USER_ID,
      tenant_id: TENANT_ID,
      deactivated_at: new Date().toISOString(),
    },
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('refreshUserProfileCreatedSubscriber', () => {
  it('metadata', () => {
    expect(refreshUserProfileCreatedSubscriber.event).toBe('identity.user.created');
    expect(refreshUserProfileCreatedSubscriber.eventVersion).toBe(1);
    expect(typeof refreshUserProfileCreatedSubscriber.subscription).toBe('string');
  });

  it('enqueues embed_user_profile with correct jobKey + replace + maxAttempts 10', async () => {
    const { ctx, executeSpy } = makeFakeCtx();
    await refreshUserProfileCreatedSubscriber.handler(makeCreatedEvent() as never, ctx as never);

    expect(executeSpy).toHaveBeenCalledOnce();
    const serialised = JSON.stringify(executeSpy.mock.calls[0][0]);
    expect(serialised).toContain('embed_user_profile');
    expect(serialised).toContain(`embed_user_profile:${TENANT_ID}:${USER_ID}`);
    expect(serialised).toContain('replace');
    expect(serialised).toContain('10');
  });

  it('passes tenant_id + user_id + event_id in payload', async () => {
    const { ctx, executeSpy } = makeFakeCtx();
    await refreshUserProfileCreatedSubscriber.handler(makeCreatedEvent() as never, ctx as never);

    const serialised = JSON.stringify(executeSpy.mock.calls[0][0]);
    expect(serialised).toContain(TENANT_ID);
    expect(serialised).toContain(USER_ID);
    expect(serialised).toContain(EVENT_ID);
  });
});

describe('refreshUserProfileUpdatedSubscriber', () => {
  it('metadata', () => {
    expect(refreshUserProfileUpdatedSubscriber.event).toBe('identity.user.profile.updated');
    expect(refreshUserProfileUpdatedSubscriber.eventVersion).toBe(1);
    expect(typeof refreshUserProfileUpdatedSubscriber.subscription).toBe('string');
  });

  it('does NOT enqueue when after does not contain skills', async () => {
    const { ctx, executeSpy } = makeFakeCtx();
    await refreshUserProfileUpdatedSubscriber.handler(
      makeUpdatedEvent({ display_name: 'New Name', timezone: 'UTC' }) as never,
      ctx as never,
    );
    expect(executeSpy).not.toHaveBeenCalled();
  });

  it('enqueues when after contains skills', async () => {
    const { ctx, executeSpy } = makeFakeCtx();
    await refreshUserProfileUpdatedSubscriber.handler(
      makeUpdatedEvent({ skills: ['typescript', 'postgres'] }) as never,
      ctx as never,
    );
    expect(executeSpy).toHaveBeenCalledOnce();
  });

  it('enqueues with jobKey replace + maxAttempts 10 when skills changed', async () => {
    const { ctx, executeSpy } = makeFakeCtx();
    await refreshUserProfileUpdatedSubscriber.handler(
      makeUpdatedEvent({ skills: ['go'] }) as never,
      ctx as never,
    );
    const serialised = JSON.stringify(executeSpy.mock.calls[0][0]);
    expect(serialised).toContain(`embed_user_profile:${TENANT_ID}:${USER_ID}`);
    expect(serialised).toContain('replace');
    expect(serialised).toContain('10');
  });
});

describe('refreshUserProfileDeactivatedSubscriber', () => {
  it('metadata', () => {
    expect(refreshUserProfileDeactivatedSubscriber.event).toBe('identity.user.deactivated');
    expect(refreshUserProfileDeactivatedSubscriber.eventVersion).toBe(1);
    expect(typeof refreshUserProfileDeactivatedSubscriber.subscription).toBe('string');
  });

  it('enqueues embed_user_profile for deactivated user', async () => {
    const { ctx, executeSpy } = makeFakeCtx();
    await refreshUserProfileDeactivatedSubscriber.handler(
      makeDeactivatedEvent() as never,
      ctx as never,
    );

    expect(executeSpy).toHaveBeenCalledOnce();
    const serialised = JSON.stringify(executeSpy.mock.calls[0][0]);
    expect(serialised).toContain('embed_user_profile');
    expect(serialised).toContain(`embed_user_profile:${TENANT_ID}:${USER_ID}`);
  });
});
