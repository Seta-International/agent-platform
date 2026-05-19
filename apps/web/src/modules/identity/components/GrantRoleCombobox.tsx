import { Button } from '@seta/shared-ui';
import { useState } from 'react';
import { grantTenantRole } from '../api/client.ts';
import { TENANT_ROLE_SLUGS } from '../constants.ts';

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
  const available = TENANT_ROLE_SLUGS.filter((r) => !existing.includes(r));

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
