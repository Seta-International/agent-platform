import type { Client } from '@microsoft/microsoft-graph-client';
import type { RouteBuildDeps, SessionEnv, WorkerHandle } from '@seta/core';
import { findEntraOidByUserId, findUserByEntraOid } from '@seta/identity';
import type { Crypto, EncryptedBlob } from '@seta/shared-crypto';
import type { TaskList } from 'graphile-worker';
import { Hono } from 'hono';
import { integrationsDb } from '../db/client.ts';
import { getM365TenantConfig } from '../domain/get-m365-tenant-config.ts';
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
  const m365SubsRepo = m365.createM365SubscriptionsRepo({ db: integrationsDb() });

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
