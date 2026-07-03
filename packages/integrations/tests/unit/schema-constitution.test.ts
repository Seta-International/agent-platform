import { getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import {
  m365GroupLinks,
  m365PlanLinks,
  m365ResourceEtags,
  m365TenantConfig,
  mailTransportConfig,
  RESOURCE_TYPES,
  SYNC_STATUS,
  TRANSPORT_KINDS,
} from '../../src/backend/db/schema/index.ts';

describe('integrations schema constitution', () => {
  it('m365_tenant_config actor columns are uuid', () => {
    const cfg = getTableConfig(m365TenantConfig);
    expect(cfg.columns.find((c) => c.name === 'created_by')?.getSQLType()).toBe('uuid');
    expect(cfg.columns.find((c) => c.name === 'updated_by')?.getSQLType()).toBe('uuid');
  });

  it('mail_transport_config actor columns are uuid and kind is CHECK-backed', () => {
    const cfg = getTableConfig(mailTransportConfig);
    expect(cfg.columns.find((c) => c.name === 'created_by')?.getSQLType()).toBe('uuid');
    expect(cfg.columns.find((c) => c.name === 'updated_by')?.getSQLType()).toBe('uuid');
    expect(cfg.checks.some((c) => c.name === 'mail_transport_config_kind_check')).toBe(true);
    expect(TRANSPORT_KINDS).toEqual(['graph', 'smtp']);
  });

  it('m365_resource_etags has created_at, a platform_id-named TS field, and a resource_type CHECK', () => {
    const cfg = getTableConfig(m365ResourceEtags);
    expect(cfg.columns.some((c) => c.name === 'created_at')).toBe(true);
    expect(m365ResourceEtags.platform_id).toBeDefined();
    expect(cfg.columns.some((c) => c.name === 'platform_id')).toBe(true);
    expect(cfg.checks.some((c) => c.name === 'm365_resource_etags_resource_type_check')).toBe(true);
    expect(RESOURCE_TYPES).toEqual([
      'plan',
      'planDetails',
      'bucket',
      'task',
      'taskDetails',
      'bucketTaskBoardTaskFormat',
      'assignment',
    ]);
  });

  it('sync_status is single-sourced and CHECK-backed on both link tables', () => {
    const planCfg = getTableConfig(m365PlanLinks);
    const groupCfg = getTableConfig(m365GroupLinks);
    expect(planCfg.checks.some((c) => c.name === 'm365_plan_links_sync_status_check')).toBe(true);
    expect(groupCfg.checks.some((c) => c.name === 'm365_group_links_sync_status_check')).toBe(true);
    expect(SYNC_STATUS).toEqual(['idle', 'pulling', 'pushing', 'error', 'conflict']);
  });
});
