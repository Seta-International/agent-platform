import { Badge, Button, cn, Input, List, ListItem, Text } from '@seta/shared-ui';
import { Plus, Search } from 'lucide-react';

export interface ThreadRailItem {
  id: string;
  title: string;
  updatedAtLabel: string;
  active?: boolean;
  hint?: string;
}

export interface ChatThreadRailProps {
  groups: Array<{ label: string; items: ThreadRailItem[] }>;
  activeId?: string;
  onSelect: (id: string) => void;
  onNewThread: () => void;
  searchValue: string;
  onSearchChange: (v: string) => void;
  className?: string;
}

export function ChatThreadRail({
  groups,
  activeId,
  onSelect,
  onNewThread,
  searchValue,
  onSearchChange,
  className,
}: ChatThreadRailProps) {
  return (
    <aside
      className={cn(
        'flex w-full flex-none flex-col border-r border-border bg-card lg:w-[260px]',
        className,
      )}
    >
      <div className="flex flex-col gap-2.5 px-3.5 pt-3.5 pb-2.5">
        <div className="flex items-center justify-between">
          <span className="text-body-sm font-semibold text-primary">Chat</span>
          <Button
            label="New"
            icon={<Plus className="size-3" aria-hidden />}
            variant="primary"
            size="sm"
            onClick={onNewThread}
          />
        </div>
        <Input
          label="Search threads"
          isLabelHidden
          value={searchValue}
          onChange={onSearchChange}
          placeholder="Search threads…"
          startIcon={<Search className="size-3.5" aria-hidden />}
          hasClear
          size="sm"
        />
      </div>
      <div className="flex-1 overflow-auto px-2 pb-3">
        {groups.map((g, gi) => (
          <div key={g.label} className={gi === 0 ? 'mt-1' : 'mt-4'}>
            <List
              header={
                <span className="block px-2 pb-1.5 text-caption font-medium uppercase tracking-[0.06em] text-secondary">
                  {g.label}
                </span>
              }
            >
              {g.items.map((t) => {
                const isActive = t.id === activeId || t.active;
                return (
                  <ListItem
                    key={t.id}
                    label={t.title}
                    description={
                      t.hint ? <Badge variant="warning" label={t.hint.toUpperCase()} /> : undefined
                    }
                    endContent={<Text type="supporting">{t.updatedAtLabel}</Text>}
                    isSelected={isActive}
                    onClick={() => onSelect(t.id)}
                  />
                );
              })}
            </List>
          </div>
        ))}
      </div>
    </aside>
  );
}
