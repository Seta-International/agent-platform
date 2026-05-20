import { useEffect } from 'react';

export interface BoardKeyboardOpts {
  onCreateTask?: () => void;
  onOpenFocused?: () => void;
  onMoveFocus?: (dir: 'up' | 'down' | 'left' | 'right') => void;
  disabled?: boolean;
}

export function useBoardKeyboard(opts: BoardKeyboardOpts) {
  useEffect(() => {
    if (opts.disabled) return;
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA') return;
      switch (e.key) {
        case 'c':
        case 'C':
          opts.onCreateTask?.();
          break;
        case 'Enter':
          opts.onOpenFocused?.();
          break;
        case 'j':
        case 'J':
        case 'ArrowDown':
          opts.onMoveFocus?.('down');
          break;
        case 'k':
        case 'K':
        case 'ArrowUp':
          opts.onMoveFocus?.('up');
          break;
        case 'h':
        case 'H':
        case 'ArrowLeft':
          opts.onMoveFocus?.('left');
          break;
        case 'l':
        case 'L':
        case 'ArrowRight':
          opts.onMoveFocus?.('right');
          break;
        default:
          return;
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [opts.disabled, opts.onCreateTask, opts.onOpenFocused, opts.onMoveFocus]);
}
