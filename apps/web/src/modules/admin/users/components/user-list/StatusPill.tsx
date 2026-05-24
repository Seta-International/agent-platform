import { Badge } from '@seta/shared-ui';

type StatusValue = 'active' | 'deactivated' | 'ooo' | 'available' | 'busy';

export function StatusPill({ status }: { status: StatusValue | string }) {
  const s = String(status).toLowerCase();
  const label =
    s === 'active' || s === 'available'
      ? 'Active'
      : s === 'deactivated'
        ? 'Disabled'
        : s === 'ooo'
          ? 'OOO'
          : s === 'busy'
            ? 'Busy'
            : status;
  const variant: 'success' | 'secondary' | 'warning' =
    s === 'active' || s === 'available'
      ? 'success'
      : s === 'ooo' || s === 'busy'
        ? 'warning'
        : 'secondary';
  return <Badge variant={variant}>{label}</Badge>;
}
