import { Sparkles } from 'lucide-react';
import { cn } from '../lib/cn';

interface Props {
  feature: string;
  className?: string;
}

export function ComingSoon({ feature, className }: Props) {
  return (
    <div
      className={cn('flex flex-col items-center justify-center gap-3 py-16 text-center', className)}
    >
      <div className="rounded-full bg-surface p-3">
        <Sparkles aria-hidden className="size-5 text-secondary" />
      </div>
      <div className="text-sm font-medium text-primary">{feature} is coming soon</div>
      <p className="text-xs text-secondary max-w-xs">We're working on it.</p>
    </div>
  );
}
