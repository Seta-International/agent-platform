import { describe, expect, it } from 'vitest';
import { conditionalSnapshot, linearSnapshot, parallelSnapshot } from './__fixtures__/snapshots.ts';
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

  it('linearSnapshot still produces type:"default-node"', () => {
    const out = buildWorkflowGraph(linearSnapshot);
    expect(out.nodes.every((n) => n.type === 'default-node')).toBe(true);
  });

  it('emits a condition-node with one edge per branch', () => {
    const out = buildWorkflowGraph(conditionalSnapshot);
    expect(out.nodes.find((n) => n.id === 'route')).toMatchObject({ type: 'condition-node' });
    expect(out.nodes.find((n) => n.id === 'hot')).toMatchObject({ type: 'default-node' });
    expect(out.nodes.find((n) => n.id === 'cold')).toMatchObject({ type: 'default-node' });
    const branchEdges = out.edges.filter((e) => e.source === 'route');
    expect(branchEdges).toHaveLength(2);
    expect(branchEdges.map((e) => e.target).sort()).toEqual(['cold', 'hot']);
    expect(out.edges.find((e) => e.source === 'classify' && e.target === 'route')).toBeDefined();
  });

  it('parallel fans out N edges and joins on an after-node', () => {
    const out = buildWorkflowGraph(parallelSnapshot);
    const ids = out.nodes.map((n) => n.id).sort();
    expect(ids).toContain('p1');
    expect(ids).toContain('p2');
    expect(ids).toContain('join');
    const after = out.nodes.find((n) => n.type === 'after-node');
    expect(after).toBeDefined();
    expect(
      out.edges
        .filter((e) => e.target === after!.id)
        .map((e) => e.source)
        .sort(),
    ).toEqual(['p1', 'p2']);
    expect(out.edges.find((e) => e.source === after!.id && e.target === 'join')).toBeDefined();
  });
});
