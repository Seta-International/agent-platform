interface PreviewProvider {
  id: string;
  name: string;
  description: string;
  badge: { initials: string; bg: string; ink: string };
}

const PROVIDERS: ReadonlyArray<PreviewProvider> = [
  {
    id: 'google',
    name: 'Google Workspace',
    description: 'Sign in with Google Workspace accounts.',
    badge: { initials: 'G', bg: '#fef2f2', ink: '#c53030' },
  },
  {
    id: 'okta',
    name: 'Okta',
    description: 'Sign in with Okta.',
    badge: { initials: 'O', bg: '#eef1f4', ink: '#0b0b0d' },
  },
  {
    id: 'saml',
    name: 'Generic SAML 2.0',
    description: 'Connect any SAML 2.0 provider.',
    badge: { initials: 'S', bg: '#ecf1ff', ink: '#0034c0' },
  },
];

export function ComingSoonProvidersCard() {
  return (
    <section className="overflow-hidden rounded-lg border border-border bg-body">
      <header className="flex items-baseline justify-between gap-2 border-b border-border px-5 py-4">
        <h2 className="m-0 text-lg font-semibold tracking-tight text-primary">More providers</h2>
        <span className="text-xs font-medium uppercase tracking-[0.04em] text-secondary">
          Coming soon
        </span>
      </header>
      <ul className="m-0 list-none divide-y divide-border p-0">
        {PROVIDERS.map((p) => (
          <li key={p.id} className="flex items-center gap-3 px-5 py-3">
            <span
              aria-hidden
              className="flex size-7 flex-none items-center justify-center rounded-md font-mono text-base font-semibold"
              style={{ background: p.badge.bg, color: p.badge.ink }}
            >
              {p.badge.initials}
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-base font-medium text-primary">{p.name}</div>
              <div className="text-sm text-secondary">{p.description}</div>
            </div>
            <span className="inline-flex h-5 items-center rounded-full border border-border bg-card px-2 text-sm font-medium text-secondary">
              Soon
            </span>
          </li>
        ))}
      </ul>
      <footer className="border-t border-border bg-card px-5 py-3">
        <p className="m-0 text-sm text-secondary">
          Need a different provider? <span className="text-accent">Talk to support.</span>
        </p>
      </footer>
    </section>
  );
}
