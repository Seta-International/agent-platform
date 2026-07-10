import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';
import { afterEach } from 'vitest';

// Radix (Popover) + cmdk rely on pointer-capture and scrollIntoView, which happy-dom lacks.
const proto = window.HTMLElement.prototype;
proto.hasPointerCapture ??= () => false;
proto.setPointerCapture ??= () => {};
proto.releasePointerCapture ??= () => {};
proto.scrollIntoView ??= () => {};

// findBy*/waitFor have their own 1s budget that testTimeout does not raise. CI runs every
// package's suite in parallel on a 4-vCPU runner, so a query that resolves in ~50ms locally
// can miss that budget there.
configure({ asyncUtilTimeout: 5_000 });

afterEach(() => {
  cleanup();
});
