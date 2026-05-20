export type CopilotEvent =
  | {
      type: 'copilot.thread.created';
      aggregate_id: string;
      data: { thread_id: string; user_id: string; tenant_id: string };
    }
  | {
      type: 'copilot.message.user.sent';
      aggregate_id: string;
      data: { thread_id: string; message_id: string };
    }
  | {
      type: 'copilot.message.agent.completed';
      aggregate_id: string;
      data: { thread_id: string; message_id: string; tokens_in: number; tokens_out: number };
    }
  | {
      type: 'copilot.tool.invoked';
      aggregate_id: string;
      data: { thread_id: string; tool_name: string; call_id: string };
    }
  | {
      type: 'copilot.tool.completed';
      aggregate_id: string;
      data: {
        thread_id: string;
        tool_name: string;
        call_id: string;
        duration_ms: number;
        status: 'ok' | 'error';
      };
    }
  | {
      type: 'copilot.hitl.requested';
      aggregate_id: string;
      data: { thread_id: string; call_id: string; tool_name: string; expires_at: string };
    }
  | {
      type: 'copilot.hitl.approved';
      aggregate_id: string;
      data: { thread_id: string; call_id: string; resolved_by_user_id: string };
    }
  | {
      type: 'copilot.hitl.rejected';
      aggregate_id: string;
      data: { thread_id: string; call_id: string; resolved_by_user_id: string; note?: string };
    }
  | {
      type: 'copilot.hitl.expired';
      aggregate_id: string;
      data: { thread_id: string; call_id: string };
    }
  | {
      type: 'copilot.delegate';
      aggregate_id: string;
      data: { thread_id: string; from_agent: string; to_agent: string };
    };
