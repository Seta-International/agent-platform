import {
  Button,
  Card,
  CardTitle,
  Input,
  Label,
  Layout,
  LayoutContent,
  LayoutHeader,
} from '@seta/shared-ui';
import { useState } from 'react';
import type { ProfileDto, SaveProfile } from '../api/client.ts';

export function ProfileAccountSection({
  profile,
  onSave,
  onUpdate,
  showEmail = true,
  passwordHint,
}: {
  profile: ProfileDto;
  onSave: SaveProfile;
  onUpdate: (p: ProfileDto) => void;
  showEmail?: boolean;
  passwordHint?: string;
}) {
  const [name, setName] = useState(profile.display_name);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const updated = await onSave({ display_name: name });
      onUpdate(updated);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <Layout
        header={
          <LayoutHeader hasDivider>
            <CardTitle>Account</CardTitle>
          </LayoutHeader>
        }
        content={
          <LayoutContent>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="display_name">Display name</Label>
                <Input id="display_name" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              {showEmail && (
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input value={profile.email} readOnly />
                </div>
              )}
              {passwordHint && <p className="text-sm text-ink-muted">{passwordHint}</p>}
              <div className="flex justify-end pt-1">
                <Button onClick={save} disabled={saving || name === profile.display_name}>
                  Save changes
                </Button>
              </div>
            </div>
          </LayoutContent>
        }
      />
    </Card>
  );
}
