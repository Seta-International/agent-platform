import {
  Alert,
  AlertDescription,
  Badge,
  Button,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@seta/shared-ui';
import { useEffect, useState } from 'react';
import { type AdminUserDetail, deactivateAdminUser, getAdminUserDetail } from '../api/client.ts';
import { GrantRoleCombobox } from './GrantRoleCombobox.tsx';
import { RoleGrantList } from './RoleGrantList.tsx';

export function UserDetailDrawer({
  userId,
  onClose,
  onChange,
}: {
  userId: string | null;
  onClose: () => void;
  onChange: () => void;
}) {
  const [detail, setDetail] = useState<AdminUserDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    if (!userId) return;
    try {
      setDetail(await getAdminUserDetail(userId));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!userId) {
        setDetail(null);
        return;
      }
      try {
        const d = await getAdminUserDetail(userId);
        if (!cancelled) {
          setDetail(d);
          setError(null);
        }
      } catch (e: unknown) {
        if (!cancelled) setError((e as Error).message);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  async function toggle() {
    if (!detail) return;
    setError(null);
    try {
      await deactivateAdminUser(
        detail.profile.user_id,
        detail.profile.deactivated_at ? 'reactivate' : 'deactivate',
      );
      await refresh();
      onChange();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <Sheet
      open={userId !== null}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <SheetContent side="right" className="w-[480px] sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{detail?.profile.display_name ?? '…'}</SheetTitle>
        </SheetHeader>
        {detail && (
          <div className="space-y-6 py-4">
            <div className="space-y-1">
              <div className="text-sm">{detail.profile.email}</div>
              <div className="flex gap-2">
                <Badge variant={detail.profile.deactivated_at ? 'destructive' : 'secondary'}>
                  {detail.profile.deactivated_at
                    ? 'deactivated'
                    : detail.profile.availability_status === 'ooo'
                      ? 'ooo'
                      : 'active'}
                </Badge>
                <Badge variant="outline">tz: {detail.profile.timezone}</Badge>
              </div>
            </div>
            <div>
              <div className="mb-2 text-sm font-medium">Skills</div>
              <div className="flex flex-wrap gap-1">
                {detail.profile.skills.length === 0 ? (
                  <span className="text-sm text-muted-foreground">None</span>
                ) : (
                  detail.profile.skills.map((s) => (
                    <Badge key={s} variant="secondary">
                      {s}
                    </Badge>
                  ))
                )}
              </div>
            </div>
            <div>
              <div className="mb-2 text-sm font-medium">Roles</div>
              <RoleGrantList
                grants={detail.grants}
                onChange={() => {
                  void refresh();
                  onChange();
                }}
              />
              <div className="mt-2">
                <GrantRoleCombobox
                  userId={detail.profile.user_id}
                  existing={detail.grants.map((g) => g.role_slug)}
                  onChange={() => {
                    void refresh();
                    onChange();
                  }}
                />
              </div>
            </div>
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <Button
              variant={detail.profile.deactivated_at ? 'default' : 'destructive'}
              onClick={() => void toggle()}
            >
              {detail.profile.deactivated_at ? 'Reactivate user' : 'Deactivate user'}
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
