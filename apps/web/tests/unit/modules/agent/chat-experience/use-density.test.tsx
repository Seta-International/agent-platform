import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { DensityProvider, useDensity } from '@/modules/agent/chat-experience/use-density';

function Probe() {
  const { density, setDensity } = useDensity();
  return (
    <button type="button" onClick={() => setDensity('detailed')}>
      {density}
    </button>
  );
}

describe('useDensity', () => {
  beforeEach(() => localStorage.clear());

  it('defaults to concise and persists a change to localStorage', () => {
    render(
      <DensityProvider>
        <Probe />
      </DensityProvider>,
    );
    const btn = screen.getByRole('button');
    expect(btn).toHaveTextContent('concise');
    act(() => btn.click());
    expect(btn).toHaveTextContent('detailed');
    expect(localStorage.getItem('seta.agent.density')).toBe('detailed');
  });

  it('reads the persisted value on mount', () => {
    localStorage.setItem('seta.agent.density', 'detailed');
    render(
      <DensityProvider>
        <Probe />
      </DensityProvider>,
    );
    expect(screen.getByRole('button')).toHaveTextContent('detailed');
  });
});
