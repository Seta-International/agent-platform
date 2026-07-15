import { Avatar, AvatarFallback, Button, Card, Input, Textarea, TimeInput } from '@seta/shared-ui';
import { Calendar } from 'lucide-react';
import { useState } from 'react';
import type { ProfileDto, SaveProfile } from '../../api/client.ts';
import { TimezonePicker } from '../TimezonePicker';

const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const BIO_MAX = 500;

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((s) => s[0]?.toUpperCase() ?? '')
    .slice(0, 2)
    .join('');
}

function FieldLabel({ label, hint }: { label: string; hint?: string }) {
  return (
    <div className="flex items-baseline justify-between mb-1.5">
      <span className="text-xs font-medium text-ink-muted">{label}</span>
      {hint && <span className="text-xs text-ink-subtle">{hint}</span>}
    </div>
  );
}

export function ProfileIdentityCard({
  profile,
  onSave,
  onUpdate,
  canEditWorkingHours = false,
}: {
  profile: ProfileDto;
  onSave: SaveProfile;
  onUpdate: (p: ProfileDto) => void;
  canEditWorkingHours?: boolean;
}) {
  const [name, setName] = useState(profile.display_name);
  const [tz, setTz] = useState(profile.timezone);
  const [bio, setBio] = useState(profile.bio ?? '');
  const [whStart, setWhStart] = useState(profile.working_hours?.start ?? '');
  const [whEnd, setWhEnd] = useState(profile.working_hours?.end ?? '');
  const [editingHours, setEditingHours] = useState(false);
  const [saving, setSaving] = useState(false);

  const wh = profile.working_hours;
  const whDirty =
    canEditWorkingHours &&
    (wh ? whStart !== wh.start || whEnd !== wh.end : Boolean(whStart) || Boolean(whEnd));
  const whInvalid =
    canEditWorkingHours && (whStart || whEnd) && !(whStart.match(HHMM_RE) && whEnd.match(HHMM_RE));
  const bioDirty = bio !== (profile.bio ?? '');
  const bioTooLong = bio.length > BIO_MAX;
  const dirty = name !== profile.display_name || tz !== profile.timezone || bioDirty || whDirty;

  async function save() {
    if (!dirty || whInvalid || bioTooLong) return;
    setSaving(true);
    try {
      const patch: Parameters<SaveProfile>[0] = {};
      if (name !== profile.display_name) patch.display_name = name;
      if (tz !== profile.timezone) patch.timezone = tz;
      if (bioDirty) patch.bio = bio;
      if (canEditWorkingHours) {
        const bothBlank = !whStart && !whEnd;
        const valid = whStart.match(HHMM_RE) && whEnd.match(HHMM_RE);
        if (bothBlank) {
          if (profile.working_hours !== null) patch.working_hours = null;
        } else if (valid) {
          const next = { start: whStart, end: whEnd };
          if (JSON.stringify(next) !== JSON.stringify(profile.working_hours)) {
            patch.working_hours = next;
          }
        }
      }
      const updated = await onSave(patch);
      onUpdate(updated);
      setEditingHours(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card padding={5}>
      <div className="flex items-start gap-5">
        <div className="flex flex-col items-center gap-2 flex-none">
          <Avatar className="size-16">
            <AvatarFallback className="text-base font-semibold">
              {initials(profile.display_name)}
            </AvatarFallback>
          </Avatar>
        </div>

        <div className="flex-1 min-w-0 flex flex-col gap-3.5">
          <div>
            <Input label="Name" value={name} onChange={(value) => setName(value)} />
          </div>

          <Textarea
            label="Bio"
            value={bio}
            maxLength={BIO_MAX}
            rows={4}
            placeholder="Add a short bio so teammates know who you are."
            onChange={(value) => setBio(value)}
            status={
              bioTooLong
                ? { type: 'error', message: `Bio cannot exceed ${BIO_MAX} characters.` }
                : undefined
            }
          />

          <div>
            <Input
              label="Email"
              description="If you change this, you'll need to verify the new email."
              value={profile.email}
              isDisabled
              className="font-mono text-sm"
            />
          </div>

          <div>
            <FieldLabel label="Timezone" />
            <TimezonePicker value={tz} onChange={setTz} />
          </div>

          <div>
            <FieldLabel label="Working hours" />
            {canEditWorkingHours && editingHours ? (
              <div className="flex items-center gap-2">
                <TimeInput
                  label="Working hours start"
                  isLabelHidden
                  hourFormat="24h"
                  value={whStart || undefined}
                  onChange={(v) => setWhStart(v ?? '')}
                />
                <span className="text-ink-muted text-sm">to</span>
                <TimeInput
                  label="Working hours end"
                  isLabelHidden
                  hourFormat="24h"
                  value={whEnd || undefined}
                  onChange={(v) => setWhEnd(v ?? '')}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setWhStart(wh?.start ?? '');
                    setWhEnd(wh?.end ?? '');
                    setEditingHours(false);
                  }}
                  label="Cancel"
                />
              </div>
            ) : (
              <div className="flex items-center gap-2.5 rounded-md border border-hairline-strong px-3 py-1.5 text-sm">
                <Calendar className="size-3.5 text-ink-muted flex-none" />
                <span>{wh ? `Mon–Fri · ${wh.start}–${wh.end}` : 'Not set'}</span>
                <span className="flex-1" />
                {canEditWorkingHours ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-5 px-2 text-xs"
                    onClick={() => setEditingHours(true)}
                    label="Edit"
                  />
                ) : (
                  <span className="text-xs text-ink-subtle">Set by your admin</span>
                )}
              </div>
            )}
            {whInvalid && (
              <p className="mt-1 text-xs text-destructive">Use 24-hour time, like 09:00</p>
            )}
          </div>

          <div className="flex justify-end pt-1">
            <Button
              onClick={save}
              isDisabled={saving || !dirty || Boolean(whInvalid) || bioTooLong}
              label="Save changes"
            />
          </div>
        </div>
      </div>
    </Card>
  );
}
