import {
  ToastViewport as AstryxToastViewport,
  type ToastViewportProps,
} from '@astryxdesign/core/Toast';
import { useEffect } from 'react';

export type {
  ShowToastFn,
  ToastOptions,
  ToastType,
  ToastViewportProps,
} from '@astryxdesign/core/Toast';
export { useToast } from '@astryxdesign/core/Toast';

/**
 * Enhanced ToastViewport in @seta/shared-ui (FUT-830).
 *
 * Ensures Toast notifications appear ON TOP of modal dialogs and can be dismissed
 * in a single click without closing background route modals, while preserving
 * hover state visual feedback and cursor: pointer interactivity.
 */
export function ToastViewport(props: ToastViewportProps) {
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const VIEWPORT_SELECTOR = 'div[popover][role="region"], [role="region"][aria-label*="toast" i]';

    const promotePopover = () => {
      const el = document.querySelector<HTMLElement>(VIEWPORT_SELECTOR);
      if (el && typeof el.showPopover === 'function') {
        try {
          el.hidePopover();
          el.showPopover();
        } catch {
          try {
            el.showPopover();
          } catch {
            /* ignore */
          }
        }
      }
    };

    let activeHoverBtn: HTMLElement | null = null;
    const clearHoverState = () => {
      if (activeHoverBtn) {
        activeHoverBtn.style.opacity = '';
        activeHoverBtn.style.backgroundColor = '';
        activeHoverBtn.style.cursor = '';
        activeHoverBtn = null;
      }
      document.body.style.cursor = '';
    };

    const handleCapturePointer = (e: MouseEvent | PointerEvent) => {
      const toasts = document.querySelectorAll<HTMLElement>('[data-toast-id]');
      if (toasts.length === 0) {
        clearHoverState();
        return;
      }

      const { clientX, clientY } = e;
      if (clientX === 0 && clientY === 0) return;

      let isOverAnyToast = false;

      for (const toast of Array.from(toasts)) {
        const rect = toast.getBoundingClientRect();
        if (
          clientX >= rect.left &&
          clientX <= rect.right &&
          clientY >= rect.top &&
          clientY <= rect.bottom
        ) {
          isOverAnyToast = true;

          const hasOpenDialog = Array.from(
            document.querySelectorAll<HTMLDialogElement>('dialog'),
          ).some((d) => d.open || (typeof d.matches === 'function' && d.matches(':modal')));

          if (hasOpenDialog) {
            promotePopover();
          }

          const dismissBtn =
            toast.querySelector<HTMLElement>('button') ??
            toast.querySelector<HTMLElement>('[aria-label*="close" i]') ??
            toast.querySelector<HTMLElement>('[aria-label*="dismiss" i]');

          if (dismissBtn) {
            const btnRect = dismissBtn.getBoundingClientRect();
            const isOverBtn =
              clientX >= btnRect.left &&
              clientX <= btnRect.right &&
              clientY >= btnRect.top &&
              clientY <= btnRect.bottom;

            if (isOverBtn) {
              if (activeHoverBtn !== dismissBtn) {
                clearHoverState();
                activeHoverBtn = dismissBtn;
                dismissBtn.style.cursor = 'pointer';
                dismissBtn.style.opacity = '0.85';
                dismissBtn.style.backgroundColor = 'rgba(255, 255, 255, 0.2)';
                dismissBtn.style.borderRadius = '4px';
              }
              document.body.style.cursor = 'pointer';
            } else if (activeHoverBtn === dismissBtn) {
              clearHoverState();
            }
          }

          e.stopPropagation();
          e.stopImmediatePropagation();

          if (e.type === 'click') {
            if (dismissBtn) {
              dismissBtn.click();
            }
            clearHoverState();
          }
          break;
        }
      }

      if (!isOverAnyToast && activeHoverBtn) {
        clearHoverState();
      }
    };

    window.addEventListener('pointermove', handleCapturePointer, true);
    window.addEventListener('pointerdown', handleCapturePointer, true);
    window.addEventListener('click', handleCapturePointer, true);

    const observer = new MutationObserver(() => {
      const hasOpenDialog = Array.from(document.querySelectorAll<HTMLDialogElement>('dialog')).some(
        (d) => d.open || (typeof d.matches === 'function' && d.matches(':modal')),
      );

      if (hasOpenDialog) {
        requestAnimationFrame(promotePopover);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['open', 'class', 'style'],
    });

    return () => {
      clearHoverState();
      window.removeEventListener('pointermove', handleCapturePointer, true);
      window.removeEventListener('pointerdown', handleCapturePointer, true);
      window.removeEventListener('click', handleCapturePointer, true);
      observer.disconnect();
    };
  }, []);

  return <AstryxToastViewport {...props} />;
}
