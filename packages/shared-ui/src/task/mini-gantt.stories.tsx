import type { Meta, StoryObj } from '@storybook/react-vite';
import { MiniGantt } from './mini-gantt';

const meta = { component: MiniGantt } satisfies Meta<typeof MiniGantt>;
export default meta;
type Story = StoryObj<typeof meta>;

export const OnTrack: Story = {
  args: { start: '2026-08-12', due: '2026-08-20', today: '2026-08-15', title: 'On track task' },
};
export const Overdue: Story = {
  args: { start: '2026-07-20', due: '2026-08-01', today: '2026-08-15', title: 'Overdue task' },
};
export const Future: Story = {
  args: { start: '2026-09-10', due: '2026-09-20', today: '2026-08-15', title: 'Future task' },
};
export const MissingDates: Story = {
  args: { start: null, due: null, today: '2026-08-15', title: 'Nothing scheduled' },
};
