import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { KanbanBoard } from '../../../src/composites/kanban-board';

describe('KanbanBoard', () => {
  it('renders children and reveals an inline compose when the Add bucket trigger is clicked', () => {
    const onAddBucket = vi.fn();

    render(
      <KanbanBoard onAddBucket={onAddBucket}>
        <div data-testid="col-1">Column 1</div>
        <div data-testid="col-2">Column 2</div>
      </KanbanBoard>,
    );

    expect(screen.getByTestId('col-1')).toBeInTheDocument();
    expect(screen.getByTestId('col-2')).toBeInTheDocument();

    const trigger = screen.getByRole('button', { name: /add another bucket/i });
    fireEvent.click(trigger);

    // Trigger swaps in-place for the input — typing nothing keeps Add disabled.
    const input = screen.getByLabelText(/new bucket name/i);
    expect(input).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^add bucket$/i })).toBeDisabled();
    expect(onAddBucket).not.toHaveBeenCalled();
  });

  it('submits the typed name on Enter and keeps the input open for another (Trello loop)', async () => {
    const onAddBucket = vi.fn();

    render(
      <KanbanBoard onAddBucket={onAddBucket}>
        <div data-testid="col-1">Column 1</div>
      </KanbanBoard>,
    );

    fireEvent.click(screen.getByRole('button', { name: /add another bucket/i }));
    const input = screen.getByLabelText(/new bucket name/i) as HTMLInputElement;

    fireEvent.change(input, { target: { value: 'Backlog' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(onAddBucket).toHaveBeenNthCalledWith(1, 'Backlog'));

    // Input stays open and is cleared, ready for the next bucket.
    expect(screen.getByLabelText(/new bucket name/i)).toBeInTheDocument();
    expect((screen.getByLabelText(/new bucket name/i) as HTMLInputElement).value).toBe('');

    fireEvent.change(screen.getByLabelText(/new bucket name/i), {
      target: { value: 'In progress' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^add bucket$/i }));
    await waitFor(() => expect(onAddBucket).toHaveBeenNthCalledWith(2, 'In progress'));
    expect(onAddBucket).toHaveBeenCalledTimes(2);
  });

  it('does not create a second bucket when Enter fires again before the first submission resolves (FUT-390)', async () => {
    let resolveAdd!: () => void;
    const onAddBucket = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveAdd = resolve;
        }),
    );

    render(
      <KanbanBoard onAddBucket={onAddBucket}>
        <div data-testid="col-1">Column 1</div>
      </KanbanBoard>,
    );

    fireEvent.click(screen.getByRole('button', { name: /add another bucket/i }));
    const input = screen.getByLabelText(/new bucket name/i);
    fireEvent.change(input, { target: { value: 'Backlog' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.keyDown(input, { key: 'Enter' });
    resolveAdd();
    await waitFor(() =>
      expect((screen.getByLabelText(/new bucket name/i) as HTMLInputElement).value).toBe(''),
    );
    expect(onAddBucket).toHaveBeenCalledTimes(1);
  });

  it('trims whitespace and ignores empty submissions', async () => {
    const onAddBucket = vi.fn();

    render(
      <KanbanBoard onAddBucket={onAddBucket}>
        <div />
      </KanbanBoard>,
    );

    fireEvent.click(screen.getByRole('button', { name: /add another bucket/i }));
    const input = screen.getByLabelText(/new bucket name/i);

    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onAddBucket).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: '  Review  ' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(onAddBucket).toHaveBeenCalledWith('Review'));
  });

  it('Escape closes the compose without submitting', () => {
    const onAddBucket = vi.fn();

    render(
      <KanbanBoard onAddBucket={onAddBucket}>
        <div />
      </KanbanBoard>,
    );

    fireEvent.click(screen.getByRole('button', { name: /add another bucket/i }));
    const input = screen.getByLabelText(/new bucket name/i);
    fireEvent.change(input, { target: { value: 'Done' } });
    fireEvent.keyDown(input, { key: 'Escape' });

    expect(onAddBucket).not.toHaveBeenCalled();
    expect(screen.queryByLabelText(/new bucket name/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add another bucket/i })).toBeInTheDocument();
  });

  it('shows an inline error and keeps compose open when name exceeds nameMaxLength', async () => {
    const onAddBucket = vi.fn();

    render(
      <KanbanBoard nameMaxLength={120} onAddBucket={onAddBucket}>
        <div />
      </KanbanBoard>,
    );

    fireEvent.click(screen.getByRole('button', { name: /add another bucket/i }));
    fireEvent.change(screen.getByLabelText(/new bucket name/i), {
      target: { value: 'x'.repeat(121) },
    });
    fireEvent.click(screen.getByRole('button', { name: /^add bucket$/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Bucket name cannot exceed 120 characters.',
    );
    expect(screen.getByLabelText(/new bucket name/i)).toBeInTheDocument();
    expect(onAddBucket).not.toHaveBeenCalled();
  });

  it('shows an inline error when onAddBucket rejects', async () => {
    render(
      <KanbanBoard
        onAddBucket={() => Promise.reject(new Error('Bucket name cannot exceed 120 characters.'))}
      >
        <div />
      </KanbanBoard>,
    );

    fireEvent.click(screen.getByRole('button', { name: /add another bucket/i }));
    fireEvent.change(screen.getByLabelText(/new bucket name/i), { target: { value: 'Too long' } });
    fireEvent.click(screen.getByRole('button', { name: /^add bucket$/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Bucket name cannot exceed 120 characters.',
    );
    expect(screen.getByLabelText(/new bucket name/i)).toBeInTheDocument();
  });

  it('does NOT render the Add bucket trigger when onAddBucket is undefined (permission-degraded view)', () => {
    render(
      <KanbanBoard>
        <div data-testid="col-1">Column 1</div>
      </KanbanBoard>,
    );

    expect(screen.queryByRole('button', { name: /add another bucket/i })).not.toBeInTheDocument();
    expect(screen.getByTestId('col-1')).toBeInTheDocument();
  });

  describe('reveals the newest bucket (FUT-19)', () => {
    let scrollToSpy: ReturnType<typeof vi.fn>;
    afterEach(() => {
      delete (HTMLElement.prototype as { scrollTo?: unknown }).scrollTo;
      delete (HTMLElement.prototype as { scrollWidth?: unknown }).scrollWidth;
    });
    function stubScroll() {
      scrollToSpy = vi.fn();
      Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
        configurable: true,
        writable: true,
        value: scrollToSpy,
      });
      Object.defineProperty(HTMLElement.prototype, 'scrollWidth', {
        configurable: true,
        get: () => 4242,
      });
    }
    const cols = (n: number) =>
      Array.from({ length: n }, (_, i) => `col-${i}`).map((id) => (
        <div key={id} data-testid={id}>
          {id}
        </div>
      ));

    it('scrolls the board to the end after the user adds a bucket and it arrives', async () => {
      stubScroll();
      const onAddBucket = vi.fn();
      const { rerender } = render(
        <KanbanBoard onAddBucket={onAddBucket} bucketCount={6}>
          {cols(6)}
        </KanbanBoard>,
      );

      fireEvent.click(screen.getByRole('button', { name: /add another bucket/i }));
      fireEvent.change(screen.getByLabelText(/new bucket name/i), {
        target: { value: 'Bucket 7' },
      });
      fireEvent.keyDown(screen.getByLabelText(/new bucket name/i), { key: 'Enter' });
      await waitFor(() => expect(onAddBucket).toHaveBeenCalledWith('Bucket 7'));

      rerender(
        <KanbanBoard onAddBucket={onAddBucket} bucketCount={7}>
          {cols(7)}
        </KanbanBoard>,
      );

      expect(scrollToSpy).toHaveBeenCalledWith(
        expect.objectContaining({ left: 4242, behavior: 'smooth' }),
      );
    });

    it('does NOT scroll when the count grows without a local add (e.g. realtime update)', () => {
      stubScroll();
      const onAddBucket = vi.fn();
      const { rerender } = render(
        <KanbanBoard onAddBucket={onAddBucket} bucketCount={6}>
          {cols(6)}
        </KanbanBoard>,
      );

      rerender(
        <KanbanBoard onAddBucket={onAddBucket} bucketCount={7}>
          {cols(7)}
        </KanbanBoard>,
      );

      expect(scrollToSpy).not.toHaveBeenCalled();
    });
  });
});
