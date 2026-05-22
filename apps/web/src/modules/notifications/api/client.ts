export interface NotificationDTO {
  id: string;
  event_type: string;
  payload: Record<string, unknown>;
  created_at: string;
  read_at: string | null;
}

export interface ListNotificationsResponse {
  items: NotificationDTO[];
  next_cursor: string | null;
}

export class NotificationsClientError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message?: string) {
    super(message ?? `${status} ${code}`);
    this.name = 'NotificationsClientError';
    this.status = status;
    this.code = code;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    credentials: 'include',
    headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
    ...init,
  });
  const text = await res.text();
  const body = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  if (!res.ok) {
    const code = typeof body.error === 'string' ? body.error : `HTTP_${res.status}`;
    throw new NotificationsClientError(
      res.status,
      code,
      typeof body.message === 'string' ? body.message : undefined,
    );
  }
  return body as T;
}

export interface NotificationPrefRowDTO {
  event_type: string;
  label: string;
  in_app_enabled: boolean;
  email_enabled: boolean;
  email_available: boolean;
}

export interface NotificationPrefsResponse {
  rows: NotificationPrefRowDTO[];
}

export interface PatchPrefInput {
  event_type: string;
  channel: 'in_app' | 'email';
  enabled: boolean;
}

export const notificationsClient = {
  list({
    unread,
    cursor,
    limit,
  }: {
    unread?: boolean;
    cursor?: string;
    limit?: number;
  } = {}): Promise<ListNotificationsResponse> {
    const params = new URLSearchParams();
    if (unread) params.set('unread', 'true');
    if (cursor) params.set('cursor', cursor);
    if (limit !== undefined) params.set('limit', String(limit));
    const qs = params.toString();
    return request<ListNotificationsResponse>(`/api/core/v1/notifications${qs ? `?${qs}` : ''}`);
  },
  unreadCount(): Promise<{ count: number }> {
    return request<{ count: number }>(`/api/core/v1/notifications/unread-count`);
  },
  markRead(id: string): Promise<NotificationDTO> {
    return request<NotificationDTO>(`/api/core/v1/notifications/${id}/read`, { method: 'POST' });
  },
  markAllRead(): Promise<{ updated: number }> {
    return request<{ updated: number }>(`/api/core/v1/notifications/read-all`, { method: 'POST' });
  },
  dismiss(id: string): Promise<NotificationDTO> {
    return request<NotificationDTO>(`/api/core/v1/notifications/${id}/dismiss`, { method: 'POST' });
  },
  listPrefs(): Promise<NotificationPrefsResponse> {
    return request<NotificationPrefsResponse>(`/api/core/v1/notification-prefs`);
  },
  setPref(input: PatchPrefInput): Promise<{ ok: true }> {
    return request<{ ok: true }>(`/api/core/v1/notification-prefs`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    });
  },
};
