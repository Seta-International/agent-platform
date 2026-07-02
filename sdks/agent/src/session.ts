// Authenticated session contract exposed to agent-domain functions and to
// agent tools through ctx. Owned by the SDK so modules can type-check
// `execute(args, ctx)` without importing engine internals.
export interface SessionLikeAssignment {
  role_slug: string;
  scope_kind: 'tenant' | 'org_unit' | 'self';
  scope_id: string | null;
}

export interface SessionLike {
  tenant_id: string;
  user_id: string;
  effective_permissions: ReadonlySet<string>;
  role_summary: {
    roles: string[];
    cross_tenant_read: boolean;
    assignments: ReadonlyArray<SessionLikeAssignment>;
  };
}
