import { cva, type VariantProps } from 'class-variance-authority';
import type * as React from 'react';

import { cn } from '../lib/cn';

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-primary-focus focus:ring-offset-2',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-on-primary hover:bg-primary/80',
        secondary: 'border-transparent bg-surface-1 text-ink hover:bg-surface-1/80',
        destructive:
          'border-transparent bg-destructive text-on-destructive hover:bg-destructive/80',
        outline: 'text-ink',
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
