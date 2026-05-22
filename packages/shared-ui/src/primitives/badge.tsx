import { cva, type VariantProps } from 'class-variance-authority';
import type * as React from 'react';

import { cn } from '../lib/cn';

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-1.5 h-[18px] text-eyebrow font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-primary-focus focus:ring-offset-2',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary-tint text-primary-ink',
        secondary: 'border-hairline bg-surface-1 text-ink-muted',
        destructive: 'border-transparent bg-destructive-tint text-destructive',
        success: 'border-transparent bg-semantic-success-tint text-semantic-success',
        warning: 'border-transparent bg-semantic-warning-tint text-semantic-warning',
        outline: 'border-hairline text-ink',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
