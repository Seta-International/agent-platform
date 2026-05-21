# Seta — RBAC & Screens (v1)

**Status:** drafted 2026-05-19. Grounded in `requirements.md` §2.2, §4, §7.1e, §9, §14.1 and `architecture.md` §G + §H.3 + §J. This doc is the **definitive role / permission / screen contract** for v1. Where it conflicts with `requirements.md`, requirements wins and this doc is a bug.

This doc answers three questions:
1. **What roles exist?** (§1)
2. **What permission does each role hold?** (§2 + §3)
3. **What can each role *do* — which actions, which screens, which copilot tools?** (§4–§6)

If you need to add a feature, look up its required permission in §2, check who holds it in §3, decide what screens it needs in §6.

---

## Table of contents

- §0. Inconsistencies flagged for resolution
- §1. Role inventory
- §2. Permission catalog
- §3. Role × permission matrix
- §4. User-facing actions by role
- §5. Copilot — agent + tool RBAC
- §6. Screens inventory (Phase A / B / C)
- §7. Implementation notes
- §8. Open items

---

## §0. Inconsistencies flagged for resolution

| # | Where | Issue | Proposed resolution |
|---|---|---|---|
| 0.1 | §14.1 references `copilot.contributor+` for specialist-agent selector gate; §4.4 defines copilot roles as `copilot.admin / copilot.user / copilot.viewer` (no `contributor`) | Naming mismatch | **Rename `copilot.user → copilot.contributor`** for consistency with `planner.contributor`. Triplets uniform across all module-scoped roles (`admin / contributor / viewer`). This doc uses the renamed form throughout; `requirements.md §4.4` needs a one-line edit. |
| 0.2 | §4.4 says `org.viewer` is "read-only across every plan in the tenant" but doesn't specify whether `org.viewer` can read **copilot threads** of other users, **audit log**, or **integration health** | Scope undefined for non-planner reads | **`org.viewer` = read-only on planner + integrations health, NOT audit log, NOT other users' chat threads.** Audit log requires explicit `core.audit.read` (per §4.4 wording). Chat threads are per-user private (§7.4) — `org.viewer` doesn't trump that. |
| 0.3 | §4.2 says role grants can be tenant-wide *or* group-scoped (via `scope_type` / `scope_id`) but §4.4 doesn't say which seeded roles support which scope | Underspecified | **Tenant-scoped only:** `org.*`, `identity.*`, `copilot.*`, `integrations.*`. **Group-scoped capable:** `planner.*` (a user can be `planner.contributor` in one group and `planner.viewer` in another). |
| 0.4 | §3.5 enforces ≥2 `org.admin`s but §4.4 doesn't say anything about minimum-counts for other roles | Counts | **Only `org.admin` carries the ≥2 minimum.** All other roles allow zero grants (a tenant with no `integrations.admin` simply cannot configure integrations — that's a tenant choice, not an error). |

If you disagree with any of these, push back before implementation starts — they bake into the seed migration.

---

## §1. Role inventory

Three tiers: **instance** (above any tenant), **tenant-wide** (whole tenant), **module-scoped** (one module within a tenant; may be group-scoped for `planner`).

### §1.1 Instance-level roles

| Role | Scope | Purpose | Granted by |
|---|---|---|---|
| `superadmin` | Instance | Operator of the entire instance. Manages tenants + instance config. Cannot read tenant business data. | Bootstrapped at install; new superadmins added by existing superadmins. |

**Cardinality.** ≥1 required at all times (instance cannot run without one). Recommended ≥2 for break-glass. Per §2.5 / §9.2: superadmin scope is **tenant management + instance config only** — no read access to tasks/plans/comments/users in any tenant.

### §1.2 Tenant-wide roles (contributed by `core`)

| Role | Scope | Purpose | Granted by |
|---|---|---|---|
| `org.admin` | Tenant | Bypass within the tenant. Holds every permission across every module. Audit-log read. | Initially: designated by superadmin at tenant creation. Subsequently: by other `org.admin`s. |
| `org.viewer` | Tenant | Read-only across every plan + every integration health view in the tenant. No writes, no member management, no audit, no other-user chat. Designed for CEO / CTO / Head of Delivery / PMO. | `org.admin`. |

**Cardinality.** `org.admin` ≥ 2 enforced (§3.5). `org.viewer` allows zero or more.

**v1.x candidates** (per §11.1 / §4.4): `org.auditor` (just `core.audit.read`), `org.pmo` (cross-group governance — priority/due-date edits without create/delete). Both ship as one-line role definitions when needed.

### §1.3 Module-scoped roles

Each module contributes its role triplet via `ContributionRegistry.roles()` at boot (per `architecture.md §C.2`). All module triplets follow the **same `admin / contributor / viewer`** shape after the §0.1 rename.

| Module | Roles | Default scope |
|---|---|---|
| `identity` | `identity.admin`, `identity.viewer` | Tenant |
| `planner` | `planner.admin`, `planner.contributor`, `planner.viewer` | Group-scoped (a user holds different roles in different groups) **or** tenant-wide for `planner.admin` |
| `copilot` | `copilot.admin`, `copilot.contributor`, `copilot.viewer` | Tenant |
| `integrations` | `integrations.admin`, `integrations.viewer` | Tenant |

**Why `identity` has only admin/viewer (no contributor):** identity has no "user-authored content" tier — there's nothing for a `contributor` to *contribute*. Users edit their own profile via implicit "self" permissions (§4); admins manage others.

**Why `integrations` has only admin/viewer:** same reason — integrations are configured (admin) or observed (viewer), never "contributed to." A user setting up MCP credentials is doing admin work.

**Why `planner` is group-scoped:** §5.1 — group membership is the access boundary in v1. `planner.contributor` in `Engineering` group ≠ `planner.contributor` in `Marketing` group; each requires a separate grant. `planner.admin` may be granted tenant-wide (rare; usually used to bootstrap) or group-scoped (typical, for team leads).

### §1.4 Role overlap and aggregation

A user holds **zero or more grants** across these tiers. Effective permission set is the **union** of all granted roles' permission bundles, with these rules:

- `org.admin` grant ⇒ all permissions in the tenant (short-circuits the union; see §3).
- Group-scoped grants contribute permissions only when evaluated against that group's resources. `planner.contributor` in Engineering does **not** let you edit Marketing tasks.
- Tenant-scoped grants contribute regardless of resource group.
- `org.viewer` grant adds tenant-wide read on planner + integrations health (handled by special pre-check, not by injecting permission strings — see §7.2).

### §1.5 Group-scoped grant mechanics

Schema (per `architecture.md §E.2`):

```sql
identity.role_grants (
  user_id     uuid not null,
  tenant_id   uuid not null,
  role_slug   text not null,         -- 'planner.contributor'
  scope_type  text not null,         -- 'tenant' | 'group'
  scope_id    text,                  -- null when scope_type='tenant'; group_id when 'group'
  ...
);
```

- A `planner.*` grant with `scope_type='group'` carries the group id in `scope_id`. The permission-check function (§7.1) only honors it for resources inside that group.
- A `planner.*` grant with `scope_type='tenant'` (rare) carries `scope_id=null` and applies to every group.
- Non-planner roles ignore `scope_id` (the field is null for them by validation).

---

## §2. Permission catalog

Permissions are flat strings, `<module>.<resource>.<action>` (per §4.1). Below is the **full v1 catalog**. Permission additions in Phase B / C are flagged inline.

### §2.1 `core.*`

| Permission | Description | Used by |
|---|---|---|
| `core.audit.read` | Read the tenant's audit log | `org.admin` bundle; `org.auditor` v1.x |
| `core.tenant.read` | Read tenant settings (idle timeout, cost cap, etc.) | `org.admin` bundle |
| `core.tenant.write` | Edit tenant settings | `org.admin` bundle |
| `superadmin.tenant.create` | (Instance) Create new tenants | `superadmin` only |
| `superadmin.tenant.suspend` | (Instance) Suspend a tenant | `superadmin` only |
| `superadmin.tenant.delete` | (Instance) Hard-delete a tenant after the soft-delete window | `superadmin` only |
| `superadmin.instance.config` | (Instance) Edit instance-wide config (LLM provider creds, auth providers, feature toggles) | `superadmin` only |
| `superadmin.instance.audit.read` | (Instance) Read instance-wide audit (tenant-created, provider-configured, etc.) | `superadmin` only |
| `superadmin.tenant.health.read` | (Instance) Per-tenant operational health (seat counts, sync status, error rates — no business data) | `superadmin` only |

