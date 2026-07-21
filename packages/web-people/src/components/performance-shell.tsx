import { HStack, Tab, TabList } from '@seta/shared-ui';
import { useLocation, useNavigate } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { PERFORMANCE_SECTIONS, type PerformanceSection } from '../lib/performance-scope.ts';
import { CapacitySwitcher } from './capacity-switcher.tsx';
import { usePerformanceScope } from './performance-scope.tsx';

const SECTION_LABELS: Record<PerformanceSection, string> = {
  dashboard: 'Dashboard',
  scoring: 'Scoring',
  'self-assessment': 'Self-assessment',
  morale: 'Morale',
  history: 'History',
  configuration: 'Configuration',
  audit: 'Audit',
};

function sectionPath(section: PerformanceSection): string {
  return section === 'dashboard' ? '/people/performance' : `/people/performance/${section}`;
}

function activeSection(pathname: string): PerformanceSection {
  const tail = pathname.replace(/\/$/, '').split('/').pop();
  return (PERFORMANCE_SECTIONS as readonly string[]).includes(tail ?? '')
    ? (tail as PerformanceSection)
    : 'dashboard';
}

/**
 * SCR-02 section shell: role-filtered section tabs (affordance only — the
 * guard + server RBAC enforce) with the capacity switcher alongside.
 * Navigation preserves search params so the scope tuple survives section
 * changes (AC3/AC4).
 */
export function PerformanceShell({ children }: { children: ReactNode }) {
  const { sections } = usePerformanceScope();
  const navigate = useNavigate();
  const location = useLocation();

  const visible = PERFORMANCE_SECTIONS.filter((s) => sections.has(s));

  return (
    <div className="flex h-full flex-col">
      <HStack hAlign="between" vAlign="center" gap={2} padding={4}>
        <TabList
          value={activeSection(location.pathname)}
          onChange={(v) =>
            void navigate({ to: sectionPath(v as PerformanceSection), search: true })
          }
        >
          {visible.map((s) => (
            <Tab key={s} value={s} label={SECTION_LABELS[s]} />
          ))}
        </TabList>
        <CapacitySwitcher />
      </HStack>
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
}
