import { applyFeatureFlag, createContributionRegistry, setFlagCatalog } from '@seta/core';
import { registerCoreContributions } from '@seta/core/register';
import { registerHiringContributions } from '@seta/hiring/register';

export async function flagSetCommand(opts: {
  key: string;
  enabled: boolean;
  members?: string;
  tenant?: string;
  global?: boolean;
}): Promise<void> {
  const reg = createContributionRegistry();
  registerCoreContributions(reg);
  registerHiringContributions(reg);
  setFlagCatalog(reg.collected.flagCatalog);

  const strategies: { kind: string; config?: Record<string, unknown> }[] = [];
  if (opts.enabled) strategies.push({ kind: 'enabled' });
  const members =
    opts.members
      ?.split(',')
      .map((s) => s.trim())
      .filter(Boolean) ?? [];
  if (members.length > 0)
    strategies.push({ kind: 'member-allowlist', config: { userIds: members } });

  await applyFeatureFlag({
    tenantId: opts.global ? null : (opts.tenant ?? null),
    key: opts.key,
    strategies,
    actorUserId: null,
  });

  process.stdout.write(
    `flag '${opts.key}' set on ${opts.global ? 'GLOBAL default' : `tenant ${opts.tenant}`}: ${JSON.stringify(strategies)}\n`,
  );
}
