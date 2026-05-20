export interface PlannerEventActor {
  type: 'user' | 'cli' | 'system' | 'agent' | 'sync';
  user_id: string | null;
  binding_id?: string;
}

export type PlannerEvent = never;
