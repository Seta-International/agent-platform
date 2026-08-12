import { DropdownMenu, DropdownMenuItem } from '@seta/shared-ui';
import { Check, ChevronsUpDown, Cpu, Sparkles, Wand2, Zap } from 'lucide-react';
import { type ModelTier, useModelCatalog } from '../hooks/use-model-catalog';

interface ModelSelectorProps {
  value: string;
  onChange: (next: string) => void;
  variant?: 'bordered' | 'ghost';
  /** When false, hide the synthetic Auto entry (CV parse requires a concrete model). */
  includeAuto?: boolean;
}

const TIER_ICON: Record<ModelTier, typeof Zap> = {
  auto: Wand2,
  fast: Zap,
  balanced: Sparkles,
  reasoning: Cpu,
};

// Auto leads; the rest follow in tier order as one flat list — no group headings,
// badges, or per-model blurbs. Just the names, the current one checked.
const TIER_ORDER: ModelTier[] = ['auto', 'fast', 'balanced', 'reasoning'];

export function ModelSelector({
  value,
  onChange,
  variant = 'ghost',
  includeAuto = true,
}: ModelSelectorProps) {
  const { data, isLoading } = useModelCatalog();
  const models = (data?.models ?? []).filter((m) => includeAuto || m.key !== 'auto');
  const ordered = TIER_ORDER.flatMap((tier) => models.filter((m) => m.tier === tier));
  const current = models.find((m) => m.key === value);
  const CurrentIcon = current ? TIER_ICON[current.tier] : includeAuto ? Wand2 : Zap;

  return (
    <DropdownMenu
      placement="above"
      menuWidth={220}
      button={{
        // `label` is the accessible name; the truncating child is the visible text
        // (Astryx Button renders `children ?? label`). Icon + chevron are pinned
        // flex-none, only the label shrinks — the trigger stays one line.
        label: `Model: ${current?.label ?? 'choose a model'}`,
        variant: variant === 'bordered' ? 'secondary' : 'ghost',
        size: 'sm',
        isDisabled: isLoading || models.length === 0,
        icon: <CurrentIcon className="size-3.5 flex-none text-secondary" aria-hidden />,
        endContent: <ChevronsUpDown className="size-3.5 flex-none text-secondary" aria-hidden />,
        className: 'min-w-[7rem] max-w-[13rem]',
        children: (
          <span className="block min-w-0 truncate text-left">{current?.label ?? 'Model'}</span>
        ),
      }}
    >
      {ordered.map((m) => {
        const Icon = TIER_ICON[m.tier];
        return (
          <DropdownMenuItem
            key={m.key}
            icon={<Icon className="size-3.5 flex-none text-secondary" aria-hidden />}
            label={m.label}
            endContent={
              m.key === value ? <Check className="size-3.5 text-accent" aria-hidden /> : undefined
            }
            onClick={() => onChange(m.key)}
          />
        );
      })}
    </DropdownMenu>
  );
}
