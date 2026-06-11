import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DataResultPart } from '@/modules/agent/chat-experience/data-result-part';

describe('DataResultPart', () => {
  it('renders a recommendation list', () => {
    render(
      <DataResultPart
        data={{
          recommendations: [
            {
              userId: 'u1',
              name: 'Alice',
              skillMatch: ['aws'],
              skillMatchCount: 1,
              status: 'available',
            },
            { userId: 'u2', name: null, skillMatch: [], skillMatchCount: 0, status: 'busy' },
          ],
        }}
      />,
    );
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('u2')).toBeInTheDocument(); // falls back to id when name is null
  });

  it('renders a task list with tags', () => {
    render(
      <DataResultPart
        data={{
          tasks: [{ task: { taskId: 't1', title: 'Infra', status: 'open', skillTags: ['infra'] } }],
        }}
      />,
    );
    expect(screen.getByText('Infra')).toBeInTheDocument();
    expect(screen.getByText(/infra/)).toBeInTheDocument();
  });

  it('renders nothing for a bare message result (prose already shows it)', () => {
    const { container } = render(<DataResultPart data={{ message: 'hello' }} />);
    expect(container).toBeEmptyDOMElement();
  });
});
