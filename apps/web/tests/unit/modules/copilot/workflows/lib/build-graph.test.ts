import { describe, expect, it, vi } from 'vitest';
import {
  conditionalSnapshot,
  foreachSnapshot,
  linearSnapshot,
  loopSnapshot,
  nestedSnapshot,
  parallelSnapshot,
  sleepSnapshot,
  unknownTypeSnapshot,
  waitForEventSnapshot,
} from '../../../../../../src/modules/copilot/workflows/lib/__fixtures__/snapshots.ts';
import { buildWorkflowGraph } from '../../../../../../src/modules/copilot/workflows/lib/build-graph.ts';

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

  it('renders unknown future types as default-node fallback (no silent drop)', () => {
    const snapshot = {
      serializedStepGraph: [
        { type: 'step', step: { id: 'a' } },
        { type: 'totallyFuture', id: 'x' },
        { type: 'step', step: { id: 'b' } },
      ],
    };
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const out = buildWorkflowGraph(snapshot);
    const ids = out.nodes.map((n) => n.id);
    expect(ids).toEqual(['a', 'x', 'b']);
    expect(out.nodes[1]!.type).toBe('default-node');
    expect((out.nodes[1]!.data as unknown as { kind: string }).kind).toBe('unknown');
    warnSpy.mockRestore();
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

  it('loop renders a loop-result-node containing the child + back-edge labeled by predicate', () => {
    const out = buildWorkflowGraph(loopSnapshot);
    const loop = out.nodes.find((n) => n.id === 'retry');
    expect(loop).toMatchObject({ type: 'loop-result-node' });
    const child = out.nodes.find((n) => n.id === 'attempt');
    expect(child).toMatchObject({ type: 'default-node' });
    const back = out.edges.find((e) => e.source === 'attempt' && e.target === 'retry');
    expect(back).toBeDefined();
    expect(back!.data).toMatchObject({ predicate: 'attempt.ok' });
  });

  it('foreach renders default-node with item-count badge data', () => {
    const out = buildWorkflowGraph(foreachSnapshot);
    const each = out.nodes.find((n) => n.id === 'each-item');
    expect(each).toMatchObject({ type: 'default-node' });
    expect(each!.data).toMatchObject({ itemsPath: 'items' });
  });

  it('sleep renders a control-node with mono duration text', () => {
    const out = buildWorkflowGraph(sleepSnapshot);
    const wait = out.nodes.find((n) => n.id === 'wait-30s');
    expect(wait).toMatchObject({ type: 'control-node' });
    expect(wait!.data).toMatchObject({ kind: 'sleep', label: '30000ms' });
    expect(out.edges.some((e) => e.source === 'start' && e.target === 'wait-30s')).toBe(true);
    expect(out.edges.some((e) => e.source === 'wait-30s' && e.target === 'after-wait')).toBe(true);
  });

  it('waitForEvent renders a control-node tagged with the event name', () => {
    const out = buildWorkflowGraph(waitForEventSnapshot);
    const wait = out.nodes.find((n) => n.id === 'wait-approval');
    expect(wait).toMatchObject({ type: 'control-node' });
    expect(wait!.data).toMatchObject({ kind: 'waitForEvent', label: 'approval.granted' });
  });

  it('nestedWorkflow renders a nested-node carrying the child snapshot', () => {
    const out = buildWorkflowGraph(nestedSnapshot);
    const nested = out.nodes.find((n) => n.id === 'sync-children');
    expect(nested).toMatchObject({ type: 'nested-node' });
    expect(nested!.data).toMatchObject({ workflowName: 'sync-child' });
    expect((nested!.data as unknown as { childSnapshot: unknown }).childSnapshot).toBeDefined();
    expect(out.edges.some((e) => e.source === 'pre' && e.target === 'sync-children')).toBe(true);
    expect(out.edges.some((e) => e.source === 'sync-children' && e.target === 'post')).toBe(true);
  });

  it('unknown step type falls back to default-node with kind=unknown', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const out = buildWorkflowGraph(unknownTypeSnapshot);
    const myst = out.nodes.find((n) => n.id === 'mystery');
    expect(myst).toMatchObject({ type: 'default-node' });
    expect((myst!.data as unknown as { kind: string }).kind).toBe('unknown');
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});
