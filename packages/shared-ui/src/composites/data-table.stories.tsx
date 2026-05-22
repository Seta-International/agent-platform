import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ColumnDef, Row as TanstackRow } from '@tanstack/react-table';
import * as React from 'react';
import { expect, within } from 'storybook/test';

import { Badge } from '../primitives/badge';
import { DataTable, type DataTableClientProps } from './data-table';

interface Row {
  id: string;
  name: string;
  status: 'open' | 'closed' | 'in_review';
  owner: string;
  priority: 'P0' | 'P1' | 'P2';
}

const SEED: Row[] = [
  { id: '1', name: 'Alpha', status: 'open', owner: 'Jane Doe', priority: 'P0' },
  { id: '2', name: 'Beta', status: 'closed', owner: 'John Roe', priority: 'P2' },
  { id: '3', name: 'Gamma', status: 'in_review', owner: 'Aki Tanaka', priority: 'P1' },
  { id: '4', name: 'Delta', status: 'open', owner: 'Sam Lee', priority: 'P1' },
];

const MANY: Row[] = Array.from({ length: 60 }, (_, i) => ({
  id: String(i + 1),
  name: `Row ${i + 1}`,
  status: (i % 3 === 0 ? 'open' : i % 3 === 1 ? 'in_review' : 'closed') as Row['status'],
  owner: `User ${(i % 7) + 1}`,
  priority: (i % 3 === 0 ? 'P0' : i % 3 === 1 ? 'P1' : 'P2') as Row['priority'],
}));

const baseColumns: ColumnDef<Row>[] = [
  { accessorKey: 'name', header: 'Name' },
  { accessorKey: 'status', header: 'Status' },
  { accessorKey: 'owner', header: 'Owner' },
  { accessorKey: 'priority', header: 'Priority' },
];

const sortableColumns: ColumnDef<Row>[] = [
  { accessorKey: 'name', header: 'Name', enableSorting: true },
  { accessorKey: 'status', header: 'Status', enableSorting: true },
  { accessorKey: 'owner', header: 'Owner', enableSorting: true },
  { accessorKey: 'priority', header: 'Priority', enableSorting: true },
];

const richColumns: ColumnDef<Row>[] = [
  { accessorKey: 'name', header: 'Name', enableSorting: true },
  {
    accessorKey: 'status',
    header: 'Status',
    cell: ({ getValue }) => {
      const v = getValue<Row['status']>();
      const variant = v === 'open' ? 'default' : v === 'closed' ? 'secondary' : 'outline';
      return <Badge variant={variant}>{v.replace('_', ' ')}</Badge>;
    },
  },
  { accessorKey: 'owner', header: 'Owner' },
  { accessorKey: 'priority', header: 'Priority', enableSorting: true },
];

const DataTableForRow = DataTable as unknown as React.ComponentType<DataTableClientProps<Row>>;

const meta: Meta<DataTableClientProps<Row>> = {
  component: DataTableForRow,
  tags: ['ai-generated', 'needs-work'],
  parameters: {
    layout: 'padded',
  },
};

export default meta;

type Story = StoryObj<DataTableClientProps<Row>>;

export const Default: Story = {
  args: {
    data: SEED,
    columns: baseColumns,
  },
};

export const RichCells: Story = {
  args: {
    data: SEED,
    columns: richColumns,
  },
  play: async ({ canvas }) => {
    // Badge is the only proof the custom cell renderer ran.
    await expect(canvas.getByText('in review')).toBeVisible();
  },
};

export const Sortable: Story = {
  args: {
    data: SEED,
    columns: sortableColumns,
  },
  play: async ({ canvas, userEvent }) => {
    const header = canvas.getByRole('button', { name: /Name/ });
    await userEvent.click(header); // asc
    await userEvent.click(header); // desc
    const firstCell = canvas.getAllByRole('row')[1]?.querySelector('td');
    await expect(firstCell?.textContent).toBe('Gamma');
  },
};

export const GlobalFilter: Story = {
  args: {
    data: SEED,
    columns: baseColumns,
  },
  play: async ({ canvas, userEvent }) => {
    const search = canvas.getByPlaceholderText('Search…');
    await userEvent.type(search, 'alpha');
    await expect(canvas.getByText('Alpha')).toBeVisible();
    await expect(canvas.queryByText('Beta')).toBeNull();
  },
};

