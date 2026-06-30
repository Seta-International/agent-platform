'use client';

import type * as React from 'react';
import { useRef, useState } from 'react';
import { cn } from '../lib/cn';
import { Badge } from '../primitives/badge';
import { Popover, PopoverContent, PopoverTrigger } from '../primitives/popover';
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
  badgeVariant?: 'default' | 'secondary' | 'outline' | 'destructive' | 'success' | 'warning';
  className?: string;
}

export function CounterBadgePopover({
  items,
  title,
  limit = 2,
  type = 'badge',
  badgeVariant = 'secondary',
  className,
}: CounterBadgePopoverProps) {
  const [isOpen, setIsOpen] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  if (!items || items.length === 0) {
    return <span className="text-caption text-ink-tertiary">—</span>;
  }

  const visibleItems = items.slice(0, limit);
  const hiddenItemsCount = items.length - limit;

  const handleMouseEnter = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setIsOpen(true);
  };

  const handleMouseLeave = () => {
    timeoutRef.current = setTimeout(() => {
      setIsOpen(false);
    }, 150);
  };

  const handleTriggerClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsOpen((prev) => !prev);
  };

  const renderTag = (item: CounterBadgeItem, isPopoverList = false) => {
    if (type === 'label-chip') {
      return <LabelChip key={item.id} name={item.name} color={item.color} />;
    }
    return (
      <Badge
        key={item.id}
        variant={badgeVariant}
        className={cn(
          'text-[11px] px-1.5 py-0 whitespace-nowrap font-medium rounded-sm border-hairline',
          isPopoverList ? 'h-auto py-0.5' : 'h-5',
        )}
      >
        {item.name}
      </Badge>
    );
  };

  return (
    <div className={cn('flex items-center gap-1.5 flex-nowrap min-w-0', className)}>
      <div className="flex items-center gap-1 flex-nowrap min-w-0">
        {visibleItems.map((item) => renderTag(item))}
      </div>

      {hiddenItemsCount > 0 && (
        <Popover open={isOpen} onOpenChange={setIsOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              onMouseEnter={handleMouseEnter}
              onMouseLeave={handleMouseLeave}
              onClick={handleTriggerClick}
              className={cn(
                'inline-flex items-center justify-center h-5 px-1.5 rounded-sm border border-hairline bg-surface-2 text-ink hover:bg-surface-3 transition-colors text-[11px] font-semibold cursor-pointer whitespace-nowrap focus:outline-none',
              )}
            >
              +{hiddenItemsCount}
            </button>
          </PopoverTrigger>
          <PopoverContent
            side="bottom"
            align="start"
            sideOffset={4}
            className="w-64 p-3 bg-surface-3 border border-hairline text-ink rounded-md shadow-lg outline-none duration-150 ease-out"
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
          >
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-ink-muted leading-none">
                <span>{title}</span>
                <span className="text-ink-tertiary font-mono">{items.length}</span>
              </div>
              <div className="border-l border-hairline pl-3 flex flex-col gap-1.5 items-start mt-1 max-h-[150px] overflow-y-auto w-full pr-1.5 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-ink-muted/30 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-ink-muted/50">
                {items.map((item) => renderTag(item, true))}
              </div>
            </div>
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}
