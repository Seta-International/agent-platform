import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { toHaveNoViolations } from 'jest-axe';
import { afterEach, expect, vi } from 'vitest';

// @testing-library/react's asyncWrapper checks `typeof jest !== 'undefined'` to detect
// fake timers and advance them after each async user-event action. Vitest does not provide
// a `jest` global, so the check falls through and any fake-timer-gated setTimeout(0) hangs.
// Aliasing `jest → vi` lets the library see the fake timer flag (setTimeout.clock set by
// @sinonjs/fake-timers) and call jest.advanceTimersByTime(0), which maps to vi.advanceTimersByTime.
// Without this, `await userEvent.*` with `vi.useFakeTimers()` deadlocks indefinitely.
if (typeof globalThis.jest === 'undefined') {
  (globalThis as Record<string, unknown>).jest = vi;
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

afterEach(() => {
  cleanup();
});
