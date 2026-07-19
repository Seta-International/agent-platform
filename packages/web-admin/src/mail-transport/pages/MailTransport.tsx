import {
  Banner,
  Button,
  Grid,
  HStack,
  Input,
  RadioGroup,
  RadioListItem,
  SettingsSection,
  StackItem,
  Switch,
  Text,
  VStack,
} from '@seta/shared-ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { AdminPageFrame } from '../../components/AdminPageFrame.tsx';
import {
  disableMailTransport,
  getMailTransport,
  type MailTransportRow,
  type SetMailTransportInput,
  setMailTransport,
  verifyMailTransport,
} from '../api/mail-transport-client.ts';

const queryKey = ['admin', 'mail-transport'] as const;

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

  const subtitle = enabled
    ? `Active · ${data?.kind === 'graph' ? 'Microsoft Graph' : 'SMTP'}`
    : 'Not set up yet';

  return (
    <AdminPageFrame crumb="Mail transport" title="Mail transport" subtitle={subtitle}>
      {error && <Banner status="error" title={(error as Error).message} />}

      <SettingsSection title="Transport" description="How outgoing mail is delivered.">
        <VStack gap={5} paddingBlock={4}>
          <RadioGroup
            label="Transport"
            value={form.kind}
            onChange={(v) => setKind(v as Kind)}
            orientation="horizontal"
          >
            <RadioListItem value="graph" label="Microsoft Graph" />
            <RadioListItem value="smtp" label="SMTP" />
          </RadioGroup>

          <Grid columns={2} gap={4}>
            <Input
              type="email"
              label="Sender address"
              value={form.senderAddress}
              onChange={(value) => setForm((s) => ({ ...s, senderAddress: value }))}
              placeholder="noreply@your-domain.com"
            />
            <Input
              label="Sender display name"
              value={form.senderDisplayName}
              onChange={(value) => setForm((s) => ({ ...s, senderDisplayName: value }))}
              placeholder="Acme"
            />
          </Grid>

          {form.kind === 'graph' ? (
            <HStack
              gap={3}
              vAlign="start"
              style={{
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-container)',
                padding: 'var(--spacing-3)',
              }}
            >
              <Switch
                label="Application access policy acknowledged"
                isLabelHidden
                value={form.graphPolicyAcked}
                onChange={(v) => setForm((s) => ({ ...s, graphPolicyAcked: v }))}
              />
              <VStack gap={0}>
                <Text weight="medium" display="block">
                  Application access policy is in place
                </Text>
                <Text color="secondary" display="block">
                  Confirm an ApplicationAccessPolicy limits the Entra app to sending only from this
                  mailbox. Required before you can turn on Graph send.
                </Text>
              </VStack>
            </HStack>
          ) : (
            <VStack gap={4}>
              <Grid columns={2} gap={4}>
                <Input
                  label="Host"
                  value={form.smtpHost}
                  onChange={(value) => setForm((s) => ({ ...s, smtpHost: value }))}
                  placeholder="smtp.your-provider.com"
                />
                <RadioGroup
                  label="Port"
                  value={String(form.smtpPort)}
                  onChange={(v) =>
                    setForm((s) => ({ ...s, smtpPort: Number(v) === 465 ? 465 : 587 }))
                  }
                  orientation="horizontal"
                >
                  <RadioListItem value="587" label="587 (STARTTLS)" />
                  <RadioListItem value="465" label="465 (TLS)" />
                </RadioGroup>
              </Grid>
              <Grid columns={2} gap={4}>
                <Input
                  label="Username"
                  value={form.smtpUsername}
                  onChange={(value) => setForm((s) => ({ ...s, smtpUsername: value }))}
                />
                <Input
                  type="password"
                  label="Password"
                  value={form.smtpPassword}
                  onChange={(value) => setForm((s) => ({ ...s, smtpPassword: value }))}
                  placeholder={enabled ? '(unchanged — leave blank to keep)' : ''}
                />
              </Grid>
              <Switch
                label="Require TLS"
                value={form.smtpRequireTls}
                onChange={(v) => setForm((s) => ({ ...s, smtpRequireTls: v }))}
              />
            </VStack>
          )}

          {save.error && <Banner status="error" title={(save.error as Error).message} />}

          <HStack hAlign="end" vAlign="center" gap={2}>
            {enabled && (
              <Button
                type="button"
                variant="ghost"
                label="Disable"
                onClick={() => disable.mutate()}
                isDisabled={disable.isPending}
              />
            )}
            <Button
              variant="primary"
              type="button"
              label={enabled ? 'Save changes' : 'Enable'}
              onClick={() => save.mutate(toInput(form))}
              isDisabled={save.isPending || isLoading}
            />
          </HStack>
        </VStack>
      </SettingsSection>

      <SettingsSection
        title="Send a test email"
        description="Send yourself a message to make sure your setup actually delivers."
      >
        <VStack gap={3} paddingBlock={4}>
          <HStack gap={2}>
            <StackItem size="fill">
              <Input
                type="email"
                label="Recipient email"
                isLabelHidden
                value={verifyEmail}
                onChange={(value) => setVerifyEmail(value)}
                placeholder="recipient@your-domain.com"
              />
            </StackItem>
            <Button
              type="button"
              variant="secondary"
              label="Send test"
              onClick={() => verify.mutate(verifyEmail)}
              isDisabled={verify.isPending || !verifyEmail || !enabled}
            />
          </HStack>
          {verify.data?.ok && (
            <Banner
              status="info"
              title={<>Sent. Message ID: {verify.data.transport_message_id ?? '—'}</>}
            />
          )}
          {verify.data && !verify.data.ok && (
            <Banner
              status="error"
              title={
                <>
                  {verify.data.error?.code}: {verify.data.error?.message}
                </>
              }
            />
          )}
          {verify.error && <Banner status="error" title={(verify.error as Error).message} />}
        </VStack>
      </SettingsSection>
    </AdminPageFrame>
  );
}
