import * as React from 'react';
import { cn } from '../lib/cn';
import { cva, type VariantProps } from '../lib/cva';

const inputVariants = cva(
  cn(
    'flex w-full rounded-md border border-hairline bg-transparent text-ink placeholder:text-ink-subtle transition-colors',
    'file:border-0 file:bg-transparent file:text-body-sm file:font-medium file:text-ink',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
    'disabled:cursor-not-allowed disabled:opacity-50',
  ),
  {
    variants: {
      size: {
        default: 'h-9 px-3 py-1 text-body-sm',
        lg: 'h-10 px-sm py-2 text-body',
      },
    },
    defaultVariants: { size: 'default' },
  },
);

export interface InputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'>,
    VariantProps<typeof inputVariants> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, size, ...props }, ref) => (
    <input type={type} ref={ref} className={cn(inputVariants({ size }), className)} {...props} />
  ),
);
Input.displayName = 'Input';

export { Input, inputVariants };
