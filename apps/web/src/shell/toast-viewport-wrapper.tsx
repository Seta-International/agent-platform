import { ToastViewport as AstryxToastViewport, type ToastViewportProps } from '@seta/shared-ui';
import { useEffect } from 'react';

/**
 * ToastViewport wrapper in apps/web shell that ensures toast notifications
 * always render ABOVE modal dialogs across all workflows (FUT-830).
 *
 * When a native <dialog showModal()> is opened, the dialog enters the Top Layer
 * after the initial ToastViewport popover, placing toasts behind the dialog.
 * This wrapper monitors DOM mutations inside the ToastViewport container and
 * re-promotes the popover whenever a new toast is added, bringing toasts to the
 * top of the Top Layer stack above open modals.
 */
export function ToastViewportWrapper(props: ToastViewportProps) {
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Helper to re-promote popover to top of Top Layer stack
    const promotePopover = (el: HTMLElement) => {
      if (typeof el.showPopover === 'function') {
        try {
          el.hidePopover();
          el.showPopover();
        } catch {
          try {
            el.showPopover();
          } catch {
            /* ignore if already top layer or unsupported environment */
          }
        }
      }
    };

    // Observer to detect when [data-toast-id] nodes are added to the viewport
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.addedNodes.length > 0) {
          const hasNewToast = Array.from(mutation.addedNodes).some((node) => {
            if (node instanceof HTMLElement) {
              return (
                node.hasAttribute('data-toast-id') || node.querySelector('[data-toast-id]') !== null
              );
            }
            return false;
          });

          if (hasNewToast) {
            const viewportEl = document.querySelector<HTMLElement>('div[popover][role="region"]');
            if (viewportEl) {
              promotePopover(viewportEl);
            }
          }
        }
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
    };
  }, []);

  return <AstryxToastViewport {...props} />;
}

ToastViewportWrapper.displayName = 'ToastViewportWrapper';