### §2.2 `identity.*`

| Permission | Description |
|---|---|
| `identity.user.read.self` | Read own profile |
| `identity.user.write.self` | Edit own profile (skills, availability, working hours, timezone) |
| `identity.user.read.any` | Read any tenant member's profile |
| `identity.user.write.any` | Edit any tenant member's profile (admin override) |
| `identity.user.invite` | Invite a new user to the tenant |
| `identity.user.deactivate` | Deactivate a tenant member |
| `identity.role_grant.read` | View role grants for any user |
| `identity.role_grant.write` | Grant / revoke roles for any user |
| `identity.idp_mapping.read` | (Phase B) View Entra-group → role mappings |
| `identity.idp_mapping.write` | (Phase B) Configure Entra-group → role mappings |
| `identity.password.disable_local` | Toggle the "disable local password" per-tenant flag |
| `identity.concept_map.read` | Read the tenant skill concept map (§3.9.1) |
| `identity.concept_map.write` | Edit the tenant skill concept map |

### §2.3 `planner.*`

All `planner.*` permissions are **evaluated in a group scope**. Holding `planner.task.read` via a group-scoped grant means "read tasks inside that group"; via a tenant-scoped grant means "read tasks in any group of this tenant"; via `org.viewer` short-circuit means "read tasks in any group, but only read."

| Permission | Description |
|---|---|
| `planner.group.read` | List / view groups |
| `planner.group.create` | Create a new group |
| `planner.group.update` | Rename / edit group metadata |
| `planner.group.delete` | Delete a group (soft) |
| `planner.group.member.read` | View group members |
| `planner.group.member.write` | Add / remove group members |
| `planner.plan.read` | View plans in accessible groups |
| `planner.plan.create` | Create a plan |
| `planner.plan.update` | Edit plan metadata |
| `planner.plan.delete` | Delete a plan (soft) |
| `planner.bucket.read` | View buckets |
| `planner.bucket.create` | Create a bucket |
| `planner.bucket.update` | Rename / reorder buckets |
| `planner.bucket.delete` | Delete a bucket |
| `planner.task.read` | View tasks |
| `planner.task.create` | Create a task |
| `planner.task.update` | Edit task fields (title, description, dates, priority, progress, labels, checklist, skill_tags, review_state) |
| `planner.task.assign` | Assign / unassign users on a task |
| `planner.task.delete` | Delete a task (soft) |
| `planner.task.bulk` | Run bulk operations on tasks (Phase B) |
| `planner.task.review_state.write` | Toggle review_state — folded into `planner.task.update`; explicit so future workflow gates can split it |
| `planner.label.read` / `.write` | Manage per-plan labels |
| `planner.checklist.write` | Manage checklist items on a task |
| `planner.comment.read` / `.create` / `.delete` (Phase B) | Comments |
| `planner.attachment.read` / `.create` / `.delete` (Phase B) | Attachments |
| `planner.trash.read` / `.restore` / `.empty` | Trash management (Phase B UI; Phase A backend exists) |

### §2.4 `copilot.*`

| Permission | Description |
|---|---|
| `copilot.chat.use` | Open the copilot, send messages, use the Supervisor agent |
| `copilot.specialist.use` | Use specialist agents (`planner.agent`, `staffing.agent`) directly from the agent selector |
| `copilot.thread.read.self` | Read own chat threads |
| `copilot.thread.write.self` | Create / delete own threads |
| `copilot.thread.erase.any` | (Admin / DSR) Erase any user's threads — for GDPR DSR (§10.1); rarely exercised |
| `copilot.workflow.run.read.self` | Read own workflow runs in the Workflows tab |
| `copilot.workflow.run.read.tenant` | Read all workflow runs in the tenant (§7.3 agent-ops) |
| `copilot.workflow.run.read.instance` | Read all workflow runs across all tenants (superadmin) |
| `copilot.workflow.run.execute.self` | Re-run own (or otherwise-visible) workflow runs |
| `copilot.workflow.approve` | Act on an assigned HITL approval card |
| `copilot.config.read` | Read copilot config (model, custom instructions, tool allowlist) |
| `copilot.config.write` | Edit copilot config |
| `copilot.rate_limit.read` | View per-tenant AI cost / token usage |
| `staffing.read` | Invoke staffing read primitives (`match_users_to_topic`, `infer_user_skills_from_history`, `get_user_availability`, `compute_workload`, `get_leave_overlap`). Separate from `copilot.chat.use` because cross-group expansion needs a different gate — see §7.2. Per D15 there is no `recommend_reviewers` macro tool; gating applies at the primitive level. |

**Note on tool-level gating.** Each copilot tool declares a `requiredPermission` (per `architecture.md §C.1`). Tools are filtered out of the per-session Agent's tool list when the user lacks the permission (§A8). Read tools require `planner.task.read` etc.; write tools require `planner.task.create` etc. The user does NOT need a separate `copilot.tool.<x>` permission for each tool — the permission is the underlying domain permission.

### §2.5 `integrations.*`

| Permission | Description |
|---|---|
| `integrations.mcp.read` | View configured MCP clients |
| `integrations.mcp.write` | Add / edit / remove MCP clients (incl. Timesheet) |
| `integrations.mcp.health.read` | View MCP health (last invoked, last failure, state) |
| `integrations.binding.read` (Phase B) | View MS Planner bindings |
| `integrations.binding.write` (Phase B) | Create / disconnect bindings |
| `integrations.conflict.read` (Phase B) | View sync conflict log |
| `integrations.conflict.resolve` (Phase B) | Resolve conflicts (HITL) |
| `integrations.translation.read` (Phase B) | View translation log |

---

## §3. Role × permission matrix

`✓` = granted. Cells left blank = not granted.

`org.admin` is a bypass — it short-circuits to "all permissions for this tenant." It is listed here for completeness; in code, the permission check returns true for any string if the user holds `org.admin`.

`superadmin` is instance-level — listed in a separate column because its permissions are also instance-level (do not apply to tenant business data).

### §3.1 Tenant-wide roles

| Permission | org.admin | org.viewer |
|---|:---:|:---:|
| `core.audit.read` | ✓ | |
| `core.tenant.read` | ✓ | ✓ |
| `core.tenant.write` | ✓ | |
| All `identity.*.read.*` | ✓ | ✓ (members list only — not role_grant, not failed_login) |
| All `identity.*.write.*` | ✓ | |
| `identity.user.read.self` | ✓ (implicit for any logged-in user) | ✓ |
| `identity.user.write.self` | ✓ | ✓ |
| All `planner.*.read` | ✓ | ✓ (tenant-wide read short-circuit) |
| All `planner.*.write` | ✓ | |
| `copilot.chat.use` | ✓ | ✓ |
| `copilot.specialist.use` | ✓ | (no — viewer should not directly use specialists) |
| `copilot.thread.*.self` | ✓ | ✓ |
| `copilot.thread.erase.any` | ✓ | |
| `copilot.workflow.run.read.tenant` | ✓ | ✓ |
| `copilot.config.*` | ✓ | |
| `copilot.rate_limit.read` | ✓ | ✓ |
| `staffing.read` | ✓ | ✓ (read-only primitives; no writes) |
| All `integrations.*.read` | ✓ | ✓ |
| All `integrations.*.write` | ✓ | |

**Implicit self-permissions for any authenticated user** (no grant required):
- `identity.user.read.self`, `identity.user.write.self`
- `copilot.chat.use`, `copilot.thread.read.self`, `copilot.thread.write.self`, `copilot.workflow.run.read.self`

These are baseline — every logged-in tenant member gets them. Grants only *add* beyond this baseline.

### §3.2 Module-scoped roles

#### identity

| Permission | identity.admin | identity.viewer |
|---|:---:|:---:|
| `identity.user.read.any` | ✓ | ✓ |
| `identity.user.write.any` | ✓ | |
| `identity.user.invite` | ✓ | |
| `identity.user.deactivate` | ✓ | |
| `identity.role_grant.read` | ✓ | ✓ |
| `identity.role_grant.write` | ✓ | |
| `identity.idp_mapping.*` (Phase B) | ✓ | read-only |
| `identity.password.disable_local` | ✓ | |
| `identity.concept_map.read` | ✓ | ✓ |
| `identity.concept_map.write` | ✓ | |

#### planner (evaluated in group scope)

