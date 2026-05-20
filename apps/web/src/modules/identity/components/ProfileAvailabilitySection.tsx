import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  DatePicker,
  Label,
  RadioGroup,
  RadioGroupItem,
} from '@seta/shared-ui';
import { useState } from 'react';
import type { ProfileDto, SaveProfile } from '../api/client.ts';

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
    <Card>
      <CardHeader>
        <CardTitle>Availability</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <RadioGroup
          value={status}
          onValueChange={(v) => setStatus(v as typeof status)}
          className="flex gap-4"
        >
          <Label className="flex items-center gap-2">
            <RadioGroupItem value="available" />
            Available
          </Label>
          <Label className="flex items-center gap-2">
            <RadioGroupItem value="busy" />
            Busy
          </Label>
          <Label className="flex items-center gap-2">
            <RadioGroupItem value="ooo" />
            Out of office
          </Label>
        </RadioGroup>
        {status === 'ooo' && (
          <div className="space-y-2">
            <Label>Until</Label>
            <DatePicker
              value={oooUntil}
              onChange={setOooUntil}
              minDate={new Date()}
              placeholder="Pick a return date"
              clearable
            />
          </div>
        )}
        <Button onClick={save} disabled={saving || !dirty}>
          Save
        </Button>
      </CardContent>
    </Card>
  );
}
