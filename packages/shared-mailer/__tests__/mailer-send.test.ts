import pino from 'pino';
import { describe, expect, it, vi } from 'vitest';
import { createMailer } from '../src/mailer.ts';

const SILENT_LOG = pino({ enabled: false });

function makeDeps() {
  const enqueued: Array<{
    taskName: string;
    payload: unknown;
    opts?: { jobKey?: string; maxAttempts?: number };
  }> = [];
  const upserted: unknown[] = [];
  const events: Array<{ eventType: string; payload: Record<string, unknown> }> = [];
  const deps = {
    env: {
      MAILER_DEFAULT_TRANSPORT: 'dev-stub' as const,
      MAILER_DEFAULT_SENDER: 'noreply@seta.example',
    },
    outboxStore: {
      upsertPending: vi.fn(async (input: unknown) => {
        upserted.push(input);
        return { id: 'outbox-id-1', deduped: false };
      }),
      findById: vi.fn(),
      markSent: vi.fn(),
      markFailedTransient: vi.fn(),
      markPermanentlyFailed: vi.fn(),
    },
    queue: {
      addJob: vi.fn(
        async (
          taskName: string,
          payload: unknown,
          opts?: { jobKey?: string; maxAttempts?: number },
        ) => {
          enqueued.push({ taskName, payload, opts });
        },
      ),
    },
    emit: vi.fn(async (e: { eventType: string; payload: Record<string, unknown> }) => {
      events.push({ eventType: e.eventType, payload: e.payload });
    }),
    log: SILENT_LOG,
  };
  return { deps, enqueued, upserted, events };
}

describe('mailer.send', () => {
  it('inserts outbox row, emits queued, enqueues worker job', async () => {
    const { deps, enqueued } = makeDeps();
    const mailer = createMailer(deps as never);
    const out = await mailer.send({
      to: 'A@Example.com',
      template: 'verify-email',
      props: {
        displayName: 'Alex',
        verifyUrl: 'https://x',
        expiresAt: '2026-05-21',
      },
      tenantId: 'tenant-1',
      dedupeKey: 'verify-email:user-1:nonce-1',
    });
    expect(out.outgoingEmailId).toBe('outbox-id-1');
    expect(out.deduped).toBe(false);
    expect(deps.outboxStore.upsertPending).toHaveBeenCalledWith(
      expect.objectContaining({
        toAddress: 'a@example.com',
        template: 'verify-email',
        dedupeKey: 'verify-email:user-1:nonce-1',
      }),
    );
    expect(enqueued[0]).toMatchObject({
      taskName: 'mailer:send',
      opts: { jobKey: 'outbox-id-1', maxAttempts: 8 },
    });
    expect(deps.emit).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'core.email.queued' }),
    );
  });

  it('returns deduped=true and skips queue when conflict', async () => {
    const enqueued: unknown[] = [];
    const deps = {
      env: {
        MAILER_DEFAULT_TRANSPORT: 'dev-stub' as const,
        MAILER_DEFAULT_SENDER: 'noreply@seta.example',
      },
      outboxStore: {
        upsertPending: vi.fn(async () => ({ id: 'outbox-id-1', deduped: true })),
        findById: vi.fn(),
        markSent: vi.fn(),
        markFailedTransient: vi.fn(),
        markPermanentlyFailed: vi.fn(),
      },
      queue: { addJob: vi.fn(async (...args: unknown[]) => void enqueued.push(args)) },
      emit: vi.fn(async () => undefined),
      log: SILENT_LOG,
    };
    const mailer = createMailer(deps as never);
    const out = await mailer.send({
      to: 'a@example.com',
      template: 'verify-email',
      props: { displayName: 'Alex', verifyUrl: 'https://x', expiresAt: '2026-05-21' },
      tenantId: 'tenant-1',
      dedupeKey: 'k',
    });
    expect(out.deduped).toBe(true);
    expect(deps.queue.addJob).not.toHaveBeenCalled();
    expect(deps.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'core.email.queued',
        payload: expect.objectContaining({ deduped: true }),
      }),
    );
  });

  it('rejects on invalid recipient email', async () => {
    const { deps } = makeDeps();
    const mailer = createMailer(deps as never);
    await expect(
      mailer.send({
        to: 'not-an-email',
        template: 'verify-email',
        props: { displayName: 'x', verifyUrl: 'https://x', expiresAt: 'now' },
        tenantId: 't',
        dedupeKey: 'k',
      }),
    ).rejects.toThrow();
  });
});
