import { Card as AstryxCard } from '@astryxdesign/core/Card';
import type { ComponentProps, ReactNode } from 'react';
import { cn } from '../lib/cn';

export type CardProps = ComponentProps<typeof AstryxCard>;

export function Card(props: CardProps) {
  return <AstryxCard {...props} />;
}

export function CardTitle({ children, className }: { children?: ReactNode; className?: string }) {
  return (
    <div className={cn('text-card-title leading-none tracking-tight', className)}>{children}</div>
  );
}

export function CardDescription({
  children,
  className,
}: {
  children?: ReactNode;
  className?: string;
}) {
  return <div className={cn('text-body-sm text-ink-subtle', className)}>{children}</div>;
}
