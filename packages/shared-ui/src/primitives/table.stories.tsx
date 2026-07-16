import type { Meta, StoryObj } from '@storybook/react-vite';
import { proportional, Table, type TableColumn } from './table';

const meta: Meta = { title: 'primitives/Table' };
export default meta;
type Story = StoryObj;

interface Employee {
  id: string;
  name: string;
  department: string;
  status: string;
  [key: string]: unknown;
}

const EMPLOYEES: Employee[] = [
  { id: '1', name: 'Alice Chen', department: 'Engineering', status: 'Active' },
  { id: '2', name: 'Bob Martinez', department: 'Design', status: 'Active' },
  { id: '3', name: 'Carol Kim', department: 'Product', status: 'On leave' },
  { id: '4', name: 'David Osei', department: 'Engineering', status: 'Active' },
];

const COLUMNS: TableColumn<Employee>[] = [
  { key: 'name', header: 'Name', width: proportional(1), renderCell: (e) => e.name },
  {
    key: 'department',
    header: 'Department',
    width: proportional(1),
    renderCell: (e) => e.department,
  },
  { key: 'status', header: 'Status', width: proportional(1), renderCell: (e) => e.status },
];

export const Default: Story = {
  render: () => <Table data={EMPLOYEES} columns={COLUMNS} idKey="id" />,
};
