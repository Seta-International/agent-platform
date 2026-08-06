import type { SessionScope } from '@seta/core';
import { tenantScoped } from '@seta/shared-rbac';
import { presignedDownloadUrl } from '@seta/shared-storage';
import { and, eq, isNull } from 'drizzle-orm';
import { peopleDb } from '../db/client.ts';
import { person } from '../db/schema.ts';
import { PeopleError, requirePermission } from '../rbac.ts';

/** Signature lifetime of the S3 GET the photo route redirects to. */
export const PHOTO_URL_TTL_SECONDS = 5 * 60;
/** Browser cache for the redirect itself — strictly shorter, so it can never outlive the signature. */
export const PHOTO_REDIRECT_CACHE_SECONDS = 4 * 60;

function photoBucket(): string {
  return process.env.S3_BUCKET ?? 'seta-knowledge';
}

/**
 * The photo URL every read surface embeds. Deliberately an app path, not a presigned S3 URL:
 * an org chart or directory page can stay open for hours, and a signature baked into that JSON
 * would expire under it. The route re-signs on each image load instead. `null` (not a URL that
 * 404s) when there is no photo, so the avatar renders initials without a failed request first.
 */
export function personPhotoUrl(person_id: string, photo_storage_key: string | null): string | null {
  return photo_storage_key ? `/api/people/v1/workers/${person_id}/photo` : null;
}

export interface PhotoPresignDeps {
  presignDownload?: typeof presignedDownloadUrl;
}

/**
 * Presign the person's stored M365 photo. Tenant-scoped only — matching the read surfaces that
 * hand out the URL (`listWorkers`, `getOrgStructure`), which are likewise tenant-wide.
 */
export async function workerPhotoDownloadUrl(
  input: { worker_id: string; session: SessionScope },
  deps: PhotoPresignDeps = {},
): Promise<{ download_url: string; expires_in_seconds: number }> {
  requirePermission(input.session, 'people.worker.read');
  const [row] = await peopleDb()
    .select({ photo_storage_key: person.photo_storage_key })
    .from(person)
    .where(
      and(
        eq(person.id, input.worker_id),
        tenantScoped(person.tenant_id, input.session),
        isNull(person.deleted_at),
      ),
    )
    .limit(1);
  if (!row?.photo_storage_key) throw new PeopleError('NOT_FOUND', 'person has no photo on file');

  const presign = deps.presignDownload ?? presignedDownloadUrl;
  const download_url = await presign({
    bucket: photoBucket(),
    key: row.photo_storage_key,
    expiresInSeconds: PHOTO_URL_TTL_SECONDS,
  });
  return { download_url, expires_in_seconds: PHOTO_URL_TTL_SECONDS };
}
