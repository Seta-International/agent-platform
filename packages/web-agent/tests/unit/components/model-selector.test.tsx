import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

// Avoid the real /api/agent/v1/models fetch; drive a fixed catalog.
vi.mock('../../../src/hooks/use-model-catalog', () => ({
  useModelCatalog: () => ({
    data: {
      default: 'auto',
      models: [
        { key: 'auto', label: 'Auto', tier: 'auto', supportsReasoning: false },
        { key: 'gpt-4o-mini', label: 'GPT-4o mini', tier: 'fast', supportsReasoning: false },
        { key: 'gpt-4o', label: 'GPT-4o', tier: 'balanced', supportsReasoning: false },
        { key: 'o3', label: 'o3', tier: 'reasoning', supportsReasoning: true },
      ],
    },
    isLoading: false,
  }),
}));

import { ModelSelector } from '../../../src/components/model-selector';

function trigger() {
  return screen.getByRole('button', { name: /model/i });
}

describe('<ModelSelector>', () => {
  it('keeps the trigger to a single truncating line', () => {
    render(<ModelSelector value="auto" onChange={vi.fn()} />);
    const btn = trigger(); // getByRole throws if there were two triggers
    // Width is pinned so the label can shrink instead of wrapping the footer.
    expect(btn.className).toMatch(/max-w-\[/);
    expect(btn.className).toMatch(/min-w-\[/);
    // Exactly the label truncates; icon + chevron are pinned (flex-none).
    const label = btn.querySelector('.truncate');
    expect(label).not.toBeNull();
    expect(label?.textContent).toBe('Auto');
  });

  it('leads with Auto marked Recommended, then the tier groups', async () => {
    const user = userEvent.setup();
    render(<ModelSelector value="auto" onChange={vi.fn()} />);
    await user.click(trigger());

    const cards = screen.getAllByRole('checkbox');
    // Auto is the first card in the popover.
    expect(cards[0]).toHaveAccessibleName('Auto');
    expect(screen.getByText('Recommended')).toBeInTheDocument();
    // The other tiers render their group labels.
    expect(screen.getByText('Fast')).toBeInTheDocument();
    expect(screen.getByText('Balanced')).toBeInTheDocument();
    expect(screen.getByText('Reasoning')).toBeInTheDocument();
  });

  it('calls onChange with the picked model key', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ModelSelector value="auto" onChange={onChange} />);
    await user.click(trigger());
    await user.click(screen.getByRole('checkbox', { name: 'GPT-4o mini' }));
    expect(onChange).toHaveBeenCalledWith('gpt-4o-mini');
  });
});
