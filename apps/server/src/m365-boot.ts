import type { StartWorkerPoolOpts, WorkerHandle } from '@seta/core/workers';
import { findEntraOidByUserId, findUserByEntraOid } from '@seta/identity';
import { getM365TenantConfig, m365 } from '@seta/integrations';
import { integrationsDb } from '@seta/integrations/db';
import type { Crypto, EncryptedBlob } from '@seta/shared-crypto';

export interface M365BootDeps {
  webhookSecret: string;
  cryptoSvc: Crypto;
  workers: WorkerHandle;
}

export interface M365BootResult {
  jobs: NonNullable<StartWorkerPoolOpts['jobs']>;
  webhookRouter: ReturnType<typeof m365.buildWebhookRouter>;
}

export function buildM365Boot(deps: M365BootDeps): M365BootResult {
  const { webhookSecret, cryptoSvc, workers } = deps;

  const m365LinksRepo = m365.createM365GroupLinkRepo({ db: integrationsDb() });
  const m365SubsRepo = m365.createM365SubscriptionsRepo({ db: integrationsDb() });

  async function graphClientFor(setaTenantId: string) {
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

  const jobs: NonNullable<StartWorkerPoolOpts['jobs']> = {
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
        workerAddJob: (id, jobPayload, opts) => workers.addJob(id, jobPayload, opts),
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
        workerAddJob: (id, jobPayload, opts) => workers.addJob(id, jobPayload, opts),
      });
    },
  };

  const webhookRouter = m365.buildWebhookRouter({
    webhookSecret,
    subscriptionsRepo: m365SubsRepo,
    linksRepo: m365LinksRepo,
    enqueuePullJob: async (input) => {
      await workers.addJob('m365.group.pull', input);
    },
  });

  return { jobs, webhookRouter };
}
