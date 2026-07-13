'use client';

import { ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';
import * as React from 'react';
import { type DayButton, DayPicker, getDefaultClassNames } from 'react-day-picker';

import { cn } from '../lib/cn';
import { Button } from '../primitives/button';

// react-day-picker's prev/next nav buttons are plain `<button>`s styled via a `classNames` map
// (not the `Button` component), so they carry their own small slice of the old shadcn button
// classes rather than depending on `Button`'s (now-Astryx-backed) internals.
const NAV_BUTTON_VARIANT_CLASSES: Record<
  NonNullable<React.ComponentProps<typeof Button>['variant']>,
  string
> = {
  primary: 'bg-primary text-on-primary hover:bg-primary-hover',
  secondary: 'bg-surface-1 text-ink border border-hairline hover:bg-surface-2',
  destructive: 'bg-destructive text-on-destructive hover:bg-destructive/90',
  ghost: 'hover:bg-surface-2 hover:text-ink',
};
const NAV_BUTTON_BASE_CLASSES =
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-button font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0';

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  captionLayout = 'label',
  buttonVariant = 'ghost',
  formatters,
  components,
  ...props
}: React.ComponentProps<typeof DayPicker> & {
  buttonVariant?: React.ComponentProps<typeof Button>['variant'];
}) {
  const defaultClassNames = getDefaultClassNames();

  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn(
        'bg-canvas group/calendar p-3 [--cell-size:2rem] [[data-slot=card-content]_&]:bg-transparent [[data-slot=popover-content]_&]:bg-transparent',
        String.raw`rtl:**:[.rdp-button\_next>svg]:rotate-180`,
        String.raw`rtl:**:[.rdp-button\_previous>svg]:rotate-180`,
        className,
      )}
      captionLayout={captionLayout}
      formatters={{
        formatMonthDropdown: (date) => date.toLocaleString('default', { month: 'short' }),
        ...formatters,
      }}
      classNames={{
        // Not `w-fit`: with the table-based month grid, shrink-to-fit here has nothing
        // reliable to shrink around and the whole grid collapses to ~half size. Let the
        // caller size this via its own wrapper instead.
        root: cn(defaultClassNames.root),
        months: cn('relative flex flex-col gap-4 md:flex-row', defaultClassNames.months),
        month: cn('flex w-full flex-col gap-4', defaultClassNames.month),
        nav: cn(
          'absolute inset-x-0 top-0 flex w-full items-center justify-between gap-1',
          defaultClassNames.nav,
        ),
        button_previous: cn(
          NAV_BUTTON_BASE_CLASSES,
          NAV_BUTTON_VARIANT_CLASSES[buttonVariant],
          'h-[--cell-size] w-[--cell-size] select-none p-0 aria-disabled:opacity-50',
          defaultClassNames.button_previous,
        ),
        button_next: cn(
          NAV_BUTTON_BASE_CLASSES,
          NAV_BUTTON_VARIANT_CLASSES[buttonVariant],
          'h-[--cell-size] w-[--cell-size] select-none p-0 aria-disabled:opacity-50',
          defaultClassNames.button_next,
        ),
        month_caption: cn(
          'flex h-[--cell-size] w-full items-center justify-center px-[--cell-size]',
          defaultClassNames.month_caption,
        ),
        dropdowns: cn(
          'flex h-[--cell-size] w-full items-center justify-center gap-1.5 text-sm font-medium',
          defaultClassNames.dropdowns,
        ),
        dropdown_root: cn(
          'has-focus:border-ring border-hairline shadow-xs has-focus:ring-primary-focus/50 has-focus:ring-[3px] relative rounded-md border',
          defaultClassNames.dropdown_root,
        ),
        dropdown: cn('bg-surface-3 absolute inset-0 opacity-0', defaultClassNames.dropdown),
        caption_label: cn(
          'select-none font-medium',
          captionLayout === 'label'
            ? 'text-sm'
            : '[&>svg]:text-ink-subtle flex h-8 items-center gap-1 rounded-md pl-2 pr-1 text-sm [&>svg]:size-3.5',
          defaultClassNames.caption_label,
        ),
        // react-day-picker renders the grid as a real <table> (slot name "month_grid").
        // Without an explicit width the table shrinks to its content's natural size —
        // every cell/button collapses toward ~16px regardless of --cell-size, since the
        // browser's table auto-layout wins over the flex classes on <tr>/<td> beneath it.
        month_grid: cn('w-full border-collapse [table-layout:fixed]', defaultClassNames.month_grid),
        weekdays: cn('flex', defaultClassNames.weekdays),
        weekday: cn(
          'text-ink-subtle flex-1 select-none rounded-md text-[0.8rem] font-normal',
          defaultClassNames.weekday,
        ),
        week: cn('mt-2 flex w-full', defaultClassNames.week),
        week_number_header: cn('w-[--cell-size] select-none', defaultClassNames.week_number_header),
        week_number: cn('text-ink-subtle select-none text-[0.8rem]', defaultClassNames.week_number),
        day: cn(
          'group/day relative aspect-square h-full w-full select-none p-0 text-center [&:first-child[data-selected=true]_button]:rounded-l-md [&:last-child[data-selected=true]_button]:rounded-r-md',
          defaultClassNames.day,
        ),
        range_start: cn('bg-primary-tint rounded-l-md', defaultClassNames.range_start),
        range_middle: cn('rounded-none', defaultClassNames.range_middle),
        range_end: cn('bg-primary-tint rounded-r-md', defaultClassNames.range_end),
        today: cn(
          'bg-primary-tint text-primary-ink rounded-md data-[selected=true]:rounded-none',
          defaultClassNames.today,
        ),
        outside: cn('text-ink-subtle aria-selected:text-ink-subtle', defaultClassNames.outside),
        disabled: cn('text-ink-subtle opacity-50', defaultClassNames.disabled),
        hidden: cn('invisible', defaultClassNames.hidden),
        ...classNames,
      }}
      components={{
        Root: ({ className, rootRef, ...props }) => {
          return <div data-slot="calendar" ref={rootRef} className={cn(className)} {...props} />;
        },
        Chevron: ({ className, orientation, ...props }) => {
          if (orientation === 'left') {
            return <ChevronLeftIcon className={cn('size-4', className)} {...props} />;
          }

          if (orientation === 'right') {
            return <ChevronRightIcon className={cn('size-4', className)} {...props} />;
          }

          return <ChevronDownIcon className={cn('size-4', className)} {...props} />;
        },
        DayButton: CalendarDayButton,
        WeekNumber: ({ children, ...props }) => {
          return (
            <td {...props}>
              <div className="flex size-[--cell-size] items-center justify-center text-center">
                {children}
              </div>
            </td>
          );
        },
        ...components,
      }}
      {...props}
    />
  );
}

