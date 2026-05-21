import type { SessionScope } from '@seta/core';

export interface PlannerSystemActor {
  kind: 'system';
  system_id: 'integrations.m365';
}

export type PlannerSessionScope = SessionScope & { actor?: PlannerSystemActor };

export function isM365SystemActor(session: SessionScope): boolean {
  const a = (session as PlannerSessionScope).actor;
  return a?.kind === 'system' && a.system_id === 'integrations.m365';
}
