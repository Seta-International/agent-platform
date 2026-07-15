import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Radix (Popover) + cmdk rely on pointer-capture and scrollIntoView, which happy-dom lacks.
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

afterEach(() => {
  cleanup();
});
