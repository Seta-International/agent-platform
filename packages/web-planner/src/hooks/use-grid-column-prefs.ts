import { type Dispatch, type SetStateAction, useEffect, useState } from 'react';

interface Prefs {
  order: string[];
  widths: Record<string, number>;
}

const DEFAULT: Prefs = {
  order: ['title', 'status', 'bucket', 'assignees', 'priority', 'due', 'labels'],
  widths: {},
};

export function useGridColumnPrefs(planId: string): [Prefs, Dispatch<SetStateAction<Prefs>>] {
  const key = `planner.grid.columns.${planId}`;

  const [prefs, setPrefs] = useState<Prefs>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? { ...DEFAULT, ...(JSON.parse(raw) as Partial<Prefs>) } : DEFAULT;
    } catch {
      // localStorage is unavailable (e.g. private-mode browsers throw SecurityError).
      return DEFAULT;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(prefs));
    } catch {
      // localStorage is unavailable — silently skip persistence rather than crash.
    }
  }, [key, prefs]);

  return [prefs, setPrefs];
}
