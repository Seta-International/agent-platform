import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { GroupStatRow } from './GroupStatRow';

describe('GroupStatRow', () => {
  it('renders 4 stat cells (Plans, Open tasks, Members, Activity (7d))', () => {
    render(<GroupStatRow planCount={3} openTaskCount={12} memberCount={5} />);
    expect(screen.getByText('Plans')).toBeInTheDocument();
    expect(screen.getByText('Open tasks')).toBeInTheDocument();
    expect(screen.getByText('Members')).toBeInTheDocument();
    expect(screen.getByText('Activity (7d)')).toBeInTheDocument();
  });

  it('renders the planCount and memberCount as values', () => {
    render(<GroupStatRow planCount={3} openTaskCount={12} memberCount={5} />);
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('renders "—" and "Coming soon" for the Activity (7d) stat', () => {
    render(<GroupStatRow planCount={0} openTaskCount={0} memberCount={0} />);
    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.getByText(/Coming soon/i)).toBeInTheDocument();
  });
});
