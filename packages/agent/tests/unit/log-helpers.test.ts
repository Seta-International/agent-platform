import { describe, expect, it, vi } from 'vitest';
import { logError, logWarn } from '../../src/backend/routes/_shared.ts';

/** Mimics pino: `.error`/`.warn` read an instance-private symbol via `this`,
 *  so calling them detached (`const { error } = logger; error(...)`) throws
 *  — exactly the bug these helpers must avoid. */
const msgPrefixSym = Symbol('pino.msgPrefix');
function makePinoLikeLogger() {
  const calls: Array<{ method: string; obj: unknown; msg?: string }> = [];
  return {
    calls,
    [msgPrefixSym]: '[agent] ',
    error(this: { [msgPrefixSym]: string }, obj: unknown, msg?: string) {
      calls.push({ method: 'error', obj, msg: `${this[msgPrefixSym]}${msg}` });
    },
    warn(this: { [msgPrefixSym]: string }, obj: unknown, msg?: string) {
      calls.push({ method: 'warn', obj, msg: `${this[msgPrefixSym]}${msg}` });
    },
  };
}

describe('logError / logWarn', () => {
  it('calls deps.log.error as a bound method (does not detach `this`)', () => {
    const log = makePinoLikeLogger();
    expect(() => logError({ log }, { err: 'boom' }, 'agent chat stream error')).not.toThrow();
    expect(log.calls).toEqual([
      { method: 'error', obj: { err: 'boom' }, msg: '[agent] agent chat stream error' },
    ]);
  });

  it('calls deps.log.warn as a bound method (does not detach `this`)', () => {
    const log = makePinoLikeLogger();
    expect(() => logWarn({ log }, { reason: 'slow' }, 'attachment read slow')).not.toThrow();
    expect(log.calls).toEqual([
      { method: 'warn', obj: { reason: 'slow' }, msg: '[agent] attachment read slow' },
    ]);
  });

  it('falls back to console.error when deps.log is absent', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    logError({}, { err: 'boom' }, 'agent chat stream error');
    expect(spy).toHaveBeenCalledWith({ err: 'boom' }, 'agent chat stream error');
    spy.mockRestore();
  });

  it('falls back to console.warn when deps.log is absent', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    logWarn({}, { reason: 'slow' }, 'attachment read slow');
    expect(spy).toHaveBeenCalledWith({ reason: 'slow' }, 'attachment read slow');
    spy.mockRestore();
  });
});
