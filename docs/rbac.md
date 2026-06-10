# How RBAC works

This is a conceptual guide to role-based access control (RBAC) on the platform — the mental model, not the implementation. It is written so a new contributor or an AI agent can understand *how access is decided* without reading any code. (For where things live and the wiring, see the architecture doc's RBAC section.)

## The one-sentence version

Every user holds **roles**; each role grants a set of **permissions**; at sign-in we expand a user's roles into one flat **set of permission strings** and attach it to their session; everything that needs to authorize an action just asks "is this permission in the set?"

## Vocabulary

- **Permission** — the smallest unit of "you may do X". It is a single dotted string shaped `module.resource.action`, for example `planner.task.create`, `knowledge.file.read`, or `identity.user.write`. The first segment is the owning module, the middle is the thing being acted on, and the tail is the verb. Some actions carry a scope suffix like `.self` (only your own), `.any` (anyone's), or `.tenant` (tenant-wide) — e.g. `agent.thread.read.self`.
- **Resource + actions** — permissions are declared as a resource with a list of actions (e.g. the resource `planner.task` with actions `read`, `create`, `update`…). The flat permission string is simply `resource` + `.` + `action`. This is just two views of the same thing: the grouped form is convenient to author, the flat string is convenient to check.
- **Role** — a named bundle of permissions, e.g. `planner.contributor` or `identity.admin`. Users are never granted individual permissions directly; they are granted roles, and roles carry the permissions. Role names are namespaced by module (`knowledge.viewer`, `agent.admin`) so they never collide.
- **Permission set** — the fully expanded, de-duplicated collection of permission strings a particular user effectively has right now. This is what authorization checks read.

## The three kinds of roles

1. **Module roles** — ordinary roles owned by a feature module (e.g. `planner.admin`, `knowledge.viewer`, `agent.contributor`). They grant a curated list of that module's permissions.
2. **Foundation roles** — three special, cross-cutting roles that are *not* enumerated permission-by-permission, because doing so would rot as modules are added. Instead they are resolved by rule:
   - `org.admin` and `tenant.admin` → **wildcard**: they resolve to *every* permission that exists anywhere in the system. Add a new module tomorrow and these admins automatically gain its permissions.
   - `org.viewer` → **every read permission**: it resolves to every permission whose action is `read` (i.e. the string ends in `.read`), giving an org-wide read-only viewer. (This is why "read" is the canonical action name — it keeps this rule mechanical.)
3. **The implicit baseline** — a small set of permissions every authenticated user gets regardless of their roles: things like "use the chat assistant", "read/update your own profile", "read your own threads". These are unioned into everyone's permission set so basic self-service always works.

## The single source of truth

All of the above — every permission, and the seed list of permissions each module role grants — is declared **once**, in a single reconciled inventory. There is exactly one place a human edits to change "what permissions exist" or "what a built-in role grants by default."

Everything else is derived from that one inventory:
- the runtime resolver that builds permission sets,
- the identity layer that answers "what can I do?",
- the generated list of valid permission strings shared by the backend and frontend.

Because they all build from the same inventory, they cannot drift apart. Each module also re-declares its own slice of the inventory locally (so its code can be type-checked against its own permissions), and an automated parity check fails the build if a module's local declaration ever disagrees with the inventory. The inventory is authoritative; the local declarations are guarded mirrors.

## Resolution: roles → permission set

When a session is established (and again whenever the cached session is rehydrated), the system:

1. looks up the user's granted roles,
2. starts from the implicit baseline,
3. for each role, adds its permissions — applying the wildcard rule for `org.admin`/`tenant.admin` and the all-reads rule for `org.viewer`,
4. and attaches the resulting flat set to the session.

The set is **computed, not stored** — a deploy that introduces new permissions takes effect immediately without rebuilding anything, and there is never a stale persisted copy to invalidate.

## Enforcement: who checks, and how

- **The backend is the only real security boundary.** Every state-changing or sensitive operation re-checks permission against the session's permission set at the point it runs. The core check is trivial: *is this permission string in the set?*
- **Module wrappers add context, not resolution.** A module may wrap that check to throw its own typed error, or to layer an additional *scope* rule that a flat permission can't express — for example, "you may edit tasks **in this group**" combines the `planner.task.update` permission with a check that the group is one you can access. Resolution (does the user have the permission at all) and scope (is this specific object in reach) are separate concerns.
- **System and integration actors** (e.g. the background Microsoft 365 sync) run with a synthetic session carrying exactly the permissions their job needs, resolved the same way through the same rules — there is no second, hand-maintained code path.
- **The frontend mirrors the same set for UX, never as a gate.** Navigation entries, route guards, and a small "show this only if permitted" component all check the same resolved permission set, which is delivered to the browser with the session. This decides what the user *sees*; it is purely about not showing dead ends. It is never the thing that actually protects data — the backend re-checks regardless. The frontend gates on permissions, never on role names, so the UI stays correct as roles change.

## Typed permission strings

The full list of valid permission strings is generated from the inventory into a single shared type. Both backend and frontend import it, so a typo in a permission string is a compile error rather than a silent "always denied." A drift check fails the build if the generated list ever falls out of step with the inventory.

## How to add or change access (the workflow, conceptually)

- **Add a new permission to an existing module:** add it to the inventory (and the module's local mirror), regenerate the shared permission list, then check it at the call site and, if it should appear in the UI, gate the relevant nav/route/component on it.
- **Add a new module:** declare its permissions and seed roles in the inventory; the module scaffolding wires the rest. Until the new module's permissions are in the inventory, the parity check will flag it — that is the guardrail working, telling you to update the single source of truth.
- **Change what a built-in role grants by default:** edit that role's permission list in the inventory. Because it is the one source, the change flows everywhere consistently.

## What is intentionally *not* here yet

- **Per-tenant customization of roles.** Today the permissions a built-in role grants are fixed defaults baked into the inventory. The resolver is already shaped to accept a per-tenant override layer (a delta of "also grant" / "revoke" on top of the defaults), so a future admin-facing matrix that lets each tenant tune its roles can be added without changing how resolution works. Foundation roles (`org.admin`, `tenant.admin`, `org.viewer`) are not customizable by design.
- **Tenant-authored brand-new roles**, **group-scoped checks for agent/automation actors**, and **bulk role assignment UX** are deliberate future work, not part of the current model.

## Mental checklist when reasoning about access

1. What permission string does this action require?
2. Does that string exist in the inventory (and therefore in the generated type)?
3. Which roles grant it — and does the wildcard/all-reads/implicit logic also reach it?
4. Is there a *scope* dimension (own vs any, or a specific group) beyond the flat permission?
5. Backend enforces it for real; the frontend only mirrors it for UX.
