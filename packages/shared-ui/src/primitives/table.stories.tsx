import type { Meta, StoryObj } from '@storybook/react-vite';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from './table';

const meta: Meta = { title: 'primitives/Table' };
export default meta;
type Story = StoryObj;

const EMPLOYEES = [
  { id: '1', name: 'Alice Chen', department: 'Engineering', status: 'Active' },
  { id: '2', name: 'Bob Martinez', department: 'Design', status: 'Active' },
  { id: '3', name: 'Carol Kim', department: 'Product', status: 'On leave' },
  { id: '4', name: 'David Osei', department: 'Engineering', status: 'Active' },
];

export const Default: Story = {
  render: () => (
    <Table>
      <TableCaption>Employee directory</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Department</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {EMPLOYEES.map((emp) => (
          <TableRow key={emp.id}>
            <TableCell className="font-medium">{emp.name}</TableCell>
            <TableCell>{emp.department}</TableCell>
            <TableCell>{emp.status}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  ),
};
