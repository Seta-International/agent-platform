import type { Client } from '@microsoft/microsoft-graph-client';
import type { StartWorkerPoolOpts } from '@seta/core/runtime';
import { findEntraOidByUserId, findUserByEntraOid } from '@seta/identity';
import { getM365TenantConfig, m365 } from '@seta/integrations';
import { integrationsDb } from '@seta/integrations/db';
import type { Crypto, EncryptedBlob } from '@seta/shared-crypto';
import { getPool } from '@seta/shared-db';

export interface M365BootDeps {
  webhookSecret: string;
  cryptoSvc: Crypto;
}

export interface M365BootResult {
  jobs: NonNullable<StartWorkerPoolOpts['jobs']>;
}

// PR08 will collapse this with apps/server's m365-boot into a shared integrations entry.
export function buildM365Boot(deps: M365BootDeps): M365BootResult {
  const { webhookSecret, cryptoSvc } = deps;

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

  async function enqueue(
    identifier: string,
    payload: unknown,
    opts?: { jobKey?: string; maxAttempts?: number; queueName?: string; runAt?: Date },
  ): Promise<void> {
    const pool = getPool('worker');
    await pool.query(
      `SELECT graphile_worker.add_job(
         identifier => $1,
         payload => $2::json,
         queue_name => $3,
         run_at => $4,
         max_attempts => $5,
         job_key => $6
       )`,
      [
        identifier,
        JSON.stringify(payload ?? {}),
        opts?.queueName ?? null,
        opts?.runAt ?? null,
        opts?.maxAttempts ?? null,
        opts?.jobKey ?? null,
      ],
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
        workerAddJob: enqueue,
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
        workerAddJob: enqueue,
      });
    },
  };

  return { jobs };
}
