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
// A narrow stylesheet rule (rather than a global Element.prototype.setAttribute
// override) keeps this scoped to [popover] elements and to the lowest possible
// CSS specificity, so Astryx's own inline `style.display` toggle on open still
// wins and is never fought or re-clobbered by a later re-render.
const popoverShim = document.createElement('style');
popoverShim.textContent = '[popover] { display: none; }';
document.head.appendChild(popoverShim);

afterEach(() => {
  cleanup();
});
