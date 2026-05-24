import type { ToolCallMessagePartProps } from '@assistant-ui/react';
import { useAssistantToolUI } from '@assistant-ui/react';
import { ChatToolCall } from '@seta/shared-ui';
import { useAgentCatalog } from '../../hooks/use-agent-catalog';
import { useToolCatalog } from '../../hooks/use-tool-catalog';
import { ListMyThreadsRenderer } from './copilot.list-my-threads';
import { ServerTimeRenderer } from './core.server-time';
import { DelegateRenderer } from './delegate';
import { ListMyRolesRenderer } from './identity.list-my-roles';
import { UpdateMyDisplayNameRenderer } from './identity.update-my-display-name';
import { WhoAmIRenderer } from './identity.who-am-i';

function toReadState(
  props: ToolCallMessagePartProps,
): 'input-streaming' | 'output-available' | 'output-error' {
  if (props.status.type === 'complete') return props.isError ? 'output-error' : 'output-available';
  if (props.status.type === 'incomplete') return 'output-error';
  return 'input-streaming';
}

function toWriteState(
  props: ToolCallMessagePartProps,
): 'input-streaming' | 'input-pending-approval' | 'output-available' | 'output-error' {
  if (props.status.type === 'requires-action') return 'input-pending-approval';
  return toReadState(props);
}

// Tool ids that have a dedicated renderer below — excluded from the generic fallback so
// we don't double-register.
const DEDICATED_TOOL_IDS = new Set([
  'core_serverTime',
  'identity_whoAmI',
  'identity_listMyRoles',
  'identity_updateMyDisplayName',
  'copilot_listMyThreads',
]);

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

function ListMyThreadsRegistration({ name }: { name: string }) {
  useAssistantToolUI({
    toolName: 'copilot_listMyThreads',
    render: (props) => (
      <ListMyThreadsRenderer
        name={name}
        args={props.args}
        state={toReadState(props)}
        output={
          (props.result ?? undefined) as Parameters<typeof ListMyThreadsRenderer>[0]['output']
        }
      />
    ),
  });
  return null;
}

function UpdateMyDisplayNameRegistration({ name }: { name: string }) {
  useAssistantToolUI({
    toolName: 'identity_updateMyDisplayName',
    render: (props) => {
      const interrupt = (props as { interrupt?: { payload?: { id?: string } } }).interrupt;
      return (
        <UpdateMyDisplayNameRenderer
          name={name}
          args={props.args as { displayName: string; expiresAt?: string }}
          state={toWriteState(props)}
          callId={props.toolCallId}
          approval={interrupt?.payload}
        />
      );
    },
  });
  return null;
}

// Mastra auto-generates a delegation tool per sub-agent, named `agent-${id}`. The delegate
// tool itself participates in HITL — when a leaf write tool deep in the chain pauses for
// approval, Mastra surfaces a top-level `tool-approval-request` on the delegate tool here.
function DelegateRegistration({
  name,
  label,
  parentAgentName,
}: {
  name: string;
  label: string;
  parentAgentName: string;
}) {
  useAssistantToolUI({
    toolName: `agent-${name}`,
    render: (props: ToolCallMessagePartProps<Record<string, unknown>, unknown>) => {
      const interrupt = (props as { interrupt?: { payload?: { id?: string } } }).interrupt;
      return (
        <DelegateRenderer
          parentAgentName={parentAgentName}
          targetName={name}
          targetLabel={label}
          args={props.args}
          state={toWriteState(props)}
          output={props.result ?? undefined}
          approval={interrupt?.payload}
        />
      );
    },
  });
  return null;
}

// Generic fallback for tools that don't have a dedicated React renderer — registers
// against the tool id and prints a minimal ChatToolCall card using the catalog name.
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
      return <ChatToolCall name={name} status="running" />;
    },
  });
  return null;
}

export function ToolUIRegistry({ agentName }: { agentName: string }) {
  const { agents } = useAgentCatalog();
  const { tools, nameFor } = useToolCatalog();
  return (
    <>
      <ServerTimeRegistration name={nameFor('core_serverTime')} />
      <WhoAmIRegistration name={nameFor('identity_whoAmI')} />
      <ListMyRolesRegistration name={nameFor('identity_listMyRoles')} />
      <ListMyThreadsRegistration name={nameFor('copilot_listMyThreads')} />
      <UpdateMyDisplayNameRegistration name={nameFor('identity_updateMyDisplayName')} />
      {tools
        .filter((t) => !DEDICATED_TOOL_IDS.has(t.id))
        .map((t) => (
          <GenericToolRegistration key={t.id} id={t.id} name={t.name} />
        ))}
      {agents.map((a) => (
        <DelegateRegistration
          key={a.name}
          name={a.name}
          label={a.label}
          parentAgentName={agentName}
        />
      ))}
    </>
  );
}
