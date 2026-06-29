import { useQuery } from '@tanstack/react-query';
import {
  type AuditListParams,
  type AuditListResponse,
  listAuditEvents,
} from '../../api/audit-client.ts';

export const auditKeys = {
  all: ['identity', 'audit'] as const,
  list: (p: AuditListParams) =>
    [
      'identity',
      'audit',
      'list',
      p.event_type ?? '',
      p.from ?? '',
      p.to ?? '',
      p.limit,
      p.offset,
      p.sort_by ?? 'occurred_at',
      p.sort_dir ?? 'desc',
    ] as const,
};

export function useAuditEvents(params: AuditListParams) {
  return useQuery<AuditListResponse>({
    queryKey: auditKeys.list(params),
    queryFn: ({ signal }) => listAuditEvents(params, signal),
    placeholderData: (prev) => prev,
  });
}
