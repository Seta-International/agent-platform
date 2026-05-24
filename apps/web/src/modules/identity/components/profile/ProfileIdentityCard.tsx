import {
  Avatar,
  AvatarFallback,
  Button,
  Card,
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@seta/shared-ui';
import { Calendar, Check, ChevronsUpDown } from 'lucide-react';
import { useState } from 'react';
import type { ProfileDto, SaveProfile } from '../../api/client.ts';

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

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((s) => s[0]?.toUpperCase() ?? '')
    .slice(0, 2)
    .join('');
}

function TimezonePicker({ value, onChange }: { value: string; onChange: (next: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="secondary"
          aria-expanded={open}
          className="w-full justify-between font-normal h-9"
        >
          <span className="truncate">{value || 'Select timezone'}</span>
          <ChevronsUpDown className="ml-2 size-4 opacity-50 flex-none" />
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
  const dirty = name !== profile.display_name || tz !== profile.timezone || whDirty;

  async function save() {
    if (!dirty || whInvalid) return;
    setSaving(true);
    try {
      const patch: Parameters<SaveProfile>[0] = {};
      if (name !== profile.display_name) patch.display_name = name;
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
      const updated = await onSave(patch);
      onUpdate(updated);
      setEditingHours(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="p-5">
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
            <FieldLabel label="Name" />
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          <div>
            <FieldLabel
              label="Email"
              hint="If you change this, you'll need to verify the new email."
            />
            <div className="flex items-center gap-2">
              <Input value={profile.email} readOnly className="font-mono text-sm" />
            </div>
          </div>

          <div>
            <FieldLabel label="Timezone" />
            <TimezonePicker value={tz} onChange={setTz} />
          </div>

          <div>
            <FieldLabel label="Working hours" />
            {canEditWorkingHours && editingHours ? (
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
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setWhStart(wh?.start ?? '');
                    setWhEnd(wh?.end ?? '');
                    setEditingHours(false);
                  }}
                >
                  Cancel
                </Button>
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
                  >
                    Edit
                  </Button>
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
            <Button onClick={save} disabled={saving || !dirty || Boolean(whInvalid)}>
              Save changes
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}
