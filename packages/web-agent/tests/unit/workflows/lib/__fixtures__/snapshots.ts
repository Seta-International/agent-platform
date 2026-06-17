export const linearSnapshot = {
  status: 'running',
  context: { a: { status: 'success' }, b: { status: 'running' } },
  serializedStepGraph: [
    { type: 'step', step: { id: 'a', description: 'A' } },
    { type: 'step', step: { id: 'b', description: 'B' } },
  ],
} as const;

export const conditionalSnapshot = {
  context: { classify: { status: 'success' }, hot: { status: 'success' } },
  serializedStepGraph: [
    { type: 'step', step: { id: 'classify' } },
    {
      type: 'conditional',
      id: 'route',
      steps: [
        { condition: 'priority>5', step: { type: 'step', step: { id: 'hot' } } },
        { condition: 'else', step: { type: 'step', step: { id: 'cold' } } },
      ],
    },
  ],
} as const;

export const parallelSnapshot = {
  serializedStepGraph: [
    {
      type: 'parallel',
      id: 'fanout',
      steps: [
        { type: 'step', step: { id: 'p1' } },
        { type: 'step', step: { id: 'p2' } },
      ],
    },
    { type: 'step', step: { id: 'join' } },
  ],
} as const;

export const loopSnapshot = {
  serializedStepGraph: [
    {
      type: 'loop',
      id: 'retry',
      loopType: 'dountil',
      step: { type: 'step', step: { id: 'attempt' } },
      condition: 'attempt.ok',
    },
  ],
} as const;

export const foreachSnapshot = {
  serializedStepGraph: [
    {
      type: 'foreach',
      id: 'each-item',
      itemsPath: 'items',
      step: { type: 'step', step: { id: 'process' } },
    },
  ],
} as const;

export const sleepSnapshot = {
  serializedStepGraph: [
    { type: 'step', step: { id: 'start' } },
    { type: 'sleep', id: 'wait-30s', duration: 30000 },
    { type: 'step', step: { id: 'after-wait' } },
  ],
} as const;

export const waitForEventSnapshot = {
  serializedStepGraph: [
    { type: 'step', step: { id: 'kickoff' } },
    { type: 'waitForEvent', id: 'wait-approval', eventName: 'approval.granted' },
    { type: 'step', step: { id: 'finalize' } },
  ],
} as const;

export const nestedSnapshot = {
  serializedStepGraph: [
    { type: 'step', step: { id: 'pre' } },
    {
      type: 'nestedWorkflow',
      id: 'sync-children',
      workflowName: 'sync-child',
      child: {
        serializedStepGraph: [
          { type: 'step', step: { id: 'child-a' } },
          { type: 'step', step: { id: 'child-b' } },
        ],
      },
    },
    { type: 'step', step: { id: 'post' } },
  ],
} as const;

export const unknownTypeSnapshot = {
  serializedStepGraph: [
    { type: 'step', step: { id: 'known' } },
    { type: 'futureGadget', id: 'mystery' },
    { type: 'step', step: { id: 'after' } },
  ],
} as const;
