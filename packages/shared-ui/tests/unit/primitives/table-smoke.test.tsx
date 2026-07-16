import {
  Table,
  type TableColumn,
  type TableSortState,
  useTablePagination,
  useTableSelection,
  useTableSelectionState,
  useTableSortable,
  // Import ambiguity in the plan (controller-resolved): the brief's starter code imports
  // from '../../../src/primitives/table', a wrapper Task 2a creates. That file doesn't
  // exist yet, so this smoke test imports the vendor package directly — shared-ui is the
  // one package allowed to import @astryxdesign/core. Task 2a switches this one line to
  // the wrapper; everything else here is the pinned contract those 16 migrations rely on.
} from '@astryxdesign/core/Table';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';

type Row = { id: string; name: string; age: number } & Record<string, unknown>;
const DATA: Row[] = [
  { id: '1', name: 'Alice', age: 30 },
  { id: '2', name: 'Bob', age: 25 },
  { id: '3', name: 'Cara', age: 35 },
];
const COLUMNS: TableColumn<Row>[] = [
  { key: 'name', header: 'Name', sortable: true, renderCell: (r) => r.name },
  { key: 'age', header: 'Age', renderCell: (r) => String(r.age) },
];

function Harness() {
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<TableSortState>([]);
  // useTableSelectionState needs its own controlled Set<string> — the brief's starter
  // omitted this, but UseTableSelectionStateConfig requires `selectedKeys` +
  // `setSelectedKeys` (they are not optional).
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const { selectionConfig } = useTableSelectionState<Row>({
    data: DATA,
    idKey: 'id',
    selectedKeys,
    setSelectedKeys,
  });
  const pagination = useTablePagination<Row>({
    page,
    onPageChange: setPage,
    totalItems: 3,
    pageSize: 2,
  });
  const sortable = useTableSortable<Row>({ sort, onSortChange: setSort });
  // PINNED: useTableSelectionState's result does NOT spread directly into
  // useTableSelection — it returns `{ selectionConfig }` (a `UseTableSelectionConfig<T>`
  // wrapped in a named field), not the config itself. Every consumer must unwrap it:
  // `useTableSelection(selectionState.selectionConfig)`, never
  // `useTableSelection(selectionState)`. Confirmed against the vendor's own
  // useTableSelectionState.test.tsx, which does exactly this unwrap.
  const selection = useTableSelection<Row>(selectionConfig);
  return (
    <>
      <output data-testid="sort">{sort[0]?.sortKey ?? 'none'}</output>
      <output data-testid="page">{page}</output>
      {/* idKey is required on <Table> itself (not just the selection plugin) — without
          it, row selection can't set aria-selected on the right <tr>. */}
      <Table
        data={DATA}
        columns={COLUMNS}
        idKey="id"
        plugins={{ pagination, sortable, selection }}
      />
    </>
  );
}

describe('Astryx Table + plugins under happy-dom', () => {
  it('renders rows, sorts via header, pages via pager, selects via checkbox', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const table = screen.getByRole('table');
    expect(within(table).getByText('Alice')).toBeInTheDocument();

    // PINNED QUERY CONTRACT — sort control:
    // The sortable plugin does NOT make the <th> (role=columnheader) itself the click
    // target. It renders a <button> *inside* the columnheader with accessible name
    // "Sort by {Column header}". Query it as a button, not the columnheader.
    await user.click(within(table).getByRole('button', { name: /sort by name/i }));
    expect(screen.getByTestId('sort')).toHaveTextContent('name');

    // PINNED QUERY CONTRACT — selection checkboxes:
    // The selection plugin injects a leading checkbox column. The header checkbox has
    // accessible name "Select all rows"; each body row checkbox has accessible name
    // "Select row" (identical for every row — disambiguate by index, not name). Both
    // are exposed with role=checkbox, so `getAllByRole('checkbox')` returns
    // [selectAll, row0, row1, row2] — index 0 is select-all, not a data row.
    const boxes = within(table).getAllByRole('checkbox');
    expect(boxes).toHaveLength(DATA.length + 1);
    await user.click(within(table).getByLabelText('Select all rows'));
    expect(within(table).getAllByRole('row')[1]).toHaveAttribute('aria-selected', 'true');

    // PINNED QUERY CONTRACT — pagination:
    // The pagination plugin renders a `<nav role="navigation" aria-label="Table
    // pagination">` (below the table by default) containing per-page buttons with
    // accessible name "Go to page {n}" (1-based — `page` starts at 1 and pageSize=2
    // over 3 items produces exactly 2 pages, so "Go to page 2" exists).
    const nav = screen.getByRole('navigation', { name: 'Table pagination' });
    await user.click(within(nav).getByRole('button', { name: 'Go to page 2' }));
    expect(screen.getByTestId('page')).toHaveTextContent('2');
  });
});
