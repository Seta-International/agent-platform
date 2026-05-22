import type { WorkflowRunScope } from '../state/query-keys.ts';
import {
  DecideApprovalResponse,
  ListWorkflowRunsResponse,
  PendingApprovalsResponse,
  SseTokenResponse,
  WorkflowRunRow,
} from './schemas.ts';

interface ApiErrorBody {
  error?: string;
  message?: string;
}

async function jsonOrThrow<T>(res: Response, schema?: { parse: (v: unknown) => T }): Promise<T> {
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}) as ApiErrorBody)) as ApiErrorBody;
    throw Object.assign(new Error(body.message ?? res.statusText), {
      status: res.status,
      code: body.error,
    });
  }
  const json = (await res.json()) as unknown;
  return schema ? schema.parse(json) : (json as T);
}

export interface ListRunsOpts {
  scope: WorkflowRunScope;
  cursor?: string;
  limit?: number;
}

export interface DecideApprovalBody {
  decision: 'approve' | 'reject' | 'modify';
  overrideUserId?: string;
  note?: string;
}

export const workflowsApi = {
  async listRuns(opts: ListRunsOpts) {
    const qs = new URLSearchParams({ scope: opts.scope });
    if (opts.cursor) qs.set('cursor', opts.cursor);
    if (opts.limit != null) qs.set('limit', String(opts.limit));
    const res = await fetch(`/api/copilot/v1/workflows/runs?${qs}`, {
      credentials: 'include',
    });
    return jsonOrThrow(res, ListWorkflowRunsResponse);
  },

  async getRun(runId: string) {
    const res = await fetch(`/api/copilot/v1/workflows/runs/${encodeURIComponent(runId)}`, {
      credentials: 'include',
    });
    if (res.status === 404) return null;
    return jsonOrThrow(res, WorkflowRunRow);
  },

  async getRunSnapshot(runId: string): Promise<unknown | null> {
    const res = await fetch(
      `/api/copilot/v1/workflows/runs/${encodeURIComponent(runId)}/snapshot`,
      { credentials: 'include' },
    );
    if (res.status === 404) return null;
    return jsonOrThrow<unknown>(res);
  },

  async listMyPendingApprovals() {
    const res = await fetch('/api/copilot/v1/workflows/my-pending-approvals', {
      credentials: 'include',
    });
    return jsonOrThrow(res, PendingApprovalsResponse);
  },

  async decideApproval(approvalId: string, body: DecideApprovalBody) {
    const res = await fetch(
      `/api/copilot/v1/workflows/approvals/${encodeURIComponent(approvalId)}/decide`,
      {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
    );
    return jsonOrThrow(res, DecideApprovalResponse);
  },

  async cancelRun(runId: string): Promise<void> {
    const res = await fetch(`/api/copilot/v1/workflows/runs/${encodeURIComponent(runId)}/cancel`, {
      method: 'POST',
      credentials: 'include',
    });
    await jsonOrThrow<{ ok: true }>(res);
  },

  async rerunRun(runId: string, inputOverride?: Record<string, unknown>) {
    const res = await fetch(`/api/copilot/v1/workflows/runs/${encodeURIComponent(runId)}/rerun`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inputOverride }),
    });
    return jsonOrThrow<{ newRunId: string }>(res);
  },

  async replayFromStep(
    runId: string,
    stepId: string,
    payload: Record<string, unknown>,
  ): Promise<{ newRunId: string }> {
    const res = await fetch(
      `/api/copilot/v1/workflows/runs/${encodeURIComponent(runId)}/replay-from-step`,
      {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stepId, payload }),
      },
    );
    return jsonOrThrow<{ newRunId: string }>(res);
  },

  async getInputSchema(workflowId: string): Promise<Record<string, unknown> | null> {
    const res = await fetch(
      `/api/copilot/v1/workflows/${encodeURIComponent(workflowId)}/input-schema`,
      { credentials: 'include' },
    );
    if (res.status === 404) return null;
    return jsonOrThrow<Record<string, unknown>>(res);
  },

  async issueSseToken(): Promise<string> {
    const res = await fetch('/api/copilot/v1/workflows/sse-token', {
      credentials: 'include',
    });
    const out = await jsonOrThrow(res, SseTokenResponse);
    return out.token;
  },
};
