import * as DialogPrimitive from '@radix-ui/react-dialog';
import type * as React from 'react';
import { cn } from '../lib/cn';

// `AlertDialogAction`/`AlertDialogCancel` render plain `<button>`/`DialogPrimitive.Close`
// elements (not the shared `Button` component), so they carry their own small slice of the old
// shadcn button classes rather than depending on `Button`'s (now-Astryx-backed) internals. This
// primitive is not part of the Astryx migration yet — only its Button-shaped dependency needed
// to be removed.
const ALERT_DIALOG_ACTION_CLASSES =
  'inline-flex h-8 items-center justify-center gap-2 whitespace-nowrap rounded-md bg-primary px-2.5 text-button font-medium text-on-primary transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0';
const ALERT_DIALOG_CANCEL_CLASSES =
  'inline-flex h-8 items-center justify-center gap-2 whitespace-nowrap rounded-md border border-hairline bg-surface-1 px-2.5 text-button font-medium text-ink transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0';

/**
 * Confirmation dialog (shadcn AlertDialog shape) built on @radix-ui/react-dialog — the same
 * primitive the suite's Dialog uses — so it adds no new React-types peer context to the graph.
 * Unlike Dialog it takes the `alertdialog` role and never dismisses on outside click or Escape:
 * the user must pick Cancel or the action.
 */

const AlertDialog = DialogPrimitive.Root;

const AlertDialogTrigger = DialogPrimitive.Trigger;

const AlertDialogPortal = DialogPrimitive.Portal;

function AlertDialogOverlay({
  className,
  ref,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      ref={ref}
      className={cn(
        'fixed inset-0 z-50 bg-semantic-overlay data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
        className,
      )}
      {...props}
    />
  );
}
AlertDialogOverlay.displayName = 'AlertDialogOverlay';

function AlertDialogContent({
  className,
  ref,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content>) {
  return (
    <AlertDialogPortal>
      <AlertDialogOverlay />
      <DialogPrimitive.Content
        ref={ref}
        role="alertdialog"
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
        className={cn(
          'fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border border-hairline bg-canvas p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:rounded-lg',
          className,
        )}
        {...props}
      />
    </AlertDialogPortal>
  );
}
AlertDialogContent.displayName = 'AlertDialogContent';

const AlertDialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('flex flex-col space-y-1.5 text-center sm:text-left', className)} {...props} />
);
AlertDialogHeader.displayName = 'AlertDialogHeader';

const AlertDialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn('flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2', className)}
    {...props}
  />
);
AlertDialogFooter.displayName = 'AlertDialogFooter';

function AlertDialogTitle({
  className,
  ref,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      ref={ref}
      className={cn(
        'text-card-title font-semibold leading-none tracking-tight text-ink',
        className,
      )}
      {...props}
    />
  );
}
AlertDialogTitle.displayName = 'AlertDialogTitle';

function AlertDialogDescription({
  className,
  ref,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      ref={ref}
      className={cn('text-body-sm text-ink-subtle', className)}
      {...props}
    />
  );
}
AlertDialogDescription.displayName = 'AlertDialogDescription';

/** Confirming action. Consumer wires `onClick`; pass a className override (e.g. a destructive
 * intent) — it merges on top of the default primary-intent classes below. */
function AlertDialogAction({ className, ...props }: React.ComponentProps<'button'>) {
  return <button type="button" className={cn(ALERT_DIALOG_ACTION_CLASSES, className)} {...props} />;
}
AlertDialogAction.displayName = 'AlertDialogAction';

/** Cancel action — closes the dialog via the Radix Close trigger. */
function AlertDialogCancel({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return (
    <DialogPrimitive.Close className={cn(ALERT_DIALOG_CANCEL_CLASSES, className)} {...props} />
  );
}
AlertDialogCancel.displayName = 'AlertDialogCancel';

export {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogOverlay,
  AlertDialogPortal,
  AlertDialogTitle,
  AlertDialogTrigger,
};
