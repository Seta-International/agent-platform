import { basename } from 'node:path';

export interface BuildTenantKeyInput {
  tenant_id: string;
  domain: 'knowledge';
  file_id: string;
  filename: string;
}

/**
 * Build an S3 key under a tenant-scoped prefix. Tenant_id is in the path so
 * blast radius is obvious; bucket policies can constrain access by prefix.
 *
 * Filenames pass through path.basename to strip directory separators (no
 * "../../etc/passwd" tricks). Empty filename → throw.
 */
export function buildTenantKey(input: BuildTenantKeyInput): string {
  if (!input.filename) {
    throw new Error('filename required');
  }
  const safe = basename(input.filename);
  return `tenants/${input.tenant_id}/${input.domain}/${input.file_id}/${safe}`;
}
