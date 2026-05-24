// Authenticated session contract exposed to copilot-domain functions and to
// agent tools through ctx. Owned by the SDK so modules can type-check
// `execute(args, ctx)` without importing engine internals.
export interface SessionLike {
  tenant_id: string;
  user_id: string;
  effective_permissions: ReadonlySet<string>;
  role_summary: { roles: string[]; cross_tenant_read: boolean };
}
