import {
  installDialogShim,
  installLiveRegionIsolation,
  installPopoverShim,
} from '@seta/shared-ui/testing';
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

installPopoverShim();
installDialogShim();
installLiveRegionIsolation();
// jsdom doesn't implement scrollIntoView; forms use it to surface validation errors.
Element.prototype.scrollIntoView ??= () => {};

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

if (typeof (globalThis as Record<string, unknown>).jest === 'undefined') {
  (globalThis as Record<string, unknown>).jest = vi;
}

afterEach(() => {
  cleanup();
});
