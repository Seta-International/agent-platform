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

  // FUT-816. A payload-free card (an A2 preview) carries no entityList: there is
  // nothing to choose, only a change to confirm. Its confirm body says WHICH
  // action was picked and never a value, so it cannot reuse the assignment
  // card's `{ decision, overrideUserIds }` — the server parses the body with the
  // schema belonging to the approval's workflow and 400s on a mismatch.
  describe('payload-free preview card', () => {
    const updateCard = {
      intent: 'Update "AWS migration"',
      riskBadge: 'write',
      summary: 'Due will change.',
      details: [
        {
          kind: 'kvTable',
          rows: [
            { k: 'Due', v: '12 Aug 2026 23:59 → 15 Aug 2026 23:59' },
            { k: 'Priority', v: 'Medium → Urgent' },
          ],
        },
      ],
      primary: { label: 'Apply the change', argsPatch: { action: 'update' } },
      alternates: [],
      decline: { label: 'Cancel' },
    };

    function renderCard(card: unknown) {
      const onDecide = vi.fn();
      const utils = render(
        <HitlCard card={card as never} canAct onDecide={onDecide} renderEntity={() => null} />,
      );
      return { onDecide, ...utils };
    }

    it('renders every old → new row', () => {
      renderCard(updateCard);
      expect(screen.getByText('Due')).toBeInTheDocument();
      expect(screen.getByText('12 Aug 2026 23:59 → 15 Aug 2026 23:59')).toBeInTheDocument();
      expect(screen.getByText('Priority')).toBeInTheDocument();
      expect(screen.getByText('Medium → Urgent')).toBeInTheDocument();
    });

    it('Confirm reports the primary choice, with no payload', async () => {
      const { onDecide } = renderCard(updateCard);
      await userEvent.click(screen.getByRole('button', { name: /apply the change/i }));
      expect(onDecide).toHaveBeenCalledWith({ chosen: 'primary' });
    });

    it('Cancel reports the decline choice without asking for a reason', async () => {
      const { onDecide } = renderCard(updateCard);
      await userEvent.click(screen.getByRole('button', { name: /^cancel$/i }));
      expect(onDecide).toHaveBeenCalledWith({ chosen: 'decline' });
    });

    it('AC5 — the card is a review surface, not a form', async () => {
      const { container } = renderCard(updateCard);
      // Also after clicking decline, which is where the note textarea used to live.
      await userEvent.click(screen.getByRole('button', { name: /^cancel$/i }));
      expect(container.querySelector('input')).toBeNull();
      expect(container.querySelector('select')).toBeNull();
      expect(container.querySelector('textarea')).toBeNull();
    });

    it('renders a diff block', () => {
      renderCard({
        ...updateCard,
        details: [{ kind: 'diff', before: ['alpha', 'beta'], after: ['alpha', 'gamma'] }],
      });
      expect(screen.getByText(/beta/)).toBeInTheDocument();
      expect(screen.getByText(/gamma/)).toBeInTheDocument();
    });

    it('a long value wraps instead of widening the card', () => {
      renderCard({
        ...updateCard,
        details: [{ kind: 'kvTable', rows: [{ k: 'Description', v: 'x'.repeat(400) }] }],
      });
      const cell = screen.getByText(/^x+$/);
      expect(cell.className).toMatch(/break-words|truncate|line-clamp|overflow/);
    });
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
