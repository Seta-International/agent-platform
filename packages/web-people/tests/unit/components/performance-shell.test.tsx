import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PerformanceContext } from '../../../src/api/people-client.ts';
import { CapacitySwitcher } from '../../../src/components/capacity-switcher.tsx';
import {
  PerformanceScopeProvider,
  SectionGuard,
  usePerformanceScope,
} from '../../../src/components/performance-scope.tsx';
import { PerformanceShell } from '../../../src/components/performance-shell.tsx';

const navigateMock = vi.hoisted(() => vi.fn());
const searchMock = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));
const pathnameMock = vi.hoisted(() => ({ value: '/people/performance' }));

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigateMock,
  useSearch: () => searchMock.value,
  useLocation: () => ({ pathname: pathnameMock.value }),
}));

type OkContext = Extract<PerformanceContext, { status: 'ok' }>;

const TL_MEMBER_CTX: OkContext = {
  status: 'ok',
  as_of_month: '2026-07',
  person: { person_id: 'p1', full_name: 'Jane', org_unit_id: null },
  role_slugs: [],
  capacities: [
    { kind: 'tl', project_id: 'proj-a', account_id: 'acc', label: 'Alpha' },
    { kind: 'member', project_id: 'proj-b', account_id: 'acc', label: 'Beta' },
  ],
  default_capacity_index: 0,
};

const PMO_CTX: OkContext = {
  ...TL_MEMBER_CTX,
  role_slugs: ['pm.pmo'],
  capacities: [],
  default_capacity_index: -1,
};

function ScopeProbe() {
  const { scope } = usePerformanceScope();
  return <div>scope:{scope ? `${scope.capacity.kind}` : 'none'}</div>;
}

beforeEach(() => {
  navigateMock.mockReset();
  searchMock.value = {};
  pathnameMock.value = '/people/performance';
});

describe('PerformanceScopeProvider', () => {
  it('derives the scope from URL search params (no state copy)', () => {
    searchMock.value = { capacity: 'member:proj-b' };
    render(
      <PerformanceScopeProvider context={TL_MEMBER_CTX}>
        <ScopeProbe />
      </PerformanceScopeProvider>,
    );
    expect(screen.getByText('scope:member')).toBeInTheDocument();
  });

  it('falls back to the deterministic default on garbage params', () => {
    searchMock.value = { capacity: 'nonsense' };
    render(
      <PerformanceScopeProvider context={TL_MEMBER_CTX}>
        <ScopeProbe />
      </PerformanceScopeProvider>,
    );
    expect(screen.getByText('scope:tl')).toBeInTheDocument();
  });
});

describe('CapacitySwitcher', () => {
  it('lists capacities as "Kind · Label" and updates the URL on selection (AC2/AC3)', async () => {
    const user = userEvent.setup();
    render(
      <PerformanceScopeProvider context={TL_MEMBER_CTX}>
        <CapacitySwitcher />
      </PerformanceScopeProvider>,
    );
    const combobox = screen.getByRole('combobox', { name: 'Capacity' });
    expect(within(combobox).getByText('TL · Alpha')).toBeInTheDocument(); // selection on control
    await user.click(combobox);
    await user.click(await screen.findByRole('option', { name: 'Member · Beta' }));
    expect(navigateMock).toHaveBeenCalledWith(
      expect.objectContaining({ search: expect.any(Function) }),
    );
    const searchUpdater = navigateMock.mock.calls.at(-1)?.[0].search as (
      p: Record<string, unknown>,
    ) => Record<string, unknown>;
    expect(searchUpdater({})).toMatchObject({ capacity: 'member:proj-b' });
  });

  it('renders a read-only current capacity when there is only one (single-role edge)', () => {
    const single: OkContext = {
      ...TL_MEMBER_CTX,
      capacities: [TL_MEMBER_CTX.capacities[0]!],
    };
    render(
      <PerformanceScopeProvider context={single}>
        <CapacitySwitcher />
      </PerformanceScopeProvider>,
    );
    expect(screen.getByText('TL · Alpha')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /TL · Alpha/ })).not.toBeInTheDocument();
  });
});

describe('PerformanceShell section nav (AC1 affordance)', () => {
  it('shows PMO only their entitled sections', () => {
    render(
      <PerformanceScopeProvider context={PMO_CTX}>
        <PerformanceShell>
          <div>body</div>
        </PerformanceShell>
      </PerformanceScopeProvider>,
    );
    for (const visible of ['Dashboard', 'Morale', 'History', 'Audit']) {
      expect(screen.getByRole('button', { name: visible })).toBeInTheDocument();
    }
    for (const hidden of ['Scoring', 'Self-assessment', 'Configuration']) {
      expect(screen.queryByRole('button', { name: hidden })).not.toBeInTheDocument();
    }
  });

  it('member sees no Audit/Configuration', () => {
    render(
      <PerformanceScopeProvider context={TL_MEMBER_CTX}>
        <PerformanceShell>
          <div>body</div>
        </PerformanceShell>
      </PerformanceScopeProvider>,
    );
    expect(screen.queryByRole('button', { name: 'Audit' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Configuration' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Scoring' })).toBeInTheDocument(); // TL grants it
  });
});

describe('SectionGuard (graceful in-surface no-access, AC1)', () => {
  it('blocks an unentitled section without the generic 403 copy', () => {
    render(
      <PerformanceScopeProvider context={TL_MEMBER_CTX}>
        <SectionGuard section="audit">
          <div>audit body</div>
        </SectionGuard>
      </PerformanceScopeProvider>,
    );
    expect(screen.getByText('No access to this section')).toBeInTheDocument();
    expect(screen.queryByText('audit body')).not.toBeInTheDocument();
    expect(screen.queryByText('No access')).not.toBeInTheDocument(); // app-403 heading absent
  });

  it('renders entitled sections', () => {
    render(
      <PerformanceScopeProvider context={TL_MEMBER_CTX}>
        <SectionGuard section="scoring">
          <div>scoring body</div>
        </SectionGuard>
      </PerformanceScopeProvider>,
    );
    expect(screen.getByText('scoring body')).toBeInTheDocument();
  });
});
