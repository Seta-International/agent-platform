import { describe, expect, it, vi } from 'vitest';
import { runEmbedBackfill } from '../src/commands/embed-backfill.ts';

describe('embed-backfill CLI', () => {
  it('dispatches to backfillTasks with planner', async () => {
    const backfillTasks = vi.fn(async () => {});
    const fakePool = { end: vi.fn(async () => {}) };
    await runEmbedBackfill(
      { module: 'planner', tenant: '00000000-0000-0000-0000-000000000000' },
      {
        backfillTasks: backfillTasks as never,
        env: { OPENAI_API_KEY: 'k' },
        pool: fakePool as never,
      },
    );
    expect(backfillTasks).toHaveBeenCalledOnce();
    expect(backfillTasks).toHaveBeenCalledWith(
      expect.objectContaining({
        tenant_id: '00000000-0000-0000-0000-000000000000',
        model: 'text-embedding-3-small',
      }),
    );
  });

  it('dispatches to backfillUserProfiles with identity', async () => {
    const backfillUserProfiles = vi.fn(async () => {});
    const fakePool = { end: vi.fn(async () => {}) };
    await runEmbedBackfill(
      { module: 'identity', tenant: '00000000-0000-0000-0000-000000000000' },
      {
        backfillUserProfiles: backfillUserProfiles as never,
        env: { OPENAI_API_KEY: 'k' },
        pool: fakePool as never,
      },
    );
    expect(backfillUserProfiles).toHaveBeenCalledOnce();
    expect(backfillUserProfiles).toHaveBeenCalledWith(
      expect.objectContaining({
        tenant_id: '00000000-0000-0000-0000-000000000000',
        model: 'text-embedding-3-small',
      }),
    );
  });

  it('throws on unsupported module', async () => {
    await expect(
      runEmbedBackfill({ module: 'foo', tenant: 't' }, { env: { OPENAI_API_KEY: 'k' } }),
    ).rejects.toThrow(/unsupported module/);
  });

  it('throws when OPENAI_API_KEY missing', async () => {
    await expect(runEmbedBackfill({ module: 'planner', tenant: 't' }, { env: {} })).rejects.toThrow(
      /OPENAI_API_KEY/,
    );
  });

  it('respects EMBED_MODEL env override', async () => {
    const backfillTasks = vi.fn(async () => {});
    const fakePool = { end: vi.fn(async () => {}) };
    await runEmbedBackfill(
      { module: 'planner', tenant: 'tt' },
      {
        backfillTasks: backfillTasks as never,
        env: { OPENAI_API_KEY: 'k', EMBED_MODEL: 'text-embedding-3-large' },
        pool: fakePool as never,
      },
    );
    expect(backfillTasks).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'text-embedding-3-large' }),
    );
  });
});
