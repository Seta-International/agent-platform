import { type Density, useDensity } from './use-density';

const OPTIONS: { value: Density; label: string }[] = [
  { value: 'concise', label: 'Concise' },
  { value: 'detailed', label: 'Detailed' },
];

export function DensityToggle() {
  const { density, setDensity } = useDensity();
  return (
    <div
      role="radiogroup"
      aria-label="Response detail level"
      className="inline-flex items-center gap-0.5 rounded-md border border-hairline bg-surface-1 p-0.5"
    >
      {OPTIONS.map((o) => {
        const active = density === o.value;
        return (
          <label
            key={o.value}
            className={`cursor-pointer rounded px-2 py-0.5 text-caption transition-colors ${
              active ? 'bg-primary-tint text-primary' : 'text-ink-muted hover:text-ink'
            }`}
          >
            <input
              type="radio"
              name="density"
              value={o.value}
              checked={active}
              onChange={() => setDensity(o.value)}
              aria-label={o.label}
              className="sr-only"
            />
            {o.label}
          </label>
        );
      })}
    </div>
  );
}
