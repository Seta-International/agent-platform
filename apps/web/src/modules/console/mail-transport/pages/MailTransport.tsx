import {
  Alert,
  AlertDescription,
  Button,
  Card,
  Input,
  Label,
  PageChrome,
  RadioGroup,
  RadioGroupItem,
  Switch,
} from '@seta/shared-ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import {
  disableMailTransport,
  getMailTransport,
  type MailTransportRow,
  type SetMailTransportInput,
  setMailTransport,
  verifyMailTransport,
} from '../api/mail-transport-client.ts';

const queryKey = ['console', 'mail-transport'] as const;

type Kind = 'graph' | 'smtp';

interface FormState {
  kind: Kind;
  senderAddress: string;
  senderDisplayName: string;
  graphPolicyAcked: boolean;
  smtpHost: string;
  smtpPort: 465 | 587;
  smtpUsername: string;
  smtpPassword: string;
  smtpRequireTls: boolean;
}

function initialState(): FormState {
  return {
    kind: 'graph',
    senderAddress: '',
    senderDisplayName: '',
    graphPolicyAcked: false,
    smtpHost: '',
    smtpPort: 587,
    smtpUsername: '',
    smtpPassword: '',
    smtpRequireTls: true,
  };
}

function hydrate(row: MailTransportRow | null, state: FormState): FormState {
  if (!row) return state;
  if (row.kind === 'graph') {
    const cfg = row.config as { app_access_policy_documented: boolean };
    return {
      ...state,
      kind: 'graph',
      senderAddress: row.sender_address,
      senderDisplayName: row.sender_display_name ?? '',
      graphPolicyAcked: cfg.app_access_policy_documented,
    };
  }
  const cfg = row.config as {
    host: string;
    port: number;
    username: string;
    require_tls: boolean;
  };
  return {
    ...state,
    kind: 'smtp',
    senderAddress: row.sender_address,
    senderDisplayName: row.sender_display_name ?? '',
    smtpHost: cfg.host,
    smtpPort: cfg.port === 465 || cfg.port === 587 ? (cfg.port as 465 | 587) : 587,
    smtpUsername: cfg.username,
    smtpRequireTls: cfg.require_tls,
  };
}

function toInput(form: FormState): SetMailTransportInput {
  const sender_display_name = form.senderDisplayName.trim() || null;
  if (form.kind === 'graph') {
    return {
      kind: 'graph',
      senderAddress: form.senderAddress.trim(),
      senderDisplayName: sender_display_name,
      config: { app_access_policy_documented: form.graphPolicyAcked },
    };
  }
  return {
    kind: 'smtp',
    senderAddress: form.senderAddress.trim(),
    senderDisplayName: sender_display_name,
    config: {
      host: form.smtpHost.trim(),
      port: form.smtpPort,
      username: form.smtpUsername.trim(),
      password: form.smtpPassword,
      require_tls: form.smtpRequireTls,
    },
  };
}

