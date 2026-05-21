# Workflow screens — designer handoff

**Status:** draft for design review. W1, W3, W4, W5, W8 shipped 2026-05-21 (foundation + feature + polish PRs).
**Audience:** product designer + design-system reviewer.
**Engineering anchors:** `docs/rbac-and-screens.md` A7/A8/B17, `docs/architecture.md` §A/§F/§H, `DESIGN.md` + `packages/shared/ui/src/styles/tokens.css`.
**Reference patterns:** Mastra Studio editor (`mastra.ai/docs/editor/overview`, `mastra.ai/docs/editor/prompts`, `mastra.ai/docs/workflows/overview`) — see the local checkout at `/Users/canh/Projects/Seta/mastra` for ground truth.

This doc describes the **Workflows** surface end-to-end: authoring a workflow visually, running it, observing runs in real time, and the prompt/tool editors that sit alongside. It is written for a designer to take into Figma. Engineering specs (RBAC, DB, events) live in the architecture docs and are referenced by anchor.

> **Scope note.** Today the project ships workflows as code (`reg.workflows([...])`) and ships only the read-only inbox + drilldown (A7/A8/B17). This handoff intentionally goes further — it lays out the *authoring* surface as well, so the designer can design the full Copilot Studio shell in one pass. Engineering will phase delivery; design should not.

---

## 1. Goals & non-goals

**Goals**

1. Make it possible for a non-engineer (prompt engineer, PM, ops) to read a workflow's structure at a glance, edit the parts that don't require code (instructions, prompt blocks, tool selection), and version every change.
2. Make a running workflow legible — current step, elapsed time, emitted events, suspended pauses for HITL — without leaving the surface.
3. Make a *completed* run replayable: step-by-step inspection, logs, time-travel into any step's input/output.
4. Make role-shaped visibility obvious. A contributor sees their own runs; an ops viewer sees the tenant's; a superadmin sees the instance's. Same screen, different scope.

**Non-goals**

- Building workflows by drag-and-drop *creates* new step code from scratch. Steps are authored in code; the visual editor lets you wire, configure, and override — not generate logic.
- Replacing the planner's task UI. A workflow may *touch* tasks (via `planner` public surface), but workflows themselves are agent-orchestration artifacts, not project plans.
- Replacing the chat. Workflows kicked off from chat continue to show progress in chat; this surface is the deep view, not the everyday driver.

---

## 2. Personas & jobs-to-be-done

| Persona | Permissions (see `rbac-and-screens.md`) | What they do here |
|---|---|---|
| **Workflow builder** | `copilot.editor.write` (new — see §9 open questions) | Compose steps, edit agent instructions / prompt blocks, save draft, publish a version. |
| **Workflow runner** | `copilot.workflow.run.execute` (new) | Open a workflow, fill the input form, start a run, watch it stream, approve HITL pauses. |
| **Contributor (everyone)** | `copilot.workflow.run.read.self` | See *my* runs, drill into any of them, see step graph + logs + emitted events. |
| **Ops viewer** | `copilot.workflow.run.read.tenant` | See tenant-wide run inbox + ops dashboards (volume, p50/p95 latency, failure rate, token spend). |
| **Superadmin** | `copilot.workflow.run.read.instance` | All of the above, instance-wide, with per-tenant breakdown. |
| **HITL participant** | scoped per workflow | Receives an approval card (in chat or in their notifications); approval resumes the run. |

The same human often holds two of these. Design must not create separate sub-apps for "viewer" vs "builder" — it's one surface, with affordances hidden when the role doesn't grant them.

---

## 3. Information architecture

```
/copilot
├── /chat                          (existing — out of scope for this doc)
├── /studio
│   ├── /workflows                 W1   Catalog + run inbox (split view)
│   │   ├── /:workflowId           W2   Workflow editor (graph + inspector)
│   │   ├── /:workflowId/runs/:id  W4/5 Live run (W4) → drilldown (W5)
│   │   └── /:workflowId/versions  W9   Version history & diff
│   ├── /prompts                   W10  Prompt-block catalog
│   │   └── /:promptId             W10  Prompt-block editor
│   └── /tools                     W11  Tool catalog (integrations, MCP, overrides)
└── /ops                           B17  Ops dashboards (role-shaped)
```

