import type * as React from 'react';

import { cn } from '../lib/cn';
import { cva, type VariantProps } from '../lib/cva';

const cardVariants = cva('bg-surface-1 border border-hairline text-ink shadow-none', {
  variants: {
    variant: {
      default: 'rounded-md p-lg',
      product: 'rounded-lg p-lg',
      testimonial: 'rounded-md p-xl text-body-lg',
    },
  },
  defaultVariants: { variant: 'default' },
});

export interface CardProps extends React.ComponentProps<'div'>, VariantProps<typeof cardVariants> {}

function Card({ className, variant, ref, ...props }: CardProps) {
  return <div ref={ref} className={cn(cardVariants({ variant }), className)} {...props} />;
}
Card.displayName = 'Card';

function CardHeader({ className, ref, ...props }: React.ComponentProps<'div'>) {
  return <div ref={ref} className={cn('flex flex-col space-y-1.5', className)} {...props} />;
}
CardHeader.displayName = 'CardHeader';

function CardTitle({ className, ref, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      ref={ref}
      className={cn('text-card-title leading-none tracking-tight', className)}
      {...props}
    />
  );
}
CardTitle.displayName = 'CardTitle';

function CardDescription({ className, ref, ...props }: React.ComponentProps<'div'>) {
  return <div ref={ref} className={cn('text-body-sm text-ink-subtle', className)} {...props} />;
}
CardDescription.displayName = 'CardDescription';

function CardContent({ className, ref, ...props }: React.ComponentProps<'div'>) {
  return <div ref={ref} className={cn('pt-md', className)} {...props} />;
}
CardContent.displayName = 'CardContent';

function CardFooter({ className, ref, ...props }: React.ComponentProps<'div'>) {
  return <div ref={ref} className={cn('flex items-center pt-md', className)} {...props} />;
}
CardFooter.displayName = 'CardFooter';

export { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle, cardVariants };
