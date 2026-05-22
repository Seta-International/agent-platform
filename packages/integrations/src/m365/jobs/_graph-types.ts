// Shared minimal duck types for Graph client across m365 job files.
// Separate request interfaces let each job declare only the methods it uses,
// so per-test stubs only need to implement the called methods.

export interface GraphRequestRead {
  select(...fields: string[]): GraphRequestRead;
  filter(expr: string): GraphRequestRead;
  get(): Promise<unknown>;
}

export interface GraphRequestPost {
  post(body: unknown): Promise<{ id: string }>;
}

export interface GraphRequestPatch {
  patch(body: unknown): Promise<void>;
}

export interface GraphRequestReadPatch extends GraphRequestRead {
  patch(body: unknown): Promise<void>;
}

// Convenience union for jobs that only post or only patch
export interface GraphLikePost {
  api(path: string): GraphRequestPost;
}

export interface GraphLikeRead {
  api(path: string): GraphRequestRead;
}

export interface GraphLikeReadPatch {
  api(path: string): GraphRequestReadPatch;
}

export interface GraphLikePatch {
  api(path: string): GraphRequestPatch;
}

export interface GraphRequestWrite {
  header(name: string, value: string): GraphRequestWrite;
  update(body: unknown): Promise<unknown>;
  post(body: unknown): Promise<unknown>;
  delete(): Promise<void>;
}

export interface GraphLikeWrite {
  api(path: string): GraphRequestWrite;
}

// Planner-specific DTOs -------------------------------------------------------

export interface GraphPlan {
  id: string;
  '@odata.etag': string;
  title: string;
  owner?: string; // deprecated in Graph v1.0; may be absent
  container?: { containerId?: string; type?: string }; // current replacement; may be absent on old plans
  createdDateTime?: string;
}

export interface GraphPlanDetails {
  id: string;
  '@odata.etag': string;
  sharedWith?: Record<string, boolean>;
  categoryDescriptions?: Record<string, string | null>; // keys: category1..category25
}

export interface GraphBucket {
  id: string;
  '@odata.etag': string;
  name: string;
  planId: string;
  orderHint: string;
}

export interface GraphAssignment {
  '@odata.type'?: '#microsoft.graph.plannerAssignment';
  assignedBy?: { user?: { id?: string } };
  assignedDateTime?: string;
  orderHint?: string;
}

export type GraphAssignments = Record<string, GraphAssignment>; // keys: Entra user OIDs
export type GraphAppliedCategories = Record<string, boolean>; // keys: category1..category25

export interface GraphTask {
  id: string;
  '@odata.etag': string;
  planId: string;
  bucketId: string;
  title: string;
  orderHint: string;
  assigneePriority?: string;
  percentComplete: number;
  priority: number;
  startDateTime?: string | null;
  dueDateTime?: string | null;
  completedDateTime?: string | null;
  hasDescription?: boolean;
  previewType?: string;
  conversationThreadId?: string | null;
  appliedCategories: GraphAppliedCategories;
  assignments: GraphAssignments;
  createdDateTime?: string;
}

export interface GraphChecklistItem {
  '@odata.type'?: '#microsoft.graph.plannerChecklistItem';
  title: string;
  isChecked: boolean;
  orderHint: string;
  lastModifiedBy?: unknown;
  lastModifiedDateTime?: string;
}

export interface GraphTaskReference {
  '@odata.type'?: '#microsoft.graph.plannerExternalReference';
  alias?: string;
  type?: string;
  previewPriority?: string;
  lastModifiedBy?: unknown;
  lastModifiedDateTime?: string;
}

export interface GraphTaskDetails {
  id: string;
  '@odata.etag': string;
  description?: string | null;
  previewType?: string;
  references: Record<string, GraphTaskReference>; // keys: URL-encoded URLs
  checklist: Record<string, GraphChecklistItem>; // keys: GUIDs
}

export interface GraphBucketTaskBoardTaskFormat {
  id: string;
  '@odata.etag': string;
  orderHint: string;
}
