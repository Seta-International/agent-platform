# How RBAC works

A technical guide to the access-control model — the mechanism, invariants, and edge cases — written so a contributor or an AI agent can reason precisely about authorization without reading source. It describes *how* decisions are made, not where the code lives. (For wiring and locations, see the architecture doc's RBAC section.)

## Model in one paragraph

Authorization is **role-based with a precomputed permission set**. Permissions are flat strings. Roles bundle permissions. A single reconciled **inventory** is the only hand-edited source of "what permissions exist" and "what each built-in role grants." At session-build time a pure **resolver** expands the user's role slugs into one immutable set of permission strings and attaches it to the session. Every authorization decision is then an O(1) set-membership test against that set. The backend is the only enforcement boundary; the frontend mirrors the same set purely to decide what to display.

---

## 1. Permission strings: grammar and scope

A permission is a dotted string `module.resource.action`:

- **module** — the owning module (`planner`, `knowledge`, `identity`, `agent`, …). One special case: the `core.*` namespace (tenant, audit) is owned by the identity module because those are foundation concerns.
- **resource** — the noun being acted on (`task`, `file`, `user`, `workflow.run`). A resource may itself contain dots (`agent.workflow.run` is a single resource).
- **action** — the verb, optionally with a **scope suffix**:
  - `read`, `write`, `create`, `update`, `delete`, `assign`, `approve`, … — plain verbs.
  - `.self` — only the actor's own objects (`agent.thread.read.self`).
  - `.any` — anyone's objects (`identity.user.read.any`).
  - `.tenant` / `.instance` — tenant-wide or a specific instance (`agent.workflow.run.read.tenant`).

The scope suffix is **part of the string**, not a separate dimension the resolver understands. `identity.user.read.self` and `identity.user.read.any` are two distinct, independent permissions; holding one says nothing about the other. Code that needs "self vs any" semantics checks for the specific string it requires. This keeps the resolver a dumb, fast set — all the policy lives in *which strings exist* and *which roles grant them*.

### Authoring form vs canonical form

Permissions are authored grouped — a **resource → list of actions** map (a "statement"), e.g. resource `knowledge.file` with actions `[read, write, delete]`. The canonical flat string is the cartesian product `resource + "." + action`, so that statement yields `knowledge.file.read`, `knowledge.file.write`, `knowledge.file.delete`. Multi-segment actions flatten the same way: resource `planner.group` with action `member.role.set` → `planner.group.member.role.set`. Grouped form is ergonomic for humans; the flat form is what everything checks. The two are mechanically interconvertible and must never disagree (enforced — see §8).

---

## 2. Roles and the resolution rules

A user is granted **role slugs** (e.g. `planner.contributor`), never bare permissions. There are three categories, resolved differently:

1. **Module roles** — enumerated bundles. `knowledge.viewer` grants exactly the permissions listed for it in the inventory.
2. **Foundation roles** — resolved by *rule*, not enumeration, so they stay correct as the permission catalogue grows:
   - `org.admin` and `tenant.admin` → **wildcard**: the entire universe of permissions. Never enumerated; computed as "all known permissions" at resolve time.
   - `org.viewer` → **all read permissions**: every permission string ending in `.read`. (See §6 for the precise rule and its boundary.)
3. **Implicit baseline** — a fixed, small set granted to *every* authenticated user irrespective of roles (use the assistant, read/update own profile, read/cancel own threads/workflow approvals). Always unioned in.

### The resolution algorithm (exact precedence)

Given the user's role slugs and the implicit baseline, the resolver produces the permission set as follows:

1. **Wildcard short-circuit.** If any held slug is `org.admin` or `tenant.admin`, return a copy of the *entire* permission universe and stop. (Admins are never narrowed by anything below.)
2. Otherwise, seed the result with the **implicit baseline**.
3. For each held slug:
   - If it is `org.viewer`, add every permission whose string ends in `.read`.
   - Else look up the slug's enumerated permissions; if the slug is unknown, **ignore it silently** (unknown roles contribute nothing — they never error and never grant).
   - Add those permissions, subject to any optional per-tenant overlay (§7).
4. Return the accumulated set (immutable).

Properties that follow from this shape:
- **Union semantics.** Multiple roles compose by union; more roles can only ever *add* permissions (absent an overlay revoke).
- **Unknown-role tolerance.** A stale or typo'd role slug is a no-op, not a crash — important because role slugs are free-form strings stored per grant.
- **No ordering effects** among non-wildcard roles (set union is commutative); wildcard is the only precedence rule.
- **Cost is O(total permissions granted)**, over an in-memory structure — cheap enough to run on every session build.

---

## 3. The single source of truth

Exactly one reconciled **inventory** is hand-edited. It declares, per module: the statement (resources → actions) and the seed role→permission map with human-readable role descriptions. From this one artifact, three consumers are *derived* (never hand-maintained in parallel):

- the **resolver's registry** used at runtime,
- the identity layer that answers "what can I do?",
- the generated, typed list of every valid permission string (shared by backend and frontend).

Because all three build from the same inventory, they are structurally incapable of drifting. Additionally, each module re-declares *its own slice* locally so the module's code can be type-checked against its own permissions; an automated **parity check** fails the build if a module's local statement ever diverges from the inventory. Net: the inventory is authoritative; module-local declarations are guarded mirrors; derived artifacts are regenerated.

---

## 4. The registry and its boot-time invariants

At startup the inventory is compiled into an in-memory **registry** — conceptually three indexes:

- the set of **all permission strings** (for wildcard expansion and existence checks),
- the subset of **read permissions** (strings ending `.read`, for `org.viewer`),
- a **map from role slug → its permission strings**.

Building the registry enforces two consistency invariants and **fails fast** (refuses to boot) if either is violated:

1. **No dangling grant** — every permission a role grants must be a real, declared permission. A role pointing at a permission that doesn't exist is a build/boot error, not a silent denial.
2. **No duplicate permission key** — the same permission string cannot be declared by two modules. Ownership is unambiguous.

These run at boot precisely so a bad inventory edit can never reach production as a subtle runtime authorization bug.

---

## 5. Session lifecycle and caching

Resolution happens at **session build** and again on **cache hydration** — never lazily per check, and never persisted.

- The expanded permission set is attached to the session object alongside the user's role summary.
- There are two cache layers: an in-memory hot cache of fully-built sessions, and a durable cache of the user's *role summary* (not the permission set). On a durable-cache hit, the permission set is **recomputed** from the cached roles rather than read back.
- **Why recompute, never store the set:** a deploy that adds/renames permissions or changes a role's defaults takes effect immediately, with no stale persisted permission blobs to migrate or invalidate. The registry is in-memory and the recompute is O(roles), so this is cheap.
- Session invalidation (e.g. a role grant/revoke) flows through the existing role-summary cache invalidation; the next build re-resolves.

---

## 6. The `org.viewer` rule and its deliberate boundary

`org.viewer` resolves to "every permission ending in `.read`." This is intentionally **mechanical** (a string-suffix test) so it stays correct without anyone maintaining a viewer list. The naming convention "the read verb is spelled `read`" exists to make this rule total.

Known, accepted boundary: permissions whose *scope suffix* follows the verb — e.g. `...read.tenant`, `...read.instance` — do **not** end in `.read` and are therefore **not** granted to `org.viewer`. Such tenant-wide/instance reads are considered operational rather than viewer-grade and must come from an explicit role. This is a conscious trade (mechanical simplicity over catching every "read-ish" string); changing it would mean teaching the resolver about scope suffixes, which the model deliberately avoids.

---

## 7. The overlay seam (per-tenant role customization, future)

Today a built-in role's permissions are fixed defaults from the inventory. The resolver already accepts an optional **overlay**: a per-tenant delta keyed by `(role, permission)` with two operations — `grant` (add a permission the default lacks) and `revoke` (remove one the default has). Application order within a role:

1. start from the role's default permissions,
2. drop any the overlay marks `revoke`,
3. add any the overlay marks `grant`.

When no overlay is supplied (the current state) resolution is seed-only, so behavior is unchanged. This seam exists so a future admin-facing matrix that lets each tenant tune its built-in roles is purely additive — no change to the resolution algorithm. Foundation roles (`org.admin`/`tenant.admin`/`org.viewer`) are **not** overlay-customizable by design; their rules are invariant.

---

## 8. Codegen and parity invariants

Three automated guarantees keep the system honest:

- **Generated permission type.** The full list of valid permission strings is generated from the inventory into one shared type imported by both backend and frontend. A mistyped permission is a compile error, not a silent "always denied." A **drift guard** regenerates in-memory and fails the build if the committed list disagrees with the inventory.
- **Per-module parity.** Each module's local statement is checked to equal its slice of the inventory (same permissions, same role permissions, same descriptions, same order). Catches a module mirror drifting from the source.
- **Aggregate parity.** The union of all module-contributed declarations is checked to equal the inventory-derived registry. Catches a module that forgot to contribute, or an inventory entry with no module behind it.

Together these make "the inventory, the runtime registry, the generated type, and every module's local view" provably identical at build time.

---

## 9. Enforcement: two independent layers

Authorization is split into two orthogonal questions:

1. **Resolution** — "does the actor hold permission X at all?" A flat membership test against the session's permission set. This is the universal check; it is uniform across every module.
2. **Scope** — "is *this specific object* within the actor's reach?" Permissions are tenant-global strings; they cannot express "tasks in groups you belong to" or "your own thread vs anyone's." Modules that need it layer a scope check *after* resolution succeeds — e.g. combine the `update` permission with a check that the target group is in the actor's accessible-group list, or that the target row is owned by the actor. Self-vs-any is sometimes encoded as distinct permission strings (`.self`/`.any`) and sometimes as a scope check, depending on the module.

Resolution and scope are independent: passing one says nothing about the other, and both must pass. Module wrappers exist to (a) throw the module's typed error and (b) apply scope — never to re-derive resolution.

### Fail-closed guarantees

- A missing/empty permission set denies (membership in an empty set is false) — there is no "default allow."
- The cross-service permission check refuses to run until it has been wired with a registry at boot; an unconfigured check throws rather than silently passing.
- The frontend, lacking a delivered set, treats absence as "no permissions" (hides everything) — and is never the security boundary regardless.

---

## 10. Actors beyond logged-in users

- **Cross-service / RPC calls** carry the actor's *role slugs* (compact) over the wire, not the expanded set. The receiving service **re-resolves** against its own registry and re-checks. Shipping slugs rather than the full set keeps the wire payload small and makes the callee authoritative — it cannot be tricked by a caller-supplied permission list.
- **Agent/LLM tool calls** thread the actor's resolved set through the request context; each tool re-checks its required permission before executing, so an agent can never exceed the invoking user's permissions.
- **System/automation actors** (e.g. background external-system sync) run with a **synthetic session** whose permission set is resolved through the *same* rules from a dedicated system role — there is no separate, hand-maintained permission path. Scope checks that don't apply to a tenant-wide system actor are bypassed explicitly and narrowly (e.g. group-scope), with tenant isolation still enforced by the domain logic.

---

## 11. The frontend mirror

The resolved set is serialized to the browser with the session. Navigation visibility, route guards, and a conditional-render primitive all test the *same* permission strings. This is **UX correctness only** — deciding what to show so users don't hit dead ends. The backend re-checks every action regardless, so a tampered or stale client cannot gain access. The frontend gates on permissions, never on role names, so the UI tracks permission changes automatically.

---

## 12. Reasoning checklist

When deciding whether an operation is allowed, or designing a new one:

1. **What exact permission string does it require?** (including any `.self`/`.any`/`.tenant` scope suffix)
2. **Does that string exist in the inventory** (and therefore the generated type and registry)? If not, it resolves for nobody but wildcard admins — add it to the inventory.
3. **Which roles grant it**, and do the wildcard / all-reads / implicit rules also reach it?
4. **Is there a scope dimension** (own-vs-any, group membership, ownership) beyond the flat permission? If so, that's a separate check after resolution.
5. **Is the path fail-closed** — does a missing set, unknown role, or unconfigured checker deny rather than allow?
6. Remember the backend enforces for real; the frontend only mirrors.
