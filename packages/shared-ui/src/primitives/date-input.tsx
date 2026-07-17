import { DateInput as AstryxDateInput } from '@astryxdesign/core/DateInput';
import type { ComponentProps } from 'react';

type AstryxDateInputProps = ComponentProps<typeof AstryxDateInput>;
// Astryx types value/min/max as a branded `ISODateString` template-literal type, not a plain
// `string` — forcing every call site to cast a `useState<string>` value at the boundary. Widen
// to `string` here, at the one file allowed to import `@astryxdesign/core` directly, so callers
// can keep passing/receiving ordinary ISO ('YYYY-MM-DD') strings unchanged.
export type DateInputProps = Omit<AstryxDateInputProps, 'value' | 'min' | 'max'> & {
  value?: string;
  min?: string;
  max?: string;
};

export function DateInput({ value, min, max, ...props }: DateInputProps) {
  return (
    <AstryxDateInput
      {...props}
      value={value as AstryxDateInputProps['value']}
      min={min as AstryxDateInputProps['min']}
      max={max as AstryxDateInputProps['max']}
    />
  );
}
