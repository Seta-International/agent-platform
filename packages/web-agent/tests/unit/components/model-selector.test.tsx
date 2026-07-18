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
    // Exactly the label truncates; icon + chevron are pinned (flex-none).
    const label = btn.querySelector('.truncate');
    expect(label).not.toBeNull();
    expect(label?.textContent).toBe('Auto');
  });

  it('is a plain flat list — no group headings, badges, or blurbs', async () => {
    const user = userEvent.setup();
    render(<ModelSelector value="auto" onChange={vi.fn()} />);
    await user.click(trigger());

    // Every model is a plain menu item, Auto first.
    const items = screen.getAllByRole('menuitem');
    expect(items.map((i) => i.textContent)).toEqual(['Auto', 'GPT-4o mini', 'GPT-4o', 'o3']);
    // None of the removed chrome is present.
    expect(screen.queryByText('Recommended')).toBeNull();
    expect(screen.queryByText('Balanced')).toBeNull();
    expect(screen.queryByText('Reasoning')).toBeNull();
    expect(screen.queryByText(/picks the best model/i)).toBeNull();
  });

  it('calls onChange with the picked model key', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ModelSelector value="auto" onChange={onChange} />);
    await user.click(trigger());
    await user.click(screen.getByRole('menuitem', { name: 'GPT-4o mini' }));
    expect(onChange).toHaveBeenCalledWith('gpt-4o-mini');
  });
});
