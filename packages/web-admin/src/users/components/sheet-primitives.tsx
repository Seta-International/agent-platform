// Shared building blocks for the user detail sheet sections.

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs font-medium uppercase tracking-[0.04em] text-secondary">
        {label}
      </span>
      <div className="text-base text-primary">{children}</div>
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
    <div className="flex items-center gap-2 border-b border-border pb-2">
      <span className="text-secondary">{icon}</span>
      <h3 className="text-base font-semibold text-primary">{children}</h3>
    </div>
  );
}
