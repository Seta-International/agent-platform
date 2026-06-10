import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getRoleAccessMatrix,
  type MatrixRole,
  resetRole,
  setRolePermission,
} from '../api/role-access-client.ts';
import { roleAccessKeys } from '../state/query-keys.ts';

const KEY = roleAccessKeys.matrix();

export function useRoleAccessMatrix() {
  return useQuery({ queryKey: KEY, queryFn: () => getRoleAccessMatrix() });
}

function patchCells(
  roles: MatrixRole[],
  slug: string,
  fn: (role: MatrixRole) => MatrixRole,
): MatrixRole[] {
  return roles.map((r) => (r.slug === slug ? fn(r) : r));
}

export function useSetRolePermission() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { role: string; permission: string; enabled: boolean }) =>
      setRolePermission(v.role, v.permission, v.enabled),
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: KEY });
      const prev = qc.getQueryData<MatrixRole[]>(KEY);
      if (prev) {
        qc.setQueryData<MatrixRole[]>(
          KEY,
          patchCells(prev, v.role, (role) => ({
            ...role,
            cells: role.cells.map((c) =>
              c.permission_key === v.permission
                ? { ...c, effective: v.enabled, overridden: v.enabled !== c.seedDefault }
                : c,
            ),
          })),
        );
      }
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(KEY, ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useResetRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (slug: string) => resetRole(slug),
    onMutate: async (slug) => {
      await qc.cancelQueries({ queryKey: KEY });
      const prev = qc.getQueryData<MatrixRole[]>(KEY);
      if (prev) {
        qc.setQueryData<MatrixRole[]>(
          KEY,
          patchCells(prev, slug, (role) => ({
            ...role,
            cells: role.cells.map((c) => ({ ...c, effective: c.seedDefault, overridden: false })),
          })),
        );
      }
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(KEY, ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}
