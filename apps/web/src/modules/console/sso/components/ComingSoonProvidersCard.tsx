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
    description: 'OpenID Connect via Google.',
    badge: { initials: 'G', bg: '#fef2f2', ink: '#c53030' },
  },
  {
    id: 'okta',
    name: 'Okta',
    description: 'SAML 2.0 or OIDC via Okta.',
    badge: { initials: 'O', bg: '#eef1f4', ink: '#0b0b0d' },
  },
  {
    id: 'saml',
    name: 'Generic SAML 2.0',
    description: 'Custom enterprise IdP.',
    badge: { initials: 'S', bg: '#ecf1ff', ink: '#0034c0' },
  },
];

export function ComingSoonProvidersCard() {
  return (
    <section className="overflow-hidden rounded-lg border border-hairline bg-canvas">
      <header className="flex items-baseline justify-between gap-2 border-b border-hairline-tertiary px-5 py-4">
        <h2 className="m-0 text-section-title font-semibold tracking-tight text-ink">
          More providers
        </h2>
        <span className="text-eyebrow uppercase tracking-[0.04em] text-ink-subtle">
          Coming soon
        </span>
      </header>
      <ul className="m-0 list-none divide-y divide-hairline-tertiary p-0">
        {PROVIDERS.map((p) => (
          <li key={p.id} className="flex items-center gap-3 px-5 py-3">
            <span
              aria-hidden
              className="flex size-7 flex-none items-center justify-center rounded-md font-mono text-body-sm font-semibold"
              style={{ background: p.badge.bg, color: p.badge.ink }}
            >
              {p.badge.initials}
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-body-sm font-medium text-ink">{p.name}</div>
              <div className="text-caption text-ink-subtle">{p.description}</div>
            </div>
            <span className="inline-flex h-5 items-center rounded-full border border-hairline bg-surface-1 px-2 text-caption font-medium text-ink-muted">
              Soon
            </span>
          </li>
        ))}
      </ul>
      <footer className="border-t border-hairline-tertiary bg-surface-1 px-5 py-3">
        <p className="m-0 text-caption text-ink-subtle">
          Need a different provider? <span className="text-primary">Talk to support.</span>
        </p>
      </footer>
    </section>
  );
}
