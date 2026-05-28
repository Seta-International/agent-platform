import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const message = {
  content: [
    { type: 'tool-call', status: { type: 'complete' } },
    {
      type: 'data',
      name: 'tool-agent',
      data: {
        id: 'planner-supervisor',
        toolCalls: [{ payload: { toolCallId: 'c1', toolName: 'planner_createTask' } }],
        toolResults: [{ payload: { toolCallId: 'c1', isError: false } }],
      },
    },
  ],
};

vi.mock('@assistant-ui/react', () => ({
  useAuiState: (selector: (s: unknown) => unknown) => selector({ message }),
}));

import { ChainOfThought } from '@/modules/agent/chat-experience/chain-of-thought';

describe('ChainOfThought', () => {
  it('renders a leaf tool-call row with its via-agent label when expanded', () => {
    render(
      <ChainOfThought running={true} count={1} indices={[0]}>
        <div>delegate-row</div>
      </ChainOfThought>,
    );
    expect(screen.getByText('Planner Create Task')).toBeInTheDocument();
    expect(screen.getByText('via Planner')).toBeInTheDocument();
    expect(screen.getByText('delegate-row')).toBeInTheDocument();
  });

  it('folds leaf rows into the step count when collapsed-eligible (not running)', () => {
    render(
      <ChainOfThought running={false} count={1} indices={[0]}>
        <div>delegate-row</div>
      </ChainOfThought>,
    );
    // count(1 grouped) + 1 leaf = 2 steps
    expect(screen.getByText(/2 steps/)).toBeInTheDocument();
  });
});
