import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// happy-dom doesn't implement the native Popover API's default UA stylesheet
// ([popover]:not(:popover-open) { display: none }), so [popover] elements (the
// Astryx `Selector`'s option list, mounted via @seta/shared-ui) render visible
// pre-interaction. Astryx's useLayer already falls back to inline
// `style.display` toggling when `showPopover`/`hidePopover` are absent (its
// documented old-Safari/old-Firefox fallback path) — this only supplies the
// missing initial-hidden state so that fallback path starts consistent.
// Mirrors the identical patch in packages/shared-ui/tests/setup.ts.
const nativeSetAttribute = Element.prototype.setAttribute;
Element.prototype.setAttribute = function setAttribute(this: Element, name: string, value: string) {
  nativeSetAttribute.call(this, name, value);
  if (name === 'popover' && this instanceof HTMLElement) {
    this.style.display = 'none';
  }
};

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
// Aliasing `jest → vi` lets the library see the fake timer flag and call advanceTimersByTime.
if (typeof globalThis.jest === 'undefined') {
  (globalThis as Record<string, unknown>).jest = vi;
}

afterEach(() => {
  cleanup();
});