`/studio` is the new authoring shell. `/copilot/workflows` (today's A7) becomes the **runs inbox** *inside* the catalog screen W1 — the toggle is in-page, not a separate route. Keep deep links stable: a paste of `/copilot/workflows/:runId` from an alert still lands on W5.

**Navigation rules**

- The top-level left rail (existing app shell) gets one new tile: **Studio**. Chat keeps its own tile.
- Inside `/studio`, the secondary nav is horizontal tabs: **Workflows · Prompts · Tools · Versions**. (Versions is contextual — only shown when a workflow is selected.)
- Breadcrumbs in W2/W4/W5: `Studio / Workflows / <workflow-name> / <view>`. Crumbs are clickable.

---

## 4. Screens

### W1 — Workflows catalog + run inbox   **[shipped 2026-05-21]**

**Route:** `/copilot/studio/workflows`

**Purpose:** the landing page. Two things sit side by side: the **definitions** (workflows registered in code or in the editor) and the **runs** (instances of those definitions, role-scoped).

**Layout (desktop ≥ 1280 px)**

```
┌──────────────────────────────────────────────────────────────────────────┐
│ Studio                                          [ search ]   [ + New ▾ ] │  ← page header
├──────────────────────────────────────────────────────────────────────────┤
│ Workflows · Prompts · Tools                                              │  ← studio tabs
├──────────────────────────────────────────────────────────────────────────┤
│ ┌─ Definitions ─────────────┐  ┌─ Runs (mine ▾) ───────────────────────┐ │
│ │ ▸ leave-approval-reminder │  │ ● running  capability-gap … 2m ago    │ │
│ │ ▸ capability-gap-translat │  │ ● paused   leave-approval … 1h • HITL │ │
│ │ ▸ new-task-skill-tag-…    │  │ ✓ ok       new-task-skill … 3h        │ │
│ │ ▸ capacity-rollup         │  │ ✕ failed   capacity-rollup … 1d       │ │
│ │   (12 more)               │  │ … infinite scroll                     │ │
│ └───────────────────────────┘  └───────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────┘
```

**Definitions list (left, 320 px)**

- Item rows: workflow id (mono), display name, last-modified, owner module badge (e.g. `planner`, `copilot`, `integrations`).
- Status badge: `code` (code-defined), `edited` (has a stored override), `draft` (unpublished changes).
- Filter chips at top: **All · Code · Edited · Draft**.
- Click → W2 editor.

**Runs inbox (right, fluid)**

- Scope dropdown at top: **mine · my group · tenant · instance**. Options visible by role; default = lowest-privilege the user holds.
- Row anatomy: status dot, workflow display name, started-at relative time, duration if finished, suspend reason tag if paused, triggering actor (avatar + name) on hover.
- Row click → W4 if running/paused, W5 if finished.
- Empty state: "No runs in this scope yet. Open a workflow to start one." with a primary CTA back to the left list.

**+ New ▾ menu**

- *New workflow* — opens W2 in blank state. (Disabled for users without `copilot.editor.write`.)
- *New prompt block* — opens W10 modal.
- *Import from code* — picks an unedited code workflow and creates a draft override.

**States to design**

- Empty (no workflows exist in tenant yet) — single illustration + two CTAs ("New workflow" / "Browse templates").
- Loading — skeleton rows on both panels.
- Error fetching either panel — inline banner with retry; never block the other panel.

---

### W2 — Workflow editor

**Route:** `/copilot/studio/workflows/:workflowId`

**Purpose:** the heart of the surface. Visual representation of a workflow's step graph, plus an inspector for the selected node, plus controls to **save draft / publish / run**.

**Layout**

```
┌──────────────────────────────────────────────────────────────────────────┐
│ ← Workflows / capability-gap-translation  ⏷    [v3 draft] [Run ▸] [Save] │  ← header
├──────┬───────────────────────────────────────────────┬───────────────────┤
│ Pal- │                                               │ Inspector         │
│ ette │              [step graph canvas]              │                   │
│      │                                               │  ┌─────────────┐  │
│ ▸ +  │     ┌────────┐    ┌────────┐                  │  │ Step: extract│ │
│      │     │ extract│ →  │ classify│ → … → ┌──────┐  │  │ id, schemas │  │
│      │     └────────┘    └────────┘        │ done │  │  │ tools, vars │  │
│      │                          ↘ branch                                 │
│      │                                               │  └─────────────┘  │
│      │                                               │                   │
├──────┴───────────────────────────────────────────────┴───────────────────┤
│ Issues (2)  · Last saved 4m ago · Owner: copilot · Storage: stored-override│
└──────────────────────────────────────────────────────────────────────────┘
```

**Header (sticky, 56 px)**

- Back affordance — text link, not a button.
- Workflow display name (Geist 22/medium); chevron opens a quick-pick of other workflows.
- Version chip — `[v3 draft]` / `[v2 published]` / `[v1 archived]`. Click → W9 versions panel as a side sheet.
- **Run** primary action (`bg primary-500 #0047FF`, white text). Disabled until input schema validates.
- **Save** secondary action. Becomes **Save draft** when there are unsaved changes; pulses a 1 px primary border at idle to indicate dirty state.
- Overflow menu (`⋯`): **Publish draft · Restore version · Duplicate · Export JSON · Delete**.

**Palette (left rail, 240 px, collapsible to 48 px)**

Categories, accordion:

1. **Control flow** — `Then`, `Parallel`, `Branch`, `Foreach`, `DoUntil`, `DoWhile`, `Sleep`, `WaitForEvent` (matches Mastra's `.then() / .parallel() / .branch() / .foreach() / .dountil() / .dowhile() / .sleep() / .waitForEvent()` — icons exist under `/docs/static/img/workflows/` in the Mastra checkout).
2. **Steps** — list of `createStep` definitions registered in the tenant, grouped by module.
3. **Agents** — registered agents that can be invoked from a step. Drag → creates an "agent step".
4. **Tools** — read-only tools available via the public surface of `planner`, `identity`, `integrations`, `copilot.self`.
5. **Workflows** — other workflows usable as sub-workflows.

Each palette item: 28 px row, monochrome icon, name, drag handle. On drag, the canvas highlights valid drop targets.

**Canvas (center, fluid)**

- Directed-graph layout, left-to-right by default; auto-layout button in the canvas footer.
- Nodes: 200 × 72 px cards with hairline border (`--hairline #e9e8e6`), 8 px radius, white background. Selected node gets a 2 px `--primary #0047FF` ring (not a fill — fill is reserved for status).
- Edges: 1 px gray, arrowhead at the consumer. Branch/parallel edges use a label chip mid-edge.
- Node anatomy:

  ```
  ┌────────────────────────────────────┐
  │ ⊙ extract               [agent]    │  ← title + kind badge
  │ in: TaskRef  out: ExtractedSkills  │  ← schemas, mono 12 px
  └────────────────────────────────────┘
  ```

- Status during a run: dot at top-left changes — gray `pending` · blue spinner `running` · green check `success` · red x `failed` · amber pause `suspended` · purple `tripwire`. (Match Mastra workflow `status` union — see `docs/workflows/overview.mdx` line 380.)
- Sub-workflows render as a slightly thicker double border.
- Zoom: cmd-+/-/0; mini-map bottom-right (toggle).

**Inspector (right, 360 px, collapsible)**

The contents depend on what's selected. The tabs at the top of the inspector switch *aspect*, not *node* — see "What can be overridden" in `editor/overview.mdx` for which fields are editable on code-defined nodes.

For a **step**:
- **Properties** — id (read-only when code-defined), display name, description.
- **Schemas** — collapsible JSON viewer for `inputSchema` and `outputSchema`. Read-only for code-defined; editable for stored-only steps.
- **Instructions** — if the step calls an agent: ordered list of instruction blocks, each one *inline text* / *prompt block* / *prompt block reference*. **Add block** opens the block picker (W10). Reorder via drag. Per block: **Display conditions** panel (rule groups, AND/OR, operators `equals`, `contains`, `greater_than`, `exists`, …).
- **Tools** — chips of tools available to the agent in this step. **Add tool** from the tool catalog (W11).
- **State** — if the step reads/writes workflow state, show the `stateSchema` and which keys it touches.

For an **edge** (control-flow connector):
- Edge type (`then`, branch predicate, parallel fan-out, foreach key).
- For `branch`: predicate JSON editor with autocomplete on upstream output.
- For `sleep` / `waitForEvent`: duration / event-name field with a "watch in runs" link.

For the **workflow itself** (canvas background clicked):
- Workflow id, display name, owner module.
- `inputSchema` / `outputSchema` (read-only when code-defined).
- Versioning lifecycle controls (mirrors W9 quick form): **Save draft · Publish · Restore**.

**Footer (40 px)**

- **Issues** popover — schema mismatches between connected steps (e.g. `step-A.output ≠ step-B.input`), unresolved prompt-block references, missing tool permissions. Issues block **Publish** but never **Save draft**.
- Last-saved timestamp.
- Owner badge (which module exported it).
- Storage chip — `code` / `stored-override` / `stored-only`.

**Key interactions**

- Drag from palette → drop on canvas → connect by drawing from a node's right edge to another node's left edge.
- Right-click node → context menu: **Open code · Save as prompt step · Duplicate · Delete**.
- `R` keyboard shortcut → opens **Run** dialog (W3).
- `⌘S` → Save draft.
- `⌘⇧P` → Publish draft (modal confirms; shows version diff summary).
- `⌘K` → command palette (jump to step by id, jump to another workflow, open recent run).

**Empty / blank state (new workflow)**

Canvas shows a single ghost "Start" placeholder + an inline tip: *"Drag a step from the palette, or paste a Mastra workflow id."* Inspector is disabled with copy "Select a node to edit."

---

### W3 — Run input dialog   **[shipped 2026-05-21 — re-run side sheet]**

**Trigger:** **Run** in W2, or **Re-run with edits** from W5.

**Purpose:** generate a form from the workflow's `inputSchema`, validate, start the run.

**Layout:** side sheet from the right, 480 px wide. Backdrop dims to `rgba(0,0,0,0.32)`.

- Title: **Run *<workflow-name>***. Version chip mirrors the editor's chip.
- Form rendered from `inputSchema` (Zod / Standard JSON Schema) — primitives, enums, arrays, nested objects. Field labels = property name in title case; help text from JSON Schema `description`.
- File / vector inputs render as upload zones (out of scope for v1; show as a chip placeholder with "Coming soon").
- **Run mode** toggle: **Start** (await result) · **Stream** (live updates). Default = Stream.
- **Request context** advanced panel (collapsed): inject `request-context` key-value pairs. Power-user only.
- Submit → starts the run, navigates to W4 with the new `runId`. Sheet closes on navigation.

**Validation**

- Inline per field, identical to TanStack Form patterns we already use in planner.
- Disabled submit until valid; on disable, hovering the button shows the first error in a tooltip.

---

### W4 — Live run (streaming)   **[shipped 2026-05-21]**

**Route:** `/copilot/studio/workflows/:workflowId/runs/:runId` while status is `running` / `paused` / `waiting`.

**Purpose:** show the workflow *as it runs*. Same canvas as W2, but nodes light up; right panel becomes a live log; bottom panel shows emitted events and HITL prompts.

**Layout differences from W2**

- Editor controls (Save / Publish / palette) are hidden. The header swaps to: **← Back to workflow · Run #<short-id> · started 2m ago · status pill · [Cancel] [Open in editor]**.
- Right panel tabs switch to **State · Logs · Events · Input · Output**.
  - **State** — current `state` object (live JSON), updated on `setState` calls.
  - **Logs** — streaming log lines, color-coded by step (one color band per node).
  - **Events** — chronological list of domain events emitted by the run via `core.events` (per `architecture.md` §F.4) — event type, aggregate, timestamp, payload viewer.
  - **Input** — the original `inputData`.
  - **Output** — partial output as it accumulates; final when status flips to `success`.
- Step nodes show timing chip on the bottom edge: `1.2s` while running (counts up), `3.4s ✓` on success, `12.0s ✕` on failure.
- A suspended step renders an **HITL approval card** docked at the bottom of the canvas (see §5 components) — designer should also produce the chat-embedded variant.

**Cancel & restart**

- **Cancel** on the header opens a confirm: "Cancel this run? The current step will finish; downstream steps will not start." Destructive (red text on hover).
- After cancel or failure: header gains **Restart from last active step** (mirrors Mastra's `run.restart()`) and **Re-run with edits** (opens W3 pre-filled).

---

### W5 — Run drilldown (completed run)   **[shipped 2026-05-21]**

**Route:** same as W4, surfaces this state once status ∈ {`success`, `failed`, `tripwire`}.

**Purpose:** post-mortem. The canvas is now a *replay surface*. The right panel adds **Time-travel**.

- Each node is clickable → inspector pane shows that step's `payload` (input), `output`, and any logs scoped to it.
- **Time-travel** tab in the right panel lists each step with a **Replay** button (mirrors Mastra's time-travel: replay an individual step with the same or modified input). Replay opens W3-style form pre-filled.
- A **Trace** sub-tab links out to the OTel/observability dashboard (`architecture.md` §G) — passes `traceId`.
- Failed runs render the offending node with red ring; clicking shows the captured error in a banner above the inspector content with **Copy stack** and **Open ticket** affordances.
- Tripwire runs show a yellow ring on the trigger node and a banner with `reason` + `metadata` (per Mastra's tripwire result shape).

**Permissions**

- Self-scope users see only their own runs (audit subject = self).
- Tenant viewers see all runs in the tenant; the row reveals **Started by** in the header.
- Instance viewers (superadmin) see a tenant chip in the header.

---

### W6 — (folded into W1)

We do not have a separate inbox page anymore — A7's intent is preserved as the right pane of W1. If a designer wants a full-bleed inbox view for ops, see W7.

---

### W7 — Ops dashboard

**Route:** `/copilot/ops` (existing B17 anchor).

**Purpose:** the §7.3 observability view. Three personas, one screen, gated by role chip at the top.

**Layout — single-column responsive board**

```
┌──────────────────────────────────────────────────────────────────────────┐
│ Ops · scope: [tenant ▾]                              last 24h ▾  · ⟳     │
├──────────────────────────────────────────────────────────────────────────┤
│  ┌─ Volume ─────┐ ┌─ p50/p95 ─────┐ ┌─ Failure % ─┐ ┌─ Token spend ────┐ │
│  │  4,210 runs   │ │ 1.4s / 12.8s  │ │   2.1%      │ │ $128.40 / $500 cap│ │
│  └──────────────┘ └───────────────┘ └─────────────┘ └──────────────────┘ │
├──────────────────────────────────────────────────────────────────────────┤
│  Runs by workflow  (horizontal bar, top 10)                              │
├──────────────────────────────────────────────────────────────────────────┤
│  Recent failures  (table, last 50, click → W5)                           │
├──────────────────────────────────────────────────────────────────────────┤
│  Tenant breakdown  (superadmin only — table, click → tenant-scoped view) │
└──────────────────────────────────────────────────────────────────────────┘
```

- Scope dropdown swaps the entire board between `tenant` and `instance` (only superadmin sees `instance`).
- All time selectors share state across panels.
- "Token spend" tile shows the cap from `copilot.rate_limits`; bar fills proportionally; red when ≥ 90 %.
- Drill from any table row to W5.

---

### W8 — HITL approval (used by W4)   **[shipped 2026-05-21 — canvas + chat-embedded]**

**Purpose:** when a workflow `suspend`s for human approval (required across half our workflows per §14.1), render a card that a permitted human can act on.

**Two surfaces — same component, different containers:**

1. **Canvas docked** (in W4) — appears as a floating card at the bottom of the canvas, just over the suspended step.
2. **Chat embedded** (in `/copilot/chat`) — same card rendered inside an assistant-ui `Interactable`. (See `architecture.md` §14.1.)

**Card anatomy**

```
┌────────────────────────────────────────────────────────────┐
│  ⏸  Approval needed                            HITL · 4m   │
│                                                            │
│  capability-gap-translation step `propose-skill-tag`       │
│  wants to write the tag `kafka-tuning` to user             │
│  jane.doe@acme.com's profile.                              │
│                                                            │
│  Proposed payload:                                         │
│  { "skill": "kafka-tuning", "source": "history" }          │
│  [ view diff ▸ ]                                           │
│                                                            │
│  [ Approve ]  [ Modify… ]  [ Reject ]                      │
│  Suspend timeout: 7 days · approver: workflow.assignee     │
└────────────────────────────────────────────────────────────┘
```

- **Approve** → resumes the run, gets a green flash; the suspended node turns blue/running.
- **Modify…** → opens a side sheet pre-filled with the proposed payload; on confirm, resumes with the edited payload.
- **Reject** → resumes with a tripwire signal; the suspended node turns yellow with the reject reason.
- All three actions require the user to hold the permission the workflow declared.
- "Suspend timeout" is informational; once expired the card shows expired-disabled and the run transitions to `failed` with a timeout reason.

---

### W9 — Versions panel

**Route:** `/copilot/studio/workflows/:workflowId/versions` (also a side sheet from W2 header).

**Purpose:** the Draft / Published / Archived lifecycle from `editor/overview.mdx` §Versioning.

**Layout** — a side sheet with a vertical timeline.

- Row per version: `v3 · draft · 4m ago · canh@acme · 2 instructions changed, 1 tool added`.
- One row carries a green dot + "**Published**" badge — only one at a time.
- Actions per row: **Diff against published**, **Restore**, **Compare with…**.
- Diff modal: two-pane, left = base, right = candidate; per-section toggles for *Instructions*, *Tools*, *Schemas*. Designer should produce both the high-level "summary" view and the detailed "field" view.
- **Restore** archives the current published and republishes the selected version; confirm modal with a small warning.

---

### W10 — Prompt-block catalog & editor

**Route:** `/copilot/studio/prompts` and `/.../prompts/:id`.

**Purpose:** the Mastra Studio **Prompts** tab adapted — manage reusable instruction templates referenced from workflow steps.

**Catalog**

- Table: name, latest version, last edited by, used-by count (workflows + agents referencing it), tags.
- **Create prompt block** primary action.
- Filter chips: **All · Mine · Used in workflows · Unused · Drafts**.

**Editor (right side or full page)**

- Name field (kebab-case slug, auto-derived; editable).
- **Instruction text** — large editor area, monospaced for `{{variable}}` clarity, with autocomplete on dot-notation paths and `{{var || 'default'}}` fallbacks.
- **Variables** side panel — auto-detected variables with descriptions; show usage example.
- **Display conditions** — rule-group builder (AND / OR, nested) with operators `equals`, `contains`, `greater_than`, `exists`. Reuse the same component as W2's per-block conditions.
- **Used by** panel — list of agents and workflow steps consuming this block. Click → jumps to that node in W2 / agent editor.
- Versioning sidebar identical to W9.

---

### W11 — Tool catalog & override

**Route:** `/copilot/studio/tools`.

**Purpose:** runtime tool management — add tools from integrations (Composio-style), MCP servers, override descriptions. Adapted from Mastra `editor/tools`.

- Three sub-tabs: **Integrations · MCP · Code-defined**.
- For each tool: name, description (editable for override), input/output schema preview, "Used by" list.
- A tool can be tagged with `requires-approval` (drives the HITL card automatically when used in a workflow step that writes).
- Add MCP server: form with URL, auth, test-connect button, then a checklist of exposed tools to enable.

---

## 5. Shared components

### 5.1 Status pills & dots

| State | Dot | Pill bg | Pill text |
|---|---|---|---|
| pending | `--ink-subtle #8a8f98` filled | `--surface-2` | `Pending` |
| running | `--primary #0047FF` with subtle pulse | `--primary-tint #ecf1ff` | `Running` |
| paused / suspended | `#d97706` filled | `#fef3c7` | `Paused · HITL` |
| success | `--semantic-success #27a644` filled | `#dcfce7` | `Success` |
| failed | `#dc2626` filled | `#fee2e2` | `Failed` |
| tripwire | `#7c3aed` filled | `#ede9fe` | `Tripwire` |
| canceled | `--ink-subtle` outline | `--surface-2` | `Canceled` |

Status union mirrors Mastra's result `status` (`success`, `failed`, `suspended`, `tripwire`, `paused`) plus our own `canceled`/`running`/`pending` lifecycle states.

### 5.2 Step node card

- 200 × 72 px, 8 px radius, 1 px `--hairline` border.
- Title row: 14/medium, icon left (kind), kind badge right (`agent`, `tool`, `sub-workflow`, `control`).
- Meta row: input/output schema names in Geist Mono 12.
- Selected: 2 px `--primary` ring, no border color change.
- Hover: subtle elevation (`box-shadow: 0 1px 0 0 var(--hairline-strong), 0 2px 6px rgba(2,5,30,0.06)`).
- Status dot top-left, timing chip bottom-right during/after run.

### 5.3 Control-flow nodes

Smaller than step nodes (140 × 48 px), distinct shape (rounded pill, dashed border) so they read as *connectors* not *steps*. One per Mastra primitive: `Then`, `Parallel`, `Branch`, `Foreach`, `DoUntil`, `DoWhile`, `Sleep`, `WaitForEvent`. Reuse the icons under `mastra/docs/static/img/workflows/` as a visual reference for what each primitive represents.

### 5.4 Timing chip

- 13 px Geist Mono pill, `--surface-3` bg.
- During run: counts up every 100 ms.
- On finish: shows total + status icon (`3.4s ✓` / `12.0s ✕`).
- Click → scrolls the Logs panel to the first log line from that step.

### 5.5 Log row

- Monospace, 13 px, 6 px row padding.
- Color band on the left = step it belongs to (8 px wide). Same color in the canvas selection ring.
- Severity tag: `info` (gray), `warn` (amber), `error` (red).
- Folded JSON payloads with click-to-expand.

### 5.6 Schema viewer

- Two modes: **Form** (the auto-generated form, used in W3) and **Tree** (collapsible JSON Schema explorer used in inspectors).
- Read-only schemas (from code-defined steps) get a muted lock icon next to the title.

### 5.7 Diff viewer (W9, W10 versions)

- Side-by-side, line-level, with section folds.
- Additions highlighted in `#ecf1ff` (primary-tint), deletions in `#fef2f2`.
- Designer should produce a "summary card" variant (one-line description per change) for the version timeline rows.

---

## 6. Design tokens (recap, see `tokens.css` for the truth)

- **Brand accent**: `--primary #0047FF` — used for selection, primary CTA, focus ring, link emphasis, running state. No second chromatic accent in this surface.
- **Surfaces**: warm off-white ladder (`#ffffff → #fafaf9 → #f4f4f3 → #ecebea → #e2e1df`).
- **Type**: Geist 14/13/12 on an 8-px rhythm. Geist Mono for ids, schemas, code, kbd hints.
- **Radii**: 4 px (chips), 6 px (inputs), 8 px (cards/nodes), 12 px (sheets).
- **Hairlines**: `#e9e8e6` (default), `#d6d5d2` (strong).
- **Status colors** above are *not* additional brand colors; they are functional semantics — use them only in pills, dots, rings, and progress states.

> **Do not introduce a second chromatic accent.** No purple/teal/orange for "category" decoration. If you need to distinguish a step's logs from another's, use the per-run color band — a low-saturation hue from a small palette (8 max), seeded from the run id, *not* mapped to meaning.

---

## 7. Interaction patterns

### Keyboard

| Where | Key | Action |
|---|---|---|
| Anywhere in /studio | `⌘K` | Command palette (jump to workflow, run, prompt, tool). |
| W2 canvas | `R` | Open Run dialog. |
| W2 canvas | `⌘S` / `⌘⇧P` | Save draft / Publish. |
| W2 canvas | arrows | Move selected node 8 px. |
| W2 canvas | `Del` / `⌫` | Delete selected node/edge (with confirm if it disconnects downstream). |
| W4 logs | `⌘F` | Scoped find in current run's logs. |
| W5 step inspector | `←`/`→` | Previous / next step in run. |
| W9 versions | `Enter` | Open diff for focused row. |

### RBAC visibility

A button is **hidden** when the user lacks the permission, not disabled. Tooltips/help-text never reveal permissions the user doesn't have. The exception is the **Studio** tile itself — show it greyed-out with a tooltip "Ask an admin for access" for tenants where the surface exists but the role is contributor-only, so users discover its existence.

### Live updates

W4 uses SSE (project standard — see `architecture.md` §F). Designer should produce:
- A "reconnecting" toast (8-second timeout before showing).
- A "lost connection — open elsewhere?" modal if the stream stays down > 30 s.
- A stale-data ribbon at the top of the canvas if the run has been mutated server-side by another viewer (rare; covers parallel HITL action).

### Empty / loading / error matrix

| Screen | Empty | Loading | Error |
|---|---|---|---|
| W1 list | "No workflows yet" + 2 CTAs | skeleton rows per panel | inline banner per panel |
| W1 inbox | "No runs in this scope" | skeleton rows | inline banner |
| W2 editor | ghost Start node + tip | full canvas skeleton (nodes + edges as muted lines) | full-bleed error with **Retry** and **Open last working version** |
| W3 input form | n/a | field shimmer | per-field error banner above submit |
| W4 live | "Run hasn't reported any progress yet" copy + spinner | skeleton canvas | reconnect toast / lost-connection modal |
| W5 drilldown | "Run completed with no output" | step skeletons | error banner per step |
| W7 ops | "No activity in selected window" | per-tile skeleton | per-tile error |
| W10/W11 | "No prompt blocks / tools yet" | skeleton table | inline banner |

---

## 8. Accessibility

- All canvases are keyboard-traversable: nodes are buttons in tab order; edges are reachable via a node's expandable "Connections" submenu (`Enter` on a node opens the menu).
- Color is never the only signal. Status uses dot + label everywhere it appears; the canvas node carries both the dot and a status-specific aria-label.
- Live regions: the live-run header has `aria-live="polite"` for status changes; new log lines do **not** announce (would be noisy).
- Focus rings: 2 px solid `--primary` outside the element; never removed.
- Color contrast: validate the warm off-white ladder against status pills — `#fef3c7` background + body ink must hit 4.5:1. (Token may need slight darkening for `--ink-subtle` over the lightest pill backgrounds.)
- Reduced motion: the running-status pulse degrades to a static filled dot when `prefers-reduced-motion: reduce`.

---

## 9. Open questions for the designer (and engineering)

These are not blockers — flag your preferred direction in Figma, engineering will follow up.

1. **Auto-layout vs free-form canvas.** Mastra Studio uses auto-layout. Do we let users drag nodes to arbitrary positions and persist them, or always auto-layout and persist only logical structure? Recommendation: always auto-layout for code-defined; allow position overrides for stored-only. Designer can confirm by sketching both.
2. **Sub-workflow rendering.** Inline-expanded (canvas-in-canvas) vs. opaque single node with "open in new tab"? Recommend opaque with a peek-on-hover.
3. **Workflow templates.** Should W1's **+ New** offer a template gallery (M3+ scope) or only blank + "Import from code"?
4. **Per-run color band assignment.** Seeded from run id, or selectable by user? Seed is cheaper; selectable nicer for triage.
5. **Studio tile placement.** Sits in the top-level rail next to Chat, or only inside `/copilot`? Recommend top-level rail — the personas above don't all live in chat.
6. **Approval card outside the surface.** When a workflow suspends, do we also push a notification (email/Slack) or only surface in the in-app inbox + chat? §14.1 says HITL is approval-gated; doc the notification UX separately if so.
7. **Stored-only workflows vs code-defined.** Today architecture says workflows are code. If we allow stored-only (drag-only authoring), engineering needs to extend `ContributionRegistry` — flag this as a real decision, not a design knob.
8. **`copilot.editor.write` permission.** New permission, not yet in `rbac-and-screens.md`. Designer should not assume it exists; reviewer to add a D-row when this design lands.

---

## 10. Out of scope (intentionally deferred)

| Item | Why deferred | Tracker |
|---|---|---|
| Drag-to-author *new step code* | Steps are code-defined for safety; visual authoring writes wires and overrides, not logic. | n/a |
| Workflow marketplace / templates gallery | Post-M3; needs trust + sharing model. | M3 backlog |
| Multi-tenant workflow sharing UI | Tenants are isolated; deferring cross-tenant share entirely. | n/a |
| Eval / experiment runner UI | Mastra editor mentions automated experimentation against datasets — out of scope this round. | M4 backlog |
| Notification UX for HITL pauses outside the app | Email/Slack/push needs its own design. | M3 backlog |

---

## 11. Handoff checklist for the designer

- [ ] Light theme primary; produce dark-theme parity for all screens (`DESIGN.md` retains the dark palette).
- [ ] All status states designed for every screen (pending / running / paused / success / failed / tripwire / canceled).
- [ ] Empty, loading, error states for every screen per §7 matrix.
- [ ] Components captured as Figma components (status pill, step node, control-flow node, timing chip, log row, HITL card, schema viewer, diff viewer). Each in default / hover / focus / disabled / error states.
- [ ] Keyboard hint surface — designer to pick the visual treatment (floating cheatsheet vs inline `kbd` chips).
- [ ] Annotated motion spec for: status pulse, node selection ring, side-sheet open, log row append, canvas pan/zoom.
- [ ] Confirm token contrasts pass WCAG 2.2 AA over the warm off-white ladder.
- [ ] Open questions §9 — leave a comment per item with the designer's recommendation.

---

## 12. References (consult before sketching)

- `docs/rbac-and-screens.md` §A7, §A8, §B17 — current scoped screens and permission rows.
- `docs/architecture.md` §A (modules), §F.4 (events), §H.1 (one-domain-per-agent), §G (observability), §14.1 (HITL pattern).
- `DESIGN.md` + `packages/shared/ui/src/styles/tokens.css` — design tokens (tokens.css wins on color).
- Mastra checkout at `/Users/canh/Projects/Seta/mastra`:
  - `docs/src/content/en/docs/editor/overview.mdx` — version lifecycle, sub-agent overrides.
  - `docs/src/content/en/docs/editor/prompts.mdx` — prompt blocks, template variables, display conditions.
  - `docs/src/content/en/docs/workflows/overview.mdx` — step / workflow / status model.
  - `docs/static/img/workflows/*.jpg` — primitive icons (Then, Parallel, Branch, Foreach, DoUntil, DoWhile, Sleep, WaitForEvent, agent step, tool step, data-mapping).
- Mastra docs online: `mastra.ai/docs/editor/overview`, `mastra.ai/docs/editor/prompts`, `mastra.ai/docs/workflows/overview`.
