import { render } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { AfterNode } from '../after-node.tsx';
import { ConditionNode } from '../condition-node.tsx';
import { ControlNode } from '../control-node.tsx';
import { LoopResultNode } from '../loop-result-node.tsx';
import { NestedNode } from '../nested-node.tsx';
import { DefaultNode } from '../step-node.tsx';

function withFlow(child: ReactNode) {
  return <ReactFlowProvider>{child}</ReactFlowProvider>;
}

// @xyflow/react NodeProps requires a fully populated ReactFlow internal context that isn't available in unit tests.
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

describe('node variants render', () => {
  it('DefaultNode renders stepId + description', () => {
    const { getByLabelText } = render(
      withFlow(
        <DefaultNode
          {...nodeProps({ stepId: 'a', status: 'running', description: 'do a thing' })}
        />,
      ),
    );
    expect(getByLabelText(/Step a/i)).toBeInTheDocument();
  });

  it('ConditionNode renders predicates', () => {
    const { getByText, getByLabelText } = render(
      withFlow(
        <ConditionNode
          {...nodeProps({
            stepId: 'route',
            status: 'success',
            predicates: ['x>5', 'else'],
          })}
        />,
      ),
    );
    expect(getByLabelText(/Condition route/i)).toBeInTheDocument();
    expect(getByText('x>5')).toBeInTheDocument();
    expect(getByText('else')).toBeInTheDocument();
  });

  it('LoopResultNode renders predicate', () => {
    const { getByText } = render(
      withFlow(
        <LoopResultNode
          {...nodeProps({ stepId: 'retry', status: 'running', predicate: 'attempt.ok' })}
        />,
      ),
    );
    expect(getByText(/attempt\.ok/)).toBeInTheDocument();
  });

  it('NestedNode renders workflowName', () => {
    const { getByText } = render(
      withFlow(
        <NestedNode
          {...nodeProps({
            stepId: 'sub',
            status: 'pending',
            workflowName: 'sync-child',
            childSnapshot: null,
          })}
        />,
      ),
    );
    expect(getByText('sync-child')).toBeInTheDocument();
  });

  it('AfterNode renders an aria-hidden join dot', () => {
    const { container } = render(
      withFlow(<AfterNode {...nodeProps({ stepId: 'j__after', status: 'pending' })} />),
    );
    expect(container.querySelector('[aria-hidden]')).toBeTruthy();
  });

  it('ControlNode renders sleep/wait label', () => {
    const { getByText } = render(
      withFlow(
        <ControlNode
          {...nodeProps({ stepId: 'w', status: 'pending', kind: 'sleep', label: '30000ms' })}
        />,
      ),
    );
    expect(getByText('30000ms')).toBeInTheDocument();
  });
});
