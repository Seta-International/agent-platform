import * as React from 'react';
import { cn } from '../lib/cn';

const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => (
    <input
      type={type}
      ref={ref}
      className={cn(
        'flex h-9 w-full rounded-md border border-hairline bg-transparent px-3 py-1 text-body-sm text-ink placeholder:text-ink-subtle transition-colors',
        'file:border-0 file:bg-transparent file:text-body-sm file:font-medium file:text-ink',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = 'Input';

export { Input };
