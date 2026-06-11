import type { ToolCallMessagePartProps } from '@assistant-ui/react';
import { useAssistantDataUI, useAssistantToolUI } from '@assistant-ui/react';
import { ChatToolCall } from '@seta/shared-ui';
import { AgentStreamPart } from '../../chat-experience/agent-stream-part';
import { DataResultPart } from '../../chat-experience/data-result-part';
import { DataTrustPart } from '../../chat-experience/data-trust-part';
import { OrchestrationStepPart } from '../../chat-experience/orchestration-step-part';
import { useToolCatalog } from '../../hooks/use-tool-catalog';
import { ServerTimeRenderer } from './core.server-time';
import { ListMyRolesRenderer } from './identity.list-my-roles';
import { WhoAmIRenderer } from './identity.who-am-i';

function summarizeArgs(args: unknown): string | undefined {
  if (!args || typeof args !== 'object') return undefined;
  const formatValue = (v: unknown): string => {
    if (v == null) return '';
    if (typeof v === 'string') return v;
    if (typeof v === 'number' || typeof v === 'boolean') return String(v);
    if (Array.isArray(v)) return v.map(formatValue).filter(Boolean).join('/');
    return JSON.stringify(v);
  };
  const parts = Object.entries(args as Record<string, unknown>)
    .map(([k, v]) => {
      const val = formatValue(v);
      return val ? `${k}: ${val}` : '';
    })
    .filter(Boolean);
  if (parts.length === 0) return undefined;
  const text = parts.join(', ');
  return text.length > 80 ? `${text.slice(0, 79)}…` : text;
}

function toReadState(
  props: ToolCallMessagePartProps,
): 'input-streaming' | 'output-available' | 'output-error' {
  if (props.status.type === 'complete') return props.isError ? 'output-error' : 'output-available';
  if (props.status.type === 'incomplete') return 'output-error';
  return 'input-streaming';
}

const DEDICATED_TOOL_IDS = new Set(['core_serverTime', 'identity_whoAmI', 'identity_listMyRoles']);

function ServerTimeRegistration({ name }: { name: string }) {
  useAssistantToolUI({
    toolName: 'core_serverTime',
    render: (props) => (
      <ServerTimeRenderer
        name={name}
        args={props.args}
        state={toReadState(props)}
        output={(props.result ?? undefined) as { iso?: string } | undefined}
      />
    ),
  });
  return null;
}

function WhoAmIRegistration({ name }: { name: string }) {
  useAssistantToolUI({
    toolName: 'identity_whoAmI',
    render: (props) => (
      <WhoAmIRenderer
        name={name}
        args={props.args}
        state={toReadState(props)}
        output={(props.result ?? undefined) as Parameters<typeof WhoAmIRenderer>[0]['output']}
      />
    ),
  });
  return null;
}

function ListMyRolesRegistration({ name }: { name: string }) {
  useAssistantToolUI({
    toolName: 'identity_listMyRoles',
    render: (props) => (
      <ListMyRolesRenderer
        name={name}
        args={props.args}
        state={toReadState(props)}
        output={(props.result ?? undefined) as Parameters<typeof ListMyRolesRenderer>[0]['output']}
      />
    ),
  });
  return null;
}

function AgentStreamRegistration() {
  // Renders historical `data-tool-agent` parts (sub-agent leaf tool calls from
  // threads recorded before the orchestration cutover) and any future emitter.
  useAssistantDataUI({ name: 'tool-agent', render: AgentStreamPart });
  return null;
}

function OrchestrationStepRegistration() {
  // Matches `data-orchestration-step` emitted by the orchestration chat stream
  // (ORCHESTRATION_STEP_PART in packages/agent). Renders the per-step trust
  // trace timeline.
  useAssistantDataUI({ name: 'orchestration-step', render: OrchestrationStepPart });
  return null;
}

function ResultRegistration() {
  useAssistantDataUI({
    name: 'result',
    render: (props: { data: unknown }) => <DataResultPart data={props.data as never} />,
  });
  return null;
}

function TrustRegistration() {
  useAssistantDataUI({
    name: 'trust',
    render: (props: { data: unknown }) => <DataTrustPart data={props.data as never} />,
  });
  return null;
}

function GenericToolRegistration({ id, name }: { id: string; name: string }) {
  useAssistantToolUI({
    toolName: id,
    render: (props) => {
      const state = toReadState(props);
      if (state === 'output-available') {
        return <ChatToolCall name={name} status="ok" payload={props.result ?? undefined} />;
      }
      if (state === 'output-error') {
        return <ChatToolCall name={name} status="error" summary="failed" />;
      }
      return <ChatToolCall name={name} status="running" summary={summarizeArgs(props.args)} />;
    },
  });
  return null;
}

export function ToolUIRegistry() {
  const { tools, nameFor } = useToolCatalog();
  return (
    <>
      <AgentStreamRegistration />
      <OrchestrationStepRegistration />
      <ResultRegistration />
      <TrustRegistration />
      <ServerTimeRegistration name={nameFor('core_serverTime')} />
      <WhoAmIRegistration name={nameFor('identity_whoAmI')} />
      <ListMyRolesRegistration name={nameFor('identity_listMyRoles')} />
      {tools
        .filter((t) => !DEDICATED_TOOL_IDS.has(t.id))
        .map((t) => (
          <GenericToolRegistration key={t.id} id={t.id} name={t.name} />
        ))}
    </>
  );
}
