import Dagre from '@dagrejs/dagre';
import type { Edge, Node } from '@xyflow/react';
import { MarkerType } from '@xyflow/react';

export interface NodeBaseData extends Record<string, unknown> {
  stepId: string;
  status: string;
}

export interface DefaultNodeData extends NodeBaseData {
  description: string;
  runStatus?: string;
  originalPayload?: unknown;
  onReplay?: (args: { stepId: string; originalPayload: unknown }) => void;
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

const seenUnknown = new Set<string>();
function warnUnknown(type: string): void {
  if (seenUnknown.has(type)) return;
  seenUnknown.add(type);
  // biome-ignore lint/suspicious/noConsole: forward-compat surface — operators need to see new step types we don't render
  console.warn(
    `[copilot/workflows] unknown step type '${type}' — rendered as default-node fallback`,
  );
}

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
    case 'loop': {
      const id = (step as { id?: string }).id ?? 'loop';
      const child = (step as { step?: SerializedStep }).step ?? { type: 'step' };
      const predicate = String((step as { condition?: unknown }).condition ?? '');
      const loopNode = makeNode<NodeBaseData & { predicate: string }>(id, 'loop-result-node', {
        stepId: id,
        status: ctx.context[id]?.status ?? 'pending',
        predicate,
      });
      const inner = walkOne(child, ctx);
      const out: WalkResult = {
        nodes: [loopNode, ...inner.nodes],
        edges: [...inner.edges],
        outIds: [id],
        inHeads: [id],
      };
      if (inner.nodes[0]) {
        out.edges.push({
          id: `${id}->${inner.nodes[0].id}`,
          source: id,
          target: inner.nodes[0].id,
          ...EDGE_DEFAULTS,
        });
      }
      for (const tail of inner.outIds) {
        out.edges.push({
          id: `${tail}->${id}#back`,
          source: tail,
          target: id,
          data: { predicate },
          ...EDGE_DEFAULTS,
        });
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
    case 'foreach': {
      const id = (step as { id?: string }).id ?? 'each';
      const inner = (step as { step?: SerializedStep }).step ?? { type: 'step' };
      const itemsPath = String((step as { itemsPath?: unknown }).itemsPath ?? '');
      const innerStep = (inner as { step?: { id?: string; description?: string } }).step ?? {};
      return {
        nodes: [
          makeNode<DefaultNodeData & { itemsPath: string; kind: string }>(id, 'default-node', {
            stepId: id,
            description: innerStep.description ?? `for each ${itemsPath}`,
            status: ctx.context[id]?.status ?? 'pending',
            itemsPath,
            kind: 'foreach',
          }),
        ],
        edges: [],
        outIds: [id],
        inHeads: [id],
      };
    }
    case 'sleep': {
      const id = (step as { id?: string }).id ?? 'sleep';
      const duration = (step as { duration?: number }).duration;
      const label = typeof duration === 'number' ? `${duration}ms` : 'dynamic';
      return {
        nodes: [
          makeNode<NodeBaseData & { kind: string; label: string }>(id, 'control-node', {
            stepId: id,
            status: ctx.context[id]?.status ?? 'pending',
            kind: 'sleep',
            label,
          }),
        ],
        edges: [],
        outIds: [id],
        inHeads: [id],
      };
    }
    case 'waitForEvent': {
      const id = (step as { id?: string }).id ?? 'wait';
      const eventName = String((step as { eventName?: unknown }).eventName ?? '');
      return {
        nodes: [
          makeNode<NodeBaseData & { kind: string; label: string }>(id, 'control-node', {
            stepId: id,
            status: ctx.context[id]?.status ?? 'pending',
            kind: 'waitForEvent',
            label: eventName,
          }),
        ],
        edges: [],
        outIds: [id],
        inHeads: [id],
      };
    }
    case 'nestedWorkflow': {
      const id = (step as { id?: string }).id ?? 'nested';
      const workflowName = String((step as { workflowName?: unknown }).workflowName ?? id);
      const childSnapshot = (step as { child?: unknown }).child ?? null;
      return {
        nodes: [
          makeNode<NodeBaseData & { workflowName: string; childSnapshot: unknown }>(
            id,
            'nested-node',
            {
              stepId: id,
              status: ctx.context[id]?.status ?? 'pending',
              workflowName,
              childSnapshot,
            },
          ),
        ],
        edges: [],
        outIds: [id],
        inHeads: [id],
      };
    }
    default: {
      const id = (step as { id?: string }).id ?? `${step.type}-anon`;
      warnUnknown(step.type);
      return {
        nodes: [
          makeNode<DefaultNodeData & { kind: string }>(id, 'default-node', {
            stepId: id,
            description: `(unknown step type: ${step.type})`,
            status: ctx.context[id]?.status ?? 'pending',
            kind: 'unknown',
          }),
        ],
        edges: [],
        outIds: [id],
        inHeads: [id],
      };
    }
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
