import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
  Input,
  Label,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@seta/shared-ui';
import { Check, ChevronsUpDown } from 'lucide-react';
import { useState } from 'react';
import type { ProfileDto, SaveProfile } from '../api/client.ts';

const TIMEZONES = ((
  Intl as unknown as { supportedValuesOf?: (key: string) => string[] }
).supportedValuesOf?.('timeZone') as string[]) ?? [
  'UTC',
  'America/New_York',
  'Europe/London',
  'Asia/Singapore',
  'Asia/Ho_Chi_Minh',
];

const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function TimezonePicker({ value, onChange }: { value: string; onChange: (next: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="secondary"
          aria-expanded={open}
          className="w-full justify-between font-normal"
        >
          {value || 'Select timezone'}
          <ChevronsUpDown className="ml-2 h-4 w-4 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] p-0">
        <Command>
          <CommandInput placeholder="Search timezone…" />
          <CommandList className="max-h-72">
            <CommandEmpty>No timezone found.</CommandEmpty>
            {TIMEZONES.map((z) => (
              <CommandItem
                key={z}
                value={z}
                onSelect={() => {
                  onChange(z);
                  setOpen(false);
                }}
              >
                <Check className={`mr-2 h-4 w-4 ${value === z ? 'opacity-100' : 'opacity-0'}`} />
                {z}
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

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
      <CardHeader>
        <CardTitle>Locale</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="timezone">Timezone</Label>
          <TimezonePicker value={tz} onChange={setTz} />
        </div>
        {canEditWorkingHours ? (
          <div className="space-y-2">
            <Label>Working hours (Mon–Fri)</Label>
            <div className="flex items-center gap-2">
              <Input
                type="time"
                aria-label="Working hours start"
                value={whStart}
                onChange={(e) => setWhStart(e.target.value)}
                className="w-32"
              />
              <span className="text-ink-muted text-sm">to</span>
              <Input
                type="time"
                aria-label="Working hours end"
                value={whEnd}
                onChange={(e) => setWhEnd(e.target.value)}
                className="w-32"
              />
              {(whStart || whEnd) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setWhStart('');
                    setWhEnd('');
                  }}
                >
                  Clear
                </Button>
              )}
            </div>
            {whInvalid && <p className="text-xs text-destructive">Use HH:MM (24-hour)</p>}
          </div>
        ) : (
          wh && (
            <div className="space-y-2">
              <Label>Working hours (Mon–Fri)</Label>
              <p className="text-sm text-ink-muted">
                {wh.start}–{wh.end} · contact your admin to change
              </p>
            </div>
          )
        )}
        <Button onClick={save} disabled={saving || !dirty || Boolean(whInvalid)}>
          Save
        </Button>
      </CardContent>
    </Card>
  );
}
