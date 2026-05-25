import type { ToolCallMessagePartProps } from '@assistant-ui/react';
import { useAssistantToolUI } from '@assistant-ui/react';
import { ChatToolCall } from '@seta/shared-ui';
import { useToolCatalog } from '../../hooks/use-tool-catalog';
import { ServerTimeRenderer } from './core.server-time';
import { DelegateRenderer } from './delegate';
import { ListMyRolesRenderer } from './identity.list-my-roles';
import { UpdateMyDisplayNameRenderer } from './identity.update-my-display-name';
import { WhoAmIRenderer } from './identity.who-am-i';
import { PlannerCreateTaskRenderer } from './planner.create-task';

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

const DEDICATED_TOOL_IDS = new Set([
  'core_serverTime',
  'identity_whoAmI',
  'identity_listMyRoles',
  'identity_updateMyDisplayName',
  'planner_createTask',
]);

const DELEGATE_TARGETS: ReadonlyArray<{ name: string; label: string }> = [
  { name: 'work', label: 'Work' },
  { name: 'people', label: 'People' },
  { name: 'self', label: 'Self' },
  { name: 'meta', label: 'Meta' },
];

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

function PlannerCreateTaskRegistration({ name }: { name: string }) {
  useAssistantToolUI({
    toolName: 'planner_createTask',
    render: (props) => {
      const interrupt = (
        props as {
          interrupt?: {
            payload?: Parameters<typeof PlannerCreateTaskRenderer>[0]['approval'];
          };
        }
      ).interrupt;
      return (
        <PlannerCreateTaskRenderer
          name={name}
          args={props.args as Record<string, unknown>}
          state={toWriteState(props)}
          output={props.result ?? undefined}
          callId={props.toolCallId}
          approval={interrupt?.payload}
        />
      );
    },
  });
  return null;
}

function DelegateRegistration({ name, label }: { name: string; label: string }) {
  useAssistantToolUI({
    toolName: `agent-${name}`,
    render: (props: ToolCallMessagePartProps<Record<string, unknown>, unknown>) => {
      const interrupt = (props as { interrupt?: { payload?: { id?: string } } }).interrupt;
      return (
        <DelegateRenderer
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

export function ToolUIRegistry() {
  const { tools, nameFor } = useToolCatalog();
  return (
    <>
      <ServerTimeRegistration name={nameFor('core_serverTime')} />
      <WhoAmIRegistration name={nameFor('identity_whoAmI')} />
      <ListMyRolesRegistration name={nameFor('identity_listMyRoles')} />
      <UpdateMyDisplayNameRegistration name={nameFor('identity_updateMyDisplayName')} />
      <PlannerCreateTaskRegistration name={nameFor('planner_createTask')} />
      {tools
        .filter((t) => !DEDICATED_TOOL_IDS.has(t.id))
        .map((t) => (
          <GenericToolRegistration key={t.id} id={t.id} name={t.name} />
        ))}
      {DELEGATE_TARGETS.map((a) => (
        <DelegateRegistration key={a.name} name={a.name} label={a.label} />
      ))}
    </>
  );
}
