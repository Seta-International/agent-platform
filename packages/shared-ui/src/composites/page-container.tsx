import type { ComponentPropsWithoutRef } from 'react';
import { cn } from '../lib/cn';

export type PageContainerProps = ComponentPropsWithoutRef<'div'>;

export function PageContainer({ className, children, ...rest }: PageContainerProps) {
  return (
    <div className={cn('mx-auto w-full max-w-[73.75rem] p-6', className)} {...rest}>
      {children}
    </div>
  );
}
