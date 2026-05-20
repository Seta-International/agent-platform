import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@seta/shared-ui';
import { Check, ChevronDown } from 'lucide-react';
import { useAgentCatalog } from '../hooks/use-agent-catalog';
import type { AgentName } from './agents';

interface AgentSelectorProps {
  value: AgentName;
  onChange: (next: AgentName) => void;
  variant?: 'bordered' | 'ghost';
}

export function AgentSelector({ value, onChange, variant = 'bordered' }: AgentSelectorProps) {
  const { agents } = useAgentCatalog();
  const current = agents.find((a) => a.name === value) ?? agents[0];
  const triggerClass =
    variant === 'bordered'
      ? 'inline-flex h-7 items-center gap-2 rounded-md border border-hairline px-2.5 text-body-sm text-ink hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-focus'
      : 'inline-flex h-6 items-center gap-1.5 rounded-md px-1.5 text-caption text-ink hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-focus';
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className={triggerClass} aria-label="Choose agent">
          <span className="size-1.5 rounded-full bg-primary" aria-hidden />
          {current?.label ?? value}
          <ChevronDown className="size-3 text-ink-subtle" aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[220px]">
        {agents.map((a) => (
          <DropdownMenuItem
            key={a.name}
            onSelect={() => onChange(a.name)}
            className="flex items-start gap-2"
          >
            <Check
              className={`mt-0.5 size-3.5 ${a.name === value ? 'text-primary' : 'invisible'}`}
              aria-hidden
            />
            <span className="flex min-w-0 flex-col">
              <span className="text-body-sm text-ink">{a.label}</span>
              <span className="text-caption text-ink-subtle">{a.description}</span>
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
