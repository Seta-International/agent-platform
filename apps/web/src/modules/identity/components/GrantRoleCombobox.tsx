import { Button } from '@seta/shared-ui';
import { useState } from 'react';
import { grantTenantRole } from '../api/client.ts';

const ROLE_OPTIONS = [
  'org.admin',
  'org.viewer',
  'identity.admin',
  'identity.viewer',
  'copilot.admin',
  'copilot.contributor',
  'copilot.viewer',
  'integrations.admin',
  'integrations.viewer',
  'planner.admin',
];

export function GrantRoleCombobox({
  userId,
  existing,
  onChange,
}: {
  userId: string;
  existing: string[];
  onChange: () => void;
}) {
  const [role, setRole] = useState('');
  const available = ROLE_OPTIONS.filter((r) => !existing.includes(r));

  async function grant() {
    if (!role) return;
    await grantTenantRole(userId, role);
    setRole('');
    onChange();
  }

  return (
    <div className="flex gap-2">
      <select
        value={role}
        onChange={(e) => setRole(e.target.value)}
        className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
        aria-label="Add role"
      >
        <option value="">Add role…</option>
        {available.map((r) => (
          <option key={r} value={r}>
            {r}
          </option>
        ))}
      </select>
      <Button onClick={grant} disabled={!role}>
        Grant
      </Button>
    </div>
  );
}
