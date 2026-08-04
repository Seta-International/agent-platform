import type { ToastViewportProps } from '@astryxdesign/core/Toast';
import { ToastViewport as AstryxToastViewport } from '@astryxdesign/core/Toast';
import { useEffect, useRef } from 'react';

const VIEWPORT_SELECTOR = '[role="region"][aria-label="Notifications"]';

/**
 * Toast viewport that stays visible above modal dialogs.
 *
 * Astryx's `ToastViewport` and `Dialog` both live in the CSS top layer, and top-layer
 * stacking is by insertion order: the viewport enters the top layer once on mount
 * (`popover="manual"` + `showPopover()`), so any `<dialog>` shown afterwards stacks
 * above it — toasts fired while a modal is open end up hidden behind its `::backdrop`.
 *
 * This wrapper watches for modal dialogs entering the top layer and re-promotes the
 * viewport to the top of the stack. `showPopover()` alone is a no-op when already
 * showing, so we hide+show: hidePopover() then showPopover() removes and re-inserts
 * the element at the top of the top layer (above any open dialog). Both calls run in
 * the same synchronous block, so the browser never paints the toast in the hidden
 * intermediate state — no flicker.
 *
 * Timing matters. Astryx mounts the `<dialog>` (closed) and calls `showModal()` in a
 * passive effect *after* paint, which adds the `open` attribute. The mutation observer
 * therefore sees the dialog twice:
 *   1. childList — node added, `open` not yet set. Re-promote here is premature (the
 *      dialog isn't in the top layer yet), so defer to a macrotask that runs *after*
 *      the effect has run showModal().
 *   2. attributes `open` — set by showModal(). The dialog is now in the top layer and
 *      stacked above us; re-promote synchronously (observer callbacks run after the
 *      mutation that added the attribute, i.e. after showModal()).
 * Deferring the childList case via setTimeout(0) — not queueMicrotask — is what makes
 * the fix correct in real browsers where effects run after paint.
 *
 * Astryx's ToastViewport does not forward a ref, so we locate the viewport div by its
 * stable role/aria-label (the same selector the popover-shim uses).
 */
export function ToastViewport(props: ToastViewportProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    const viewport = container?.querySelector<HTMLElement>(VIEWPORT_SELECTOR);
    if (!viewport || typeof viewport.hidePopover !== 'function') return;

    // Defer re-promotion to a macrotask so it runs after any pending passive effect
    // (Astryx's showModal()). A dialog mounted-but-not-yet-open must not be re-promoted
    // before it joins the top layer, or the subsequent showModal() would stack above us.
    let scheduled = false;
    const repromote = () => {
      if (scheduled) return;
      scheduled = true;
      setTimeout(() => {
        scheduled = false;
        try {
          viewport.hidePopover();
        } catch {
          /* already hidden */
        }
        try {
          viewport.showPopover();
        } catch {
          /* already showing */
        }
      }, 0);
    };

    const isOpenDialog = (el: unknown): el is Element =>
      el instanceof Element && el.matches('dialog[open]');

    const mo = new MutationObserver((records) => {
      for (const record of records) {
        if (record.type === 'attributes') {
          if (record.attributeName === 'open' && isOpenDialog(record.target)) {
            repromote();
            return;
          }
        } else {
          for (const node of record.addedNodes) {
            if (node instanceof Element && node.matches('dialog')) {
              repromote();
              return;
            }
          }
        }
      }
    });
    mo.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['open'],
    });
    return () => mo.disconnect();
  }, []);

  return (
    <div ref={containerRef}>
      <AstryxToastViewport {...props} />
    </div>
  );
}
