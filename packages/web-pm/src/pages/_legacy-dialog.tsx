/**
 * Legacy Dialog/AlertDialog shims for the three web-pm dialogs not yet ported to the new
 * Astryx Dialog API (kpi-configure, kpi-manual-input, weekly-report-detail). Kept separate
 * from _ui-compat so the already-migrated pages keep the real Astryx Dialog (and their
 * migration smoke tests keep passing). Native modal overlay; rough visuals, polished later.
 */
import type { ReactNode } from 'react';
import { Button } from './_ui-compat.tsx';

type Div = React.ComponentProps<'div'>;

function Overlay({
  open,
  onOpenChange,
  children,
}: {
  open?: boolean;
  onOpenChange?: (v: boolean) => void;
  children?: ReactNode;
}) {
  if (!open) return null;
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: click-outside/Esc backdrop shim
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={() => onOpenChange?.(false)}
      onKeyDown={(e) => e.key === 'Escape' && onOpenChange?.(false)}
      role="presentation"
    >
      {children}
    </div>
  );
}

export function Dialog({
  open,
  isOpen,
  onOpenChange,
  children,
}: {
  open?: boolean;
  isOpen?: boolean;
  onOpenChange?: (v: boolean) => void;
  purpose?: string;
  width?: number;
  maxHeight?: string;
  children?: ReactNode;
}) {
  return (
    <Overlay open={open ?? isOpen} onOpenChange={onOpenChange}>
      {children}
    </Overlay>
  );
}
export function DialogContent({
  children,
  className,
}: Div & { unstyled?: boolean; hideClose?: boolean }) {
  return (
    <div
      role="dialog"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
      className={`flex max-h-[88vh] flex-col overflow-auto rounded-xl border border-hairline bg-canvas p-5 shadow-lg ${className ?? ''}`}
    >
      {children}
    </div>
  );
}
export function DialogHeader({
  title,
  children,
  className,
}: Div & { title?: ReactNode; onOpenChange?: (v: boolean) => void }) {
  return (
    <div className={`mb-3 ${className ?? ''}`}>
      {title ? <h2 className="text-xl font-semibold text-primary">{title}</h2> : children}
    </div>
  );
}
export function DialogTitle({ children, className }: Div) {
  return <h2 className={`text-xl font-semibold text-primary ${className ?? ''}`}>{children}</h2>;
}
export function DialogDescription({ children, className }: Div) {
  return <p className={`text-sm text-secondary ${className ?? ''}`}>{children}</p>;
}
export function DialogFooter({ children, className }: Div) {
  return <div className={`mt-4 flex justify-end gap-2 ${className ?? ''}`}>{children}</div>;
}

type AlertProps = {
  open?: boolean;
  isOpen?: boolean;
  onOpenChange?: (v: boolean) => void;
  title?: ReactNode;
  description?: ReactNode;
  actionLabel?: string;
  cancelLabel?: string;
  isActionLoading?: boolean;
  onAction?: () => void;
  children?: ReactNode;
};
export function AlertDialog({
  open,
  isOpen,
  onOpenChange,
  title,
  description,
  actionLabel,
  cancelLabel = 'Cancel',
  isActionLoading,
  onAction,
  children,
}: AlertProps) {
  return (
    <Overlay open={open ?? isOpen} onOpenChange={onOpenChange}>
      {children ?? (
        <DialogContent className="max-w-md">
          {title ? <DialogTitle>{title}</DialogTitle> : null}
          {description ? <DialogDescription>{description}</DialogDescription> : null}
          <DialogFooter>
            <Button variant="secondary" onClick={() => onOpenChange?.(false)}>
              {cancelLabel}
            </Button>
            <Button variant="destructive" isDisabled={isActionLoading} onClick={onAction}>
              {actionLabel ?? 'Confirm'}
            </Button>
          </DialogFooter>
        </DialogContent>
      )}
    </Overlay>
  );
}
export const AlertDialogContent = DialogContent;
export const AlertDialogHeader = DialogHeader;
export const AlertDialogTitle = DialogTitle;
export const AlertDialogDescription = DialogDescription;
export const AlertDialogFooter = DialogFooter;
export function AlertDialogAction({ children, ...rest }: React.ComponentProps<typeof Button>) {
  return <Button {...rest}>{children}</Button>;
}
export function AlertDialogCancel({ children, ...rest }: React.ComponentProps<typeof Button>) {
  return (
    <Button variant="secondary" {...rest}>
      {children}
    </Button>
  );
}
