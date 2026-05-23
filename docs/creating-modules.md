# Creating a new module (and giving it an agent)

The module factory (`pnpm gen module`) produces a Seta module that compiles, lints, and tests with **zero edits**. This doc walks the path from `gen module` to a working agent-callable tool.

If anything below conflicts with [`architecture.md`](./architecture.md) §3 (boundaries) or §4 (canonical shape), that doc wins — this one is the operator's view.

---

## 1. Scaffold the module

```bash
pnpm gen module
```

Three prompts:

| Prompt | Answer |
|---|---|
| Module name (kebab-case) | `timesheet` |
| Tier | `feature` (default) / `foundation` / `orchestrator` |
| Generate apps/web/src/modules/<name>/ companion folder? | `Y` if the module owns top-level UI; `N` if it lives under `console-web` admin |

What lands:

```
packages/timesheet/
├── package.json                    # @seta/timesheet, exports: . ./events ./rbac ./contracts ./register
├── tsconfig.json  vitest.config.ts  drizzle.config.ts  README.md
├── drizzle/migrations/0001_init.sql    # CREATE SCHEMA "timesheet"
├── src/
│   ├── index.ts                    # public surface (empty stub)
│   ├── events.ts                   # TIMESHEET_EVENTS = {} as const
│   ├── rbac.ts                     # TIMESHEET_PERMISSIONS = {} as const
│   ├── contracts.ts                # browser-safe DTOs
│   ├── register.ts                 # one reg.module({...}) call
│   └── backend/
│       ├── db/{schema.ts,client.ts}
│       ├── agent-tools.ts          # timesheetAgentTools: CopilotTool[] = []
│       ├── agent-specs.ts          # timesheetAgentSpecs: AgentSpec[] = []
│       └── {domain,subscribers,jobs,http,stream,workflows}/.gitkeep
└── tests/public/loads.test.ts      # asserts the module imports cleanly
```

And these side effects:

- `apps/server/src/index.ts` + `apps/worker/src/index.ts` gain `import { registerTimesheetContributions } from '@seta/timesheet/register'` and a `registerTimesheetContributions(reg)` call (inserted before the sentinel comments — biome resorts the import block on save).
- Both `apps/server/package.json` and `apps/worker/package.json` get `"@seta/timesheet": "workspace:^"`.
- If you answered `Y` to the web companion: `apps/web/src/modules/timesheet/` with a `navManifest` stub, registered in `apps/web/src/shell/manifests.ts`.
- `pnpm install` re-runs automatically.

**Verify:**

```bash
pnpm --filter @seta/timesheet typecheck   # green
pnpm --filter @seta/timesheet test        # 1 passed (loads.test.ts)
pnpm lint                                 # dep-cruiser green
```

If any of those fail at this point, the generator is the bug — not your code.

---

## 2. Add tables

Edit `packages/timesheet/src/backend/db/schema.ts`:

```ts
import { pgSchema, uuid, text, timestamp } from 'drizzle-orm/pg-core';

export const timesheetSchema = pgSchema('timesheet');

export const entries = timesheetSchema.table('entries', {
  id: uuid('id').primaryKey(),
  tenant_id: uuid('tenant_id').notNull(),
  user_id: uuid('user_id').notNull(),                  // no FK — cross-schema
  hours: text('hours').notNull(),
  occurred_on: timestamp('occurred_on', { withTimezone: true }).notNull(),
});
```

Generate the migration:

```bash
pnpm --filter @seta/timesheet db:generate
pnpm db:migrate
```

Never hand-edit files under `drizzle/`. If output is wrong, fix `schema.ts` and re-run.

---

## 3. Define events + permissions

`packages/timesheet/src/events.ts`:

```ts
import { z } from 'zod';

export const TIMESHEET_ENTRY_LOGGED = 'timesheet.entry.logged' as const;

export const TIMESHEET_ENTRY_LOGGED_PAYLOAD = z.object({
  entry_id: z.string().uuid(),
  user_id: z.string().uuid(),
  hours: z.string(),
});

export const TIMESHEET_EVENTS = {
  [TIMESHEET_ENTRY_LOGGED]: TIMESHEET_ENTRY_LOGGED_PAYLOAD,
} as const;
```

