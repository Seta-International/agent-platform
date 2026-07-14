import { TimeInput as AstryxTimeInput } from '@astryxdesign/core/TimeInput';
import type { ComponentProps } from 'react';

type AstryxTimeInputProps = ComponentProps<typeof AstryxTimeInput>;
// Astryx types value/min/max as a branded `ISOTimeString` template-literal type, not a plain
// `string` — forcing every call site to cast a `useState<string>` value at the boundary. Widen
// to `string` here, at the one file allowed to import `@astryxdesign/core` directly, so callers
// can keep passing/receiving ordinary ISO ('HH:MM' or 'HH:MM:SS') strings unchanged.
export type TimeInputProps = Omit<AstryxTimeInputProps, 'value' | 'min' | 'max'> & {
  value?: string;
  min?: string;
  max?: string;
};

export function TimeInput({ value, min, max, ...props }: TimeInputProps) {
  return (
    <AstryxTimeInput
      {...props}
      value={value as AstryxTimeInputProps['value']}
      min={min as AstryxTimeInputProps['min']}
      max={max as AstryxTimeInputProps['max']}
    />
  );
}
