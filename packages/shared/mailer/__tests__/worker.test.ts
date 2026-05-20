import pino from 'pino';
import { describe, expect, it, vi } from 'vitest';
import type { OutboxStoreLike } from '../src/mailer.ts';
import { createMailerSendTask } from '../src/queue/worker.ts';
import type { ResolvedTransport } from '../src/resolve-transport.ts';
import { TransportError } from '../src/transports/types.ts';

const SILENT_LOG = pino({ enabled: false });

function makeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'outbox-1',
    tenantId: 'tenant-1',
    dedupeKey: 'k',
    template: 'verify-email',
    toAddress: 'a@example.com',
    propsHash: 'h',
    transportKind: null,
    status: 'pending',
    attempts: 0,
    lastError: null,
    lastErrorAt: null,
    transportMessageId: null,
    createdAt: new Date(),
    sentAt: null,
    ...overrides,
  };
}

function makeDeps(rowOverrides: Record<string, unknown> = {}, transport?: ResolvedTransport) {
  const row = makeRow(rowOverrides);
  const store: OutboxStoreLike = {
    upsertPending: vi.fn(),
    findById: vi.fn(async () => row),
    markSent: vi.fn(),
    markFailedTransient: vi.fn(),
    markPermanentlyFailed: vi.fn(),
  };
  const t: ResolvedTransport = transport ?? {
    transport: {
      kind: 'dev-stub',
      send: vi.fn(async () => ({ messageId: 'm-1' })),
    },
    sender: 'noreply@seta.example',
    transportKind: 'dev-stub',
  };
  return {
    row,
    store,
    transport: t,
    emit: vi.fn(async () => undefined),
    log: SILENT_LOG,
  };
}

describe('mailer:send worker', () => {
  it('renders, sends, marks sent, emits core.email.sent', async () => {
    const d = makeDeps();
    const task = createMailerSendTask({
      outboxStore: d.store,
      resolveTransport: async () => d.transport,
      emit: d.emit,
      log: d.log,
    });
    await task({
      outgoingEmailId: 'outbox-1',
      props: { displayName: 'Alex', verifyUrl: 'https://x', expiresAt: 'now' },
    });
    expect(d.transport.transport.send).toHaveBeenCalled();
    expect(d.store.markSent).toHaveBeenCalledWith('outbox-1', {
      transportKind: 'dev-stub',
      transportMessageId: 'm-1',
    });
    expect(d.emit).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'core.email.sent' }));
  });

  it('no-ops when row already sent', async () => {
    const d = makeDeps({ status: 'sent' });
    const task = createMailerSendTask({
      outboxStore: d.store,
      resolveTransport: async () => d.transport,
      emit: d.emit,
      log: d.log,
    });
    await task({ outgoingEmailId: 'outbox-1', props: {} });
    expect(d.transport.transport.send).not.toHaveBeenCalled();
    expect(d.store.markSent).not.toHaveBeenCalled();
  });

  it('marks transient and rethrows so graphile-worker retries', async () => {
    const transient: ResolvedTransport = {
      transport: {
        kind: 'smtp',
        send: vi.fn(async () => {
          throw new TransportError('smtp', 'transient', 'ECONNREFUSED', 'refused');
        }),
      },
      sender: 'x',
      transportKind: 'smtp',
    };
    const d = makeDeps({}, transient);
    const task = createMailerSendTask({
      outboxStore: d.store,
      resolveTransport: async () => d.transport,
      emit: d.emit,
      log: d.log,
    });
    await expect(
      task({
        outgoingEmailId: 'outbox-1',
        props: { displayName: 'x', verifyUrl: 'https://x', expiresAt: 'now' },
      }),
    ).rejects.toMatchObject({ classification: 'transient' });
    expect(d.store.markFailedTransient).toHaveBeenCalledWith('outbox-1', {
      transportKind: 'smtp',
      error: 'refused',
    });
    expect(d.store.markPermanentlyFailed).not.toHaveBeenCalled();
  });

  it('marks permanent and does not rethrow', async () => {
    const permanent: ResolvedTransport = {
      transport: {
        kind: 'graph',
        send: vi.fn(async () => {
          throw new TransportError('graph', 'permanent', 'GRAPH_401', 'unauthorized');
        }),
      },
      sender: 'x',
      transportKind: 'graph',
    };
    const d = makeDeps({}, permanent);
    const task = createMailerSendTask({
      outboxStore: d.store,
      resolveTransport: async () => d.transport,
      emit: d.emit,
      log: d.log,
    });
    await task({
      outgoingEmailId: 'outbox-1',
      props: { displayName: 'x', verifyUrl: 'https://x', expiresAt: 'now' },
    });
    expect(d.store.markPermanentlyFailed).toHaveBeenCalledWith('outbox-1', {
      transportKind: 'graph',
      errorCode: 'GRAPH_401',
      error: 'unauthorized',
    });
    expect(d.emit).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'core.email.permanently_failed' }),
    );
  });
});
