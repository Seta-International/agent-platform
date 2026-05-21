import { cva, type VariantProps } from 'class-variance-authority';
import type * as React from 'react';

import { cn } from '../lib/cn';

const alertVariants = cva(
  'relative w-full rounded-md border p-sm text-body-sm [&>svg~*]:pl-7 [&>svg+div]:translate-y-[-3px] [&>svg]:absolute [&>svg]:left-3 [&>svg]:top-3',
  {
    variants: {
      variant: {
        default: 'bg-canvas border-hairline text-ink',
        destructive:
          'bg-destructive-tint border-transparent text-destructive [&>svg]:text-destructive',
        warning:
          'bg-semantic-warning-tint border-transparent text-semantic-warning [&>svg]:text-semantic-warning',
        info: 'bg-primary-tint border-primary-border text-primary-ink [&>svg]:text-primary',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

function Alert({
  className,
  variant,
  ref,
  ...props
}: React.ComponentProps<'div'> & VariantProps<typeof alertVariants>) {
  return (
    <div ref={ref} role="alert" className={cn(alertVariants({ variant }), className)} {...props} />
  );
}
Alert.displayName = 'Alert';

function AlertTitle({ className, children, ref, ...props }: React.ComponentProps<'h5'>) {
  return (
    <h5
      ref={ref}
      className={cn('mb-1 text-body-sm font-semibold leading-none tracking-tight', className)}
      {...props}
    >
      {children}
    </h5>
  );
}
AlertTitle.displayName = 'AlertTitle';

function AlertDescription({ className, ref, ...props }: React.ComponentProps<'div'>) {
  return (
    <div ref={ref} className={cn('text-body-sm [&_p]:leading-relaxed', className)} {...props} />
  );
}
AlertDescription.displayName = 'AlertDescription';

export { Alert, AlertDescription, AlertTitle };
