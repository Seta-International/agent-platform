import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { HitlCard } from '../../../src/composites/hitl-card';

const card = {
  intent: 'Assign "Infra"',
  riskBadge: 'write',
  summary: 'Top match: Alice.',
  details: [
    {
      kind: 'entityList',
      select: 'multi',
      items: [{ id: 'u1', type: 'user', label: 'Alice', primary: true }],
    },
  ],
  primary: { label: 'Assign to Alice' },
  alternates: [],
  decline: { label: 'Leave unassigned' },
};

describe('HitlCard', () => {
  it('renders intent + blocks and emits an approve decision', async () => {
    const onDecide = vi.fn();
    render(
      <HitlCard
        card={card as never}
        canAct
        onDecide={onDecide}
        renderEntity={(e) => <span>{e.label}</span>}
      />,
    );
    expect(screen.getByText(/Assign "Infra"/)).toBeInTheDocument();
    expect(screen.getByText('Alice')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /assign to alice/i }));
    expect(onDecide).toHaveBeenCalledWith({ decision: 'approve', overrideUserIds: ['u1'] });
  });

  it('does not throw on an unknown block kind', () => {
    const weird = { ...card, details: [{ kind: 'no-such-block' }] };
    expect(() =>
      render(
        <HitlCard card={weird as never} canAct onDecide={() => {}} renderEntity={() => null} />,
      ),
    ).not.toThrow();
  });
});
