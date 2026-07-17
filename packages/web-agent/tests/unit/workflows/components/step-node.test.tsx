import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReactFlowProvider } from '@xyflow/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { DefaultNode } from '../../../../src/workflows/components/step-node.tsx';

function withFlow(child: ReactNode) {
  return <ReactFlowProvider>{child}</ReactFlowProvider>;
}

// @xyflow/react NodeProps requires a fully populated ReactFlow internal context that isn't
// available in unit tests — same shape used by nodes/__snapshot__.test.tsx.
// biome-ignore-start lint/suspicious/noExplicitAny: see above
/* eslint-disable @typescript-eslint/no-explicit-any */
const nodeProps = (data: Record<string, unknown>): any => ({
  id: String(data.stepId),
  type: 'x',
  data,
  selected: false,
  dragging: false,
  isConnectable: false,
  xPos: 0,
  yPos: 0,
  zIndex: 0,
});
/* eslint-enable @typescript-eslint/no-explicit-any */
// biome-ignore-end lint/suspicious/noExplicitAny: see above

describe('StepJsonDialog (via DefaultNode)', () => {
  // Astryx `Dialog`'s standard/modal path always mounts the `<dialog>` element + children
  // regardless of `isOpen` — assert closed via `queryByRole('dialog')` returning null, and
  // open via `getByRole('dialog')`, never via the JSON content leaving the DOM.
  it('is closed until the Input button is clicked, then shows the step JSON scoped to the dialog', async () => {
    const user = userEvent.setup();
    render(
      withFlow(
        <DefaultNode
          {...nodeProps({
            stepId: 'fetch-user',
            status: 'success',
            stepInput: { userId: '42', includeArchived: false },
          })}
        />,
      ),
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Input' }));

    const dialog = screen.getByRole('dialog');
    // `DialogHeader` wires no `aria-labelledby`, so assert the title via its heading, scoped
    // to the dialog with `within()` rather than the dialog's accessible name.
    expect(within(dialog).getByRole('heading', { name: 'fetch-user — Input' })).toBeInTheDocument();
    expect(within(dialog).getByText(/"userId": "42"/)).toBeInTheDocument();
    expect(within(dialog).getByText(/"includeArchived": false/)).toBeInTheDocument();
  });

  it('closes the dialog when the header close button is clicked', async () => {
    const user = userEvent.setup();
    render(
      withFlow(
        <DefaultNode
          {...nodeProps({
            stepId: 'fetch-user',
            status: 'failed',
            stepError: { message: 'boom' },
          })}
        />,
      ),
    );

    await user.click(screen.getByRole('button', { name: 'Error' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(/"message": "boom"/)).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: /close/i }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
