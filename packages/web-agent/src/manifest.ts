import { type AppManifest, noNavExtensions } from '@seta/module-sdk';
import { BookOpen, MessageSquare, Sparkles, Workflow } from 'lucide-react';

export const agentAppManifest: AppManifest = {
  id: 'agent',
  routeNamespace: '/agent',
  label: 'Agent Studio',
  icon: Sparkles,
  color: '#8b5cf6',
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
