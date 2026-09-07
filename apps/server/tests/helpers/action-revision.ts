import { randomUUID } from 'node:crypto';
import { RequestContext } from '@mastra/core/request-context';
import { writeChatApprovalRow } from '@seta/agent';
import { resetCoreDb } from '@seta/core/testing';
import { createUser } from '@seta/identity';
import { type ActionPorts, makeActionPorts, makeActionTools } from '@seta/planner/orchestration';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import type { Pool } from 'pg';

// ─────────────────────────────────────────────────────────────────────────────
// Shared scaffolding for FUT-840's cross-tool invariant matrix.
//
// Everything here exists because the matrix needs the REAL PreviewPort, and only
// apps/server may compose @seta/planner with @seta/agent. The planner-side
// fixtures (`seedTasksFixture`, `withAgentTestDb`) live behind a package boundary
// that forbids importing another package's test tree, so the minimal seeding is
// reproduced here.
// ─────────────────────────────────────────────────────────────────────────────

/** apps/server's own `withAgentTestDb`: a template-cloned database with the
 *  shared pools initialised, matching packages/agent/tests/helpers.ts. */
export function withActionTestDb<T>(fn: (ctx: { pool: Pool }) => Promise<T>): Promise<T> {
  return withTestDb(
    {
      templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
      baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
    },
    async ({ pool, databaseUrl }) => {
      initPools({ databaseUrl });
      try {
        return await fn({ pool });
      } finally {
        resetCoreDb();
        await closePools();
      }
    },
  );
}

export interface SeededWorld {
  tenantId: string;
  actorUserId: string;
  groupId: string;
  planId: string;
  bucketId: string;
  tasks: Array<{ taskId: string; version: number; title: string }>;
}

/**
 * Tenant + org.admin actor + a group they belong to + one plan/bucket + N tasks.
 *
 * Group membership is load-bearing rather than decorative: the update and link
 * ports gate per group, and `getTaskGroupId` resolves the group through the plan,
 * so a task in a group the actor is not in is refused by the read.
 */
export async function seedWorld(
  pool: Pool,
  opts: {
    titles: string[];
    due_at?: string | null;
    /** Seed into an EXISTING tenant. Both must be given together: creating a
     *  tenant is what mints the admin, so a reused tenant brings its own actor. */
    tenantId?: string;
    actorUserId?: string;
  },
): Promise<SeededWorld> {
  const reuse = opts.tenantId !== undefined && opts.actorUserId !== undefined;
  const tenantId = opts.tenantId ?? randomUUID();
  if (!reuse) {
    await pool.query('INSERT INTO core.tenants (id, name, slug) VALUES ($1, $2, $3)', [
      tenantId,
      `Org ${tenantId.slice(0, 8)}`,
      `org-${tenantId.slice(0, 8)}`,
    ]);
  }
  const actorUserId = reuse
    ? // biome-ignore lint/style/noNonNullAssertion: guarded by `reuse`.
      opts.actorUserId!
    : (
        await createUser(
          {
            tenant_id: tenantId,
            email: `admin-${randomUUID().slice(0, 8)}@example.test`,
            name: 'Admin',
            password: 'correct-horse-battery-staple',
            initial_role: { role_slug: 'org.admin', scope_type: 'tenant', scope_id: null },
          },
          { type: 'cli', user_id: null },
        )
      ).user_id;

  const creator = randomUUID();
  const groupId = randomUUID();
  await pool.query(
    `INSERT INTO planner.groups
       (id, tenant_id, name, theme, visibility, default_role, external_source, created_by, deleted_at)
     VALUES ($1, $2, $3, 'blue', 'private', 'member', 'native', $4, NULL)`,
    [groupId, tenantId, `Group ${groupId.slice(0, 8)}`, creator],
  );
  await pool.query(
    `INSERT INTO planner.group_members (tenant_id, group_id, user_id, role, added_by)
     VALUES ($1, $2, $3, 'member', $4)
     ON CONFLICT DO NOTHING`,
    [tenantId, groupId, actorUserId, creator],
  );
  // The read model `resolveMembers` searches. Without it the actor is a group
  // member nobody can name, and every assign refuses with "I can't find anybody".
  // availability_status and timezone are NOT NULL without defaults.
  await pool.query(
    `INSERT INTO planner.assignee_projection
       (tenant_id, user_id, display_name, email, availability_status, timezone)
     VALUES ($1, $2, 'Admin', $3, 'available', 'UTC')
     ON CONFLICT DO NOTHING`,
    [tenantId, actorUserId, `${actorUserId}@example.test`],
  );
  const planId = randomUUID();
  await pool.query(
    `INSERT INTO planner.plans (id, tenant_id, group_id, name, external_source, created_by)
     VALUES ($1, $2, $3, $4, 'native', $5)`,
    [planId, tenantId, groupId, `Plan ${planId.slice(0, 8)}`, creator],
  );
  const bucketId = randomUUID();
  await pool.query(
    `INSERT INTO planner.buckets (id, tenant_id, plan_id, name, external_source, created_by)
     VALUES ($1, $2, $3, 'To do', 'native', $4)`,
    [bucketId, tenantId, planId, creator],
  );

  const tasks: SeededWorld['tasks'] = [];
  for (const title of opts.titles) {
    const taskId = randomUUID();
    const inserted = await pool.query<{ version: number }>(
      `INSERT INTO planner.tasks
         (id, tenant_id, plan_id, bucket_id, title, due_at, created_by, deleted_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NULL)
       RETURNING version`,
      [taskId, tenantId, planId, bucketId, title, opts.due_at ?? null, creator],
    );
    tasks.push({ taskId, version: inserted.rows[0]!.version, title });
  }
  return { tenantId, actorUserId, groupId, planId, bucketId, tasks };
}

