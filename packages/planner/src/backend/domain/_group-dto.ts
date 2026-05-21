import type { groups } from '../../db/schema.ts';
import type {
  GroupDefaultRole,
  GroupExternalSource,
  GroupRow,
  GroupTheme,
  GroupVisibility,
} from '../dto.ts';

type GroupDbRow = typeof groups.$inferSelect;

export function groupRowToDto(row: GroupDbRow): GroupRow {
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    name: row.name,
    description: row.description,
    theme: row.theme as GroupTheme,
    visibility: row.visibility as GroupVisibility,
    default_role: row.default_role as GroupDefaultRole,
    external_source: row.external_source as GroupExternalSource,
    external_id: row.external_id,
    external_synced_at: row.external_synced_at ? row.external_synced_at.toISOString() : null,
    account_id: row.account_id,
    created_by: row.created_by,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
    deleted_at: row.deleted_at ? row.deleted_at.toISOString() : null,
    version: row.version,
  };
}
