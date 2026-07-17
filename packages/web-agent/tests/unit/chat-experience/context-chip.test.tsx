import { render, screen } from '@testing-library/react';
import { AtSign } from 'lucide-react';
import { describe, expect, it } from 'vitest';
import { ContextChip } from '../../../src/chat-experience/context-chip';

describe('ContextChip', () => {
  it('renders kind and label as separate visible text', () => {
    render(<ContextChip kind="person" label="Jane Doe" icon={<AtSign aria-hidden />} />);
    expect(screen.getByText('person')).toBeInTheDocument();
    expect(screen.getByText('Jane Doe')).toBeInTheDocument();
  });

  it('does not cram kind and label into one flat string', () => {
    render(<ContextChip kind="person" label="Jane Doe" icon={<AtSign aria-hidden />} />);
    // The bug this replaces: `sent with context: ${kind} — ${label}`.
    expect(screen.queryByText(/person — Jane Doe/)).toBeNull();
    expect(screen.queryByText(/sent with context/)).toBeNull();
  });

  it('exposes the kind on a data attribute for querying', () => {
    const { container } = render(
      <ContextChip kind="plan.task" label="Q3 Roadmap" icon={<AtSign aria-hidden />} />,
    );
    expect(container.querySelector('[data-context-chip][data-kind="plan.task"]')).not.toBeNull();
  });
});
