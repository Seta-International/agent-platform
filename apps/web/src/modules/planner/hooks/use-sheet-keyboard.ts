import { useEffect } from 'react';

export interface SheetKeyboardOpts {
  onClose?: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  onEditTitle?: () => void;
  onSubmit?: () => void;
  disabled?: boolean;
}

export function useSheetKeyboard(opts: SheetKeyboardOpts) {
  useEffect(() => {
    if (opts.disabled) return;
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA') {
        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') opts.onSubmit?.();
        return;
      }
      switch (e.key) {
        case 'Escape':
          opts.onClose?.();
          break;
        case 'j':
        case 'J':
        case 'ArrowDown':
          opts.onNext?.();
          break;
        case 'k':
        case 'K':
        case 'ArrowUp':
          opts.onPrev?.();
          break;
        case 'e':
        case 'E':
          opts.onEditTitle?.();
          break;
        default:
          return;
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [opts.disabled, opts.onClose, opts.onPrev, opts.onNext, opts.onEditTitle, opts.onSubmit]);
}
