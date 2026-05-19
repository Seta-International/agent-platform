import type { ColumnDef } from '@tanstack/react-table';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DataTable } from './data-table';

interface Row {
  id: string;
  name: string;
  status: string;
}

const rows: Row[] = [
  { id: '1', name: 'Alpha', status: 'open' },
  { id: '2', name: 'Beta', status: 'closed' },
];

const columns: ColumnDef<Row>[] = [
  { accessorKey: 'name', header: 'Name' },
  { accessorKey: 'status', header: 'Status' },
];

const sortableColumns: ColumnDef<Row>[] = [
  { accessorKey: 'name', header: 'Name', enableSorting: true },
  { accessorKey: 'status', header: 'Status', enableSorting: true },
];

describe('DataTable — base', () => {
  it('renders headers from columns', () => {
    render(<DataTable data={rows} columns={columns} />);
    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();
  });

  it('renders rows from data', () => {
    render(<DataTable data={rows} columns={columns} />);
    expect(screen.getByText('Alpha')).toBeInTheDocument();
    expect(screen.getByText('Beta')).toBeInTheDocument();
  });
});

describe('DataTable — sorting', () => {
  it('click sortable header toggles asc → desc', () => {
    const { container } = render(<DataTable data={rows} columns={sortableColumns} />);
    const nameHeader = screen.getByRole('button', { name: /Name/ });

    let cells = container.querySelectorAll('tbody tr td:first-child');
    expect(cells[0]?.textContent).toBe('Alpha');
    expect(cells[1]?.textContent).toBe('Beta');

    fireEvent.click(nameHeader);
    cells = container.querySelectorAll('tbody tr td:first-child');
    expect(cells[0]?.textContent).toBe('Alpha');
    expect(cells[1]?.textContent).toBe('Beta');

    fireEvent.click(nameHeader);
    cells = container.querySelectorAll('tbody tr td:first-child');
    expect(cells[0]?.textContent).toBe('Beta');
    expect(cells[1]?.textContent).toBe('Alpha');
  });
});

describe('DataTable — global filter', () => {
  it('narrows visible rows when user types', () => {
    render(<DataTable data={rows} columns={columns} />);
    const search = screen.getByPlaceholderText('Search…');
    fireEvent.change(search, { target: { value: 'alpha' } });
    expect(screen.getByText('Alpha')).toBeInTheDocument();
    expect(screen.queryByText('Beta')).not.toBeInTheDocument();
  });
});

describe('DataTable — pagination', () => {
  const many: Row[] = Array.from({ length: 60 }, (_, i) => ({
    id: String(i),
    name: `R${i}`,
    status: 'open',
  }));

  it('renders pagination footer with default page size 25', () => {
    render(<DataTable data={many} columns={columns} />);
    expect(screen.getByText(/1–25 of 60/i)).toBeInTheDocument();
  });

  it('clicks next → shows rows 26–50', () => {
    render(<DataTable data={many} columns={columns} />);
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    expect(screen.getByText(/26–50 of 60/i)).toBeInTheDocument();
  });
});

describe('DataTable — row selection', () => {
  it('selects a row when checkbox clicked', () => {
    const onChange = vi.fn();
    render(
      <DataTable
        data={rows}
        columns={columns}
        enableRowSelection
        onRowSelectionChange={onChange}
      />,
    );
    const checkboxes = screen.getAllByRole('checkbox');
    const firstRowCheckbox = checkboxes[1];
    if (!firstRowCheckbox) throw new Error('expected a checkbox');
    fireEvent.click(firstRowCheckbox);
    expect(onChange).toHaveBeenCalled();
  });
});

describe('DataTable — expansion', () => {
  it('clicking the chevron renders subComponent', () => {
    render(
      <DataTable
        data={rows}
        columns={columns}
        enableExpansion
        renderSubComponent={({ row }) => <div data-testid="sub">expanded: {row.original.name}</div>}
      />,
    );
    const chevrons = screen.getAllByRole('button', { name: /expand row/i });
    const first = chevrons[0];
    if (!first) throw new Error('expected expand button');
    fireEvent.click(first);
    expect(screen.getByTestId('sub').textContent).toMatch(/Alpha/);
  });
});

describe('DataTable — loading + empty', () => {
  it('shows skeleton rows when isLoading', () => {
    const { container } = render(<DataTable data={[]} columns={columns} isLoading />);
    const skeletons = container.querySelectorAll('[data-skeleton]');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('shows EmptyState when data is empty and not loading', () => {
    render(<DataTable data={[]} columns={columns} />);
    expect(screen.getByText(/no results/i)).toBeInTheDocument();
  });
});

describe('DataTable — server mode', () => {
  it('reads state from props and fires callbacks', () => {
    const onPaginationChange = vi.fn();
    render(
      <DataTable
        mode="server"
        data={rows}
        columns={columns}
        sorting={[]}
        onSortingChange={() => {}}
        columnFilters={[]}
        onColumnFiltersChange={() => {}}
        globalFilter=""
        onGlobalFilterChange={() => {}}
        pagination={{ pageIndex: 0, pageSize: 25 }}
        onPaginationChange={onPaginationChange}
        pageCount={4}
        rowCount={100}
      />,
    );
    expect(screen.getByText(/1–25 of 100/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    expect(onPaginationChange).toHaveBeenCalled();
  });
});
