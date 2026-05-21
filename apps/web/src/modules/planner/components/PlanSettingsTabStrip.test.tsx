import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  PLAN_SETTINGS_TABS,
  type PlanSettingsTab,
  PlanSettingsTabStrip,
} from './PlanSettingsTabStrip';

const baseCounts = {
  buckets: 4,
  members: 9,
  categories: 7,
};

function renderStrip(active: PlanSettingsTab, onTabChange = vi.fn()) {
  render(<PlanSettingsTabStrip activeTab={active} counts={baseCounts} onTabChange={onTabChange} />);
  return onTabChange;
}

describe('PlanSettingsTabStrip', () => {
  it('renders the 7 tabs in spec order', () => {
    renderStrip('categories');
    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(PLAN_SETTINGS_TABS.length);
    expect(tabs.map((t) => t.textContent)).toEqual([
      'General',
      'Buckets 4',
      'Members 9',
      'Labels',
      'Categories 7/25',
      'Automations',
      'Danger zone',
    ]);
  });

  it('marks only the active tab with aria-selected=true', () => {
    renderStrip('categories');
    const active = screen.getByRole('tab', { name: /Categories/ });
    expect(active.getAttribute('aria-selected')).toBe('true');
    const general = screen.getByRole('tab', { name: /^General$/ });
    expect(general.getAttribute('aria-selected')).toBe('false');
  });

  it('calls onTabChange with the slug when a tab is clicked', () => {
    const onTabChange = renderStrip('categories');
    fireEvent.click(screen.getByRole('tab', { name: /^General$/ }));
    expect(onTabChange).toHaveBeenCalledWith('general');
    fireEvent.click(screen.getByRole('tab', { name: /Danger zone/ }));
    expect(onTabChange).toHaveBeenCalledWith('danger');
  });

  it('renders a tablist landmark', () => {
    renderStrip('categories');
    expect(screen.getByRole('tablist')).toBeInTheDocument();
  });
});
