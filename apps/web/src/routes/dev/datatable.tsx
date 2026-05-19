import { DataTable } from '@seta/shared-ui';
import { createFileRoute } from '@tanstack/react-router';
import type { ColumnDef } from '@tanstack/react-table';
import { useMemo, useState } from 'react';

interface DemoRow {
  id: string;
  name: string;
  status: 'open' | 'closed' | 'in_progress';
  assignee: string;
  updatedAt: string;
  notes: string;
}

function makeRows(n: number): DemoRow[] {
  const names = ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon', 'Zeta', 'Eta', 'Theta'];
  const statuses: DemoRow['status'][] = ['open', 'closed', 'in_progress'];
  const assignees = ['Ada', 'Grace', 'Linus', 'Margaret', 'Rich'];
  return Array.from({ length: n }, (_, i) => ({
    id: String(i + 1),
    name: `${names[i % names.length]} #${i + 1}`,
    status: statuses[i % statuses.length] ?? 'open',
    assignee: assignees[i % assignees.length] ?? 'Ada',
    updatedAt: new Date(Date.now() - i * 86400_000).toISOString().slice(0, 10),
    notes: `Note about row ${i + 1}`,
  }));
}

export const Route = createFileRoute('/dev/datatable')({
  component: DemoPage,
});

function DemoPage() {
  const data = useMemo(() => makeRows(200), []);
  const [selection, setSelection] = useState({});

  const columns = useMemo<ColumnDef<DemoRow>[]>(
    () => [
      { accessorKey: 'name', header: 'Name', enableSorting: true },
      { accessorKey: 'status', header: 'Status', enableSorting: true },
      { accessorKey: 'assignee', header: 'Assignee', enableSorting: true },
      { accessorKey: 'updatedAt', header: 'Updated', enableSorting: true },
    ],
    [],
  );

  return (
    <div className="p-xl space-y-lg">
      <h1 className="text-display-md">DataTable demo</h1>
      <DataTable
        data={data}
        columns={columns}
        enableRowSelection
        rowSelection={selection}
        onRowSelectionChange={setSelection}
        enableExpansion
        renderSubComponent={({ row }) => (
          <div className="p-md bg-surface-2 text-body-sm">{row.original.notes}</div>
        )}
      />
    </div>
  );
}
