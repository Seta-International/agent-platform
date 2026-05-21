import { describe, expect, it } from 'vitest';
import { buildWorkflowGraph } from './build-graph.ts';

describe('buildWorkflowGraph', () => {
  it('returns empty arrays when snapshot has no steps', () => {
    const out = buildWorkflowGraph({});
    expect(out.nodes).toEqual([]);
    expect(out.edges).toEqual([]);
  });

  it('builds a linear chain of nodes + edges from a serializedStepGraph', () => {
    const snapshot = {
      status: 'running',
      context: {
        'load-task': { status: 'success' },
        'classify-skills': { status: 'running' },
      },
      serializedStepGraph: [
        { type: 'step', step: { id: 'load-task', description: 'Load' } },
        { type: 'step', step: { id: 'classify-skills', description: 'Classify' } },
        { type: 'step', step: { id: 'find-candidates', description: 'Find' } },
      ],
    };
    const out = buildWorkflowGraph(snapshot);

    expect(out.nodes.map((n) => n.id)).toEqual(['load-task', 'classify-skills', 'find-candidates']);
    expect(out.nodes[0]!.data.status).toBe('success');
    expect(out.nodes[1]!.data.status).toBe('running');
    expect(out.nodes[2]!.data.status).toBe('pending');

    expect(out.edges).toHaveLength(2);
    expect(out.edges[0]).toMatchObject({ source: 'load-task', target: 'classify-skills' });
    expect(out.edges[1]).toMatchObject({
      source: 'classify-skills',
      target: 'find-candidates',
    });
  });

  it('skips non-step entries gracefully', () => {
    const snapshot = {
      serializedStepGraph: [
        { type: 'step', step: { id: 'a' } },
        { type: 'sleep', id: 'wait-1' },
        { type: 'step', step: { id: 'b' } },
      ],
    };
    const out = buildWorkflowGraph(snapshot);
    expect(out.nodes.map((n) => n.id)).toEqual(['a', 'b']);
  });
});
