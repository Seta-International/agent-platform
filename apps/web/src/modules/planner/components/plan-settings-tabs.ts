export type PlanSettingsTab =
  | 'general'
  | 'buckets'
  | 'members'
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
  { slug: 'categories', label: 'Categories' },
  { slug: 'automations', label: 'Automations' },
  { slug: 'danger', label: 'Danger zone' },
];
