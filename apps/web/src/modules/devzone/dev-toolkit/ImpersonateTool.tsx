import { AlertCircle, Loader2, LogIn, Users } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { listTenantUsers, type TenantUserRow } from '@/modules/identity/api/client.ts';
import { startImpersonation } from './api.ts';

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((s) => s[0]?.toUpperCase() ?? '')
    .slice(0, 2)
    .join('');
}

interface Props {
  onImpersonated: () => void;
}

export function ImpersonateTool({ onImpersonated }: Props) {
  const [query, setQuery] = useState('');
  const [users, setUsers] = useState<TenantUserRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [acting, setActing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const doSearch = useCallback((q: string) => {
    setLoading(true);
    setError(null);
    listTenantUsers({ search: q, limit: 8, offset: 0 })
      .then((r) => setUsers(r.rows))
      .catch(() => setError('Failed to load users'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    inputRef.current?.focus();
    void doSearch('');
  }, [doSearch]);

  function handleInput(e: React.ChangeEvent<HTMLInputElement>) {
    const q = e.target.value;
    setQuery(q);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(q), 250);
  }

  async function handleImpersonate(user: TenantUserRow) {
    setActing(user.user_id);
    setError(null);
    const result = await startImpersonation(user.user_id);
    if (result.ok) {
      onImpersonated();
    } else {
      setError(result.error ?? 'Impersonation failed');
      setActing(null);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Search */}
      <div className="relative">
        <Users className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-tertiary pointer-events-none" />
        <input
          ref={inputRef}
          value={query}
          onChange={handleInput}
          placeholder="Search users…"
          className="w-full bg-surface-3 border border-hairline rounded-lg pl-8 pr-3 py-2 text-[11px] font-mono text-ink placeholder:text-ink-tertiary focus:outline-none focus:border-primary/50 transition-colors"
        />
        {loading && (
          <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-ink-tertiary animate-spin" />
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-1.5 text-[10px] font-mono text-destructive">
          <AlertCircle className="w-3 h-3 shrink-0" />
          {error}
        </div>
      )}

      {/* User list */}
      <ul className="flex flex-col gap-0.5 max-h-[240px] overflow-y-auto -mx-1">
        {users.length === 0 && !loading && (
          <li className="px-1 py-3 text-center text-[10px] text-ink-tertiary font-mono">
            No users found
          </li>
        )}
        {users.map((user) => (
          <li key={user.user_id}>
            <button
              type="button"
              onClick={() => void handleImpersonate(user)}
              disabled={acting !== null}
              className="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-surface-3 transition-colors text-left disabled:opacity-50 disabled:cursor-not-allowed group"
            >
              <span className="shrink-0 w-6 h-6 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center text-[9px] font-mono font-medium text-primary-ink">
                {initials(user.name)}
              </span>
              <span className="flex-1 min-w-0 flex flex-col">
                <span className="text-[11px] text-ink font-medium leading-tight truncate">
                  {user.name}
                </span>
                <span className="text-[10px] text-ink-tertiary font-mono truncate">
                  {user.email}
                </span>
                {user.role_slugs.length > 0 && (
                  <span className="flex flex-wrap gap-0.5 mt-0.5">
                    {user.role_slugs.map((role) => (
                      <span
                        key={role}
                        className="text-[9px] font-mono text-ink-subtle border border-hairline rounded px-1 py-0.5 whitespace-nowrap"
                      >
                        {role}
                      </span>
                    ))}
                  </span>
                )}
              </span>
              {acting === user.user_id ? (
                <Loader2 className="shrink-0 w-3 h-3 text-primary animate-spin" />
              ) : (
                <LogIn className="shrink-0 w-3 h-3 text-ink-tertiary opacity-0 group-hover:opacity-100 transition-opacity" />
              )}
            </button>
          </li>
        ))}
      </ul>

      <p className="text-[9px] text-ink-tertiary font-mono leading-relaxed border-t border-hairline pt-2">
        Session cookie replaced. Page reloads to apply. Original session restored on exit.
      </p>
    </div>
  );
}
