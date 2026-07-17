import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { LeafToolCall } from '../../../src/chat-experience/leaf-tool-calls';
import { SubagentGroup } from '../../../src/chat-experience/subagent-group';

const rows: LeafToolCall[] = [
  { toolCallId: 'c1', name: 'planner_createTask', status: 'ok', via: 'Planner' },
  { toolCallId: 'c2', name: 'planner_listTasks', status: 'running', via: 'Planner' },
];

describe('SubagentGroup', () => {
  it('renders one agent header with the step count and humanized leaf names', () => {
    render(<SubagentGroup agent="Planner" rows={rows} open={true} />);
    expect(screen.getByText('Planner')).toBeInTheDocument();
    expect(screen.getByText('2 steps')).toBeInTheDocument();
    expect(screen.getByText('Planner Create Task')).toBeInTheDocument();
    expect(screen.getByText('Planner List Tasks')).toBeInTheDocument();
    // No flat "via" rows any more — the header carries the agent identity.
    expect(screen.queryByText(/via Planner/)).toBeNull();
  });

  it('singularizes the count for a one-step delegation', () => {
    render(<SubagentGroup agent="Staffing" rows={[rows[0]]} open={true} />);
    expect(screen.getByText('1 step')).toBeInTheDocument();
  });
});
