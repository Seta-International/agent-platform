import {
  Button,
  Card,
  CardTitle,
  Field,
  Layout,
  LayoutContent,
  LayoutHeader,
  TimeInput,
} from '@seta/shared-ui';
import { useId, useState } from 'react';
import type { ProfileDto, SaveProfile } from '../api/client.ts';
import { TimezonePicker } from './TimezonePicker';

const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export function ProfileLocaleSection({
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
  const [tz, setTz] = useState(profile.timezone);
  const [whStart, setWhStart] = useState(profile.working_hours?.start ?? '');
  const [whEnd, setWhEnd] = useState(profile.working_hours?.end ?? '');
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const patch: Parameters<SaveProfile>[0] = {};
      if (tz !== profile.timezone) patch.timezone = tz;
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
      if (Object.keys(patch).length === 0) return;
      const updated = await onSave(patch);
      onUpdate(updated);
    } finally {
      setSaving(false);
    }
  }

  const wh = profile.working_hours;
  const whDirty =
    canEditWorkingHours &&
    (wh ? whStart !== wh.start || whEnd !== wh.end : Boolean(whStart) || Boolean(whEnd));
  const whInvalid =
    canEditWorkingHours && (whStart || whEnd) && !(whStart.match(HHMM_RE) && whEnd.match(HHMM_RE));
  const dirty = tz !== profile.timezone || whDirty;

  return (
    <Card>
      <Layout
        header={
          <LayoutHeader hasDivider>
            <CardTitle>Locale</CardTitle>
          </LayoutHeader>
        }
        content={
          <LayoutContent>
            <div className="space-y-4">
              <TimezonePicker value={tz} onChange={setTz} isLabelHidden={false} />
              {canEditWorkingHours ? (
                <Field
                  label="Working hours (Mon–Fri)"
                  inputID={workingHoursId}
                  labelID={workingHoursId}
                  isGroupLabel
                  status={
                    whInvalid
                      ? { type: 'error', message: 'Use 24-hour time, like 09:00' }
                      : undefined
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
                    <span className="text-ink-muted text-sm">to</span>
                    <TimeInput
                      label="Working hours end"
                      isLabelHidden
                      hourFormat="24h"
                      value={whEnd || undefined}
                      onChange={(v) => setWhEnd(v ?? '')}
                    />
                    {(whStart || whEnd) && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setWhStart('');
                          setWhEnd('');
                        }}
                        label="Clear"
                      />
                    )}
                  </fieldset>
                </Field>
              ) : (
                wh && (
                  <div className="space-y-2">
                    <span className="text-body-sm font-medium text-ink">
                      Working hours (Mon–Fri)
                    </span>
                    <p className="text-sm text-ink-muted">
                      {wh.start}–{wh.end} · contact your admin to change
                    </p>
                  </div>
                )
              )}
              <div className="flex justify-end pt-1">
                <Button
                  onClick={save}
                  isDisabled={saving || !dirty || Boolean(whInvalid)}
                  label="Save changes"
                />
              </div>
            </div>
          </LayoutContent>
        }
      />
    </Card>
  );
}
