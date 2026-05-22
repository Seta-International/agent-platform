import type * as React from 'react';

import { cn } from '../lib/cn';

function Textarea({ className, ref, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      className={cn(
        'flex min-h-[80px] w-full rounded-md border border-hairline-strong bg-canvas px-2.5 py-2 text-body-sm text-ink placeholder:text-ink-subtle transition-colors focus-visible:outline-none focus-visible:border-primary focus-visible:shadow-[0_0_0_3px_var(--color-primary-tint)] disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      ref={ref}
      {...props}
    />
  );
}
Textarea.displayName = 'Textarea';

export { Textarea };
