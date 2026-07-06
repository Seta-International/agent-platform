import { Card, PageChrome } from '@seta/shared-ui';
import type { ReactNode } from 'react';

// Shared frame for every Settings page: the shell supplies the "Seta › Settings"
// breadcrumb and left nav, so each page only owns its title and body.
export function SettingsSurface({ title, children }: { title: string; children: ReactNode }) {
  return (
    <PageChrome title={title} className="flex min-h-0 flex-1 flex-col">
      <div className="bg-surface-1 min-h-full">
        <div className="page-container space-y-5">{children}</div>
      </div>
    </PageChrome>
  );
}

export function ComingSoonCard({ body }: { body: string }) {
  return (
    <Card className="p-8 text-center">
      <p className="text-sm text-ink-subtle">{body}</p>
    </Card>
  );
}
