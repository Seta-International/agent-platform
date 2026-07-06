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

  it('button label follows the selection and sends a modify with the chosen user', async () => {
    // Single-select card with per-candidate assign patches (the assignment card
    // shape). Picking a different candidate must relabel the button AND send that
    // user, not the frozen top match.
    const assignCard = {
      intent: 'Assign "Infra"',
      riskBadge: 'write',
      details: [
        {
          kind: 'entityList',
          select: 'single',
          items: [
            { id: 'u1', type: 'user', label: 'Alice', primary: true },
            { id: 'u2', type: 'user', label: 'Bob' },
          ],
        },
      ],
      primary: { label: 'Assign to Alice', argsPatch: { assigneeUserIds: ['u1'] } },
      alternates: [{ label: 'Assign to Bob', argsPatch: { assigneeUserIds: ['u2'] } }],
      decline: { label: 'Leave unassigned' },
    };
    const onDecide = vi.fn();
    render(
      <HitlCard
        card={assignCard as never}
        canAct
        onDecide={onDecide}
        renderEntity={(e) => <span>{e.label}</span>}
      />,
    );
    // Seeded to the top match.
    expect(screen.getByRole('button', { name: /assign to alice/i })).toBeInTheDocument();
    // Pick Bob → label flips, radio replaces the seed.
    await userEvent.click(screen.getByRole('radio', { name: 'Bob' }));
    const button = screen.getByRole('button', { name: /assign to bob/i });
    expect(button).toBeInTheDocument();
    await userEvent.click(button);
    expect(onDecide).toHaveBeenCalledWith({ decision: 'modify', overrideUserIds: ['u2'] });
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
