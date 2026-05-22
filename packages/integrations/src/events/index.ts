export type IntegrationsEvent =
  | {
      type: 'integrations.mail_transport.configured';
      payload: { kind: 'graph' | 'smtp'; sender_address: string };
    }
  | {
      type: 'integrations.mail_transport.disabled';
      payload: Record<string, never>;
    }
  | {
      type: 'integrations.mail_transport.verify_succeeded';
      payload: { kind: 'graph' | 'smtp'; transport_message_id: string | null };
    }
  | {
      type: 'integrations.mail_transport.verify_failed';
      payload: { kind: 'graph' | 'smtp'; error_code: string; error_message: string };
    }
  | {
      type: 'integrations.m365_tenant_config.set';
      payload: { entra_tenant_id: string; client_id: string };
    }
  | {
      type: 'integrations.m365.member.skipped';
      payload: {
        group_id: string;
        entra_oid: string;
        reason: 'not_provisioned';
      };
    }
  | {
      type: 'integrations.m365.group.field-conflict';
      payload: {
        group_id: string;
        conflict_fields: string[];
      };
    }
  | {
      type: 'integrations.m365.assignee.skipped';
      payload: {
        tenant_id: string;
        plan_id: string;
        task_id: string;
        entra_oid: string;
        reason: 'not_provisioned';
      };
    }
  | {
      type: 'integrations.m365.task.field-conflict';
      payload: {
        tenant_id: string;
        plan_id: string;
        task_id: string;
        external_task_id: string;
        conflicts: Array<{ field: string; local: unknown; remote: unknown; snapshot: unknown }>;
      };
    }
  | {
      type: 'integrations.m365.plan.field-conflict';
      payload: {
        tenant_id: string;
        plan_id: string;
        conflicts: Array<{
          scope: string;
          field: string;
          local: unknown;
          remote: unknown;
          snapshot: unknown;
        }>;
      };
    };
