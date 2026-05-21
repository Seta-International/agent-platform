import Dagre from '@dagrejs/dagre';
import type { Edge, Node } from '@xyflow/react';
import { MarkerType } from '@xyflow/react';

interface SerializedStep {
  type: string;
  step?: {
    id: string;
    description?: string;
  };
}

interface SnapshotShape {
  serializedStepGraph?: SerializedStep[];
  context?: Record<string, { status?: string; output?: unknown } | undefined>;
  status?: string;
}

export interface StepNodeData extends Record<string, unknown> {
  stepId: string;
  description: string;
  status: string;
}

const NODE_WIDTH = 240;
const NODE_HEIGHT = 76;

const EDGE_DEFAULTS = {
  type: 'default' as const,
  markerEnd: {
    type: MarkerType.ArrowClosed,
    width: 16,
    height: 16,
    color: 'var(--color-ink-subtle)',
  },
};

function layoutNodes<T extends Node>(nodes: T[], edges: Edge[]): T[] {
  const g = new Dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'TB', nodesep: 30, ranksep: 40 });
  for (const e of edges) g.setEdge(e.source, e.target);
  for (const n of nodes) g.setNode(n.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  Dagre.layout(g);
  return nodes.map((n) => {
    const pos = g.node(n.id);
    return {
      ...n,
      position: {
        x: pos.x - NODE_WIDTH / 2,
        y: pos.y - NODE_HEIGHT / 2,
      },
    };
  });
}

/**
 * Build a ReactFlow graph from a Mastra workflow snapshot. Supports straight-line
 * step flows (the v1 workflow shape). When workflows gain branching / loop / parallel
 * shapes, the upstream snapshot will carry additional SerializedStep types and the
 * build function should be extended to match.
 */
export function buildWorkflowGraph(snapshot: unknown): {
  nodes: Node<StepNodeData>[];
  edges: Edge[];
} {
  const snap = (snapshot ?? {}) as SnapshotShape;
  const steps = snap.serializedStepGraph ?? [];
  const context = snap.context ?? {};

  const linearSteps = steps
    .filter(
      (s): s is SerializedStep & { step: { id: string } } => s.type === 'step' && !!s.step?.id,
    )
    .map((s) => s.step);

  const nodes: Node<StepNodeData>[] = linearSteps.map((step, i) => {
    const ctxEntry = context[step.id];
    return {
      id: step.id,
      type: 'step',
      position: { x: 0, y: i * (NODE_HEIGHT + 40) },
      data: {
        stepId: step.id,
        description: step.description ?? '',
        status: ctxEntry?.status ?? 'pending',
      },
    };
  });

  const edges: Edge[] = [];
  for (let i = 0; i < linearSteps.length - 1; i++) {
    const src = linearSteps[i]!.id;
    const tgt = linearSteps[i + 1]!.id;
    edges.push({
      id: `${src}->${tgt}`,
      source: src,
      target: tgt,
      ...EDGE_DEFAULTS,
    });
  }

  return { nodes: layoutNodes(nodes, edges), edges };
}
