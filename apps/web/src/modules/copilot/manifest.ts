import { type NavManifest, noNavExtensions } from '@seta/module-sdk';
import { BookOpen, MessageSquare, Sparkles, Workflow } from 'lucide-react';

export const copilotNavManifest: NavManifest = {
  id: 'copilot',
  label: 'Copilot',
  icon: Sparkles,
  requiredPermissions: [],
  useNavExtensions: noNavExtensions,
  nav: [
    {
      label: 'Workspace',
      items: [
        { id: 'copilot.chat', icon: MessageSquare, label: 'Chat', to: '/copilot/chat' },
        { id: 'copilot.workflows', icon: Workflow, label: 'Workflows', to: '/copilot/workflows' },
        { id: 'copilot.knowledge', icon: BookOpen, label: 'Knowledge', to: '/copilot/knowledge' },
      ],
    },
  ],
};
