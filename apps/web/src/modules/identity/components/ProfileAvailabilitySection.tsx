import {
  Button,
  Calendar,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Label,
  Popover,
  PopoverContent,
  PopoverTrigger,
  RadioGroup,
  RadioGroupItem,
} from '@seta/shared-ui';
import { useState } from 'react';
import { type ProfileDto, patchProfile } from '../api/client.ts';

export function ProfileAvailabilitySection({
  profile,
  onUpdate,
}: {
  profile: ProfileDto;
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
      const updated = await patchProfile({
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
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="secondary" className="w-full justify-start">
                  {oooUntil ? oooUntil.toDateString() : 'Pick a date'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <Calendar
                  mode="single"
                  selected={oooUntil ?? undefined}
                  onSelect={(d) => setOooUntil(d ?? null)}
                />
              </PopoverContent>
            </Popover>
          </div>
        )}
        <Button onClick={save} disabled={saving || !dirty}>
          Save
        </Button>
      </CardContent>
    </Card>
  );
}
