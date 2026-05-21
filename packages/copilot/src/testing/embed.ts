/**
 * Re-exports embedding utilities for use in cross-package test suites.
 * Only import from test files — not production code.
 */
export {
  type EmbedTaskDeps,
  type EmbedTaskPayload,
  embedTask,
} from '../backend/embeddings/embed-task.ts';
