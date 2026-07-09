import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';
import { toHaveNoViolations } from 'jest-axe';
import { afterEach, expect, vi } from 'vitest';

// Planner components gate actions with usePermission(), which reads the session via useSession().
// Most unit tests render those components without a SessionProvider, so stub usePermission to grant
// access globally — these tests pre-date permission gating and assume full access. Every other
// @seta/web-identity export keeps its real implementation (useSession, SessionProvider, API helpers).
// Tests that need to assert the no-permission (disabled) state can override usePermission per-file.
vi.mock('@seta/web-identity', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@seta/web-identity')>()),
  usePermission: () => true,
}));

// Node ≥ 24 exposes an experimental opt-in localStorage that resolves to undefined
// unless --localstorage-file is passed. Shim it with an in-memory implementation so
// tests that call localStorage.* work inside happy-dom without the flag.
if (typeof localStorage === 'undefined') {
  const _store: Record<string, string> = {};
  const localStorageShim: Storage = {
    getItem: (k: string) => (Object.hasOwn(_store, k) ? (_store[k] as string) : null),
    setItem: (k: string, v: string) => {
      _store[k] = String(v);
    },
    removeItem: (k: string) => {
      delete _store[k];
    },
    clear: () => {
      for (const k of Object.keys(_store)) delete _store[k];
    },
    key: (i: number) => Object.keys(_store)[i] ?? null,
    get length() {
      return Object.keys(_store).length;
    },
  };
  Object.defineProperty(globalThis, 'localStorage', {
    value: localStorageShim,
    configurable: true,
    writable: true,
  });
}

// @testing-library/react's asyncWrapper checks `typeof jest !== 'undefined'` to detect
// fake timers and advance them after each async user-event action. Vitest does not provide
// a `jest` global, so the check falls through and any fake-timer-gated setTimeout(0) hangs.
// Aliasing `jest → vi` lets the library see the fake timer flag (setTimeout.clock set by
// @sinonjs/fake-timers) and call jest.advanceTimersByTime(0), which maps to vi.advanceTimersByTime.
// Without this, `await userEvent.*` with `vi.useFakeTimers()` deadlocks indefinitely.
if (typeof globalThis.jest === 'undefined') {
  (globalThis as Record<string, unknown>).jest = vi;
}

// Radix UI portals (Select, Dialog, etc.) use pointer-capture APIs and scrollIntoView
// that are absent or incomplete in happy-dom, causing infinite focus-event recursion.
// Stub them to no-ops globally so every test that mounts a Radix component is safe.
window.HTMLElement.prototype.hasPointerCapture = () => false;
window.HTMLElement.prototype.setPointerCapture = () => {};
window.HTMLElement.prototype.releasePointerCapture = () => {};
window.HTMLElement.prototype.scrollIntoView = () => {};

// Radix's FocusScope calls element.focus() inside a `focusin` event handler, causing
// happy-dom to re-fire a `focusin` event (which bubbles to document) and trigger the
// same handler again — infinite recursion. Guard `HTMLElement.prototype.focus` with a
// re-entrant flag so nested `.focus()` calls during a `focusin` event are silently
// dropped (the outer call already handles focus; the inner one is redundant).
{
  const _focus = HTMLElement.prototype.focus;
  let _inFocus = false;
  HTMLElement.prototype.focus = function (options?: FocusOptions): void {
    if (_inFocus) return;
    _inFocus = true;
    try {
      _focus.call(this, options);
    } finally {
      _inFocus = false;
    }
  };
}

expect.extend(toHaveNoViolations);

declare module 'vitest' {
  interface Assertion {
    toHaveNoViolations(): unknown;
  }
  interface AsymmetricMatchersContaining {
    toHaveNoViolations(): unknown;
  }
}

// findBy*/waitFor have their own 1s budget that testTimeout does not raise. CI runs every
// package's suite in parallel on a 4-vCPU runner, so a query that resolves in ~50ms locally
// can miss that budget there.
configure({ asyncUtilTimeout: 5_000 });

afterEach(() => {
  cleanup();
});
