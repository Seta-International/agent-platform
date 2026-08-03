import type { Client } from '@microsoft/microsoft-graph-client';
import type { RouteBuildDeps, SessionEnv, WorkerHandle } from '@seta/core';
import { emit, withEmit } from '@seta/core/events';
import { findEntraOidByUserId, findUserByEntraOid } from '@seta/identity';
import {
  createPlan,
  getPlan,
  getTask,
  linkPlanToM365,
  listBuckets,
  markPlanSyncStatus,
  markTaskSyncStatus,
  updateTask,
} from '@seta/planner';
import type { Crypto, EncryptedBlob } from '@seta/shared-crypto';
import type { TaskList } from 'graphile-worker';
import { Hono } from 'hono';
import { integrationsDb } from '../db/client.ts';
import { getM365TenantConfig } from '../domain/get-m365-tenant-config.ts';
import { registerM365DirectoryRoutes } from '../http/directory-routes.ts';
import { registerIntegrationsM365Routes } from '../http/m365-routes.ts';
import * as m365 from './index.ts';

export interface M365BootDeps {
  webhookSecret: string;
  cryptoSvc: Crypto;
  getWorkers: () => WorkerHandle;
}

export interface M365Boot {
  jobs: TaskList;
  buildRoutes: (deps: RouteBuildDeps) => Hono<SessionEnv>;
}

