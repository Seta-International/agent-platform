import type { Meta, StoryObj } from '@storybook/react-vite';
import { GraphZoomControls } from './graph-zoom-controls';

const meta = { component: GraphZoomControls } satisfies Meta<typeof GraphZoomControls>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { zoomPct: 80, onZoomIn: () => {}, onZoomOut: () => {}, onFit: () => {} },
};
