import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

interface MessageShape {
  content: unknown[];
}

// The leaf rows are MULTI-call on purpose. Astryx `ChatToolCalls` renders a
// single-element `calls` array inline via `CallRow` and IGNORES
// `isExpanded`/`defaultIsExpanded` entirely (ChatToolCalls.tsx L525-530), so a
// one-call group looks "expanded" no matter what the state says and a
// forced-open assertion against it would pass vacuously. With two calls the
// collapsible group header (role="button" + aria-expanded) actually exists and
// reflects real state.
function messageWith(toolCallStatus: string): MessageShape {
  return {
    content: [
      { type: 'tool-call', status: { type: toolCallStatus } },
      {
        type: 'data',
        name: 'tool-agent',
        data: {
          id: 'planner-supervisor',
          toolCalls: [
            { payload: { toolCallId: 'c1', toolName: 'planner_createTask' } },
            { payload: { toolCallId: 'c2', toolName: 'planner_listTasks' } },
          ],
          toolResults: [{ payload: { toolCallId: 'c1', isError: false } }],
        },
      },
    ],
  };
}

let message: MessageShape = messageWith('complete');

vi.mock('@assistant-ui/react', () => ({
  useAuiState: (selector: (s: unknown) => unknown) => selector({ message }),
}));

import { ChainOfThought } from '../../../src/chat-experience/chain-of-thought';

describe('ChainOfThought', () => {
  beforeEach(() => {
    message = messageWith('complete');
    localStorage.clear();
  });

  it('groups a subagent’s leaf calls under one agent header when expanded', () => {
    render(
      <ChainOfThought running={true} count={1} indices={[0]}>
        <div>delegate-row</div>
      </ChainOfThought>,
    );
    expect(screen.getByText('Planner')).toBeInTheDocument();
    expect(screen.getByText('2 steps')).toBeInTheDocument();
    expect(screen.getByText('Planner Create Task')).toBeInTheDocument();
    expect(screen.getByText('Planner List Tasks')).toBeInTheDocument();
    // Flat "via {Agent}" rows are gone.
    expect(screen.queryByText(/via Planner/)).toBeNull();
    expect(screen.getByText('delegate-row')).toBeInTheDocument();
  });

  it('folds leaf rows into the step count when collapsed-eligible (not running)', () => {
    render(
      <ChainOfThought running={false} count={1} indices={[0]}>
        <div>delegate-row</div>
      </ChainOfThought>,
    );
    // count(1 grouped) + 2 leaves = 3 steps
    expect(screen.getByRole('button', { name: /3 steps/ })).toBeInTheDocument();
  });

  it('collapses a finished group under the default (concise) density', () => {
    render(
      <ChainOfThought running={false} count={1} indices={[0]}>
        <div>delegate-row</div>
      </ChainOfThought>,
    );
    // Control for the forced-open test below: with no `requires-action` part
    // and `running=false`, this exact tree collapses. Without this assertion the
    // forced-open test could not distinguish "held open by the HITL gate" from
    // "open by default".
    expect(screen.queryByRole('button', { expanded: true })).toBeNull();
  });

  it('stays forced-open while an inner tool call awaits approval (requires-action)', () => {
    // Mastra-native `requireApproval` HITL gate: the agent flips the group to
    // 'complete', which would collapse it and hide the approval card behind a
    // manual expand. `hasPendingAction` must override that.
    message = messageWith('requires-action');
    render(
      <ChainOfThought running={false} count={1} indices={[0]}>
        <div>delegate-row</div>
      </ChainOfThought>,
    );
    // The chain-of-thought shell itself is held open...
    expect(screen.getByRole('button', { name: /Thought/ })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    // ...and so is the multi-call leaf group nested inside it, so a pending
    // approval row is actually reachable rather than one more click away.
    expect(screen.getByRole('button', { name: /2 tool calls/ })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(screen.queryByRole('button', { expanded: false })).toBeNull();
  });
});
