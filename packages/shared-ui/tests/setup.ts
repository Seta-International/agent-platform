import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
import { installPopoverShim } from '../src/testing/popover-shim';

// Radix (Popover) relies on pointer-capture and scrollIntoView, which happy-dom lacks.
const proto = window.HTMLElement.prototype;
proto.hasPointerCapture ??= () => false;
proto.setPointerCapture ??= () => {};
proto.releasePointerCapture ??= () => {};
proto.scrollIntoView ??= () => {};

installPopoverShim();

// happy-dom's matchMedia evaluates `hover`/`pointer` against navigator.maxTouchPoints
// (0 by default), so it always reports a hover-capable mouse. Astryx's TopNavHeading
// menu (`useMenuHover`, showDelay: 0) treats that as license to open on `mouseenter` —
// which `userEvent.click()` synthesizes before the `click` event — so a single click
// opens-then-immediately-closes the menu (click always toggles). Real touch/keyboard
// users never trigger this path; only intercept hover/pointer queries so the test
// environment behaves like one of those devices, leaving every other query (e.g.
// prefers-color-scheme, prefers-reduced-motion, width queries) on the real implementation.
const nativeMatchMedia = window.matchMedia?.bind(window);
if (nativeMatchMedia) {
  window.matchMedia = (query: string) => {
    if (/\b(hover|pointer)\s*:/.test(query)) {
      return {
        matches: false,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      } as MediaQueryList;
    }
    return nativeMatchMedia(query);
  };
}

afterEach(() => {
  cleanup();
});
