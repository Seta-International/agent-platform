import type * as React from 'react';
import { cn } from '../lib/cn';
import { cva, type VariantProps } from '../lib/cva';

const backdropVariants = cva('pointer-events-none absolute inset-0', {
  variants: {
    intensity: {
      subtle: 'opacity-25',
      default: 'opacity-40',
      bold: 'opacity-60',
    },
    origin: {
      'top-left': '',
      'top-right': '',
      center: '',
      'bottom-left': '',
      'bottom-right': '',
    },
  },
  defaultVariants: { intensity: 'default', origin: 'top-left' },
});

const ORIGIN_POSITION: Record<NonNullable<DotFieldBackdropProps['origin']>, string> = {
  'top-left': '20% 20%',
  'top-right': '80% 20%',
  center: '50% 50%',
  'bottom-left': '20% 80%',
  'bottom-right': '80% 80%',
};

export interface DotFieldBackdropProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, 'children'>,
    VariantProps<typeof backdropVariants> {}

export function DotFieldBackdrop({
  className,
  intensity,
  origin = 'top-left',
  style,
  ...props
}: DotFieldBackdropProps) {
  const position = ORIGIN_POSITION[origin ?? 'top-left'];
  const mask = `radial-gradient(ellipse 80% 60% at ${position}, black 0%, transparent 70%)`;

  return (
    <div
      aria-hidden
      className={cn(backdropVariants({ intensity, origin }), className)}
      style={{
        backgroundImage:
          'radial-gradient(circle at 1px 1px, var(--color-hairline-strong) 1px, transparent 0)',
        backgroundSize: 'var(--spacing-lg) var(--spacing-lg)',
        maskImage: mask,
        WebkitMaskImage: mask,
        ...style,
      }}
      {...props}
    />
  );
}
