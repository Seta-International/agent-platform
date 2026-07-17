import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { GroupedGrid } from '../../../src/composites/grouped-grid';
import type { TableColumn } from '../../../src/primitives/table';

interface Row extends Record<string, unknown> {
  id: string;
  name: string;
  group: string;
}

const columns: TableColumn<Row>[] = [
  { key: 'name', header: 'Name', width: { type: 'proportional', value: 1 } },
];

const rows: Row[] = [
  { id: 'r1', name: 'One', group: 'A' },
  { id: 'r2', name: 'Two', group: 'A' },
  { id: 'r3', name: 'Three', group: 'B' },
];

function renderGrid(props: Partial<React.ComponentProps<typeof GroupedGrid<Row>>> = {}) {
  const onToggleGroup = vi.fn();
  const utils = render(
    <GroupedGrid<Row>
      rows={rows}
      columns={columns}
      getRowId={(r) => r.id}
      getRowLabel={(r) => r.name}
      groupBy={(r) => r.group}
      renderGroupHeader={(key, count) => (
        <span>
          {key} ({count})
        </span>
      )}
      collapsedGroups={new Set()}
      onToggleGroup={onToggleGroup}
      {...props}
    />,
  );
  return { ...utils, onToggleGroup };
}

describe('GroupedGrid', () => {
  it('renders group headers with real row counts and all data rows', () => {
    renderGrid();
    expect(screen.getByText('A (2)')).toBeInTheDocument();
    expect(screen.getByText('B (1)')).toBeInTheDocument();
    expect(screen.getByText('One')).toBeInTheDocument();
    expect(screen.getByText('Three')).toBeInTheDocument();
  });

  it('collapsed groups keep the header but hide rows', () => {
    renderGrid({ collapsedGroups: new Set(['A']) });
    expect(screen.getByText('A (2)')).toBeInTheDocument();
    expect(screen.queryByText('One')).not.toBeInTheDocument();
    expect(screen.getByText('Three')).toBeInTheDocument();
  });

  it('clicking a group header toggles it', async () => {
    const { onToggleGroup } = renderGrid();
    await userEvent.click(screen.getByText('A (2)'));
    expect(onToggleGroup).toHaveBeenCalledWith('A');
  });

  it('renders a footer per group, including empty groups forced via groupOrder', () => {
    renderGrid({
      groupOrder: ['A', 'B', 'Empty'],
      renderGroupFooter: (key) => <button type="button">Add to {key}</button>,
    });
    expect(screen.getByRole('button', { name: 'Add to A' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add to Empty' })).toBeInTheDocument();
    // The forced-empty group renders a header with a zero count.
    expect(screen.getByText('Empty (0)')).toBeInTheDocument();
  });

  it('footer sentinel rows do not inflate the group count', () => {
    renderGrid({ renderGroupFooter: () => <span>footer</span> });
    expect(screen.getByText('A (2)')).toBeInTheDocument();
  });

  it('row click fires onRowClick, but clicks on interactive content do not', async () => {
    const onRowClick = vi.fn();
    render(
      <GroupedGrid<Row>
        rows={rows}
        columns={[
          {
            key: 'name',
            header: 'Name',
            width: { type: 'proportional', value: 1 },
            renderCell: (r) => (
              <span>
                {r.name} <button type="button">act</button>
              </span>
            ),
          },
        ]}
        getRowId={(r) => r.id}
        groupBy={(r) => r.group}
        renderGroupHeader={(key) => <span>{key}</span>}
        collapsedGroups={new Set()}
        onToggleGroup={() => {}}
        onRowClick={onRowClick}
      />,
    );
    await userEvent.click(screen.getByText('One', { exact: false }));
    expect(onRowClick).toHaveBeenCalledTimes(1);
    expect(onRowClick.mock.calls[0]?.[0]).toBe('r1');
    await userEvent.click(screen.getAllByRole('button', { name: 'act' })[0] as HTMLElement);
    expect(onRowClick).toHaveBeenCalledTimes(1);
  });

  it('marks the active row and selected rows via data attributes', () => {
    renderGrid({ activeRowId: 'r1', highlightedRowIds: new Set(['r2']) });
    expect(document.querySelector('tr[data-row-id="r1"]')).toHaveAttribute('data-active', 'true');
    expect(document.querySelector('tr[data-row-id="r2"]')).toHaveAttribute('data-selected', 'true');
  });

  it('does not leave aria-expanded on group header table rows (axe aria-conditional-attr)', () => {
    renderGrid();
    for (const tr of Array.from(document.querySelectorAll('tbody tr'))) {
      expect(tr).not.toHaveAttribute('aria-expanded');
    }
  });
});
