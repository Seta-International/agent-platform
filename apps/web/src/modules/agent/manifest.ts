import { type NavManifest, noNavExtensions } from '@seta/module-sdk';
import { BookOpen, MessageSquare, Sparkles, Workflow } from 'lucide-react';

export const agentNavManifest: NavManifest = {
  id: 'agent',
  label: 'Agent Studio',
  icon: Sparkles,
  requiredPermissions: [],
  useNavExtensions: noNavExtensions,
  nav: [
    {
      label: 'Workspace',
      items: [
        { id: 'agent.chat', icon: MessageSquare, label: 'Chat', to: '/agent/chat' },
        { id: 'agent.workflows', icon: Workflow, label: 'Workflows', to: '/agent/workflows' },
        { id: 'agent.knowledge', icon: BookOpen, label: 'Knowledge', to: '/agent/knowledge' },
      ],
    },
  ],
};
