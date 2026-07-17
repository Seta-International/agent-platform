'use client';

import { cn } from '../lib/cn';
import { Badge, type BadgeProps } from '../primitives/badge';
import { HoverCard } from '../primitives/hover-card';
import { LabelChip } from './label-chip';

export interface CounterBadgeItem {
  id: string;
  name: string;
  color?: string;
}

export interface CounterBadgePopoverProps {
  items: CounterBadgeItem[];
  title: string;
  limit?: number;
  type?: 'badge' | 'label-chip';
  badgeVariant?: BadgeProps['variant'];
  className?: string;
}

export function CounterBadgePopover({
  items,
  title,
  limit = 2,
  type = 'badge',
  badgeVariant = 'neutral',
  className,
}: CounterBadgePopoverProps) {
  if (!items || items.length === 0) {
    return <span className="text-caption text-disabled">—</span>;
  }

  const visibleItems = items.slice(0, limit);
  const hiddenItemsCount = items.length - limit;

  const renderTag = (item: CounterBadgeItem, isPopoverList = false) => {
    if (type === 'label-chip') {
      return <LabelChip key={item.id} name={item.name} color={item.color} />;
    }
    return (
      <Badge
        key={item.id}
        variant={badgeVariant}
        className={cn(
          'text-[11px] px-1.5 py-0 whitespace-nowrap font-medium rounded-sm border-border',
          isPopoverList ? 'h-auto py-0.5' : 'h-5',
        )}
        label={item.name}
      />
    );
  };

  return (
    <div className={cn('flex items-center gap-1.5 flex-nowrap min-w-0', className)}>
      <div className="flex items-center gap-1 flex-nowrap min-w-0">
        {visibleItems.map((item) => renderTag(item))}
      </div>

      {hiddenItemsCount > 0 && (
        <HoverCard
          placement="below"
          alignment="start"
          hasHoverIndication={false}
          content={
            <div className="w-64 flex flex-col gap-2">
              <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-secondary leading-none">
                <span>{title}</span>
                <span className="text-disabled font-mono">{items.length}</span>
              </div>
              <div className="border-l border-border pl-3 flex flex-col gap-1.5 items-start mt-1 max-h-[150px] overflow-y-auto w-full pr-1.5 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-secondary/30 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-secondary/50">
                {items.map((item) => renderTag(item, true))}
              </div>
            </div>
          }
        >
          <button
            type="button"
            className="inline-flex items-center justify-center h-5 px-1.5 rounded-sm border border-border bg-surface text-primary hover:bg-surface transition-colors text-[11px] font-semibold cursor-pointer whitespace-nowrap focus:outline-none"
          >
            +{hiddenItemsCount}
          </button>
        </HoverCard>
      )}
    </div>
  );
}
