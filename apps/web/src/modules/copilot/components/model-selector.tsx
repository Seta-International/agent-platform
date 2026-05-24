import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@seta/shared-ui';
import { Check, ChevronDown, Cpu, Sparkles, Wand2, Zap } from 'lucide-react';
import { type ModelOption, type ModelTier, useModelCatalog } from '../hooks/use-model-catalog';

interface ModelSelectorProps {
  value: string;
  onChange: (next: string) => void;
  variant?: 'bordered' | 'ghost';
  compact?: boolean;
}

const TIER_ICON: Record<ModelTier, typeof Zap> = {
  auto: Wand2,
  fast: Zap,
  balanced: Sparkles,
  reasoning: Cpu,
};

const TIER_ORDER: ModelTier[] = ['auto', 'fast', 'balanced', 'reasoning'];

const TIER_LABEL: Record<ModelTier, string> = {
  auto: 'Auto',
  fast: 'Fast',
  balanced: 'Balanced',
  reasoning: 'Reasoning',
};

export function ModelSelector({
  value,
  onChange,
  variant = 'ghost',
  compact = false,
}: ModelSelectorProps) {
  const { data, isLoading } = useModelCatalog();
  const models = data?.models ?? [];
  const current = models.find((m) => m.key === value);

  const triggerClass = compact
    ? 'inline-flex size-6 items-center justify-center rounded text-ink-muted hover:bg-surface-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-focus disabled:opacity-50'
    : variant === 'bordered'
      ? 'inline-flex h-7 items-center gap-1.5 rounded-md border border-hairline px-2.5 text-body-sm text-ink hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-focus'
      : 'inline-flex h-6 items-center gap-1.5 rounded-md px-1.5 text-caption text-ink hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-focus';

  const grouped: Array<{ tier: ModelTier; items: ModelOption[] }> = TIER_ORDER.flatMap((tier) => {
    const items = models.filter((m) => m.tier === tier);
    return items.length > 0 ? [{ tier, items }] : [];
  });

  const CurrentIcon = current ? TIER_ICON[current.tier] : Wand2;
  const ariaLabel = `Switch model — currently ${current?.label ?? 'Model'}`;

  const menuBody = (
    <DropdownMenuContent align="end" className="min-w-[240px]">
      {grouped.map((group, gi) => (
        <div key={group.tier}>
          {gi > 0 && <DropdownMenuSeparator />}
          <DropdownMenuLabel className="text-caption uppercase tracking-wide text-ink-subtle">
            {TIER_LABEL[group.tier]}
          </DropdownMenuLabel>
          {group.items.map((m) => {
            const Icon = TIER_ICON[m.tier];
            return (
              <DropdownMenuItem
                key={m.key}
                onSelect={() => onChange(m.key)}
                className="flex items-start gap-2"
              >
                <Check
                  className={`mt-0.5 size-3.5 ${m.key === value ? 'text-primary' : 'invisible'}`}
                  aria-hidden
                />
                <Icon className="mt-0.5 size-3.5 text-ink-subtle" aria-hidden />
                <span className="flex min-w-0 flex-col">
                  <span className="text-body-sm text-ink">{m.label}</span>
                  {m.supportsReasoning && m.tier !== 'auto' && (
                    <span className="text-caption text-ink-subtle">Shows its thinking</span>
                  )}
                </span>
              </DropdownMenuItem>
            );
          })}
        </div>
      ))}
    </DropdownMenuContent>
  );

  if (compact) {
    return (
      <TooltipProvider delayDuration={200}>
        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className={triggerClass}
                  aria-label={ariaLabel}
                  disabled={isLoading || models.length === 0}
                >
                  <CurrentIcon className="size-3.5" aria-hidden />
                </button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent side="top">{current?.label ?? 'Model'}</TooltipContent>
          </Tooltip>
          {menuBody}
        </DropdownMenu>
      </TooltipProvider>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={triggerClass}
          aria-label={ariaLabel}
          disabled={isLoading || models.length === 0}
        >
          <CurrentIcon className="size-3 text-ink-subtle" aria-hidden />
          <span className="truncate">{current?.label ?? 'Model'}</span>
          <ChevronDown className="size-3 text-ink-subtle" aria-hidden />
        </button>
      </DropdownMenuTrigger>
      {menuBody}
    </DropdownMenu>
  );
}