| Permission | planner.admin | planner.contributor | planner.viewer |
|---|:---:|:---:|:---:|
| `planner.group.read` | ✓ | ✓ | ✓ |
| `planner.group.create` | ✓ | | |
| `planner.group.update` | ✓ | | |
| `planner.group.delete` | ✓ | | |
| `planner.group.member.read` | ✓ | ✓ | ✓ |
| `planner.group.member.write` | ✓ | | |
| `planner.plan.read` | ✓ | ✓ | ✓ |
| `planner.plan.create` | ✓ | ✓ | |
| `planner.plan.update` | ✓ | ✓ | |
| `planner.plan.delete` | ✓ | | |
| `planner.bucket.*` | ✓ all | ✓ read/create/update | ✓ read |
| `planner.task.read` | ✓ | ✓ | ✓ |
| `planner.task.create` | ✓ | ✓ | |
| `planner.task.update` | ✓ | ✓ | |
| `planner.task.assign` | ✓ | ✓ | |
| `planner.task.delete` | ✓ | ✓ (own-created); ✗ others | |
| `planner.task.bulk` (Phase B) | ✓ | ✓ | |
| `planner.label.*` | ✓ | ✓ | read |
| `planner.checklist.write` | ✓ | ✓ | |
| `planner.comment.*` (Phase B) | ✓ | ✓ (create/own-delete) | ✓ read |
| `planner.attachment.*` (Phase B) | ✓ | ✓ | ✓ read |
| `planner.trash.read` | ✓ | ✓ | ✓ |
| `planner.trash.restore` | ✓ | | |
| `planner.trash.empty` | ✓ | | |

#### copilot

| Permission | copilot.admin | copilot.contributor | copilot.viewer |
|---|:---:|:---:|:---:|
| `copilot.chat.use` | ✓ | ✓ | ✓ (read tools only — chat works, write tools filtered out) |
| `copilot.specialist.use` | ✓ | ✓ | |
| `copilot.thread.*.self` | ✓ | ✓ | ✓ |
| `copilot.thread.erase.any` | ✓ | | |
| `copilot.workflow.run.read.self` | ✓ | ✓ | ✓ |
| `copilot.workflow.run.read.tenant` | ✓ | | ✓ |
| `copilot.workflow.run.execute.self` | ✓ | ✓ | |
| `copilot.workflow.approve` | ✓ | ✓ | |
| `copilot.config.read` | ✓ | | ✓ |
| `copilot.config.write` | ✓ | | |
| `copilot.rate_limit.read` | ✓ | | ✓ |
| `staffing.read` | ✓ | ✓ | ✓ |

**`copilot.viewer` use-case.** Internal "AI ops" persona: see who's using the copilot, total token spend, workflow run history — but not personally use the specialists. Same person often holds `copilot.viewer` + `copilot.contributor` so they can also chat.

#### integrations

| Permission | integrations.admin | integrations.viewer |
|---|:---:|:---:|
| `integrations.mcp.read` | ✓ | ✓ |
| `integrations.mcp.write` | ✓ | |
| `integrations.mcp.health.read` | ✓ | ✓ |
| `integrations.binding.*` (Phase B) | ✓ | read |
| `integrations.conflict.read` (Phase B) | ✓ | ✓ |
| `integrations.conflict.resolve` (Phase B) | ✓ | |
| `integrations.translation.read` (Phase B) | ✓ | ✓ |

#### superadmin (instance-level)

| Permission | superadmin |
|---|:---:|
| All `superadmin.*` | ✓ |
| All tenant business data permissions (`planner.*`, `identity.*`, etc.) | (none — explicitly blocked per §2.5) |

---

## §4. User-facing actions by role

This section answers "what can role X do?" in terms of features, not permission strings.

### §4.1 Authentication & profile (everyone)

| Action | Anyone | Notes |
|---|:---:|---|
| Log in with email/password | ✓ | Subject to per-tenant policy + backoff (§3.8) |
| Log in with Entra (Phase B) | ✓ | If tenant has Entra connected |
| Reset password | ✓ | Self-serve via email token |
| Verify email (first login) | ✓ | Required for local-password accounts |
| View own profile | ✓ | Implicit self-permission |
| Edit own skills, availability_status, ooo_until, timezone, working_hours | ✓ | Visible to other tenant members (§3.9.5) |
| Open standalone Copilot, send messages to Supervisor | ✓ | Baseline `copilot.chat.use` |
| Manage own chat threads (create, rename, delete) | ✓ | Per-user private |
| View own workflow runs in Workflows tab | ✓ | Self-scoped |

### §4.2 Planner-domain actions (in a group the user has access to)

| Action | viewer | contributor | admin |
|---|:---:|:---:|:---:|
| View groups, plans, buckets, tasks | ✓ | ✓ | ✓ |
| View group members | ✓ | ✓ | ✓ |
| Create / edit / delete tasks | | ✓ | ✓ |
| Assign / unassign users on tasks | | ✓ | ✓ |
| Toggle task `review_state` | | ✓ | ✓ |
| Edit task `skill_tags` | | ✓ | ✓ |
| Create / edit plans, buckets | | ✓ (plan + bucket) | ✓ |
| Delete plans | | | ✓ |
| Create / rename / delete group | | | ✓ |
| Add / remove group members | | | ✓ |
| Restore from trash | | | ✓ |
| Bulk operations (Phase B) | | ✓ | ✓ |
| Add comments / @mention (Phase B) | | ✓ | ✓ |
| Upload attachments (Phase B) | | ✓ | ✓ |

### §4.3 Identity & member management

| Action | identity.viewer | identity.admin |
|---|:---:|:---:|
| List tenant members | ✓ | ✓ |
| View any member's profile | ✓ | ✓ |
| Edit any member's profile (admin override) | | ✓ |
| Invite a user | | ✓ |
| Deactivate a user | | ✓ |
| View role grants for any user | ✓ | ✓ |
| Grant / revoke roles | | ✓ |
| Configure IdP-group mappings (Phase B) | view | ✓ |
| Toggle "disable local password" | | ✓ |
| Edit tenant skill concept map | | ✓ |

### §4.4 Copilot actions

| Action | viewer | contributor | admin |
|---|:---:|:---:|:---:|
| Open Copilot, chat with Supervisor | ✓ (read-tools only) | ✓ | ✓ |
| Pick specialist agent from selector (`planner.agent`, `staffing.agent`) | | ✓ | ✓ |
| Invoke write tools (HITL-gated) | | ✓ (within own domain permissions) | ✓ |
| Invoke staffing read primitives (`match_users_to_topic`, etc.) — agent composes them into the §7.2.2 recipe | ✓ | ✓ | ✓ |
| View all workflow runs in tenant (§7.3 ops view) | ✓ | | ✓ |
| Edit copilot config (model, custom instructions, tool allowlist) | | | ✓ |
| View per-tenant AI cost / token usage | ✓ | | ✓ |
| Erase another user's chat threads (DSR) | | | ✓ |

### §4.5 Integrations

| Action | integrations.viewer | integrations.admin |
|---|:---:|:---:|
| View configured MCP clients (Timesheet) | ✓ | ✓ |
| Configure Timesheet MCP (endpoint, credentials) | | ✓ |
| View MCP health (last invoked, last failure, state) | ✓ | ✓ |
| Connect / disconnect MS Planner binding (Phase B) | view | ✓ |
| View sync conflict log (Phase B) | ✓ | ✓ |
| Resolve sync conflicts via HITL (Phase B) | | ✓ |

### §4.6 Tenant administration (`org.admin` only)

| Action | org.admin |
|---|:---:|
| Edit tenant settings (idle timeout, AI cost cap, attachment quota) | ✓ |
| View tenant audit log | ✓ |
| Export audit log (JSON / CSV) — Phase B | ✓ |
| Add / remove other `org.admin`s (subject to ≥2 minimum) | ✓ |
| Bypass any module's permission check within the tenant | ✓ |

### §4.7 Org-wide read (`org.viewer`)

| Action | org.viewer |
|---|:---:|
| Read every plan / task / group in the tenant — across all groups, no group-membership requirement | ✓ |
| Read every group's member list | ✓ |
| Read every integration's health view | ✓ |
| Read tenant settings (cost cap, etc.) | ✓ |
| Read other users' chat threads | ✗ |
| Read audit log | ✗ |
| Write *anything* | ✗ |

### §4.8 Instance operator (`superadmin`)