export function buildM365Boot(deps: M365BootDeps): M365Boot {
  const { webhookSecret, cryptoSvc, getWorkers } = deps;

  const m365LinksRepo = m365.createM365GroupLinkRepo({ db: integrationsDb() });
  const m365PlanLinksRepo = m365.createM365PlanLinkRepo({
    db: integrationsDb(),
  });
  const m365EtagsRepo = m365.createM365ResourceEtagRepo({
    db: integrationsDb(),
  });
  const m365SubsRepo = m365.createM365SubscriptionsRepo({
    db: integrationsDb(),
  });
  const directoryRepo = m365.createDirectoryRepo({ db: integrationsDb() });
  // The real `@seta/people` adapter (design §8.1). Stateless, so one per boot.
  const directoryPeople = m365.createPeopleDirectorySurface();

  async function graphClientFor(setaTenantId: string): Promise<Client> {
    const config = await getM365TenantConfig(setaTenantId, {
      crypto: { decrypt: (b: EncryptedBlob) => cryptoSvc.decrypt(b) },
    });
    if (!config) throw new m365.M365NotConfiguredError(setaTenantId);
    return m365.buildGraphClient(
      {
        entraTenantId: config.entra_tenant_id,
        clientId: config.client_id,
        clientSecret: config.client_secret_plaintext,
      },
      setaTenantId,
    );
  }

  const jobs: TaskList = {
    'm365.plan.auto-mirror': async (payload) => {
      const p = payload as {
        tenant_id: string;
        group_id: string;
        external_group_id: string;
      };
      const graphClient = await graphClientFor(p.tenant_id);
      await m365.runPlanAutoMirror(p, {
        graph: m365.createPlansGraph(
          graphClient as unknown as Parameters<typeof m365.createPlansGraph>[0],
        ),
        planLinkRepo: m365PlanLinksRepo,
        planner: {
          createPlan: async (input) => {
            const created = await createPlan({
              group_id: input.group_id,
              name: input.name,
              session: input.session,
            });
            return { id: created.id };
          },
          linkPlanToM365: async (input) => {
            await linkPlanToM365(input);
          },
        },
        enqueuePlanPull: async () => {
          // Optional follow-up pull; create/link is sufficient for mirror bootstrap.
        },
      });
    },

    'm365.plan.push': async (payload) => {
      const p = payload as {
        tenant_id: string;
        plan_id: string;
        resource_type:
          | 'plan'
          | 'planDetails'
          | 'bucket'
          | 'task'
          | 'taskDetails'
          | 'bucketTaskBoardTaskFormat'
          | 'assignment';
        platform_id: string;
        changed_fields: string[];
      };

      const graphClient = await graphClientFor(p.tenant_id);
      const graph = m365.createPlansGraphWrite(
        graphClient as unknown as Parameters<typeof m365.createPlansGraphWrite>[0],
      );

      await m365.runPlanPush(p, {
        graph,
        planLinkRepo: m365PlanLinksRepo,
        etagRepo: m365EtagsRepo,
        emit: async (event) => {
          await withEmit(
            {
              actor: {
                userId: '00000000-0000-0000-0000-000000000000',
                tenantId: p.tenant_id,
              },
            },
            async () => {
              await emit({
                tenantId: p.tenant_id,
                aggregateType: 'm365_plan_sync',
                aggregateId: p.plan_id,
                eventType: event.type,
                eventVersion: 1,
                payload: event.payload,
              });
            },
          );
        },
        planner: {
          markPlanSyncStatus: async (input) => {
            await markPlanSyncStatus(input);
          },
          markTaskSyncStatus: async (input) => {
            await markTaskSyncStatus(input);
          },
          updatePlan: async () => {
            // planner.updatePlan currently does not accept external_* patch fields.
          },
          updateBucket: async () => {
            // planner.updateBucket currently does not accept external_* patch fields.
          },
          updateTask: async (input) => {
            const current = await getTask({
              task_id: input.task_id,
              session: input.session,
            });
            await updateTask({
              task_id: input.task_id,
              expected_version: current.version,
              patch: {
                external_etag: input.patch.external_etag,
                external_synced_at: input.patch.external_synced_at,
                order_hint: input.patch.order_hint,
              },
              session: input.session,
            });
          },
          readPlan: async (input) => {
            const plan = await getPlan(input);
            return { title: plan.name };
          },
          readPlanDetails: async (input) => {
            const plan = await getPlan(input);
            return {
              categoryDescriptions: Object.fromEntries(
                Object.entries(plan.category_descriptions ?? {}),
              ),
            };
          },
          readBucket: async (input) => {
            const buckets = await listBuckets({
              plan_id: p.plan_id,
              session: input.session,
            });
            const bucket = buckets.find((b) => b.id === input.bucket_id);
            if (!bucket) throw new Error('bucket not found');
            return { name: bucket.name, orderHint: bucket.order_hint ?? '' };
          },
          readTask: async (input) => {
            const task = await getTask({
              task_id: input.task_id,
              session: input.session,
            });
            const appliedCategories: Record<string, boolean> = {};
            for (const label of task.labels) {
              if (label.category_slot !== null) {
                appliedCategories[`category${label.category_slot}`] = true;
              }
            }

            const assignments: Record<
              string,
              { '@odata.type': '#microsoft.graph.plannerAssignment' }
            > = {};
            for (const a of task.assignees) {
              const entraOid = await findEntraOidByUserId({
                user_id: a.user_id,
                tenant_id: p.tenant_id,
              });
              if (!entraOid) continue;
              assignments[entraOid] = {
                '@odata.type': '#microsoft.graph.plannerAssignment',
              };
            }

            return {
              title: task.title,
              dueDateTime: task.due_at,
              startDateTime: task.start_at,
              priority: task.priority_number,
              percentComplete: task.percent_complete,
              bucketId: task.bucket_id ?? '',
              assigneePriority: task.assignee_priority ?? undefined,
              appliedCategories,
              assignments,
              conversationThreadId: null,
            };
          },
          readTaskDetails: async (input) => {
            const task = await getTask({
              task_id: input.task_id,
              session: input.session,
            });
            const checklist: Record<
              string,
              { title: string; isChecked: boolean; orderHint: string }
            > = {};
            for (const item of task.checklist) {
              checklist[item.id] = {
                title: item.label,
                isChecked: item.checked,
                orderHint: item.order_hint ?? '',
              };
            }
            const references: Record<
              string,
              { alias?: string; type?: string; previewPriority?: string }
            > = {};
            for (const ref of task.references) {
              references[encodeURIComponent(ref.url)] = {
                alias: ref.alias ?? undefined,
                type: ref.type ?? undefined,
                previewPriority: ref.preview_priority ?? undefined,
              };
            }
            return {
              description: task.description,
              description_text: task.description_text,
              previewType: task.preview_type,
              checklist,
              references,
            };
          },
          readTaskOrderHint: async (input) => {
            const task = await getTask({
              task_id: input.task_id,
              session: input.session,
            });
            return { orderHint: task.order_hint ?? '' };
          },
        },
        buildSystemSession: m365.buildSystemSession,
      });
    },

    'm365.plan.push-create-plan': async (payload) => {
      const p = payload as {
        tenant_id: string;
        plan_id: string;
        group_id: string;
        name: string;
      };

      const groupLink = await m365LinksRepo.findByGroup(p.group_id);
      if (!groupLink) return;

      // Idempotency: jobs are delivered at-least-once. If this plan already has
      // a live M365 link it was already pushed (e.g. a retried/duplicate job) —
      // creating another Graph plan would surface as a duplicate plan in Teams.
      const existingLink = await m365PlanLinksRepo.findByPlan(p.plan_id);
      if (existingLink) return;

      const graphClient = await graphClientFor(p.tenant_id);
      const created = (await graphClient
        .api('/planner/plans')
        .post({ owner: groupLink.externalId, title: p.name })) as {
        id: string;
        '@odata.etag'?: string;
      };

      const session = m365.buildSystemSession(p.tenant_id);
      await linkPlanToM365({
        plan_id: p.plan_id,
        external_id: created.id,
        session,
      });

      const link = await m365PlanLinksRepo.upsert({
        tenantId: p.tenant_id,
        groupId: p.group_id,
        planId: p.plan_id,
        externalId: created.id,
        initialSnapshot: {},
      });

      if (created['@odata.etag']) {
        await m365EtagsRepo.upsert({
          tenantId: p.tenant_id,
          planLinkId: link.id,
          resourceType: 'plan',
          setaId: p.plan_id,
          externalId: created.id,
          etag: created['@odata.etag'],
          lastSyncedFields: { title: p.name },
        });
      }

      const details = (await graphClient.api(`/planner/plans/${created.id}/details`).get()) as {
        id?: string;
        '@odata.etag'?: string;
        categoryDescriptions?: Record<string, string | null>;
      };

      if (details['@odata.etag']) {
        await m365EtagsRepo.upsert({
          tenantId: p.tenant_id,
          planLinkId: link.id,
          resourceType: 'planDetails',
          setaId: p.plan_id,
          externalId: details.id ?? created.id,
          etag: details['@odata.etag'],
          lastSyncedFields: {
            categoryDescriptions: details.categoryDescriptions ?? {},
          },
        });
      }
    },

    'm365.plan.push-create-task': async (payload) => {
      const p = payload as {
        tenant_id: string;
        plan_id: string;
        task_id: string;
      };

      const link = await m365PlanLinksRepo.findByPlan(p.plan_id);
      if (!link) return;

      const graphClient = await graphClientFor(p.tenant_id);
      const session = m365.buildSystemSession(p.tenant_id);
      const task = await getTask({ task_id: p.task_id, session });

      const body: Record<string, unknown> = {
        planId: link.externalId,
        title: task.title,
        priority: task.priority_number,
        percentComplete: task.percent_complete,
      };
      if (task.start_at) body.startDateTime = task.start_at;
      if (task.due_at) body.dueDateTime = task.due_at;
      if (task.order_hint) body.orderHint = task.order_hint;
      if (task.assignee_priority) body.assigneePriority = task.assignee_priority;

      if (task.bucket_id) {
        const bucketMap = await m365EtagsRepo.get(link.id, 'bucket', task.bucket_id);
        if (bucketMap) body.bucketId = bucketMap.externalId;
      }

      const created = (await graphClient.api('/planner/tasks').post(body)) as {
        id: string;
        '@odata.etag'?: string;
        bucketId?: string;
      };

      await updateTask({
        task_id: p.task_id,
        expected_version: task.version,
        patch: {
          external_source: 'm365',
          external_id: created.id,
          external_etag: created['@odata.etag'] ?? null,
          external_synced_at: new Date().toISOString(),
        },
        session,
      });

      if (!created['@odata.etag']) return;

      await m365EtagsRepo.upsert({
        tenantId: p.tenant_id,
        planLinkId: link.id,
        resourceType: 'task',
        setaId: p.task_id,
        externalId: created.id,
        etag: created['@odata.etag'],
        lastSyncedFields: {
          title: task.title,
          dueDateTime: task.due_at,
          startDateTime: task.start_at,
          priority: task.priority_number,
          percentComplete: task.percent_complete,
          bucketId: created.bucketId ?? null,
          assigneePriority: task.assignee_priority,
          appliedCategories: {},
          assignments: {},
          conversationThreadId: null,
        },
      });
    },

    'm365.plan.delete-link': async (payload) => {
      const p = payload as {
        tenant_id: string;
        trigger: 'group_unlinked' | 'plan_deleted';
        group_id?: string;
        plan_id?: string;
      };
      await m365.runPlanDeleteLink(p, { planLinkRepo: m365PlanLinksRepo });
    },

    'm365.group.pull': async (payload) => {
      const p = payload as {
        tenant_id: string;
        group_id: string;
        external_id: string;
        full?: boolean;
      };
      const graphClient = await graphClientFor(p.tenant_id);
      await m365.runPullGroup(p, {
        graphClient,
        repo: m365LinksRepo,
        findUserByEntraOid,
        findEntraOidByUserId,
      });
    },
    'm365.group.push': async (payload) => {
      const p = payload as {
        tenant_id: string;
        group_id: string;
        changed_fields: string[];
      };
      const graphClient = await graphClientFor(p.tenant_id);
      await m365.runPushGroup(p, { graphClient, repo: m365LinksRepo });
    },
    'm365.directory.pull': async (payload) => {
      const p = payload as { tenant_id: string; full?: boolean };
      const graphClient = await graphClientFor(p.tenant_id);
      // No try/catch on purpose: runDirectoryPull records directory_last_status='error' and
      // rethrows so graphile-worker retries. Catching it here would report success and silently
      // stop the retry; `GET /directory/status` is what surfaces the error state to the admin.
      await m365.runDirectoryPull(
        { tenant_id: p.tenant_id, full: p.full === true },
        {
          repo: directoryRepo,
          graph: m365.createDirectoryGraph(graphClient),
          people: directoryPeople,
        },
      );
    },

    // Snake_case because graphile-worker's crontab parser rejects dots in a task identifier
    // (CRONTAB_COMMAND: [_a-zA-Z][_a-zA-Z0-9:/_-]*) — a dotted name makes run() reject and the
    // worker never boots. Matches the platform's other cron tasks (partition_manager_tick).
    // The job it fans out to keeps its dotted name: add_job imposes no such restriction.
    m365_directory_pull_cron: async () => {
      await m365.runDirectoryPullCron({
        listTenantIds: () => m365.listDirectoryTenantIds(integrationsDb()),
        addJob: (id, jobPayload, spec) => getWorkers().addJob(id, jobPayload, spec),
      });
    },

    'm365.subscription.create': async (payload) => {
      const p = payload as {
        tenant_id: string;
        resource: string;
        change_type: string;
        notification_url: string;
        lifecycle_url?: string;
      };
      const graphClient = await graphClientFor(p.tenant_id);
      await m365.runCreateSubscription(p, {
        graphClient,
        webhookSecret,
        subscriptionsRepo: m365SubsRepo,
        workerAddJob: (id, jobPayload, opts) => getWorkers().addJob(id, jobPayload, opts),
      });
    },
    'm365.subscription.renew': async (payload) => {
      const p = payload as { subscription_row_id: string };
      const row = await m365SubsRepo.findById(p.subscription_row_id);
      if (!row) return;
      const graphClient = await graphClientFor(row.tenantId);
      await m365.runRenewSubscription(p, {
        graphClient,
        subscriptionsRepo: m365SubsRepo,
        workerAddJob: (id, jobPayload, opts) => getWorkers().addJob(id, jobPayload, opts),
      });
    },
  };

  function buildRoutes(rtDeps: RouteBuildDeps): Hono<SessionEnv> {
    const app = new Hono<SessionEnv>();
    registerIntegrationsM365Routes(app, {
      graphClientFor,
      workers: rtDeps.workers,
      m365LinksRepo,
    });
    registerM365DirectoryRoutes(app, {
      repo: directoryRepo,
      // Resolutions apply through the same public `@seta/people` doors the sync uses, under the
      // acting admin's session (§9.2) — hence the resolution surface, not the sync's.
      people: m365.createPeopleResolutionSurface(),
      workers: rtDeps.workers,
      lastRun: m365.createDirectoryRunReader(integrationsDb()),
    });
    const webhookRouter = m365.buildWebhookRouter({
      webhookSecret,
      subscriptionsRepo: m365SubsRepo,
      linksRepo: m365LinksRepo,
      enqueuePullJob: async (input) => {
        await rtDeps.workers.addJob('m365.group.pull', input);
      },
    });
    app.route('/', webhookRouter as unknown as Hono<SessionEnv>);
    return app;
  }

  return { jobs, buildRoutes };
}
