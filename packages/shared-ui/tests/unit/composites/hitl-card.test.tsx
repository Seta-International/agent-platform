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
  primary: { label: 'Assign to Alice', argsPatch: { assigneeUserIds: ['u1'] } },
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
    expect(onDecide).toHaveBeenCalledWith({ chosen: 'primary' });
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

  describe('HitlCard — a payload-free card with alternates (D12, display B)', () => {
    const createCard = {
      intent: 'Create a task in Sprint 32?',
      riskBadge: 'write',
      summary: 'I found 2 similar tasks.',
      details: [{ kind: 'kvTable', rows: [{ k: 'Title', v: 'Deploy hiring screen' }] }],
      primary: { label: 'Create it', argsPatch: { action: 'create' } },
      alternates: [
        { label: 'Use "Deploy hiring screen v2"', argsPatch: { action: 'use_existing' } },
        { label: 'Use "Hiring screen deploy"', argsPatch: { action: 'use_existing' } },
      ],
      decline: { label: 'Cancel' },
    };

    it('renders one secondary button per alternate', () => {
      render(
        <HitlCard
          card={createCard as never}
          canAct
          onDecide={vi.fn()}
          renderEntity={(e) => <span>{e.label}</span>}
        />,
      );
      expect(screen.getByRole('button', { name: /use "deploy hiring screen v2"/i })).toBeVisible();
      expect(screen.getByRole('button', { name: /use "hiring screen deploy"/i })).toBeVisible();
    });

    it('emits the alternate index the button carries', async () => {
      const onDecide = vi.fn();
      render(
        <HitlCard
          card={createCard as never}
          canAct
          onDecide={onDecide}
          renderEntity={(e) => <span>{e.label}</span>}
        />,
      );
      await userEvent.click(screen.getByRole('button', { name: /use "hiring screen deploy"/i }));
      expect(onDecide).toHaveBeenCalledWith({ chosen: 'alternate', alternateIndex: 1 });
    });

    it('still emits primary and decline unchanged', async () => {
      const onDecide = vi.fn();
      render(
        <HitlCard
          card={createCard as never}
          canAct
          onDecide={onDecide}
          renderEntity={(e) => <span>{e.label}</span>}
        />,
      );
      await userEvent.click(screen.getByRole('button', { name: /create it/i }));
      expect(onDecide).toHaveBeenCalledWith({ chosen: 'primary' });
      await userEvent.click(screen.getByRole('button', { name: /^cancel$/i }));
      expect(onDecide).toHaveBeenCalledWith({ chosen: 'decline' });
    });

    // FUT-804 AC5, kept visible: no display of this card may collect a value.
    it('renders no free-text control on the payload-free path', () => {
      const { container } = render(
        <HitlCard
          card={createCard as never}
          canAct
          onDecide={vi.fn()}
          renderEntity={(e) => <span>{e.label}</span>}
        />,
      );
      expect(container.querySelector('textarea')).toBeNull();
      expect(container.querySelector('select')).toBeNull();
      expect(container.querySelector('input:not([type="radio"])')).toBeNull();
    });

    it('renders no alternate buttons when the card has none', () => {
      render(
        <HitlCard
          card={{ ...createCard, alternates: [] } as never}
          canAct
          onDecide={vi.fn()}
          renderEntity={(e) => <span>{e.label}</span>}
        />,
      );
      expect(screen.getAllByRole('button')).toHaveLength(2);
    });
  });

  describe('HitlCard — an entityList card is a branch selector (D12, display A)', () => {
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

    it('confirms the top match as the primary branch', async () => {
      const onDecide = vi.fn();
      render(
        <HitlCard
          card={assignCard as never}
          canAct
          onDecide={onDecide}
          renderEntity={(e) => <span>{e.label}</span>}
        />,
      );
      await userEvent.click(screen.getByRole('button', { name: /assign to alice/i }));
      expect(onDecide).toHaveBeenCalledWith({ chosen: 'primary' });
    });

    // The behaviour FUT-822's AC promises not to lose: picking the second
    // candidate assigns the second candidate.
    it('picking another candidate relabels Confirm and emits that alternate', async () => {
      const onDecide = vi.fn();
      render(
        <HitlCard
          card={assignCard as never}
          canAct
          onDecide={onDecide}
          renderEntity={(e) => <span>{e.label}</span>}
        />,
      );
      await userEvent.click(screen.getByRole('radio', { name: 'Bob' }));
      await userEvent.click(screen.getByRole('button', { name: /assign to bob/i }));
      expect(onDecide).toHaveBeenCalledWith({ chosen: 'alternate', alternateIndex: 0 });
    });

    it('declines without asking for a reason', async () => {
      const onDecide = vi.fn();
      render(
        <HitlCard
          card={assignCard as never}
          canAct
          onDecide={onDecide}
          renderEntity={(e) => <span>{e.label}</span>}
        />,
      );
      await userEvent.click(screen.getByRole('button', { name: /leave unassigned/i }));
      expect(onDecide).toHaveBeenCalledWith({ chosen: 'decline' });
    });

    // Radios are the only control any card may render. AC5, amended for D12
    // display A.
    it('renders radios and no free-text control', () => {
      const { container } = render(
        <HitlCard
          card={assignCard as never}
          canAct
          onDecide={vi.fn()}
          renderEntity={(e) => <span>{e.label}</span>}
        />,
      );
      expect(container.querySelectorAll('input[type="radio"]').length).toBe(2);
      expect(container.querySelector('textarea')).toBeNull();
      expect(container.querySelector('input:not([type="radio"])')).toBeNull();
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