`packages/timesheet/src/rbac.ts`:

```ts
export const TIMESHEET_ENTRY_WRITE = 'timesheet.entry.write' as const;
export const TIMESHEET_ENTRY_READ = 'timesheet.entry.read' as const;

export const TIMESHEET_PERMISSIONS = {
  [TIMESHEET_ENTRY_WRITE]: 'Log timesheet entries',
  [TIMESHEET_ENTRY_READ]: 'Read timesheet entries',
} as const;
```

The registry validates at composition time that every permission slug is unique across all modules; pick `<module>.<entity>.<verb>` to avoid collisions.

---

## 4. Write a domain function (the public surface)

`packages/timesheet/src/backend/domain/log-entry.ts`:

```ts
import { withEmit, emit } from '@seta/core/events';
import { getSessionScope } from '@seta/core';
import { timesheetDb } from '../db/client.ts';
import { entries } from '../db/schema.ts';
import { TIMESHEET_ENTRY_LOGGED, TIMESHEET_ENTRY_WRITE } from '../../events.ts';

export interface LogEntryInput {
  hours: string;
  occurred_on: Date;
  session: ReturnType<typeof getSessionScope>;
}

export async function logEntry(input: LogEntryInput): Promise<{ entry_id: string }> {
  input.session.requirePermission(TIMESHEET_ENTRY_WRITE);

  return withEmit(input.session, async () => {
    const id = crypto.randomUUID();
    await timesheetDb().insert(entries).values({
      id, tenant_id: input.session.tenant_id, user_id: input.session.user_id,
      hours: input.hours, occurred_on: input.occurred_on,
    });
    await emit({
      event_type: TIMESHEET_ENTRY_LOGGED,
      aggregate_type: 'timesheet.entry', aggregate_id: id,
      tenant_id: input.session.tenant_id,
      payload: { entry_id: id, user_id: input.session.user_id, hours: input.hours },
    });
    return { entry_id: id };
  });
}
```

Re-export from `src/index.ts`:

```ts
export { logEntry, type LogEntryInput } from './backend/domain/log-entry.ts';
```

That's the contract other modules see. **Never let another module import from `src/backend/`** — dep-cruiser will reject it.

---

## 5. Give the module an agent tool

Each module owns its agent tools. They live in `src/backend/agent-tools.ts` and are surfaced to copilot via the registry.

Replace the stub in `packages/timesheet/src/backend/agent-tools.ts`:

```ts
import { createTool } from '@mastra/core/tools';
import { actorFromContext, RequestContextSchema, registerToolPermission } from '@seta/copilot-sdk';
import type { CopilotTool } from '@seta/copilot-sdk';
import { buildActorSession } from '@seta/identity';
import { z } from 'zod';
import { logEntry } from './domain/log-entry.ts';
import { TIMESHEET_ENTRY_WRITE } from '../events.ts';

const timesheetLogEntryTool = registerToolPermission(
  createTool({
    id: 'timesheet_logEntry',
    description: 'Log a timesheet entry for the current user.',
    inputSchema: z.object({
      hours: z.string().describe('Decimal hours, e.g. "1.5"'),
      occurredOn: z.string().datetime(),
    }),
    outputSchema: z.object({ entryId: z.string().uuid() }),
    requestContextSchema: RequestContextSchema,
    execute: async (input, ctx) => {
      const actor = actorFromContext(ctx);
      const session = await buildActorSession(actor);
      const { entry_id } = await logEntry({
        hours: input.hours,
        occurred_on: new Date(input.occurredOn),
        session,
      });
      return { entryId: entry_id };
    },
  }),
  TIMESHEET_ENTRY_WRITE,
);

export const timesheetAgentTools: CopilotTool[] = [timesheetLogEntryTool];
```

Key points:

- **Mutating tools get HITL automatically** — `registerToolPermission` ties the tool to a permission; assistant-ui shows a confirmation card for any tool that's not read-only.
- **The tool is a thin wrapper.** All business logic lives in `domain/log-entry.ts`. The tool just adapts shapes and calls it.
- **Don't import from `@seta/copilot`.** Always go through `@seta/copilot-sdk`. Dep-cruiser enforces this.

---

## 6. Wire it into `reg.module({...})`

