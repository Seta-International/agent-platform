import type { ToolCallMessagePartProps } from '@assistant-ui/react';
import { makeAssistantToolUI, useAssistantToolUI } from '@assistant-ui/react';
import { useAgentCatalog } from '../../hooks/use-agent-catalog';
import { ListMyThreadsRenderer } from './copilot.list-my-threads';
import { ServerTimeRenderer } from './core.server-time';
import { DelegateRenderer } from './delegate';
import { ListMyRolesRenderer } from './identity.list-my-roles';
import { UpdateMyDisplayNameRenderer } from './identity.update-my-display-name';
import { WhoAmIRenderer } from './identity.who-am-i';

// Maps assistant-ui's runtime status discriminant to the read-only state string (no HITL branch).
function toReadState(
  props: ToolCallMessagePartProps,
): 'input-streaming' | 'output-available' | 'output-error' {
  if (props.status.type === 'complete') return props.isError ? 'output-error' : 'output-available';
  if (props.status.type === 'incomplete') return 'output-error';
  return 'input-streaming';
}

// Maps assistant-ui status to the full state set that includes the HITL branch.
function toWriteState(
  props: ToolCallMessagePartProps,
): 'input-streaming' | 'input-pending-approval' | 'output-available' | 'output-error' {
  if (props.status.type === 'requires-action') return 'input-pending-approval';
  return toReadState(props);
}

// Using `any` for TResult avoids addResult contravariance issues — we only read result, never write.
/* eslint-disable @typescript-eslint/no-explicit-any */
const SERVER_TIME_TOOL = makeAssistantToolUI<Record<string, unknown>, any>({
  toolName: 'core_serverTime',
  render: (props) => (
    <ServerTimeRenderer
      args={props.args}
      state={toReadState(props)}
      output={props.result ?? undefined}
    />
  ),
});

const WHO_AM_I_TOOL = makeAssistantToolUI<Record<string, unknown>, any>({
  toolName: 'identity_whoAmI',
  render: (props) => (
    <WhoAmIRenderer
      args={props.args}
      state={toReadState(props)}
      output={props.result ?? undefined}
    />
  ),
});

const LIST_MY_ROLES_TOOL = makeAssistantToolUI<Record<string, unknown>, any>({
  toolName: 'identity_listMyRoles',
  render: (props) => (
    <ListMyRolesRenderer
      args={props.args}
      state={toReadState(props)}
      output={props.result ?? undefined}
    />
  ),
});

const LIST_MY_THREADS_TOOL = makeAssistantToolUI<Record<string, unknown>, any>({
  toolName: 'copilot_listMyThreads',
  render: (props) => (
    <ListMyThreadsRenderer
      args={props.args}
      state={toReadState(props)}
      output={props.result ?? undefined}
    />
  ),
});

const UPDATE_MY_DISPLAY_NAME_TOOL = makeAssistantToolUI<
  { displayName: string; expiresAt?: string },
  any
>({
  toolName: 'identity_updateMyDisplayName',
  render: (props) => {
    // The v6 approval payload sits on the tool part's `interrupt` field:
    // `{ type: 'human', payload: { id: '<runId>::<toolCallId>' } }`.
    const interrupt = (props as { interrupt?: { payload?: { id?: string } } }).interrupt;
    return (
      <UpdateMyDisplayNameRenderer
        args={props.args}
        state={toWriteState(props)}
        callId={props.toolCallId}
        approval={interrupt?.payload}
      />
    );
  },
});
/* eslint-enable @typescript-eslint/no-explicit-any */

// Mastra auto-generates a delegation tool per sub-agent, named `agent-${id}`. The delegate
// tool itself participates in HITL — when a leaf write tool deep in the chain pauses for
// approval, Mastra surfaces a top-level `tool-approval-request` on the delegate tool here.
// Approving it cascades the resume down through every suspended sub-agent automatically,
// which is what lets the architecture scale to many agents without per-level wiring.
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    render: (props: ToolCallMessagePartProps<Record<string, unknown>, any>) => {
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

export function ToolUIRegistry({ agentName }: { agentName: string }) {
  const { agents } = useAgentCatalog();
  return (
    <>
      <SERVER_TIME_TOOL />
      <WHO_AM_I_TOOL />
      <LIST_MY_ROLES_TOOL />
      <LIST_MY_THREADS_TOOL />
      <UPDATE_MY_DISPLAY_NAME_TOOL />
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
