import {
  Avatar,
  Button,
  Card,
  Field,
  HStack,
  Input,
  StackItem,
  Text,
  Textarea,
  TimeInput,
  VStack,
} from '@seta/shared-ui';
import { Calendar } from 'lucide-react';
import { useId, useState } from 'react';
import type { ProfileDto, SaveProfile } from '../../api/client.ts';
import { TimezonePicker } from '../TimezonePicker';

const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const BIO_MAX = 500;

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
  const workingHoursId = useId();
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
      <HStack gap={5} vAlign="start">
        <Avatar name={profile.display_name} size={64} />

        <StackItem size="fill">
          <VStack gap={4}>
            <Input label="Name" value={name} onChange={(value) => setName(value)} />

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

            <Input
              label="Email"
              description="If you change this, you'll need to verify the new email."
              value={profile.email}
              isDisabled
              className="font-mono text-sm"
            />

            <TimezonePicker value={tz} onChange={setTz} isLabelHidden={false} />

            {!editingHours && <Text weight="semibold">Working hours</Text>}
            {canEditWorkingHours && editingHours ? (
              <Field
                label="Working hours"
                inputID={workingHoursId}
                labelID={workingHoursId}
                isGroupLabel
                status={
                  whInvalid ? { type: 'error', message: 'Use 24-hour time, like 09:00' } : undefined
                }
                statusVariant="detached"
              >
                <fieldset aria-labelledby={workingHoursId} className="flex items-center gap-2">
                  <TimeInput
                    label="Working hours start"
                    isLabelHidden
                    hourFormat="24h"
                    value={whStart || undefined}
                    onChange={(v) => setWhStart(v ?? '')}
                  />
                  <Text type="supporting">to</Text>
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
                </fieldset>
              </Field>
            ) : (
              <HStack gap={2} vAlign="center">
                <Calendar className="size-3.5 text-secondary" />
                <Text>{wh ? `Mon–Fri · ${wh.start}–${wh.end}` : 'Not set'}</Text>
                <StackItem size="fill" />
                {canEditWorkingHours ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditingHours(true)}
                    label="Edit"
                  />
                ) : (
                  <Text type="supporting">Set by your admin</Text>
                )}
              </HStack>
            )}

            <HStack hAlign="end">
              <Button
                onClick={save}
                isDisabled={saving || !dirty || Boolean(whInvalid) || bioTooLong}
                label="Save changes"
              />
            </HStack>
          </VStack>
        </StackItem>
      </HStack>
    </Card>
  );
}