`packages/timesheet/src/register.ts` (extend the generated stub):

```ts
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ContributionRegistry } from '@seta/core';
import * as schema from './backend/db/schema.ts';
import { timesheetAgentTools } from './backend/agent-tools.ts';
import { TIMESHEET_EVENTS } from './events.ts';
import { TIMESHEET_PERMISSIONS } from './rbac.ts';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

export function registerTimesheetContributions(reg: ContributionRegistry): void {
  reg.module({
    name: 'timesheet',
    schema,
    migrationsDir: resolve(__dirname, '../drizzle/migrations'),
    events: TIMESHEET_EVENTS,
    rbac: TIMESHEET_PERMISSIONS,
    agentTools: timesheetAgentTools,
  });
}
```

Optional fields on `reg.module({...})` — add as you need them:

| Field | When to add |
|---|---|
| `subscribers: SubscriberDef[]` | Reacting to events from other modules. Handlers are idempotent on `event_id`. |
| `jobs: TaskList` | graphile-worker background work. Job names must be globally unique. |
| `routes: { mountAt, build }` | Hono sub-app for HTTP endpoints (`/api/<module>/v1/...`). |
| `stream: StreamHubBuilder` | SSE hub when the module fans events to browser clients. |
| `agentSpecs: AgentSpec[]` | Compose multiple tools into a dedicated agent persona (typically orchestrators only). |
| `workflows: WorkflowBuilder[]` | Mastra workflows. Single-module workflows live with the module; cross-module ones with the orchestrator. |
| `errorMapper` | Module-specific `Error → { status, body }` translation. |

The registry throws at boot if you collide on a name, slug, tool id, or workflow id — fix collisions before you ship.

---

## 7. Compose an agent (orchestrator pattern)

A feature module rarely needs its own agent — copilot's supervisor picks tools by description. When you want a domain-scoped persona (e.g. "the staffing agent that owns plan/assign/notify flows"), declare an `AgentSpec`:

```ts
// packages/staffing/src/backend/agent-specs.ts
import type { AgentSpec } from '@seta/core';

export const staffingAgentSpecs: AgentSpec[] = [
  {
    id: 'staffing.coordinator',
    instructions: 'You are the staffing coordinator. Assign tasks to people whose skills match.',
    tools: [
      'planner_assignTask',
      'identity_searchUsersBySkills',
      'timesheet_logEntry',
    ],
    rbac: ['planner.task.assign', 'identity.user.read'],
  },
];
```

The registry validates that every `tools[]` id exists in the collected tool catalog at composition time — typo in a tool id fails boot, not runtime.

Keep agents to **~15 tools max** per agent (CLAUDE.md "Conventions"). Past that, split into a second agent and delegate via `delegates: ['other.agent.id']`.

---

## 8. Tests

The generated `tests/public/loads.test.ts` is the minimum bar — it asserts the public surface imports cleanly. Add:

- **Unit tests** in `tests/unit/` — pure domain logic, no DB.
- **Integration tests** in `tests/integration/` — real Postgres via `testcontainers` (use `@seta/shared-testing`).
- **Public-surface tests** in `tests/public/` — exercise only `@seta/<module>`. CI runs these with peer module source paths excluded; private cross-module deps fail.

```bash
pnpm --filter @seta/timesheet test
```

No DB mocks. Tests run against the real schema.

---

## 9. Final check before opening a PR

```bash
pnpm typecheck && pnpm lint && pnpm test
```

If you added a web companion, also:

```bash
pnpm test:e2e
```

The boundary gate (`pnpm lint` includes `pnpm depcruise`) catches the most common new-module mistakes: cross-module internal imports, accidentally pulling `@seta/copilot` (use `@seta/copilot-sdk`), `shared-*` reaching into a module.

---

## Where to look next

- `architecture.md` §J.7 — full shape of `reg.module({...})`.
- `architecture.md` §A5 — dep-cruiser rules your module is subject to.
- `sdks/copilot/src/index.ts` — `defineCopilotTool`, `registerToolPermission`, `RequestContextSchema`.
- `packages/planner/` — fully-built reference module: events, subscribers, jobs, HTTP, stream hub, agent tools.
- `packages/staffing/` — reference orchestrator: composes planner + identity tools into workflows.
