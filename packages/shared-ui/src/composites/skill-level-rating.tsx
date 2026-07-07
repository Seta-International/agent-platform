import type React from 'react';
import { useState } from 'react';

const LEVELS = [1, 2, 3, 4, 5] as const;

export const MAX_SKILL_LEVEL = 5;

// 1–5 proficiency shown as a segmented equalizer bar. Read-only when onChange is
// omitted; interactive segments preview on hover and clear back to unrated (null)
// when the currently-active level is clicked again.
export function SkillLevelRating({
  level,
  onChange,
}: {
  level: number | null;
  onChange?: (level: number | null) => void;
}): React.ReactElement {
  const [hover, setHover] = useState<number | null>(null);

  if (!onChange) {
    return (
      <div
        className="flex items-center gap-1.5"
        role="img"
        title={level ? `Level ${level} of ${MAX_SKILL_LEVEL}` : 'Not rated'}
        aria-label={level ? `Proficiency ${level} of ${MAX_SKILL_LEVEL}` : 'Not rated'}
      >
        {LEVELS.map((d) => (
          <span
            key={d}
            className={`h-1.5 w-4 rounded-full ${level && d <= level ? 'bg-primary' : 'bg-surface-4'}`}
          />
        ))}
      </div>
    );
  }

  const shown = hover ?? level ?? 0;
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: mouse-leave only resets the hover preview; each segment is a real button with its own label
    <div className="flex items-center gap-1.5" onMouseLeave={() => setHover(null)}>
      {LEVELS.map((d) => (
        <button
          key={d}
          type="button"
          title={`Level ${d} of ${MAX_SKILL_LEVEL}`}
          aria-label={`Set level ${d} of ${MAX_SKILL_LEVEL}`}
          aria-pressed={level === d}
          onMouseEnter={() => setHover(d)}
          onClick={() => onChange(level === d ? null : d)}
          className={`h-2 w-5 rounded-full transition-colors ${
            d <= shown
              ? hover !== null && hover >= d
                ? 'bg-primary/60'
                : 'bg-primary'
              : 'bg-surface-4 hover:bg-primary/30'
          }`}
        />
      ))}
    </div>
  );
}
