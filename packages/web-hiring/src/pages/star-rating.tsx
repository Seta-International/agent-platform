import { Star } from 'lucide-react';
import { useState } from 'react';

const LEVELS = [1, 2, 3, 4, 5] as const;

export const MAX_STAR_RATING = 5;

function starStyle(isFilled: boolean) {
  return isFilled
    ? { color: 'var(--color-icon-yellow)', fill: 'var(--color-border-yellow)' }
    : { color: 'var(--color-icon-secondary)', fill: 'none' };
}

export function StarRating({
  level,
  onChange,
}: {
  level: number | null;
  onChange?: (level: number | null) => void;
}) {
  const [hover, setHover] = useState<number | null>(null);

  if (!onChange) {
    return (
      <div
        className="flex items-center gap-0.5"
        role="img"
        title={level ? `Rated ${level} of ${MAX_STAR_RATING}` : 'Not rated'}
        aria-label={level ? `Rating ${level} of ${MAX_STAR_RATING}` : 'Not rated'}
      >
        {LEVELS.map((d) => (
          <Star key={d} className="size-5" style={starStyle(!!level && d <= level)} />
        ))}
      </div>
    );
  }

  const shown = hover ?? level ?? 0;
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: mouse-leave only resets the hover preview; each star is a real button with its own label
    <div className="flex items-center gap-0.5" onMouseLeave={() => setHover(null)}>
      {LEVELS.map((d) => (
        <button
          key={d}
          type="button"
          title={`Rate ${d} of ${MAX_STAR_RATING}`}
          aria-label={`Set rating to ${d} of ${MAX_STAR_RATING}`}
          aria-pressed={level === d}
          onMouseEnter={() => setHover(d)}
          onClick={() => onChange(level === d ? null : d)}
          className="rounded-sm p-0.5"
        >
          <Star className="size-5" style={starStyle(d <= shown)} />
        </button>
      ))}
    </div>
  );
}
