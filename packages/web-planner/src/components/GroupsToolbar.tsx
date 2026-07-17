import {
  Divider,
  FilterPill,
  Input,
  SegmentedControl,
  SegmentedControlItem,
} from '@seta/shared-ui';
import { LayoutGrid, List, Search } from 'lucide-react';
import { useEffect, useState } from 'react';

export type GroupsView = 'list' | 'grid';
export type VisibilityFilter = 'private' | 'public';
export type SourceFilter = 'native' | 'm365';
export type StatusFilter = 'active' | 'archived';

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
  status: StatusFilter | null;
  onStatusChange: (next: StatusFilter | null) => void;
}

const VISIBILITY_OPTIONS = [
  { value: 'private' as const, label: 'Private' },
  { value: 'public' as const, label: 'Workspace' },
];

const SOURCE_OPTIONS = [
  { value: 'native' as const, label: 'Internal' },
  { value: 'm365' as const, label: 'Microsoft 365' },
];

const STATUS_OPTIONS = [
  { value: 'active' as const, label: 'Active' },
  { value: 'archived' as const, label: 'Archived' },
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
  status,
  onStatusChange,
}: GroupsToolbarProps) {
  const [localSearch, setLocalSearch] = useState(searchQuery);
  const [prevSearchQuery, setPrevSearchQuery] = useState(searchQuery);
  // True while an IME composition is in progress (Vietnamese Telex/VNI, CJK, …).
  // Mutating or propagating the value mid-composition corrupts the IME buffer.
  const [isComposing, setIsComposing] = useState(false);

  // Sync local state when parent resets searchQuery externally (state-during-render pattern
  // from https://react.dev/reference/react/useState#storing-information-from-previous-renders).
  // Never mid-composition: overwriting the value breaks the IME buffer.
  if (searchQuery !== prevSearchQuery && !isComposing) {
    setPrevSearchQuery(searchQuery);
    setLocalSearch(searchQuery);
  }

  // Debounce: fire onSearchChange 250ms after last keystroke. Suspended during
  // composition so a half-formed query is never searched nor echoed back.
  useEffect(() => {
    if (isComposing) return;
    if (localSearch === searchQuery) return;
    const id = setTimeout(() => {
      onSearchChange(localSearch);
    }, 250);
    return () => clearTimeout(id);
  }, [localSearch, searchQuery, onSearchChange, isComposing]);

  return (
    <div
      data-testid="groups-toolbar"
      className="flex items-center gap-3 border-b border-border px-7 py-3"
    >
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

      <FilterPill
        label="Status"
        value={status}
        options={STATUS_OPTIONS}
        onChange={onStatusChange}
      />

      <Divider orientation="vertical" style={{ height: 16, marginInline: 4 }} />

      <SegmentedControl label="View" value={view} onChange={(v) => onViewChange(v as GroupsView)}>
        {VIEW_OPTIONS.map((o) => (
          <SegmentedControlItem key={o.value} value={o.value} label={o.label} icon={o.icon} />
        ))}
      </SegmentedControl>

      {/* Right cluster */}
      <Input
        type="text"
        label="Search groups"
        isLabelHidden
        startIcon={<Search className="size-3.5" aria-hidden />}
        hasClear
        placeholder="Search groups…"
        value={localSearch}
        onChange={(value) => setLocalSearch(value)}
        onCompositionStart={() => setIsComposing(true)}
        onCompositionEnd={(e) => {
          setIsComposing(false);
          setLocalSearch((e.currentTarget as HTMLInputElement).value);
        }}
        className="ml-auto w-[260px]"
        size="sm"
      />
    </div>
  );
}
