import { DateRangeInput } from '@seta/shared-ui';

interface Props {
  from?: string;
  to?: string;
  onChange: (next: { from?: string; to?: string }) => void;
}

export function ChartRangeControl({ from, to, onChange }: Props) {
  // Astryx's DateRangeInput carries a complete range or none, so only surface a value when both
  // ends are set; picking a range writes both, clearing writes neither.
  const value = from && to ? { start: from, end: to } : null;
  return (
    <DateRangeInput
      label="Date range"
      isLabelHidden
      size="sm"
      placeholder="Range"
      hasClear
      value={value}
      onChange={(r) => onChange({ from: r?.start, to: r?.end })}
    />
  );
}
