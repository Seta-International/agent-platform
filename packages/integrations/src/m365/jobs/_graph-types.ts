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