| Action | superadmin |
|---|:---:|
| Create a tenant | ✓ |
| Designate the initial `org.admin` of a tenant | ✓ |
| Suspend a tenant | ✓ |
| Delete a tenant (after soft-delete window) | ✓ |
| Edit instance-wide config (LLM provider, auth providers, sub-processor list, feature toggles) | ✓ |
| View instance-wide audit (tenant-created etc. — not business data) | ✓ |
| View per-tenant operational health (seat counts, sync status, error rates) | ✓ |
| Read tenant business data (tasks, users, comments, chat threads, profiles) | ✗ (explicitly blocked) |
| Be granted a tenant-level role inside any tenant | ✗ (superadmin is instance-only) |

---

## §5. Copilot — agent + tool RBAC

§7.1e + §A8 + §H.3 set the architectural shape. This section enumerates the user-visible gates.

### §5.1 Agent selector gating

The agent selector in the standalone Copilot module exposes:

| Agent | Visible to | Notes |
|---|---|---|
| **Supervisor (`router`)** | Anyone with `copilot.chat.use` (= everyone authenticated) | Always the default. Routes to specialists internally even when the user picks Supervisor. |
| **`planner.agent`** specialist | `copilot.specialist.use` (held by `copilot.contributor`, `copilot.admin`, `org.admin`) | Lets the user bypass routing and talk directly to the planner specialist. |
| **`staffing.agent`** specialist | `copilot.specialist.use` | Same. |

Users without `copilot.specialist.use` see only "Supervisor" in the selector. They can still receive output from any specialist — the Supervisor delegates internally on their behalf. The gate prevents *direct* selection only.

### §5.2 Tool RBAC (per-session filtering)

Per `architecture.md §A8`: tools are filtered into the per-session Agent's tool list based on `(session.role_summary, tool.requiredPermission)`. A user without the permission sees the tool as **absent** — not "tool returned permission denied." This matters because the LLM doesn't know to try a tool it can't see, so it doesn't generate spurious permission errors.

| Tool | `requiredPermission` | HITL? | Notes |
|---|---|:---:|---|
| `planner.list_my_accessible_groups` | `planner.group.read` | | |
| `planner.list_tasks` | `planner.task.read` | | Result rows already filtered by `accessible_group_ids` in SQL |
| `planner.search_tasks_semantic` | `planner.task.read` | | Same SQL filter |
| `planner.get_task` | `planner.task.read` | | |
| `planner.create_task` | `planner.task.create` | ✓ | |
| `planner.update_task` | `planner.task.update` | ✓ | |
| `planner.assign_task` | `planner.task.assign` | ✓ | |
| `planner.unassign_task` | `planner.task.assign` | ✓ | |
| `planner.add_skill_tag` | `planner.task.update` | ✓ | |
| `planner.toggle_review_state` | `planner.task.update` | ✓ | |
| `planner.create_group` (Phase A bootstrap) | `planner.group.create` | ✓ | Lets new tenants bootstrap via chat without UI |
| `planner.create_plan` (Phase A bootstrap) | `planner.plan.create` | ✓ | Same |
| `planner.create_bucket` (Phase A bootstrap) | `planner.bucket.create` | ✓ | Same |
| `staffing.match_users_to_topic` | `staffing.read` | | Cross-group expansion (`scope: 'tenant'`) gated by `org.viewer` OR `planner.task.read` in the target group |
| `staffing.infer_user_skills_from_history` | `staffing.read` | | |
| `staffing.get_user_availability` | `staffing.read` | | |
| `staffing.compute_workload` | `staffing.read` | | |
| `staffing.get_leave_overlap` | `staffing.read` | | |
| `planner.infer_task_topics` | `planner.task.read` | | Same primitive consumed by the `new-task-skill-tag-suggester` workflow |

### §5.3 HITL confirmation flow (re-stated for visibility)

Every tool marked HITL renders an assistant-ui Interactable card before execution. The card shows:
- Tool name, human-readable description.
- Parsed inputs (task id → task title; user id → display name).
- "Confirm" / "Cancel" buttons.

User confirms → handler runs in `core.emit()` tx → audit row written → result streams back. User cancels → `output-error` with `USER_REJECTED`; LLM is informed and responds. 10-min card timeout → `APPROVAL_TIMEOUT`.

### §5.4 Tool-level audit attribution

Every tool invocation writes a `core.audit` row with:
- `actor_kind = 'agent'`
- `actor_user_id = session.user_id` (the human prompter, per §8.1 actor model)
- `action = '<tool.key>'` (e.g., `planner.assign_task`)
- `before / after` carry the tool's input + output.
- `trace_id` links to the chat turn's OTel trace.

There is no separate audit attribution for "the agent did it" — the human who prompted is the actor. The agent name shows up in `before.agent_key` for forensic reconstruction.

---

## §6. Screens inventory

Phase A is the standalone Copilot module + the minimum admin / settings surfaces to make it self-sufficient (§14.1). Phase B opens the planner UI, Entra mapping, audit browser. Phase C polishes (DSR, MFA, concept-map editor).

### §6.1 Phase A screens (~12)

| # | Screen | Route | Owner module (frontend) | Role gate | Notes |
|---|---|---|---|---|---|
| A1 | **Login** | `/login` | identity | unauthenticated | Email + password; "forgot password" link |
| A2 | **Password reset request** | `/forgot-password` | identity | unauthenticated | Enter email → email sent |
| A3 | **Password reset confirm** | `/reset-password?token=...` | identity | unauthenticated (token-gated) | Set new password; HIBP check is Phase B |
| A4 | **Email verification** | `/verify-email?token=...` | identity | unauthenticated (token-gated) | First-login verification for local accounts |
| A5 | **User profile / settings** | `/settings/profile` | identity | any authenticated | Self-edit skills, availability, ooo_until, timezone, working_hours; view but not edit role grants |
| A6 | **Standalone Copilot — Chat** | `/copilot/chat` (default) | copilot | `copilot.chat.use` (= everyone) | Sidebar (threads), agent selector, chat pane, HITL cards |
| A7 | **Standalone Copilot — Workflows** | `/copilot/workflows` | copilot | `copilot.workflow.run.read.self` (everyone) | Inbox-style list; role-shaped visibility (own / tenant / instance) |
| A8 | **Workflow run drilldown** | `/copilot/workflows/:runId` | copilot | same as A7 + the run must be in scope | Step graph + timing + logs + emitted events |
| A9 | **Tenant admin — Users** | `/admin/users` | admin (in `apps/web/modules/admin`) | `identity.user.read.any` (view); `identity.user.invite` + `identity.role_grant.write` (act) | Bare-bones: list, invite, grant/revoke role, deactivate |
| A10 | **Superadmin — Tenants** | `/super/tenants` | admin | `superadmin` | Bare-bones: list, create, designate initial admin, suspend |
| A11 | **Integrations — Timesheet MCP config** | `/integrations/timesheet` | integrations | `integrations.mcp.read` (view); `integrations.mcp.write` (edit) | Set endpoint URL, credentials (sent to Secrets Manager), test connection, health view |
| A12 | **403 / not-authorized error page** | (overlay) | shell | any | Returned by client when route gate fails; explains which permission is missing |

Plus standard empty-state and error pages (shell-owned).

### §6.2 Phase B screens (deferred — backend already supports them)

