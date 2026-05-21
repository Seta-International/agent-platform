import * as LabelPrimitive from '@radix-ui/react-label';
import { cva, type VariantProps } from 'class-variance-authority';
import type * as React from 'react';

import { cn } from '../lib/cn';

const labelVariants = cva(
  'text-body-sm font-medium leading-none text-ink peer-disabled:cursor-not-allowed peer-disabled:opacity-70',
);

function Label({
  className,
  ref,
  ...props
}: React.ComponentProps<typeof LabelPrimitive.Root> & VariantProps<typeof labelVariants>) {
  return <LabelPrimitive.Root ref={ref} className={cn(labelVariants(), className)} {...props} />;
}
Label.displayName = LabelPrimitive.Root.displayName;

export { Label };
