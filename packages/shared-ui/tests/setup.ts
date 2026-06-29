import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Radix (Popover) + cmdk rely on pointer-capture and scrollIntoView, which happy-dom lacks.
const proto = window.HTMLElement.prototype;
proto.hasPointerCapture ??= () => false;
proto.setPointerCapture ??= () => {};
proto.releasePointerCapture ??= () => {};
proto.scrollIntoView ??= () => {};

afterEach(() => {
  cleanup();
});