| # | Screen | Route | Role gate | Notes |
|---|---|---|---|---|
| B1 | **Planner — Groups list** | `/planner/groups` | `planner.group.read` (any group) OR `org.viewer` | Empty state CTA: "Create your first group" |
| B2 | **Planner — Group detail** | `/planner/groups/:id` | `planner.group.read` for that group OR `org.viewer` | Plans inside the group; member list |
| B3 | **Planner — Plan / Kanban board** | `/planner/plans/:id` | `planner.plan.read` for the plan's group OR `org.viewer` | The main work surface — buckets + tasks, DnD, SSE board updates |
| B4 | **Planner — Task detail (Sheet)** | `/planner/plans/:id?task=:taskId` | `planner.task.read` | Slide-in sheet; inline edits (title, description, dates, priority, progress, labels, skill_tags, review_state, checklist, assignees) |
| B5 | **Planner — Task search** | `/planner/search` | `planner.task.read` (results filtered by access) | Postgres FTS + semantic via copilot tool |
| B6 | **Planner — Trash** | `/planner/trash` | `planner.trash.read`; restore requires `planner.trash.restore` | Per-tenant trash; restore / empty |
| B7 | **Tenant admin — IdP mappings (Entra group → role)** | `/admin/idp-mappings` | `identity.idp_mapping.read` (view); `identity.idp_mapping.write` (edit) | One row per Entra-group / Seta-role pair |
| B8 | **Tenant admin — Integration health** | `/admin/integrations/health` | `integrations.binding.read` OR `integrations.mcp.health.read` | Last sync, error counts, dead-letter queue size |
| B9 | **Tenant admin — Audit log browser** | `/admin/audit` | `core.audit.read` | Filterable list; export CSV/JSON (Phase C export) |
| B10 | **Tenant admin — Tenant settings** | `/admin/settings` | `core.tenant.write` | Idle timeout, AI cost cap, attachment quota, disable-local-password toggle |
| B11 | **Tenant admin — Concept map (skills)** | `/admin/skills/concept-map` | `identity.concept_map.write` | Tenant overrides the seeded map (§3.9.1) |
| B12 | **Sync — Connection setup (MS Planner)** | `/integrations/planner/connect` | `integrations.binding.write` | OAuth consent + plan binding picker |
| B13 | **Sync — Bindings list + drilldown** | `/integrations/planner/bindings` | `integrations.binding.read` | Per-binding health, conflict count, last sync |
| B14 | **Sync — Conflict log** | `/integrations/planner/conflicts` | `integrations.conflict.read`; resolve via `integrations.conflict.resolve` | Field-level diffs; resolution via HITL card in copilot |
| B15 | **Notifications feed** | overlay panel | any authenticated | @mentions, assignments, due-date approach |
| B16 | **Embedded copilot panel** | inside every planner page | `copilot.chat.use` | Right-side drawer; shares threads with standalone Copilot |
| B17 | **Workflows tab (expanded with §7.3 ops dashboards)** | `/copilot/ops` | `copilot.workflow.run.read.tenant` (tenant) or `copilot.workflow.run.read.instance` (superadmin) | Role-shaped: per-user / tenant / instance |

### §6.3 Phase C screens

| # | Screen | Role gate | Notes |
|---|---|---|---|
| C1 | DSR — Export user data | `org.admin` | Triggers `copilot.exportUserThreads` + planner export; S3 signed URL returned |
| C2 | DSR — Erase user data | `org.admin` | Cascading delete; per-table tomb-stoning |
| C3 | Cost dashboard — per-tenant | `copilot.rate_limit.read` | Token / USD spend over time |
| C4 | Tenant — Attachment quota config | `core.tenant.write` | Per-tenant quota with current usage gauge |
| C5 | MFA setup (TOTP) | any authenticated | Per-user |
| C6 | Tenant — Account-collision admin tool | `org.admin` | Link local-password account into Entra (§3.3b) |
| C7 | Audit export | `core.audit.read` | JSON / CSV download |
| C8 | Tenant knowledge — RAG corpus management | `copilot.config.write` | Upload / paste tenant-specific docs for retrieval |
| C9 | Superadmin — Instance audit | `superadmin.instance.audit.read` | Filter by tenant-created, provider-changed, etc. |
| C10 | Superadmin — Per-tenant health drilldown | `superadmin.tenant.health.read` | Metrics only — no business data |
| C11 | Superadmin — Instance config | `superadmin.instance.config` | Auth providers, LLM provider, sub-processor list, feature toggles |

### §6.4 Per-screen access matrix (Phase A — at-a-glance)

✓ = can open and use; **R** = read-only (some controls hidden / disabled); ✗ = redirected to 403.

| Screen | unauth | self | identity.viewer | identity.admin | planner.viewer | planner.contributor | planner.admin | copilot.viewer | copilot.contributor | copilot.admin | integrations.viewer | integrations.admin | org.viewer | org.admin | superadmin |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| A1 Login | ✓ | redir | redir | redir | redir | redir | redir | redir | redir | redir | redir | redir | redir | redir | redir |
| A2 Password reset request | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| A3 Password reset confirm | ✓ (token) | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| A4 Email verify | ✓ (token) | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| A5 Profile / settings | ✗ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ (no tenant scope) |
| A6 Copilot Chat | ✗ | ✓ (Supervisor only) | ✓ (Supervisor only) | ✓ | ✓ (Supervisor only) | ✓ (Supervisor only) | ✓ | ✓ (Supervisor only — read tools only) | ✓ (specialists OK) | ✓ | ✓ (Supervisor only) | ✓ | ✓ (Supervisor only) | ✓ | ✗ |
| A7 Workflows tab (self) | ✗ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ tenant-wide | ✓ | ✓ tenant-wide | ✓ | ✓ | ✓ tenant-wide | ✓ tenant-wide | ✗ |
| A8 Workflow run drilldown | ✗ | ✓ (own runs) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ tenant | ✓ | ✓ tenant | ✓ | ✓ | ✓ tenant | ✓ tenant | ✗ |
| A9 Tenant admin — Users | ✗ | ✗ | R | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ | ✗ |
| A10 Super — Tenants | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ |
| A11 Integrations — Timesheet | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | R | ✓ | R | ✓ | ✗ |
| A12 403 page | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

**Note on `superadmin` ✗ on tenant screens.** Per §2.5, superadmin has no access to tenant business data — that includes the tenant profile / copilot / planner UIs. The superadmin logs into `/super/*` only.

---

## §7. Implementation notes

### §7.1 Permission check function (§4.3 hook)

Single entry point in `core`:

```ts
// packages/core/src/rbac/has-permission.ts
export function hasPermission(
  session: SessionScope,
  permission: string,
  resource?: { tenant_id: string; group_id?: string },
): boolean {
  // Tenant boundary first.
  if (resource && resource.tenant_id !== session.tenant_id) return false;

  // org.admin short-circuit (tenant-wide bypass).
  if (session.role_summary.tenant_roles.includes('org.admin')) return true;

  // org.viewer short-circuit for tenant-wide reads.
  if (session.cross_tenant_read && isReadPermission(permission)) return true;

  // Baseline implicit permissions (every authenticated user).
  if (IMPLICIT_SELF_PERMISSIONS.includes(permission)) return true;

  // Tenant-scoped role grants (non-group).
  for (const role of session.role_summary.tenant_roles) {
    if (ROLE_BUNDLES[role].includes(permission)) return true;
  }

  // Group-scoped grants (only relevant for planner.* with a resource group).
  if (resource?.group_id && session.accessible_group_ids.includes(resource.group_id)) {
    for (const grant of session.role_summary.group_roles) {
      if (grant.group_id === resource.group_id && ROLE_BUNDLES[grant.role].includes(permission)) {
        return true;
      }
    }
  }

  return false;
}
```

Same function used by:
- Per-session Agent factory's tool filter (§A8) — called without `resource` for static "does this user *ever* hold this permission?" pre-filter.
- `wrapTool` runtime defense-in-depth check (§H.2) — called with the tool input's resource ids.
- Domain functions at their public entry point (§1.6.5).
- Hono route guards for synchronous screen-load endpoints.
- Frontend route gates (called via `/api/auth/me` returning the `role_summary` + capability bits).

### §7.2 `org.viewer` short-circuit detail

