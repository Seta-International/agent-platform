import type { BlockProps } from './types';

type Tier = 'High' | 'Medium' | 'Uncertain';

function confidenceTier(score: number): Tier {
  if (score >= 0.7) return 'High';
  if (score >= 0.4) return 'Medium';
  return 'Uncertain';
}

const TIER_CLASS: Record<Tier, string> = {
  High: 'bg-success-tint text-success',
  Medium: 'bg-warning-tint text-warning',
  Uncertain: 'bg-surface-2 text-ink-muted',
};

export function ConfidenceBlock({ block }: BlockProps) {
  const score = typeof block.score === 'number' ? block.score : 0;
  const tier = confidenceTier(score);
  const label = typeof block.label === 'string' ? block.label : `${tier} confidence`;
  return (
    <span className={`rounded px-1.5 py-0.5 text-caption font-medium ${TIER_CLASS[tier]}`}>
      {label}
    </span>
  );
}
