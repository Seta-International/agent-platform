import { Slot } from '@radix-ui/react-slot';
import type * as React from 'react';

import { cn } from '../lib/cn';
import { cva, type VariantProps } from '../lib/cva';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-button font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'bg-primary text-on-primary hover:bg-primary-hover',
        primary: 'bg-primary text-on-primary hover:bg-primary-hover',
        secondary: 'bg-surface-1 text-ink border border-hairline hover:bg-surface-2',
        tertiary: 'bg-canvas text-ink hover:bg-surface-1',
        inverse: 'bg-inverse-canvas text-inverse-ink hover:bg-inverse-surface-1',
        destructive: 'bg-destructive text-on-destructive hover:bg-destructive/90',
        ghost: 'hover:bg-surface-2 hover:text-ink',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-8 px-2.5',
        sm: 'h-7 px-2 text-caption',
        lg: 'h-9 px-4',
        icon: 'h-8 w-8',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

export interface ButtonProps
  extends React.ComponentProps<'button'>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

function Button({ className, variant, size, asChild = false, ref, ...props }: ButtonProps) {
  const Comp = asChild ? Slot : 'button';
  return <Comp className={cn(buttonVariants({ variant, size }), className)} ref={ref} {...props} />;
}
Button.displayName = 'Button';

export { Button, buttonVariants };
