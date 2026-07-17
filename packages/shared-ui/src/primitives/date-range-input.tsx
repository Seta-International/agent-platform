import { DateRangeInput as AstryxDateRangeInput } from '@astryxdesign/core/DateRangeInput';
import type { ComponentProps } from 'react';

/** A calendar range as plain 'YYYY-MM-DD' strings (Astryx brands these as `ISODateString`). */
export interface DateRange {
  start: string;
  end: string;
}

type AstryxDateRangeInputProps = ComponentProps<typeof AstryxDateRangeInput>;

// Widen the branded `ISODateString` range to plain strings at this boundary, the one place
// allowed to import `@astryxdesign/core` directly (same approach as `calendar.tsx`). Output values
// need no widening — branded strings are assignable to `string`. DateRangeInput has no
// discriminated union, so overriding `value`/`onChange` is safe.
export type DateRangeInputProps = Omit<AstryxDateRangeInputProps, 'value' | 'onChange'> & {
  value?: DateRange | null;
  onChange: (value: DateRange | null) => void;
};

export function DateRangeInput(props: DateRangeInputProps) {
  return <AstryxDateRangeInput {...(props as unknown as AstryxDateRangeInputProps)} />;
}
DateRangeInput.displayName = 'DateRangeInput';
