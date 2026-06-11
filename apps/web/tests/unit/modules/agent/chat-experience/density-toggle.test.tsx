import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { DensityToggle } from '@/modules/agent/chat-experience/density-toggle';
import { DensityProvider } from '@/modules/agent/chat-experience/use-density';

describe('DensityToggle', () => {
  beforeEach(() => localStorage.clear());

  it('reflects and switches density', async () => {
    render(
      <DensityProvider>
        <DensityToggle />
      </DensityProvider>,
    );
    const concise = screen.getByRole('radio', { name: /concise/i });
    const detailed = screen.getByRole('radio', { name: /detailed/i });
    expect(concise).toBeChecked();
    await userEvent.click(detailed);
    expect(detailed).toBeChecked();
    expect(localStorage.getItem('seta.agent.density')).toBe('detailed');
  });
});