export const RowSelection: Story = {
  args: {
    data: SEED,
    columns: baseColumns,
    enableRowSelection: true,
  },
  play: async ({ canvas, userEvent }) => {
    const checkboxes = canvas.getAllByRole('checkbox');
    const firstRow = checkboxes[1];
    if (!firstRow) throw new Error('expected a row checkbox');
    await userEvent.click(firstRow);
    await expect(firstRow).toHaveAttribute('aria-checked', 'true');
  },
};

export const Expansion: Story = {
  args: {
    data: SEED,
    columns: baseColumns,
    enableExpansion: true,
    renderSubComponent: ({ row }: { row: TanstackRow<Row> }) => (
      <div data-testid="row-detail" className="px-md py-sm text-body-sm text-ink-muted">
        Owner notes for <strong>{row.original.name}</strong> ({row.original.owner})
      </div>
    ),
  },
  play: async ({ canvas, userEvent }) => {
    const [first] = canvas.getAllByRole('button', { name: /expand row/i });
    if (!first) throw new Error('expected expand button');
    await userEvent.click(first);
    await expect(canvas.getByTestId('row-detail')).toBeVisible();
  },
};

export const Pagination: Story = {
  args: {
    data: MANY,
    columns: baseColumns,
  },
  play: async ({ canvas, userEvent }) => {
    await expect(canvas.getByText(/1–25 of 60/i)).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: /next/i }));
    await expect(canvas.getByText(/26–50 of 60/i)).toBeVisible();
  },
};

export const Loading: Story = {
  args: {
    data: [],
    columns: baseColumns,
    isLoading: true,
  },
  play: async ({ canvasElement }) => {
    const skeletons = canvasElement.querySelectorAll('[data-skeleton]');
    await expect(skeletons.length).toBeGreaterThan(0);
  },
};

export const Empty: Story = {
  args: {
    data: [],
    columns: baseColumns,
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText(/no results/i)).toBeVisible();
  },
};

export const NoResults: Story = {
  args: {
    data: SEED,
    columns: baseColumns,
  },
  play: async ({ canvas, userEvent }) => {
    const search = canvas.getByPlaceholderText('Search…');
    await userEvent.type(search, 'zzz-nothing');
    await expect(canvas.getByText(/No results match these filters/i)).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: /clear filters/i }));
    await expect(canvas.getByText('Alpha')).toBeVisible();
  },
};

export const Compact: Story = {
  args: {
    data: SEED,
    columns: richColumns,
    density: 'compact',
  },
};

export const ClickableRows: Story = {
  args: {
    data: SEED,
    columns: baseColumns,
    onRowClick: () => {},
  },
  play: async ({ canvasElement }) => {
    const chevrons = canvasElement.querySelectorAll('[data-testid="row-chevron"]');
    await expect(chevrons.length).toBe(SEED.length);
  },
};

function ServerStoryHarness() {
  const [pagination, setPagination] = React.useState({ pageIndex: 0, pageSize: 25 });
  return (
    <DataTable<Row, unknown>
      mode="server"
      data={SEED}
      columns={baseColumns}
      sorting={[]}
      onSortingChange={() => {}}
      columnFilters={[]}
      onColumnFiltersChange={() => {}}
      globalFilter=""
      onGlobalFilterChange={() => {}}
      pagination={pagination}
      onPaginationChange={setPagination}
      pageCount={4}
      rowCount={100}
    />
  );
}

export const ServerMode: Story = {
  render: () => <ServerStoryHarness />,
  play: async ({ canvasElement, userEvent }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(/1–25 of 100/i)).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: /next/i }));
    await expect(canvas.getByText(/26–50 of 100/i)).toBeVisible();
  },
};

export const CssCheck: Story = {
  args: {
    data: SEED,
    columns: baseColumns,
  },
  play: async ({ canvas }) => {
    const footer = canvas.getByText(/Showing 1–4 of 4/i).closest('div');
    if (!footer) throw new Error('expected pagination footer');
    const borderTop = getComputedStyle(footer).borderTopColor;
    await expect(borderTop).toBe('rgb(233, 232, 230)');
  },
};
