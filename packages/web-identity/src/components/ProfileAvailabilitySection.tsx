import { Button, Card, DateInput, RadioGroup, RadioListItem } from '@seta/shared-ui';
import { useState } from 'react';
import type { ProfileDto, SaveProfile } from '../api/client.ts';

function toDateInputValue(d: Date | null): string {
  if (!d) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function todayInputValue(): string {
  return toDateInputValue(new Date());
}

export function ProfileAvailabilitySection({
  profile,
  onSave,
  onUpdate,
}: {
  profile: ProfileDto;
  onSave: SaveProfile;
  onUpdate: (p: ProfileDto) => void;
}) {
  const [status, setStatus] = useState(profile.availability_status);
  const [oooUntil, setOooUntil] = useState<Date | null>(
    profile.ooo_until ? new Date(profile.ooo_until) : null,
  );
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const updated = await onSave({
        availability_status: status,
        ooo_until: status === 'ooo' ? (oooUntil?.toISOString() ?? null) : null,
      });
      onUpdate(updated);
      setStatus(updated.availability_status);
      setOooUntil(updated.ooo_until ? new Date(updated.ooo_until) : null);
    } finally {
      setSaving(false);
    }
  }

  const dirty =
    status !== profile.availability_status ||
    (oooUntil?.toISOString() ?? null) !== (profile.ooo_until ?? null);

  return (
    <Card className="space-y-4 pt-6">
      <RadioGroup
        label="Availability status"
        isLabelHidden
        value={status}
        onChange={(v) => setStatus(v as typeof status)}
        orientation="horizontal"
      >
        <RadioListItem value="available" label="Available" />
        <RadioListItem value="busy" label="Busy" />
        <RadioListItem value="ooo" label="Out of office" />
      </RadioGroup>
      {status === 'ooo' && (
        <div className="space-y-2">
          <DateInput
            label="Until"
            min={todayInputValue()}
            value={toDateInputValue(oooUntil) || undefined}
            onChange={(v) => {
              setOooUntil(v ? new Date(`${v}T00:00:00`) : null);
            }}
            width={224}
          />
        </div>
      )}
      <div className="flex justify-end pt-1">
        <Button onClick={save} isDisabled={saving || !dirty} label="Save changes" />
      </div>
    </Card>
  );
}
