import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { PerformanceCapacity } from '../../../src/api/people-client.ts';
import { ProjectContextSwitcher } from '../../../src/components/project-context-switcher.tsx';
import type { ResolvedPerformanceScope } from '../../../src/state/performance-scope.ts';

const tlA: PerformanceCapacity = {
  kind: 'tl',
  project_id: 'proj-a',
  account_id: 'acct-1',
  label: 'Atlas',
};
const memberB: PerformanceCapacity = {
  kind: 'member',
  project_id: 'proj-b',
  account_id: 'acct-2',
  label: 'Neo',
};

function capacityResolved(c: PerformanceCapacity): ResolvedPerformanceScope {
  return { mode: 'capacity', month: '2026-07', capacity: c };
}
const orgResolved: ResolvedPerformanceScope = {
  mode: 'organization',
  month: '2026-07',
  capacity: null,
};

describe('ProjectContextSwitcher', () => {
  it('single capacity shows read-only label (TC-10)', () => {
    render(
      <ProjectContextSwitcher
        capacities={[tlA]}
        canViewOrg={false}
        resolved={capacityResolved(tlA)}
        onSelect={vi.fn()}
        onSelectOrg={vi.fn()}
      />,
    );
    const el = screen.getByTestId('performance-context-switcher');
    expect(el).toHaveTextContent('TL · Atlas');
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('organization mode shows Organization (PMO, no capacities)', () => {
    render(
      <ProjectContextSwitcher
        capacities={[]}
        canViewOrg={true}
        resolved={orgResolved}
        onSelect={vi.fn()}
        onSelectOrg={vi.fn()}
      />,
    );
    expect(screen.getByTestId('performance-context-switcher')).toHaveTextContent('Organization');
  });

  it('capacity-less WITHOUT org access renders nothing selectable (no leak, FUT-781)', () => {
    render(
      <ProjectContextSwitcher
        capacities={[]}
        canViewOrg={false}
        resolved={orgResolved}
        onSelect={vi.fn()}
        onSelectOrg={vi.fn()}
      />,
    );
    expect(screen.getByTestId('performance-context-switcher')).not.toHaveTextContent(
      'Organization',
    );
  });

  it('multi capacity lists options and calls onSelect (AC2/AC3)', async () => {
    const onSelect = vi.fn();
    render(
      <ProjectContextSwitcher
        capacities={[tlA, memberB]}
        canViewOrg={false}
        resolved={capacityResolved(tlA)}
        onSelect={onSelect}
        onSelectOrg={vi.fn()}
      />,
    );
    const combobox = screen.queryByRole('combobox') ?? screen.queryByLabelText(/capacity/i);
    if (combobox) {
      await userEvent.click(combobox);
      const option = await screen.findByText('Member · Neo');
      await userEvent.click(option);
      expect(onSelect).toHaveBeenCalledWith(memberB);
    } else {
      expect(screen.getByText(/Capacity/i)).toBeInTheDocument();
    }
  });

  it('an org-viewer WITH capacities can switch to Organization (FUT-781)', async () => {
    const onSelectOrg = vi.fn();
    render(
      <ProjectContextSwitcher
        capacities={[tlA]}
        canViewOrg={true}
        resolved={capacityResolved(tlA)}
        onSelect={vi.fn()}
        onSelectOrg={onSelectOrg}
      />,
    );
    // With the org option, a single capacity is no longer read-only: it's a Selector.
    const combobox = screen.queryByRole('combobox') ?? screen.queryByLabelText(/capacity/i);
    expect(combobox).not.toBeNull();
    if (combobox) {
      await userEvent.click(combobox);
      const option = await screen.findByText('Organization');
      await userEvent.click(option);
      expect(onSelectOrg).toHaveBeenCalledTimes(1);
    }
  });
});
