import { Button, Card, CardContent, CardHeader, CardTitle, Input, Label } from '@seta/shared-ui';
import { useState } from 'react';
import { type ProfileDto, patchProfile } from '../api/client.ts';

export function ProfileAccountSection({
  profile,
  onUpdate,
}: {
  profile: ProfileDto;
  onUpdate: (p: ProfileDto) => void;
}) {
  const [name, setName] = useState(profile.display_name);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const updated = await patchProfile({ display_name: name });
      onUpdate(updated);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Account</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="display_name">Display name</Label>
          <Input id="display_name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>Email</Label>
          <Input value={profile.email} readOnly />
        </div>
        <p className="text-sm text-muted-foreground">
          Password change coming soon — contact your admin to reset for now.
        </p>
        <Button onClick={save} disabled={saving || name === profile.display_name}>
          Save
        </Button>
      </CardContent>
    </Card>
  );
}