`org.viewer` does NOT inject `planner.task.read` etc. into the permission bundle (that would inflate every role's bundle definition). Instead, the permission check has the `cross_tenant_read` early-return for reads. This keeps the bundle definitions clean and makes the `org.viewer` semantics auditable as a single code path.

`isReadPermission(permission)` is a lookup against the catalog (§2) — any permission whose action is `read` / `read.any` / `read.self` / `health.read`.

### §7.3 SSO-derived grants (Phase B)

§4.2: grants may be derived from Entra group membership. Schema:

```sql
identity.idp_group_role_mappings (
  id uuid PK,
  tenant_id uuid NOT NULL,
  provider text NOT NULL,            -- 'entra'
  external_group_id text NOT NULL,   -- Entra group's objectId
  role_slug text NOT NULL,           -- 'planner.contributor'
  scope_type text NOT NULL,
  scope_id text,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
```

On SSO login: identity reads the user's Entra groups, looks up matching mappings, **derives** grants (writes to `identity.role_grants` with `granted_by = '__sso__'`). Manual grants coexist; removing one doesn't affect the other. Per §4.2: recompute at SSO-login-time only in v1; SCIM (§11.1) is the v1.x answer for background reconciliation.

### §7.4 Frontend gate implementation

Each route declares a gate via TanStack Router's `beforeLoad`:

```ts
// apps/web/src/modules/admin/routes/users.tsx
export const Route = createFileRoute('/admin/users')({
  beforeLoad: ({ context }) => {
    if (!hasPermission(context.session, 'identity.user.read.any')) {
      throw redirect({ to: '/403', search: { missing: 'identity.user.read.any' } });
    }
  },
  component: TenantUsersPage,
});
```

The 403 page shows the missing permission string so users can tell their admin precisely what they need.

### §7.5 Tool-list filter at session boot

```ts
// packages/copilot/src/backend/rbac-filter.ts
export function filterToolsByRole(allTools: ToolDefinition[], session: SessionScope): Record<string, Tool> {
  const out: Record<string, Tool> = {};
  for (const def of allTools) {
    if (hasPermission(session, def.requiredPermission)) {
      out[def.key] = def.build({ session });
    }
  }
  return out;
}
```

Group-scoped permissions (`planner.task.update`) are admitted if the user holds the permission in **any** group — the per-call check inside `wrapTool` does the resource-specific check using the tool input's task → plan → group lookup.

### §7.6 Audit-attribution rules

Per §8.1 / §H.2:

| Trigger | `actor_kind` | `actor_user_id` |
|---|---|---|
| User clicks "Save" in UI | `user` | the user |
| Copilot tool runs (after HITL confirm or read tool) | `agent` | the user who prompted |
| Workflow step runs as part of an event reaction | `system` | the event's `caused_by_user_id` if known, else null |
| Workflow step runs from cron | `system` | null |
| Superadmin tenant-mgmt action | `superadmin` | the superadmin |

`org.viewer` and `org.admin` are not separate `actor_kind`s — they're just users acting with elevated scope. The audit row shows the user, and the permission they exercised is reconstructible from the `action` + their role grants at time `t`.

---

## §8. Open items

Things that need decisions before implementation lands:

1. **Resolve §0.1** — confirm rename `copilot.user → copilot.contributor`. Affects seed migration + §4.4 of `requirements.md`.
2. **Resolve §0.2** — confirm `org.viewer` is *not* trumping per-user chat privacy and *not* getting audit access. (If you want a different stance, this is the place to flip it.)
3. **`planner.task.delete` for `planner.contributor`** — table (§3.2) says "own-created only." Implementation: row carries `created_by`; the permission check for `planner.task.delete` admits if `(role=contributor AND resource.created_by=session.user_id) OR role>=admin`. Confirm this is the desired stance vs. "contributors cannot delete at all."
4. **Group-scoped vs tenant-scoped admins** — `planner.admin` typically group-scoped per §1.3. But a tenant might want a "planner super-user" who is admin in *every* group without `org.admin` bypass. Allow `planner.admin` with `scope_type='tenant'`? Recommendation: **yes**, the schema already supports it; document it as a rare grant.
5. **Phase A admin/users screen scope** — A9 currently allows `identity.viewer` to view but not act. Is read-only access for the user-list useful enough to ship in Phase A, or should A9 be hard-gated to `identity.admin`-only? Simpler gate = ship faster.
6. **403-page UX** — showing the missing permission string is engineer-friendly but may confuse end users. Alternative: show a friendly message + a "request access" button that emails the tenant admin. Phase A: ship the engineer-friendly version; revisit in Phase C.
7. **Workflow tab role-shaped visibility on Phase A** — A7 shows "everyone sees their own runs, copilot.viewer/admin see tenant, superadmin sees instance." But in Phase A superadmin can't access tenant screens (§2.5). Implication: no instance-wide Workflows view in Phase A. Defer the "see all tenants" capability to §6.3 Phase C (C9-C11 superadmin UIs).
8. **`integrations.viewer` for Timesheet config (A11)** — table currently says they get read access (R). Is the Secrets Manager ARN useful to a viewer? Recommendation: viewer sees endpoint URL + health, but **not** the credentials secret ARN (which they couldn't use anyway). Hide the ARN field for viewers.

---

## §9. Scalability — extending to new business modules (timesheet, pmo, finance, …)

**Short answer: yes, scalable. The RBAC + screens contract was designed for it.** Every primitive in this doc was chosen so that a v1.x module ships with **zero changes to existing modules**, per `requirements.md §1.6.3`. This section makes the claim concrete and identifies the small gaps the platform needs to close to make the v1.x path frictionless.

The two questions:

1. **Can we add `timesheet`, `pmo`, `finance` without restructuring?** Yes — §9.1–§9.3 explain why.
2. **How does a user with access to multiple apps experience the system?** §9.4 shows the multi-app UX contract.

### §9.1 What the current design already supports

Every load-bearing decision in §1–§7 was made with multi-module growth in mind:

| Capability | How it scales |
|---|---|
| **Permission strings** | Already module-prefixed (`<module>.<resource>.<action>`). `timesheet.leave.approve` cannot collide with anything in `planner` or `copilot`. No central registry to update. |
| **Role bundles** | Contributed via `ContributionRegistry.roles()` at boot (`architecture.md §C.1`). `timesheet` ships its triplet (`timesheet.admin / contributor / viewer`); `core` aggregates them. Existing modules don't know it happened. |
| **`org.admin` bypass** | `hasPermission()` short-circuits to `true` for any permission string when the session holds `org.admin` (§7.1). Works for `timesheet.leave.approve`, `pmo.capacity.write`, `finance.invoice.delete` automatically — no per-module update. |
| **`org.viewer` cross-tenant read** | Short-circuit honors any permission ending in `.read` / `.read.any` / `.health.read`. New modules that follow the naming convention get cross-tenant read for free. |
| **Permission check function** | One signature (`hasPermission(session, permission, resource?)`) — every module's domain code calls it. New modules use the same import. |
| **Frontend route gating** | TanStack Router `beforeLoad` checks `hasPermission()`. New module's routes (`/timesheet/*`) use the same pattern. |
| **Copilot tool RBAC** | Per-tool `requiredPermission` is the underlying domain permission. `timesheet.log_hours` tool has `requiredPermission: 'timesheet.entry.create'`. The per-session Agent factory (§A8) filters it in/out without code change. |
| **Cross-module tools** | The staffing primitives (`match_users_to_topic`, `compute_workload`, `get_leave_overlap`, etc.) already read from `identity` + `planner` + `integrations`. Pattern repeats: `finance.compute_project_burn` reads `pmo` + `timesheet` + `planner`. Cross-module tools live in `copilot` (per §16.2 rule). |
| **Event-driven projections** | New modules emit `<module>.<entity>.<verb>` events. Existing modules' subscribers don't need to know; new modules subscribe to whatever they need. `staffing.agent` will pick up `timesheet.leave.approved` automatically once timesheet ships (per §1.6.3 worked example). |
| **Schema isolation** | `timesheet.*` schema doesn't touch `planner.*`. dependency-cruiser and raw-SQL CI audit (§B.3) catch any drift. |

**The pattern that makes this work:** *contribution registries at boot*. Roles, routes, tools, agents, workflows, frontend routes, subscribers — all flow through `ContributionRegistry`. New modules call the same `register*` methods. Adding `timesheet` is `pnpm create-module timesheet` + writing the business logic.

### §9.2 Formalizing "module" vs "app"

The current docs use "module" everywhere. Once we have 4+ user-facing surfaces, the distinction between **module** (code unit) and **app** (user-facing surface in the launcher) matters. Pinning it now:

- **Module** — a `packages/<name>/` Turborepo package. Owns a Postgres schema, public surface, optional Hono routes, optional copilot contributions. (Per §1.6.1.)
- **App** — a top-level destination in the app launcher (the grid users see after login). Has an icon, label, landing route, and a role gate. A module may contribute **zero, one, or multiple** apps. (Today: `core`, `identity` contribute zero; `copilot`, `planner` contribute one each; `integrations` contributes one — Timesheet config; v1.x: `timesheet` contributes one, `pmo` contributes one, etc.)

Why zero is legal: `core` is platform infrastructure (shell, event bus, registries) with no first-class destination of its own. `identity` is similar — login, profile, and user-admin UIs live under broader destinations (`/login` is unauthenticated; `/settings/profile` lives inside the shell's user menu; `/admin/users` lives inside an "Admin" app contributed by `core`).

Why multiple is legal (future): a module that owns several distinct surfaces. Example v1.x — `pmo` might contribute "PMO Dashboard" (executive view) and "Capacity Planner" (per-account planning) as two separate launcher tiles, both gated by `pmo.*` roles but with different role thresholds.

### §9.3 App launcher — formal contribution API

Add an `apps()` method to the `ContributionRegistry` (small extension to `architecture.md §C.1`):

```ts
export interface AppContribution {
  key: string;                          // 'planner' | 'copilot' | 'timesheet' | 'pmo'
  label: string;                        // 'Planner' (i18n key supported)
  icon: IconKey;                        // lucide icon name
  landingPath: string;                  // '/planner' | '/copilot/chat'
  // Show this tile in the launcher if the session passes the gate.
  visibilityGate: (session: SessionScope) => boolean;
  // Order hint within the launcher; ties broken alphabetically.
  order: number;
}

export interface ContributionRegistry {
  // ... existing methods
  apps(apps: AppContribution[]): void;
}
```

Module-side registration (timesheet example):

```ts
// packages/timesheet/src/index.ts
export function registerTimesheet(reg: ContributionRegistry): void {
  // ... routes, roles, tools, subscribers
  reg.apps([{
    key: 'timesheet',
    label: 'Timesheet',
    icon: 'clock',
    landingPath: '/timesheet',
    visibilityGate: (s) =>
      s.cross_tenant_read ||                                    // org.viewer sees it
      s.role_summary.tenant_roles.some(r => r.startsWith('timesheet.')) ||
      s.role_summary.group_roles.some(g => g.role.startsWith('timesheet.')),
    order: 30,
  }]);
}
```

Shell-side launcher (`apps/web/src/shell/AppLauncher.tsx`):

```tsx
export function AppLauncher() {
  const session = useSession();
  const apps = useRegisteredApps()                   // from server /api/auth/me response
    .filter(a => a.visibilityGate(session))          // server-evaluated, sent as boolean per app
    .sort((a, b) => a.order - b.order || a.label.localeCompare(b.label));
  return <Grid>{apps.map(a => <AppTile key={a.key} {...a} />)}</Grid>;
}
```

**Important.** Visibility gates run **server-side** at `/api/auth/me` response time — the server returns a `visibleApps: AppContribution[]` array already filtered for the user. The client just renders. This keeps role logic in one place and prevents a hostile client from "seeing" apps it shouldn't enumerate.

### §9.4 Multi-app user experience contract

When a user has access to several apps, the experience is uniform regardless of how many or which ones:

**Login → landing.** After auth, the user lands on a route the shell picks in priority order:
1. The exact URL they were trying to reach (deep link).
2. Their last-used app (stored in `identity.user.last_app_key`).
3. The lowest-`order` app the user has access to.
4. If they have access to zero apps (rare — orphaned user), a "request access" page.

**App launcher.** A persistent grid icon in the top nav (Google-style 3×3 dots). Clicking opens a grid of tiles for every app the user has access to. Selecting one navigates to its `landingPath`.

**Top nav per app.** Each app owns its sub-navigation inside its route namespace. The shell's top bar stays constant (logo + app launcher + user menu). No nested global headers per app.

**Cross-app deep links.** Apps may link to each other. Example: a `timesheet` leave request page linking to "View related planner tasks" → `/planner/plans/:id?task=:taskId`. Shell handles route changes; if the user lacks permission for the target, they get the standard 403 page (per A12).

**Copilot panel — single instance, cross-app.** The embedded copilot panel (Phase B onwards) is shell-owned, not app-owned. The same panel opens inside any app and reuses the same thread store (`copilot.threads`). The portal-context hint (§7.1 — "which app is the user in") biases routing; the user can ask cross-domain questions from any app.

**Cmd+K command palette.** Each module contributes commands via the existing palette registry (`shared/ui` / `cmdk`). Commands are filtered by `hasPermission` server-side at session start. A user with `timesheet.entry.create` sees "Log hours" in the palette regardless of which app they're currently in.

**Per-app role display.** The user menu shows "Your access" — a compact list of granted roles, grouped by app: "Planner: contributor (Engineering, Mobile); Timesheet: viewer; Copilot: contributor." Lets users self-diagnose 403s.

### §9.5 Cross-app authorization invariants

These hold across any number of modules / apps:

1. **`org.admin` is the only true bypass.** It works across all current and future modules without per-module update — `hasPermission()` returns true for any string.
2. **`org.viewer` is read-only across all apps that follow the naming convention.** New modules naming their read permissions `<module>.<resource>.read[.any|.self]` get `org.viewer` coverage automatically. A new module that invents a non-conformant name (`pmo.account.peek`) gets no `org.viewer` short-circuit — convention enforced by code review, not by the runtime.
3. **No app can leak data across tenants.** Every module's domain queries include `WHERE tenant_id = $session.tenant_id` (§H.3). dependency-cruiser doesn't enforce this; integration tests must.
4. **`superadmin` never gets tenant business data, including from future modules.** §2.5's blocklist is permission-shaped: superadmin holds only `superadmin.*` permissions. `hasPermission(superadminSession, 'timesheet.entry.read')` returns false because superadmin holds no tenant role grants.
5. **Group-scoped grants stay module-local.** Today only `planner.*` is group-scoped. If `timesheet` introduces group-scoped grants (e.g., per-project capacity allocations), it uses the same `scope_type='group', scope_id=<group_id>` shape — but groups themselves are owned by `planner`, so timesheet must subscribe to `planner.group.deleted` events and clean up its grants. Documented constraint; not a code change in `core`.
6. **Cross-module tools enforce intersection RBAC.** A copilot tool that reads `timesheet` + `planner` data needs **both** module permissions. The tool's `requiredPermission` can be a single string (the most restrictive of the two), or the tool's handler does two `hasPermission` calls explicitly. Recommendation: define a synthetic `<crossmodule>.<action>` permission (`staffing.read` is the existing example) and grant it via roles that already imply the underlying access.

### §9.6 Worked example — adding `timesheet`

End-to-end checklist when v1.x adds the timesheet module. No existing module changes.

**1. Create the package.**
```
packages/timesheet/
├── drizzle.config.ts                # schemaFilter: ['timesheet']
├── src/
│   ├── backend/
│   │   ├── routes/                  # /api/timesheet/v1/*
│   │   ├── domain/                  # leave-requests, time-entries, capacity logic
│   │   ├── copilot/
│   │   │   ├── tools/               # log-hours, request-leave, approve-leave (HITL)
│   │   │   ├── agents/timesheet.agent.ts
│   │   │   └── workflows/           # leave-approval-reminder, capacity-rollup
│   │   └── subscribers/             # planner.group.deleted, identity.user.deactivated cleanup
│   ├── index.ts                     # the public surface — exports registerTimesheet(reg)
│   ├── events/                      # timesheet.leave.requested, .approved, .rejected, .hours.logged
│   └── db/schema/                   # timesheet.leave_requests, .time_entries, .capacity_allocations
```

**2. Define permissions.** New permission strings, no collision possible:
```
timesheet.entry.read.self / .write.self
timesheet.entry.read.any  / .write.any
timesheet.leave.request   / .approve / .reject / .read
timesheet.capacity.read   / .write
timesheet.report.read
```

**3. Define role bundles.**
```ts
export const timesheetAdmin = { slug: 'timesheet.admin',
  permissions: [/* every timesheet.* permission */] };
export const timesheetContributor = { slug: 'timesheet.contributor',
  permissions: ['timesheet.entry.*.self', 'timesheet.leave.request', 'timesheet.leave.read'] };
export const timesheetViewer = { slug: 'timesheet.viewer',
  permissions: ['timesheet.entry.read.any', 'timesheet.leave.read', 'timesheet.capacity.read', 'timesheet.report.read'] };
```

**4. Register everything.**
```ts
export function registerTimesheet(reg: ContributionRegistry) {
  reg.routes(timesheetHonoRouter);                                    // /api/timesheet/v1/*
  reg.roles([timesheetAdmin, timesheetContributor, timesheetViewer]);
  reg.copilotTools([logHoursTool, requestLeaveTool, approveLeaveTool, /* ... */]);
  reg.copilotAgents([timesheetAgent]);                                // single-domain → lives in module
  reg.workflows([leaveApprovalReminder, capacityRollup]);
  reg.subscribers([
    { event: 'planner.group.deleted', handler: cleanupTimesheetGrants },
    { event: 'identity.user.deactivated', handler: closeOpenLeaveRequests },
  ]);
  reg.apps([{
    key: 'timesheet',
    label: 'Timesheet',
    icon: 'clock',
    landingPath: '/timesheet',
    visibilityGate: hasAnyRole('timesheet.'),
    order: 30,
  }]);
  reg.frontendRoutes([{ path: '/timesheet/*', component: TimesheetApp }]);
}
```

**5. apps/server adds one line.** `registerTimesheet(reg);` between `registerIntegrations` and `registerCopilot`. That's it.

**6. Existing modules pick up timesheet data for free.**
- `staffing.agent` already subscribes to events to refresh its availability projection. Once `timesheet.leave.approved` events flow, the subscriber updates the projection — no `staffing.agent` change.
- The Timesheet MCP path in `integrations` (the external timesheet connector) becomes redundant for tenants that deploy the internal module; both paths can coexist (some tenants on external, some on internal).

**7. Existing roles.** None updated. `org.admin` already bypasses everything; `org.viewer` already reads everything ending in `.read`; the seeded mappings work.

**8. New roles to grant to existing users.** The tenant admin grants `timesheet.contributor` to relevant users. No mass-migration needed; users without a timesheet grant simply don't see the Timesheet app in their launcher.

**9. Audit.** Timesheet tools and routes write to `core.audit` via the same `wrapTool` / domain functions. Audit log is module-agnostic; the audit-browser UI (Phase B B9) shows timesheet actions automatically.

**10. Observability.** OTel spans, traces, metrics flow through the same instrumentation. `copilot.tool.invocation` metric automatically labels new tool keys.

### §9.7 Worked example — adding `pmo`

PMO sits above `planner` — cross-project governance, account rollups, capacity planning. Lives as a peer module, not as a planner extension (§1.6.1 rule).

**Permission set (representative):**
```
pmo.account.read / .create / .update / .archive
pmo.rollup.read
pmo.capacity.read / .write
pmo.governance.review / .approve         # for PR-style review of plan changes
pmo.dashboard.read
```

**Roles:**
- `pmo.admin` — all pmo permissions
- `pmo.contributor` — capacity edits, governance review (not approve)
- `pmo.viewer` — read-only across pmo surfaces

**Key cross-module relationships:**
- Subscribes to: `planner.plan.created`, `planner.task.*` (to maintain account rollup projections); `timesheet.hours.logged` (if timesheet is installed) for capacity actuals.
- Owns the `pmo.accounts` table that `requirements.md §2.3` reserved a hook for via `groups.account_id`. Migration: pmo's first deploy backfills `groups.account_id` from naming conventions (admin-driven, optional).
- Contributes a cross-module agent? Possibly — `governance.agent` in `copilot` could orchestrate "review this plan's burn-down + capacity headroom + open tasks." Same pattern as `staffing.agent`.

**Existing module impact:** the `groups.account_id` hook is already in `planner.groups` schema (`requirements.md §2.3`). When pmo lands, it populates the column via UI; planner ignores it. **Zero schema migration on planner.**

**App contribution:** one tile, `PMO Dashboard`, gated by `hasAnyRole('pmo.')`.

### §9.8 Worked example — adding `finance`

Finance touches money, so the RBAC posture is tighter. Same playbook + a couple of extra patterns.

**Permission set (representative):**
```
finance.invoice.read / .create / .update / .void / .send
finance.payment.read / .record
finance.budget.read / .write
finance.report.read / .export
finance.audit.read                       # separate audit lane for SOX-style separation
```

**Roles:**
- `finance.admin` — full finance access
- `finance.contributor` — invoice + payment recording, no void/export
- `finance.viewer` — read-only
- (Possible v1.x) `finance.auditor` — only `finance.audit.read` + `finance.report.read`

**Pattern beyond what timesheet / pmo need: separation of duties.** Finance modules typically forbid the same user from both *creating* and *approving* an invoice. The current model allows this via a per-tool runtime check in the approval handler — not a new platform primitive:

```ts
if (invoice.created_by === session.user_id && !session.role_summary.tenant_roles.includes('org.admin')) {
  throw new ToolError('SOD_VIOLATION', 'Cannot approve an invoice you created.');
}
```

This is finance-internal logic, not a `core` extension. Other modules don't need it. If multiple modules grow SoD needs, that's the signal to lift SoD into `core` as a first-class primitive — not before.

**Audit separation.** `finance.audit.read` is a dedicated permission, not folded into `org.admin`. This lets a finance auditor be granted *only* finance audit access without bypass on operational data. Bundle into a v1.x `org.auditor.finance` role if separation-of-duties tenants want it.

**App contribution:** one tile, `Finance`, gated by `hasAnyRole('finance.')`. Likely placed at higher `order` (later in launcher) since finance audiences are smaller.

**Existing module impact:** none. Finance reads pmo + planner data via its own event subscribers maintaining local projections.

### §9.9 What needs to change in v1 platform code to make this frictionless

Most of the v1 design supports this already. Three small additions, plus one convention to lock down:

| Change | Where | Effort | Status |
|---|---|---|---|
| Add `apps()` method to `ContributionRegistry` and `AppContribution` type | `packages/core/src/registry` | ~1h | Not yet — add to architecture doc §C.1 before Phase A code lands |
| Server-side `visibleApps` field on `/api/auth/me` response | `packages/identity/src/backend/routes/me.ts` | ~2h | Same |
| `hasAnyRole(prefix: string)` helper | `packages/core/src/rbac` | ~30m | Helper for `visibilityGate` shorthand |
| Lock the naming convention `<module>.<resource>.<action>[.self|.any|.read|...]` as a CI lint | `packages/shared/config` ESLint rule on registered permissions | ~3h | Defense against future modules inventing inconsistent permission names |

**Documentation updates needed:**
- `architecture.md §C.1` — add `apps()` to the `ContributionRegistry` interface (one paragraph).
- `architecture.md §J` — add the `AppLauncher` shell component and `/api/auth/me` `visibleApps` contract.
- `requirements.md §1.6.3` — extend the "Adding a new business module" playbook step 10 to include "9b. Contribute an app tile via `reg.apps([...])`."

I can apply all four code-touchpoint stubs + the doc updates if you want — say the word and I'll add them.

### §9.10 What the design deliberately does NOT scale to

Calling these out so expectations are anchored:

- **Custom tenant-authored modules in v1.** Plugin / sandbox framework is §11.8 (v2). v1 only ships modules built into the platform by Seta. Tenants extend via MCP servers (Seta-as-consumer pattern from §7.1d).
- **Per-tenant module enablement (toggling off a module per tenant).** §1.6.9 — v1 ships every module to every tenant. v1.x adds the toggle. Until then, the only way to "not have timesheet" is to not grant any timesheet role to anyone.
- **Modules with their own auth providers.** Identity is centralized in `identity` module. A future `partner-portal` module that wanted a separate auth flow would be a v2 conversation.
- **Modules with their own billing/quota model.** Per-module rate limits are v1.x (§11.9 if a hosted variant emerges). v1 tracks AI cost per tenant, period.
- **Cross-instance module federation** (one tenant's planner talking to another instance's pmo). §11.7+; no v1 hook.

### §9.11 The 30-second test for "is the platform ready for module N+1?"

When considering whether v1 platform code is "module-extensible enough," run this checklist:

1. ☐ New module's permission strings don't require changes to `hasPermission()` — answer: ✓ already true.
2. ☐ New module's roles register via `ContributionRegistry.roles()` — ✓ already true.
3. ☐ New module's routes mount under `/api/<module>/v1/*` via `reg.routes()` — ✓ already true.
4. ☐ New module's copilot tools register via `reg.copilotTools()` and inherit per-session RBAC filtering — ✓ already true.
5. ☐ New module's UI appears in the app launcher via `reg.apps()` — ☐ **needs §9.3 addition** (small).
6. ☐ New module's events flow through `core.events` outbox + `core.emit()` — ✓ already true.
7. ☐ New module's audit rows write to `core.audit` via `wrapTool` — ✓ already true.
8. ☐ New module's frontend route is gated by `hasPermission` in `beforeLoad` — ✓ already true.
9. ☐ New module doesn't have to update any existing module's code, schema, or role bundle — ✓ already true.
10. ☐ Adding the module is documented as a playbook — ✓ §1.6.3 + §9.6 worked example.

Five of those checks would fail in a typical "Phase A delivers Phase A only" codebase. The boundary discipline + contribution-registry pattern means we're starting Phase A with all but one of them already green.

---

End of doc. Companion: `docs/requirements.md` (§2, §4, §9 are the source decisions); `docs/architecture.md` (§G, §H.3, §J implement the contract above).
