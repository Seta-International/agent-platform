import Dagre from '@dagrejs/dagre';
import type { Edge, Node } from '@xyflow/react';
import { MarkerType } from '@xyflow/react';

export interface NodeBaseData extends Record<string, unknown> {
  stepId: string;
  status: string;
}

export interface DefaultNodeData extends NodeBaseData {
  description: string;
}

export interface ConditionNodeData extends NodeBaseData {
  predicates: string[];
}

export type AnyNodeData = DefaultNodeData | ConditionNodeData | NodeBaseData;

const NODE_WIDTHS: Record<string, number> = {
  'default-node': 240,
  'condition-node': 180,
  'loop-result-node': 260,
  'nested-node': 280,
  'after-node': 24,
  'control-node': 140,
};
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

type SerializedStep = { type: string; [k: string]: unknown };

interface WalkResult {
  nodes: Node<AnyNodeData>[];
  edges: Edge[];
  outIds: string[];
  inHeads: string[];
}

interface WalkCtx {
  context: Record<string, { status?: string } | undefined>;
}

function makeNode<D extends AnyNodeData>(
  id: string,
  type: keyof typeof NODE_WIDTHS,
  data: D,
): Node<AnyNodeData> {
  return { id, type, position: { x: 0, y: 0 }, data } as Node<AnyNodeData>;
}

function walkOne(step: SerializedStep, ctx: WalkCtx): WalkResult {
  switch (step.type) {
    case 'step': {
      const inner = (step as { step?: { id?: string; description?: string } }).step ?? {};
      const id = inner.id ?? 'unknown';
      return {
        nodes: [
          makeNode<DefaultNodeData>(id, 'default-node', {
            stepId: id,
            description: inner.description ?? '',
            status: ctx.context[id]?.status ?? 'pending',
          }),
        ],
        edges: [],
        outIds: [id],
        inHeads: [id],
      };
    }
    case 'conditional': {
      const id = (step as { id?: string }).id ?? 'cond';
      const branches =
        (step as { steps?: Array<{ condition?: unknown; step: SerializedStep }> }).steps ?? [];
      const predicates: string[] = branches.map((b) => String(b.condition ?? ''));
      const node = makeNode<ConditionNodeData>(id, 'condition-node', {
        stepId: id,
        status: ctx.context[id]?.status ?? 'pending',
        predicates,
      });
      const out: WalkResult = { nodes: [node], edges: [], outIds: [], inHeads: [id] };
      for (let i = 0; i < branches.length; i++) {
        const branch = branches[i]!;
        const inner = walkOne(branch.step, ctx);
        out.nodes.push(...inner.nodes);
        out.edges.push(...inner.edges);
        const head = inner.nodes[0]?.id;
        if (head) {
          out.edges.push({
            id: `${id}->${head}#${i}`,
            source: id,
            target: head,
            data: { branchLabel: predicates[i] ?? '' },
            ...EDGE_DEFAULTS,
          });
        }
        out.outIds.push(...inner.outIds);
      }
      return out;
    }
    case 'parallel': {
      const id = (step as { id?: string }).id ?? 'par';
      const branches = (step as { steps?: SerializedStep[] }).steps ?? [];
      const afterId = `${id}__after`;
      const afterNode = makeNode<NodeBaseData>(afterId, 'after-node', {
        stepId: afterId,
        status: ctx.context[id]?.status ?? 'pending',
      });
      const out: WalkResult = { nodes: [], edges: [], outIds: [afterId], inHeads: [] };
      for (const branch of branches) {
        const inner = walkOne(branch, ctx);
        out.nodes.push(...inner.nodes);
        out.edges.push(...inner.edges);
        out.inHeads.push(...inner.inHeads);
        for (const tail of inner.outIds) {
          out.edges.push({
            id: `${tail}->${afterId}`,
            source: tail,
            target: afterId,
            ...EDGE_DEFAULTS,
          });
        }
      }
      out.nodes.push(afterNode);
      return out;
    }
    default:
      return { nodes: [], edges: [], outIds: [], inHeads: [] };
  }
}

function layoutNodes(nodes: Node<AnyNodeData>[], edges: Edge[]): Node<AnyNodeData>[] {
  const g = new Dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'TB', nodesep: 30, ranksep: 40 });
  for (const e of edges) g.setEdge(e.source, e.target);
  for (const n of nodes) {
    g.setNode(n.id, {
      width: NODE_WIDTHS[n.type ?? 'default-node'] ?? 240,
      height: NODE_HEIGHT,
    });
  }
  Dagre.layout(g);
  return nodes.map((n) => {
    const pos = g.node(n.id);
    const width = NODE_WIDTHS[n.type ?? 'default-node'] ?? 240;
    return { ...n, position: { x: pos.x - width / 2, y: pos.y - NODE_HEIGHT / 2 } };
  });
}

export function buildWorkflowGraph(snapshot: unknown): {
  nodes: Node<AnyNodeData>[];
  edges: Edge[];
} {
  const snap = (snapshot ?? {}) as {
    serializedStepGraph?: SerializedStep[];
    context?: Record<string, { status?: string } | undefined>;
  };
  const ctx: WalkCtx = { context: snap.context ?? {} };
  const steps = snap.serializedStepGraph ?? [];

  const nodes: Node<AnyNodeData>[] = [];
  const edges: Edge[] = [];
  let prevOutIds: string[] = [];

  for (const s of steps) {
    const r = walkOne(s, ctx);
    if (r.nodes.length === 0) continue;
    nodes.push(...r.nodes);
    edges.push(...r.edges);
    for (const src of prevOutIds) {
      for (const head of r.inHeads) {
        edges.push({ id: `${src}->${head}`, source: src, target: head, ...EDGE_DEFAULTS });
      }
    }
    prevOutIds = r.outIds;
  }

  return { nodes: layoutNodes(nodes, edges), edges };
}
