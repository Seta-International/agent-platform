import type * as React from 'react';
import { Toaster as Sonner, toast } from 'sonner';

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => (
  <Sonner
    theme="dark"
    className="toaster group"
    toastOptions={{
      classNames: {
        toast:
          'group toast group-[.toaster]:bg-surface-2 group-[.toaster]:text-ink group-[.toaster]:border-hairline group-[.toaster]:shadow-lg',
        description: 'group-[.toast]:text-ink-subtle',
        actionButton: 'group-[.toast]:bg-primary group-[.toast]:text-on-primary',
        cancelButton: 'group-[.toast]:bg-surface-1 group-[.toast]:text-ink',
      },
    }}
    {...props}
  />
);

export { Toaster, toast };
