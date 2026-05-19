import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@seta/shared-ui';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/')({
  component: () => (
    <div className="p-xl">
      <Card>
        <CardHeader>
          <CardTitle>Foundation ready</CardTitle>
          <CardDescription>
            packages/shared/ui is the style monopoly. Identity UI lands on top of this in the next
            spec.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-body-sm text-ink-muted">
            Toggle the theme in the top bar. Visit{' '}
            <code className="font-mono text-mono text-ink">/does-not-exist</code> for the themed
            404.
          </p>
        </CardContent>
      </Card>
    </div>
  ),
});