function CalendarDayButton({
  className,
  day,
  modifiers,
  disabled,
  children,
  'aria-label': ariaLabel,
  ...props
}: React.ComponentProps<typeof DayButton>) {
  const defaultClassNames = getDefaultClassNames();

  const ref = React.useRef<HTMLButtonElement>(null);
  React.useEffect(() => {
    if (modifiers.focused) ref.current?.focus();
  }, [modifiers.focused]);

  return (
    <Button
      ref={ref}
      variant="ghost"
      size="sm"
      isDisabled={disabled}
      // react-day-picker (DayPicker.js) already computes a precise, localized accessible name
      // per day (via `labelDayButton`) and passes it as `aria-label` — that's the real accessible
      // name here, not a generic placeholder; `children` (the visible day-of-month number) is
      // rendered separately via Astryx's `children` slot, distinct from `label`.
      label={ariaLabel ?? day.date.toLocaleDateString()}
      data-day={day.date.toLocaleDateString()}
      data-selected-single={String(
        modifiers.selected &&
          !modifiers.range_start &&
          !modifiers.range_end &&
          !modifiers.range_middle,
      )}
      data-range-start={String(modifiers.range_start)}
      data-range-end={String(modifiers.range_end)}
      data-range-middle={String(modifiers.range_middle)}
      className={cn(
        'data-[selected-single=true]:bg-primary data-[selected-single=true]:text-on-primary data-[range-middle=true]:bg-primary-tint data-[range-middle=true]:text-ink data-[range-start=true]:bg-primary data-[range-start=true]:text-on-primary data-[range-end=true]:bg-primary data-[range-end=true]:text-on-primary group-data-[focused=true]/day:border-ring group-data-[focused=true]/day:ring-primary-focus/50 flex aspect-square h-auto w-full min-w-[--cell-size] flex-col gap-1 font-normal leading-none data-[range-end=true]:rounded-md data-[range-middle=true]:rounded-none data-[range-start=true]:rounded-md group-data-[focused=true]/day:relative group-data-[focused=true]/day:z-10 group-data-[focused=true]/day:ring-[3px] [&>span]:text-xs [&>span]:opacity-70',
        defaultClassNames.day,
        className,
      )}
      {...props}
    >
      {children}
    </Button>
  );
}

export { Calendar, CalendarDayButton };
