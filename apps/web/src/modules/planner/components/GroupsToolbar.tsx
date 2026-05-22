import { FilterPill, Input, SegmentedControl } from '@seta/shared-ui';
import { LayoutGrid, List, Search } from 'lucide-react';
import { useEffect, useState } from 'react';

export type GroupsView = 'list' | 'grid';
export type VisibilityFilter = 'private' | 'public';
export type SourceFilter = 'native' | 'm365';

export interface OwnerOption {
  value: string;
  label: string;
}

export interface GroupsToolbarProps {
  view: GroupsView;
  onViewChange: (next: GroupsView) => void;
  searchQuery: string;
  onSearchChange: (next: string) => void;
  visibility: VisibilityFilter | null;
  onVisibilityChange: (next: VisibilityFilter | null) => void;
  source: SourceFilter | null;
  onSourceChange: (next: SourceFilter | null) => void;
  owner: string | null;
  onOwnerChange: (next: string | null) => void;
  ownerOptions: ReadonlyArray<OwnerOption>;
  showSourceFilter?: boolean;
}

const VISIBILITY_OPTIONS = [
  { value: 'private' as const, label: 'Private' },
  { value: 'public' as const, label: 'Workspace' },
];

const SOURCE_OPTIONS = [
  { value: 'native' as const, label: 'Native' },
  { value: 'm365' as const, label: 'M365' },
];

const VIEW_OPTIONS = [
  { value: 'list' as const, label: 'List', icon: <List className="size-3.5" /> },
  { value: 'grid' as const, label: 'Grid', icon: <LayoutGrid className="size-3.5" /> },
];

export function GroupsToolbar({
  view,
  onViewChange,
  searchQuery,
  onSearchChange,
  visibility,
  onVisibilityChange,
  source,
  onSourceChange,
  owner,
  onOwnerChange,
  ownerOptions,
  showSourceFilter = false,
}: GroupsToolbarProps) {
  const [localSearch, setLocalSearch] = useState(searchQuery);
  const [prevSearchQuery, setPrevSearchQuery] = useState(searchQuery);

  // Sync local state when parent resets searchQuery externally (state-during-render pattern
  // from https://react.dev/reference/react/useState#storing-information-from-previous-renders).
  if (searchQuery !== prevSearchQuery) {
    setPrevSearchQuery(searchQuery);
    setLocalSearch(searchQuery);
  }

  // Debounce: fire onSearchChange 250ms after last keystroke
  useEffect(() => {
    if (localSearch === searchQuery) return;
    const id = setTimeout(() => {
      onSearchChange(localSearch);
    }, 250);
    return () => clearTimeout(id);
  }, [localSearch, searchQuery, onSearchChange]);

  return (
    <div className="flex items-center gap-3 border-b border-hairline px-7 py-3">
      {/* Left cluster */}
      <FilterPill
        label="Visibility"
        value={visibility}
        options={VISIBILITY_OPTIONS}
        onChange={onVisibilityChange}
      />

      {showSourceFilter && (
        <FilterPill
          label="Source"
          value={source}
          options={SOURCE_OPTIONS}
          onChange={onSourceChange}
        />
      )}

      <FilterPill label="Owner" value={owner} options={ownerOptions} onChange={onOwnerChange} />

      {/* Separator */}
      <div className="mx-1 h-4 w-px bg-hairline" />

      <SegmentedControl
        aria-label="View"
        value={view}
        onValueChange={onViewChange}
        options={VIEW_OPTIONS}
      />

      {/* Right cluster */}
      <div className="relative ml-auto w-[260px]">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-subtle" />
        <Input
          type="search"
          placeholder="Search groups…"
          value={localSearch}
          onChange={(e) => setLocalSearch(e.target.value)}
          className="pl-8"
          size="sm"
        />
      </div>
    </div>
  );
}
