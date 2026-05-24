// Orchestrator-facing subpath for the model registry. Direct callers today are
// limited to @seta/staffing's workflow agents.

export type {
  ModelEntry,
  ModelTier,
  PublicModel,
  ResolveOpts,
} from './backend/model-registry.ts';
export {
  listModels,
  ModelNotFoundError,
  resolveModel,
} from './backend/model-registry.ts';
