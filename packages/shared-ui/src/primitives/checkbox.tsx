import * as CheckboxPrimitive from '@radix-ui/react-checkbox';
import { Check } from 'lucide-react';
import type * as React from 'react';

import { cn } from '../lib/cn';

function Checkbox({
  className,
  ref,
  ...props
}: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      ref={ref}
      className={cn(
        'grid place-content-center peer size-4 shrink-0 rounded-sm border border-hairline-strong bg-canvas ring-offset-canvas transition-colors hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-focus focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-on-primary data-[state=indeterminate]:border-primary data-[state=indeterminate]:bg-primary data-[state=indeterminate]:text-on-primary',
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator className={cn('grid place-content-center text-current')}>
        <Check className="size-4" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}
Checkbox.displayName = CheckboxPrimitive.Root.displayName;

export { Checkbox };