export function MailTransport() {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery<MailTransportRow | null>({
    queryKey,
    queryFn: () => getMailTransport(),
  });

  const hydrated = useMemo(() => hydrate(data ?? null, initialState()), [data]);
  const [overrides, setOverrides] = useState<Partial<FormState>>({});
  const form: FormState = { ...hydrated, ...overrides };
  const setForm = (updater: (prev: FormState) => FormState) => {
    setOverrides((prev) => {
      const next = updater({ ...hydrated, ...prev });
      const diff: Partial<FormState> = {};
      for (const k of Object.keys(next) as (keyof FormState)[]) {
        if (next[k] !== hydrated[k]) {
          (diff as Record<keyof FormState, FormState[keyof FormState]>)[k] = next[k];
        }
      }
      return diff;
    });
  };

  const save = useMutation({
    mutationFn: (input: SetMailTransportInput) => setMailTransport(input),
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });
  const disable = useMutation({
    mutationFn: () => disableMailTransport(),
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });
  const [verifyEmail, setVerifyEmail] = useState('');
  const verify = useMutation({
    mutationFn: (recipient: string) => verifyMailTransport(recipient),
  });

  const setKind = (next: Kind) => setForm((s) => ({ ...s, kind: next }));
  const enabled = data?.enabled ?? false;

  return (
    <PageChrome
      breadcrumb={['Admin']}
      title="Mail transport"
      subtitle={
        enabled
          ? `Active · ${data?.kind === 'graph' ? 'Microsoft Graph' : 'SMTP'}`
          : 'Not configured'
      }
    >
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{(error as Error).message}</AlertDescription>
        </Alert>
      )}

      <Card className="p-5 space-y-5">
        <div>
          <Label className="text-eyebrow uppercase text-ink-subtle">Transport</Label>
          <RadioGroup
            value={form.kind}
            onValueChange={(v) => setKind(v as Kind)}
            className="mt-2 flex gap-6"
          >
            <div className="flex items-center gap-2 text-body-sm">
              <RadioGroupItem value="graph" id="transport-graph" />
              <Label htmlFor="transport-graph">Microsoft Graph</Label>
            </div>
            <div className="flex items-center gap-2 text-body-sm">
              <RadioGroupItem value="smtp" id="transport-smtp" />
              <Label htmlFor="transport-smtp">SMTP</Label>
            </div>
          </RadioGroup>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="sender-address">Sender address</Label>
            <Input
              id="sender-address"
              type="email"
              value={form.senderAddress}
              onChange={(e) => setForm((s) => ({ ...s, senderAddress: e.target.value }))}
              placeholder="noreply@your-domain.com"
            />
          </div>
          <div>
            <Label htmlFor="sender-name">Sender display name</Label>
            <Input
              id="sender-name"
              value={form.senderDisplayName}
              onChange={(e) => setForm((s) => ({ ...s, senderDisplayName: e.target.value }))}
              placeholder="Acme"
            />
          </div>
        </div>

        {form.kind === 'graph' ? (
          <div className="flex items-start gap-3 rounded-md border border-hairline p-3">
            <Switch
              checked={form.graphPolicyAcked}
              onCheckedChange={(v) => setForm((s) => ({ ...s, graphPolicyAcked: v }))}
              aria-label="Application access policy acknowledged"
            />
            <div className="min-w-0">
              <div className="font-medium text-ink">Application access policy is in place</div>
              <p className="text-body-sm text-ink-muted">
                Confirm that an ApplicationAccessPolicy restricts the Entra app to sending only as
                this mailbox. Required to enable Graph send.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="smtp-host">Host</Label>
                <Input
                  id="smtp-host"
                  value={form.smtpHost}
                  onChange={(e) => setForm((s) => ({ ...s, smtpHost: e.target.value }))}
                  placeholder="smtp.your-provider.com"
                />
              </div>
              <div>
                <Label htmlFor="smtp-port">Port</Label>
                <RadioGroup
                  value={String(form.smtpPort)}
                  onValueChange={(v) =>
                    setForm((s) => ({ ...s, smtpPort: Number(v) === 465 ? 465 : 587 }))
                  }
                  className="mt-2 flex gap-6"
                >
                  <div className="flex items-center gap-2 text-body-sm">
                    <RadioGroupItem value="587" id="smtp-port-587" />
                    <Label htmlFor="smtp-port-587">587 (STARTTLS)</Label>
                  </div>
                  <div className="flex items-center gap-2 text-body-sm">
                    <RadioGroupItem value="465" id="smtp-port-465" />
                    <Label htmlFor="smtp-port-465">465 (TLS)</Label>
                  </div>
                </RadioGroup>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="smtp-username">Username</Label>
                <Input
                  id="smtp-username"
                  value={form.smtpUsername}
                  onChange={(e) => setForm((s) => ({ ...s, smtpUsername: e.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="smtp-password">Password</Label>
                <Input
                  id="smtp-password"
                  type="password"
                  value={form.smtpPassword}
                  onChange={(e) => setForm((s) => ({ ...s, smtpPassword: e.target.value }))}
                  placeholder={enabled ? '(unchanged — leave blank to keep)' : ''}
                />
              </div>
            </div>
            <div className="flex items-center gap-2 text-body-sm">
              <Switch
                id="smtp-require-tls"
                checked={form.smtpRequireTls}
                onCheckedChange={(v) => setForm((s) => ({ ...s, smtpRequireTls: v }))}
              />
              <Label htmlFor="smtp-require-tls">Require TLS</Label>
            </div>
          </div>
        )}

        {save.error && (
          <Alert variant="destructive">
            <AlertDescription>{(save.error as Error).message}</AlertDescription>
          </Alert>
        )}

        <div className="flex items-center justify-end gap-2">
          {enabled && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => disable.mutate()}
              disabled={disable.isPending}
            >
              Disable
            </Button>
          )}
          <Button
            type="button"
            onClick={() => save.mutate(toInput(form))}
            disabled={save.isPending || isLoading}
          >
            {enabled ? 'Save changes' : 'Enable'}
          </Button>
        </div>
      </Card>

      <Card className="p-5 space-y-3">
        <div>
          <div className="font-medium text-ink">Send a verification email</div>
          <p className="text-body-sm text-ink-muted">
            Sends a test message to confirm the configured transport actually delivers.
          </p>
        </div>
        <div className="flex gap-2">
          <Input
            type="email"
            value={verifyEmail}
            onChange={(e) => setVerifyEmail(e.target.value)}
            placeholder="recipient@your-domain.com"
            aria-label="Recipient email"
          />
          <Button
            type="button"
            variant="secondary"
            onClick={() => verify.mutate(verifyEmail)}
            disabled={verify.isPending || !verifyEmail || !enabled}
          >
            Send test
          </Button>
        </div>
        {verify.data && verify.data.ok && (
          <Alert>
            <AlertDescription>
              Sent. Message ID: {verify.data.transport_message_id ?? '—'}
            </AlertDescription>
          </Alert>
        )}
        {verify.data && !verify.data.ok && (
          <Alert variant="destructive">
            <AlertDescription>
              {verify.data.error?.code}: {verify.data.error?.message}
            </AlertDescription>
          </Alert>
        )}
        {verify.error && (
          <Alert variant="destructive">
            <AlertDescription>{(verify.error as Error).message}</AlertDescription>
          </Alert>
        )}
      </Card>
    </PageChrome>
  );
}
