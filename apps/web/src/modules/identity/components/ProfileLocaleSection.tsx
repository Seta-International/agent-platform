import { Button, Card, CardContent, CardHeader, CardTitle, cn, Label } from '@seta/shared-ui';
import { useState } from 'react';
import { type ProfileDto, patchProfile } from '../api/client.ts';

// `supportedValuesOf` is not yet typed in TS DOM lib (as of TS 5.x) — cast required.
const TIMEZONES = ((
  Intl as unknown as { supportedValuesOf?: (key: string) => string[] }
).supportedValuesOf?.('timeZone') as string[]) ?? [
  'UTC',
  'America/New_York',
  'Europe/London',
  'Asia/Singapore',
  'Asia/Ho_Chi_Minh',
];

export function ProfileLocaleSection({
  profile,
  onUpdate,
}: {
  profile: ProfileDto;
  onUpdate: (p: ProfileDto) => void;
}) {
  const [tz, setTz] = useState(profile.timezone);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const updated = await patchProfile({ timezone: tz });
      onUpdate(updated);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Locale</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="timezone">Timezone</Label>
          <select
            id="timezone"
            value={tz}
            onChange={(e) => setTz(e.target.value)}
            className={cn(
              'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm',
              'focus:outline-none focus:ring-1 focus:ring-ring',
              'disabled:cursor-not-allowed disabled:opacity-50',
            )}
          >
            {TIMEZONES.map((z) => (
              <option key={z} value={z}>
                {z}
              </option>
            ))}
          </select>
        </div>
        <Button onClick={save} disabled={saving || tz === profile.timezone}>
          Save
        </Button>
      </CardContent>
    </Card>
  );
}
