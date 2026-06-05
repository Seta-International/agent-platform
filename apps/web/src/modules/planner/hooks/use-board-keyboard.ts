import { useEffect } from 'react';

export interface BoardKeyboardOpts {
  onCreateTask?: () => void;
  onOpenFocused?: () => void;
  onMoveFocus?: (dir: 'up' | 'down' | 'left' | 'right') => void;
  disabled?: boolean;
}

export function useBoardKeyboard(opts: BoardKeyboardOpts) {
  const { disabled, onCreateTask, onOpenFocused, onMoveFocus } = opts;
  useEffect(() => {
    if (disabled) return;
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.isContentEditable ||
        document.querySelector('[role="dialog"][data-state="open"]')
      )
        return;
      switch (e.key) {
        case 'c':
        case 'C':
          onCreateTask?.();
          break;
        case 'Enter':
          onOpenFocused?.();
          break;
        case 'j':
        case 'J':
        case 'ArrowDown':
          onMoveFocus?.('down');
          break;
        case 'k':
        case 'K':
        case 'ArrowUp':
          onMoveFocus?.('up');
          break;
        case 'h':
        case 'H':
        case 'ArrowLeft':
          onMoveFocus?.('left');
          break;
        case 'l':
        case 'L':
        case 'ArrowRight':
          onMoveFocus?.('right');
          break;
        default:
          return;
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [disabled, onCreateTask, onOpenFocused, onMoveFocus]);
}
