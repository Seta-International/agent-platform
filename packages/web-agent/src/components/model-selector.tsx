import { Badge, Button, Popover, SelectableCard } from '@seta/shared-ui';
import { ChevronsUpDown, Cpu, Sparkles, Wand2, Zap } from 'lucide-react';
import { useState } from 'react';
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

const TIER_LABEL: Record<ModelTier, string> = {
  auto: 'Auto',
  fast: 'Fast',
  balanced: 'Balanced',
  reasoning: 'Reasoning',
};

// One-line capability note per tier; a reasoning model appends a thinking hint.
const TIER_NOTE: Record<ModelTier, string> = {
  auto: 'Picks the best model for each message',
  fast: 'Quick replies for simple asks',
  balanced: 'Everyday default — solid speed and quality',
  reasoning: 'Works through hard problems step by step',
};

// Auto leads on its own; the remaining tiers render as labelled groups in order.
const GROUP_ORDER: Exclude<ModelTier, 'auto'>[] = ['fast', 'balanced', 'reasoning'];

export function ModelSelector({ value, onChange, variant = 'ghost' }: ModelSelectorProps) {
  const { data, isLoading } = useModelCatalog();
  const [open, setOpen] = useState(false);
  const models = data?.models ?? [];
  const current = models.find((m) => m.key === value);
  const auto = models.find((m) => m.tier === 'auto');
  const groups = GROUP_ORDER.flatMap((tier) => {
    const items = models.filter((m) => m.tier === tier);
    return items.length > 0 ? [{ tier, items }] : [];
  });

  const CurrentIcon = current ? TIER_ICON[current.tier] : Wand2;

  const note = (m: ModelOption) =>
    m.supportsReasoning && m.tier !== 'auto'
      ? `${TIER_NOTE[m.tier]} · shows its thinking`
      : TIER_NOTE[m.tier];

  const pick = (key: string) => {
    onChange(key);
    setOpen(false);
  };

  const card = (m: ModelOption, recommended = false) => {
    const Icon = TIER_ICON[m.tier];
    return (
      <SelectableCard
        key={m.key}
        label={m.label}
        isSelected={m.key === value}
        onChange={() => pick(m.key)}
        padding={3}
      >
        <div className="flex items-start gap-2.5">
          <Icon className="mt-0.5 size-4 flex-none text-secondary" aria-hidden />
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <div className="flex items-center gap-2">
              <span className="truncate text-base font-medium text-primary">{m.label}</span>
              {/* Non-recommended cards skip a tier badge — the enclosing group
                  heading already names the tier; repeating it here is redundant
                  clutter and would collide with that heading's text in a11y
                  queries (both would read "Fast"/"Balanced"/"Reasoning"). */}
              {recommended ? <Badge variant="info" label="Recommended" /> : null}
            </div>
            <span className="text-sm text-secondary">{note(m)}</span>
          </div>
        </div>
      </SelectableCard>
    );
  };

  return (
    <Popover
      placement="above"
      alignment="start"
      width={300}
      label="Choose a model"
      isOpen={open}
      onOpenChange={setOpen}
      content={
        <div className="flex max-h-[60vh] flex-col gap-3 overflow-y-auto p-1">
          {auto ? <div className="flex flex-col gap-1.5">{card(auto, true)}</div> : null}
          {groups.map((group) => (
            <div key={group.tier} className="flex flex-col gap-1.5">
              <span className="px-1 text-sm font-medium uppercase tracking-wide text-secondary">
                {TIER_LABEL[group.tier]}
              </span>
              {group.items.map((m) => card(m))}
            </div>
          ))}
        </div>
      }
    >
      <Button
        // `label` is the accessible name; the truncating child below is the
        // visible text (Astryx Button renders `children ?? label`, keeping
        // `label` as aria-label). Icon + chevron are pinned; only the label
        // shrinks — the trigger stays one line and never eats the send row.
        label={`Model: ${current?.label ?? 'choose a model'}`}
        variant={variant === 'bordered' ? 'secondary' : 'ghost'}
        size="sm"
        isDisabled={isLoading || models.length === 0}
        icon={<CurrentIcon className="size-3.5 flex-none text-secondary" aria-hidden />}
        endContent={<ChevronsUpDown className="size-3.5 flex-none text-secondary" aria-hidden />}
        className="min-w-[8rem] max-w-[13rem]"
      >
        <span className="block truncate text-left">{current?.label ?? 'Model'}</span>
      </Button>
    </Popover>
  );
}
