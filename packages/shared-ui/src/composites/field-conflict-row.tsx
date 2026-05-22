import { Label } from '../primitives/label';
import { RadioGroup, RadioGroupItem } from '../primitives/radio-group';

export interface FieldConflictRowProps {
  field: string;
  local: unknown;
  remote: unknown;
  snapshot?: unknown;
  choice: 'local' | 'remote' | null;
  onChoose: (c: 'local' | 'remote') => void;
}

function formatValue(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—';
  if (v instanceof Date) return v.toLocaleString();
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

export function FieldConflictRow({
  field,
  local,
  remote,
  snapshot,
  choice,
  onChoose,
}: FieldConflictRowProps) {
  const hasSnapshot = snapshot !== undefined;
  const localId = `${field}-local`;
  const remoteId = `${field}-remote`;

  return (
    <div className="grid gap-2" data-testid={`conflict-row-${field}`}>
      <div
        className="grid items-center gap-4 text-sm"
        style={{ gridTemplateColumns: hasSnapshot ? '8rem 1fr 1fr 1fr auto' : '8rem 1fr 1fr auto' }}
      >
        <span className="text-xs font-medium text-ink-subtle uppercase tracking-wide">{field}</span>
        <div>
          <p className="text-xs text-ink-subtle mb-0.5">Seta</p>
          <p className="text-sm">{formatValue(local)}</p>
        </div>
        <div>
          <p className="text-xs text-ink-subtle mb-0.5">M365</p>
          <p className="text-sm">{formatValue(remote)}</p>
        </div>
        {hasSnapshot && (
          <div>
            <p className="text-xs text-ink-subtle mb-0.5">Last synced</p>
            <p className="text-sm">{formatValue(snapshot)}</p>
          </div>
        )}
        <RadioGroup
          value={choice ?? ''}
          onValueChange={(v) => onChoose(v as 'local' | 'remote')}
          className="flex flex-col gap-2"
        >
          <div className="flex items-center gap-2">
            <RadioGroupItem value="local" id={localId} />
            <Label htmlFor={localId}>Use Seta</Label>
          </div>
          <div className="flex items-center gap-2">
            <RadioGroupItem value="remote" id={remoteId} />
            <Label htmlFor={remoteId}>Use M365</Label>
          </div>
        </RadioGroup>
      </div>
    </div>
  );
}
