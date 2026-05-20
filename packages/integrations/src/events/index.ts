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
    };
