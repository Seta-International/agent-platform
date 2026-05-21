import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CategoryDescriptionEditor, type CategoryLabel } from './category-description-editor';

const labels: CategoryLabel[] = [
  { id: 'l1', name: 'bug', color: 'var(--color-danger)', category_slot: 1 },
  { id: 'l2', name: 'customer', color: 'var(--color-info)', category_slot: 2 },
  { id: 'l3', name: 'perf', color: 'var(--color-warning)', category_slot: 5 },
  { id: 'l4', name: 'design', color: 'var(--color-primary)', category_slot: null },
];
const taskCounts = { 1: 6, 2: 3, 5: 2 };

describe('CategoryDescriptionEditor', () => {
  it('renders 10 visible rows by default plus "Show all 25"', () => {
    render(
      <CategoryDescriptionEditor
        descriptions={{
          category1: 'Bug',
          category2: 'Customer-reported',
          category5: 'Performance',
        }}
        labels={labels}
        taskCounts={taskCounts}
        onSave={() => {}}
      />,
    );
    expect(screen.getAllByRole('textbox', { name: /Slot/i })).toHaveLength(10);
    expect(screen.getByRole('button', { name: /Show all 25/ })).toBeInTheDocument();
  });

  it('expanding shows 25 rows', () => {
    render(
      <CategoryDescriptionEditor
        descriptions={{}}
        labels={labels}
        taskCounts={taskCounts}
        onSave={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Show all 25/ }));
    expect(screen.getAllByRole('textbox', { name: /Slot/i })).toHaveLength(25);
  });

  it('editing slot 3 description batches into save payload', () => {
    const onSave = vi.fn();
    render(
      <CategoryDescriptionEditor
        descriptions={{}}
        labels={labels}
        taskCounts={taskCounts}
        onSave={onSave}
      />,
    );
    fireEvent.change(screen.getByRole('textbox', { name: 'Slot 3 description' }), {
      target: { value: 'Customer-impacting' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Save changes/ }));
    expect(onSave).toHaveBeenCalledWith({ slots: { 3: { name: 'Customer-impacting' } } });
  });

  it('attaching a label batches into save payload', () => {
    const onSave = vi.fn();
    render(
      <CategoryDescriptionEditor
        descriptions={{}}
        labels={labels}
        taskCounts={taskCounts}
        onSave={onSave}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Slot 6 attach label' }));
    fireEvent.click(screen.getByRole('option', { name: 'design' }));
    fireEvent.click(screen.getByRole('button', { name: /Save changes/ }));
    expect(onSave).toHaveBeenCalledWith({ slots: { 6: { labelId: 'l4' } } });
  });

  it('renders an empty count "—" for unused slots', () => {
    render(
      <CategoryDescriptionEditor
        descriptions={{}}
        labels={labels}
        taskCounts={{}}
        onSave={() => {}}
      />,
    );
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });

  it('clearing an existing description emits { name: null } to delete the slot', () => {
    const onSave = vi.fn();
    render(
      <CategoryDescriptionEditor
        descriptions={{ category3: 'old-value' }}
        labels={labels}
        taskCounts={taskCounts}
        onSave={onSave}
      />,
    );
    fireEvent.change(screen.getByRole('textbox', { name: 'Slot 3 description' }), {
      target: { value: '' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Save changes/ }));
    expect(onSave).toHaveBeenCalledWith({ slots: { 3: { name: null } } });
  });

  it('disabled prop disables inputs and hides Save changes', () => {
    render(
      <CategoryDescriptionEditor
        descriptions={{}}
        labels={labels}
        taskCounts={{}}
        onSave={() => {}}
        disabled
      />,
    );
    expect(screen.getByRole('textbox', { name: 'Slot 1 description' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: /Save changes/ })).not.toBeInTheDocument();
  });
});
