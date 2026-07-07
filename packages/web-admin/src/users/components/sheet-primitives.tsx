// Shared building blocks for the user detail sheet sections.

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-eyebrow uppercase tracking-[0.04em] text-ink-subtle">{label}</span>
      <div className="text-body-sm text-ink">{children}</div>
    </div>
  );
}

export function SectionTitle({
  icon,
  children,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 border-b border-hairline pb-2">
      <span className="text-ink-subtle">{icon}</span>
      <h3 className="text-body-sm font-semibold text-ink">{children}</h3>
    </div>
  );
}
