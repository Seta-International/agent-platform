import { installLiveRegionIsolation } from '@seta/shared-ui/testing';
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

installLiveRegionIsolation();

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
// a `jest` global, so aliasing `jest → vi` lets the library see the fake-timer flag.
if (typeof globalThis.jest === 'undefined') {
  (globalThis as Record<string, unknown>).jest = vi;
}

afterEach(() => {
  cleanup();
});
