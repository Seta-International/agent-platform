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
      type: 'integrations.m365_tenant_config.updated';
      payload: { entraTenantId: string; enabled: boolean };
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
      /** One directory pull finished (design §11). Payload is the §11 counter set. */
      type: 'integrations.m365.directory.synced';
      payload: {
        tenant_id: string;
        full: boolean;
        users_seen: number;
        users_filtered: number;
        users_created: number;
        users_updated: number;
        users_unchanged: number;
        users_collided: number;
        users_removed: number;
        org_units_created: number;
        org_units_renamed: number;
        heads_set: number;
        manager_ambiguous: number;
        photos_stored: number;
        photos_missing: number;
        mailbox_forbidden: number;
      };
    }
  | {
      /**
       * An Entra user vanished from the directory. The link row is soft-removed and a
       * `user_removed` conflict is raised; the person is deliberately left alone (§8.3 —
       * offboarding stays a human decision).
       */
      type: 'integrations.m365.directory.user.removed';
      payload: { tenant_id: string; entra_oid: string; person_id: string };
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
