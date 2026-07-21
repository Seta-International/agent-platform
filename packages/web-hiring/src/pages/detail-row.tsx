import { IconButton } from '@seta/shared-ui';
import { Copy } from 'lucide-react';
import type { ReactNode } from 'react';

// Shared read-only fact row: label on the left (secondary), value on the right (primary), with a
// hairline below each row. Used by the candidate detail drawer and the requisition detail's facts
// panel so both read as the same label→value list. An optional leading icon and a trailing copy
// button cover the drawer's contact rows; the requisition facts pass neither.
export function DetailRow({
  icon,
  label,
  value,
  onCopy,
}: {
  icon?: ReactNode;
  label: string;
  value: ReactNode;
  onCopy?: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border py-2 last:border-b-0">
      <span className="flex items-center gap-1.5 text-sm text-secondary">
        {icon}
        {label}
      </span>
      <span className="flex items-center gap-1.5 text-base text-primary">
        {value}
        {onCopy && (
          <IconButton
            type="button"
            variant="ghost"
            size="sm"
            onClick={onCopy}
            label={`Copy ${label}`}
            icon={<Copy className="size-3.5" />}
          />
        )}
      </span>
    </div>
  );
}