export function rcFor(tenantId: string, userId: string): RequestContext {
  const rc = new RequestContext();
  rc.set('tenant_id', tenantId);
  rc.set('actor', { type: 'user', user_id: userId });
  return rc;
}

/** The REAL adapters plus the REAL preview port. `similarTasks` is the one stub:
 *  the real one needs an embedder, and an empty similar-list changes nothing
 *  about who may create a task or what a revision merges. */
export function realActionPorts(previewPort: ActionPorts['preview']): ActionPorts {
  return {
    ...makeActionPorts({
      previewPort,
      embeddingProvider: {
        get modelId(): never {
          throw new Error('the matrix must never reach an embedder');
        },
      } as never,
    }),
    similarTasks: { search: async () => [] },
  };
}

export interface ToolWorld {
  ports: ActionPorts;
  tenantId: string;
  actorUserId: string;
  openPreview?: Parameters<typeof makeActionTools>[0]['openPreview'];
}

type WriteTool = { execute?: (input: never, ctx: never) => Promise<unknown> };

/** One A2 write tool, built for this actor and this turn's open preview. */
export function toolFor(name: string, world: ToolWorld): WriteTool {
  const tools = makeActionTools({
    ports: world.ports,
    ctx: { tenantId: world.tenantId, actorUserId: world.actorUserId } as never,
    openPreview: world.openPreview ?? null,
  });
  return tools[name] as WriteTool;
}

export interface ProposedCard {
  meta: { toolId: string; dedupKeys?: string[]; supersedes?: string };
  primary: { argsPatch: Record<string, unknown> };
  intent: string;
  details?: Array<{ kind: string; rows?: Array<{ k: string; v: string }> }>;
}

/**
 * Drive one write tool's FIRST pass to the point of suspend, then project the
 * card it built into the read model exactly as `onApproval` would.
 *
 * This is the seam the whole matrix rests on: the same
 * `tool.execute` → `agent.suspend` → `writeChatApprovalRow` sequence the chat
 * route runs, with only the Mastra stream pump left out.
 *
 * `card` is undefined when the tool REFUSED rather than suspending, which is the
 * assertion for every AC5 case — so it is returned rather than thrown.
 */
export async function proposeThroughTool(args: {
  tool: WriteTool;
  input: Record<string, unknown>;
  world: ToolWorld;
  threadId: string;
  pool: Pool;
}): Promise<{
  approvalId?: string;
  runId?: string;
  card?: ProposedCard;
  refusal?: string | null;
}> {
  let card: ProposedCard | undefined;
  const out = (await args.tool.execute?.(
    args.input as never,
    {
      agent: {
        suspend: async (p: unknown) => {
          card = (p as { card?: ProposedCard }).card;
        },
        resumeData: undefined,
      },
      requestContext: rcFor(args.world.tenantId, args.world.actorUserId),
    } as never,
  )) as { refusal?: string | null } | undefined;

  if (!card) return { refusal: out?.refusal ?? null };

  const written = await writeChatApprovalRow({
    card: card as never,
    mastraRunId: `mastra-${randomUUID()}`,
    toolCallId: `tool-${randomUUID()}`,
    threadId: args.threadId,
    tenantId: args.world.tenantId,
    userId: args.world.actorUserId,
    pool: args.pool,
  });
  return { approvalId: written.approvalId, runId: written.runId, card, refusal: null };
}

/** The idempotency key a card carries, which must be FRESH on every revision. */
export function keyOf(card: ProposedCard): string {
  return card.primary.argsPatch.idempotencyKey as string;
}
