import { create } from 'zustand';

interface State {
  ids: Set<string>;
  mark: (taskId: string) => void;
  clear: (taskId: string) => void;
}

const FLASH_MS = 1000;

export const useRecentlyMovedTasks = create<State>((set, get) => ({
  ids: new Set(),
  mark: (taskId) => {
    set((s) => ({ ids: new Set(s.ids).add(taskId) }));
    setTimeout(() => get().clear(taskId), FLASH_MS);
  },
  clear: (taskId) =>
    set((s) => {
      if (!s.ids.has(taskId)) return s;
      const next = new Set(s.ids);
      next.delete(taskId);
      return { ids: next };
    }),
}));
