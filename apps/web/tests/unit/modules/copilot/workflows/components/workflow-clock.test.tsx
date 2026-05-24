import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkflowClock } from '../../../../../../src/modules/copilot/workflows/components/workflow-clock.tsx';

describe('WorkflowClock', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('counts up while running and renders mm:ss.t format', () => {
    const startedAt = new Date('2026-05-22T10:00:00Z');
    vi.setSystemTime(new Date('2026-05-22T10:00:00.000Z'));

    render(<WorkflowClock startedAt={startedAt} status="running" />);
    expect(screen.getByText('0.0s')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(3400);
    });
    expect(screen.getByText('3.4s')).toBeInTheDocument();
  });

  it('freezes at finishedAt - startedAt on terminal status', () => {
    const startedAt = new Date('2026-05-22T10:00:00Z');
    const finishedAt = new Date('2026-05-22T10:01:12.500Z');
    render(<WorkflowClock startedAt={startedAt} finishedAt={finishedAt} status="success" />);
    expect(screen.getByText('1m 12.5s')).toBeInTheDocument();
  });

  it('renders static text under prefers-reduced-motion', () => {
    const mql = { matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() };
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue(mql));
    const startedAt = new Date('2026-05-22T10:00:00Z');
    vi.setSystemTime(new Date('2026-05-22T10:00:05Z'));
    render(<WorkflowClock startedAt={startedAt} status="running" />);
    expect(screen.getByText('5.0s')).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.getByText('5.0s')).toBeInTheDocument();
  });
});
