import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Radix (Popover) relies on pointer-capture and scrollIntoView, which happy-dom lacks.
const proto = window.HTMLElement.prototype;
proto.hasPointerCapture ??= () => false;
proto.setPointerCapture ??= () => {};
proto.releasePointerCapture ??= () => {};
proto.scrollIntoView ??= () => {};

// happy-dom doesn't implement the native Popover API's default UA stylesheet
// ([popover]:not(:popover-open) { display: none }), so [popover] elements render
// visible pre-interaction. Astryx's useLayer already falls back to inline
// `style.display` toggling when `showPopover`/`hidePopover` are absent (its
// documented old-Safari/old-Firefox fallback path) — this only supplies the
// missing initial-hidden state so that fallback path starts consistent.
const nativeSetAttribute = Element.prototype.setAttribute;
Element.prototype.setAttribute = function setAttribute(this: Element, name: string, value: string) {
  nativeSetAttribute.call(this, name, value);
  if (name === 'popover' && this instanceof HTMLElement) {
    this.style.display = 'none';
  }
};

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
