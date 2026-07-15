import { createStaticSource, type SearchableItem, Typeahead } from '@seta/shared-ui';
import { useMemo } from 'react';

const TIMEZONES = ((
  Intl as unknown as { supportedValuesOf?: (key: string) => string[] }
).supportedValuesOf?.('timeZone') as string[]) ?? [
  'UTC',
  'America/New_York',
  'Europe/London',
  'Asia/Singapore',
  'Asia/Ho_Chi_Minh',
];

export function TimezonePicker({
  value,
  onChange,
  label = 'Timezone',
  isLabelHidden = true,
  isDisabled = false,
}: {
  value: string;
  onChange: (tz: string) => void;
  label?: string;
  isLabelHidden?: boolean;
  isDisabled?: boolean;
}) {
  const source = useMemo(() => createStaticSource(TIMEZONES.map((z) => ({ id: z, label: z }))), []);
  const item: SearchableItem | null = TIMEZONES.includes(value)
    ? { id: value, label: value }
    : null;

  return (
    <Typeahead
      label={label}
      isLabelHidden={isLabelHidden}
      isDisabled={isDisabled}
      searchSource={source}
      value={item}
      onChange={(next) => onChange(next?.id ?? '')}
      placeholder="Select timezone"
      debounceMs={0}
      hasEntriesOnFocus
      hasClear
    />
  );
}
