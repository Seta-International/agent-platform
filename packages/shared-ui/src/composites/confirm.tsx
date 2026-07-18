import { createContext, type ReactNode, useCallback, useContext, useRef, useState } from 'react';
import { AlertDialog } from '../primitives/alert-dialog';

export interface ConfirmOptions {
  title: string;
  description: string;
  /** Action button label. @default 'Confirm' */
  confirmLabel?: string;
  /** Cancel button label. @default 'Cancel' */
  cancelLabel?: string;
  /** 'destructive' (default) paints the action red; 'primary' for benign actions. */
  tone?: 'destructive' | 'primary';
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

/**
 * Promise-based confirmation, the design-system replacement for `window.confirm`.
 *
 * ```ts
 * const confirm = useConfirm();
 * if (await confirm({ title: 'Delete chat?', description: "…" })) remove();
 * ```
 */
export function useConfirm(): ConfirmFn {
  const confirm = useContext(ConfirmContext);
  if (!confirm) throw new Error('useConfirm must be used within a <ConfirmProvider>');
  return confirm;
}

/**
 * Hosts a single Astryx `AlertDialog` and hands descendants a promise-based
 * `confirm()`. Mount once near the app root (above the router).
 */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolveRef = useRef<((result: boolean) => void) | null>(null);

  const confirm = useCallback<ConfirmFn>((next) => {
    setOptions(next);
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve;
    });
  }, []);

  const settle = useCallback((result: boolean) => {
    resolveRef.current?.(result);
    resolveRef.current = null;
    setOptions(null);
  }, []);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {options ? (
        <AlertDialog
          isOpen
          onOpenChange={(open) => {
            if (!open) settle(false);
          }}
          title={options.title}
          description={options.description}
          cancelLabel={options.cancelLabel ?? 'Cancel'}
          actionLabel={options.confirmLabel ?? 'Confirm'}
          actionVariant={options.tone === 'primary' ? 'primary' : 'destructive'}
          onAction={() => settle(true)}
        />
      ) : null}
    </ConfirmContext.Provider>
  );
}
