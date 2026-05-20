import { describe, expect, it } from 'vitest';
import { resetCoreDb } from '../src/db/client.ts';
import { createOutboxStore } from '../src/outbox/store.ts';
import { withCoreTestDb } from '../test/test-helpers.ts';

describe('outbox store', () => {
  it('upsertPending inserts a row and returns deduped=false', async () => {
    await withCoreTestDb(async ({ db }) => {
      resetCoreDb();
      const store = createOutboxStore({ db });
      const tenantId = crypto.randomUUID();
      const r = await store.upsertPending({
        tenantId,
        dedupeKey: 'k1',
        template: 'verify-email',
        toAddress: 'a@example.com',
        propsHash: 'h1',
      });
      expect(r.deduped).toBe(false);
      expect(r.id).toMatch(/^[0-9a-f-]{36}$/);
    });
  });

  it('upsertPending returns deduped=true on second call with same key', async () => {
    await withCoreTestDb(async ({ db }) => {
      resetCoreDb();
      const store = createOutboxStore({ db });
      const tenantId = crypto.randomUUID();
      const first = await store.upsertPending({
        tenantId,
        dedupeKey: 'k1',
        template: 'verify-email',
        toAddress: 'a@example.com',
        propsHash: 'h1',
      });
      const second = await store.upsertPending({
        tenantId,
        dedupeKey: 'k1',
        template: 'verify-email',
        toAddress: 'a@example.com',
        propsHash: 'h1',
      });
      expect(second.deduped).toBe(true);
      expect(second.id).toBe(first.id);
    });
  });

  it('markSent transitions status to sent with transport metadata', async () => {
    await withCoreTestDb(async ({ db }) => {
      resetCoreDb();
      const store = createOutboxStore({ db });
      const tenantId = crypto.randomUUID();
      const { id } = await store.upsertPending({
        tenantId,
        dedupeKey: 'k1',
        template: 'verify-email',
        toAddress: 'a@example.com',
        propsHash: 'h1',
      });
      await store.markSent(id, { transportKind: 'dev-stub', transportMessageId: 'msg-1' });
      const row = await store.findById(id);
      expect(row?.status).toBe('sent');
      expect(row?.transportKind).toBe('dev-stub');
      expect(row?.transportMessageId).toBe('msg-1');
      expect(row?.sentAt).toBeInstanceOf(Date);
      expect(row?.attempts).toBe(1);
    });
  });

  it('markFailedTransient increments attempts and records error without changing status', async () => {
    await withCoreTestDb(async ({ db }) => {
      resetCoreDb();
      const store = createOutboxStore({ db });
      const tenantId = crypto.randomUUID();
      const { id } = await store.upsertPending({
        tenantId,
        dedupeKey: 'k1',
        template: 'verify-email',
        toAddress: 'a@example.com',
        propsHash: 'h1',
      });
      await store.markFailedTransient(id, { transportKind: 'smtp', error: 'ECONNREFUSED' });
      const row = await store.findById(id);
      expect(row?.status).toBe('pending');
      expect(row?.attempts).toBe(1);
      expect(row?.lastError).toBe('ECONNREFUSED');
      expect(row?.transportKind).toBe('smtp');
    });
  });

  it('markPermanentlyFailed transitions to permanently_failed', async () => {
    await withCoreTestDb(async ({ db }) => {
      resetCoreDb();
      const store = createOutboxStore({ db });
      const tenantId = crypto.randomUUID();
      const { id } = await store.upsertPending({
        tenantId,
        dedupeKey: 'k1',
        template: 'verify-email',
        toAddress: 'a@example.com',
        propsHash: 'h1',
      });
      await store.markPermanentlyFailed(id, {
        transportKind: 'graph',
        errorCode: 'AUTH_DENIED',
        error: 'ErrorAccessDenied',
      });
      const row = await store.findById(id);
      expect(row?.status).toBe('permanently_failed');
      expect(row?.attempts).toBe(1);
      expect(row?.lastError).toBe('ErrorAccessDenied');
    });
  });
});
