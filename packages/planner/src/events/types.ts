// Full event enumeration populated in Phase 4.
export interface PlannerEventActor {
  type: 'user' | 'cli' | 'system' | 'agent' | 'sync';
  user_id: string | null;
  binding_id?: string;
}

export type PlannerEvent = never; // populated in Phase 4
