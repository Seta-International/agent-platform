import { cn } from '@seta/shared-ui';

export type PlanSettingsTab =
  | 'general'
  | 'buckets'
  | 'members'
  | 'labels'
  | 'categories'
  | 'automations'
  | 'danger';

interface TabDef {
  slug: PlanSettingsTab;
  label: string;
}

export const PLAN_SETTINGS_TABS: ReadonlyArray<TabDef> = [
  { slug: 'general', label: 'General' },
  { slug: 'buckets', label: 'Buckets' },
  { slug: 'members', label: 'Members' },
  { slug: 'labels', label: 'Labels' },
  { slug: 'categories', label: 'Categories' },
  { slug: 'automations', label: 'Automations' },
  { slug: 'danger', label: 'Danger zone' },
];

const CATEGORIES_MAX = 25;

export interface PlanSettingsTabCounts {
  buckets: number;
  members: number;
  categories: number;
}

interface Props {
  activeTab: PlanSettingsTab;
  counts: PlanSettingsTabCounts;
  onTabChange: (next: PlanSettingsTab) => void;
}

function formatTabLabel(slug: PlanSettingsTab, label: string, counts: PlanSettingsTabCounts) {
  if (slug === 'buckets') return `${label} ${counts.buckets}`;
  if (slug === 'members') return `${label} ${counts.members}`;
  if (slug === 'categories') return `${label} ${counts.categories}/${CATEGORIES_MAX}`;
  return label;
}

export function PlanSettingsTabStrip({ activeTab, counts, onTabChange }: Props) {
  return (
    <div
      role="tablist"
      aria-label="Plan settings sections"
      className="flex items-center gap-1 border-b border-hairline"
    >
      {PLAN_SETTINGS_TABS.map((tab) => {
        const active = tab.slug === activeTab;
        return (
          <button
            key={tab.slug}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onTabChange(tab.slug)}
            className={cn(
              'px-3 py-2 text-sm font-medium transition-colors border-b-2 -mb-px',
              active
                ? 'text-ink border-primary'
                : 'text-ink-subtle border-transparent hover:text-ink',
            )}
          >
            {formatTabLabel(tab.slug, tab.label, counts)}
          </button>
        );
      })}
    </div>
  );
}
