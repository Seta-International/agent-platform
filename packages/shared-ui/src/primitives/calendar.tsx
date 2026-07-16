import {
  Calendar as AstryxCalendar,
  type CalendarProps as AstryxCalendarProps,
} from '@astryxdesign/core/Calendar';
import type { Ref } from 'react';

// Astryx types dates as a branded `ISODateString` template-literal type (and range values as
// `DateRange` of the same). Widen to plain `string` here, at the one file allowed to import
// `@astryxdesign/core` directly, so callers pass ordinary 'YYYY-MM-DD' strings. Output callbacks
// need no widening — branded strings are assignable to `string`.
type AstryxRangeProps = Extract<AstryxCalendarProps, { mode: 'range' }>;
type AstryxSingleProps = Exclude<AstryxCalendarProps, AstryxRangeProps>;

// `navigateTo` takes the brand in an *input* position too, so the handle is widened
// alongside the props — otherwise the one boundary this file exists to seal has a hole.
export interface CalendarHandle {
  /** Navigate the calendar to show the month containing the given 'YYYY-MM-DD' date. */
  navigateTo: (date: string) => void;
}

type WidenShared<T> = Omit<T, 'min' | 'max' | 'focusDate' | 'handleRef'> & {
  min?: string;
  max?: string;
  focusDate?: string;
  handleRef?: Ref<CalendarHandle>;
};

export type CalendarProps =
  | (Omit<WidenShared<AstryxSingleProps>, 'value' | 'defaultValue'> & {
      value?: string;
      defaultValue?: string;
    })
  | (Omit<WidenShared<AstryxRangeProps>, 'value' | 'defaultValue'> & {
      value?: { start: string; end: string };
      defaultValue?: { start: string; end: string };
    });

export function Calendar(props: CalendarProps) {
  return <AstryxCalendar {...(props as AstryxCalendarProps)} />;
}
