import { afterEach, describe, expect, it } from 'vitest';
import {
  clearLastApp,
  readLastApp,
  resolveLanding,
  writeLastApp,
} from '../../../src/shell/last-app';

afterEach(() => localStorage.clear());

describe('last-app', () => {
  it('persists and reads the last app per user', () => {
    writeLastApp('user-1', 'agent');
    expect(readLastApp('user-1')).toBe('agent');
    expect(readLastApp('user-2')).toBeUndefined();
  });
  it('resolveLanding returns last app when still permitted', () => {
    writeLastApp('user-1', 'agent');
    expect(resolveLanding('user-1', ['planner', 'agent', 'admin'])).toBe('/agent');
  });
  it('falls back to the first permitted app when last app is gone', () => {
    writeLastApp('user-1', 'people');
    expect(resolveLanding('user-1', ['planner', 'admin'])).toBe('/planner');
  });
  it('returns undefined landing when no apps are permitted', () => {
    expect(resolveLanding('user-1', [])).toBeUndefined();
  });
  it('clearLastApp removes the key', () => {
    writeLastApp('user-1', 'agent');
    clearLastApp('user-1');
    expect(readLastApp('user-1')).toBeUndefined();
  });
});
