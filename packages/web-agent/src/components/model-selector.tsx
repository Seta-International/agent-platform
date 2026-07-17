import { DropdownMenu, DropdownMenuItem } from '@seta/shared-ui';
import { Check, Cpu, Sparkles, Wand2, Zap } from 'lucide-react';
import { type ModelOption, type ModelTier, useModelCatalog } from '../hooks/use-model-catalog';

interface ModelSelectorProps {
  value: string;
  onChange: (next: string) => void;
  variant?: 'bordered' | 'ghost';
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

// Astryx's compound DropdownMenuItem has no divider sub-component (data-driven only).
function MenuDivider() {
  return (
    <hr
      aria-hidden
      style={{
        height: 1,
        margin: '4px 6px',
        border: 'none',
        backgroundColor: 'var(--color-border)',
      }}
    />
  );
}

export function ModelSelector({ value, onChange, variant = 'ghost' }: ModelSelectorProps) {
  const { data, isLoading } = useModelCatalog();
  const models = data?.models ?? [];
  const current = models.find((m) => m.key === value);

  const grouped: Array<{ tier: ModelTier; items: ModelOption[] }> = TIER_ORDER.flatMap((tier) => {
    const items = models.filter((m) => m.tier === tier);
    return items.length > 0 ? [{ tier, items }] : [];
  });

  const CurrentIcon = current ? TIER_ICON[current.tier] : Wand2;
  const ariaLabel = `Switch model — currently ${current?.label ?? 'Model'}`;

  return (
    <DropdownMenu
      placement="below"
      menuWidth={240}
      button={{
        variant: variant === 'bordered' ? 'secondary' : 'ghost',
        size: 'sm',
        label: ariaLabel,
        isDisabled: isLoading || models.length === 0,
        children: (
          // Button renders bare children — own the row layout so the icon and
          // label sit inline with a gap instead of wrapping onto each other.
          <span className="inline-flex min-w-0 items-center gap-1.5 whitespace-nowrap">
            <CurrentIcon className="size-3 shrink-0 text-secondary" aria-hidden />
            <span className="truncate">{current?.label ?? 'Model'}</span>
          </span>
        ),
      }}
    >
      {grouped.flatMap((group, gi) => {
        const header = (
          <div
            key={`hdr-${group.tier}`}
            className="uppercase text-sm text-secondary"
            style={{ padding: '4px 8px' }}
          >
            {TIER_LABEL[group.tier]}
          </div>
        );
        const rows = group.items.map((m) => {
          const Icon = TIER_ICON[m.tier];
          return (
            <DropdownMenuItem
              key={m.key}
              icon={<Icon className="size-3.5 text-secondary" aria-hidden />}
              label={m.label}
              description={
                m.supportsReasoning && m.tier !== 'auto' ? 'Shows its thinking' : undefined
              }
              endContent={
                m.key === value ? <Check className="size-3.5 text-accent" aria-hidden /> : undefined
              }
              onClick={() => onChange(m.key)}
            />
          );
        });
        return gi > 0
          ? [<MenuDivider key={`div-${group.tier}`} />, header, ...rows]
          : [header, ...rows];
      })}
    </DropdownMenu>
  );
}
