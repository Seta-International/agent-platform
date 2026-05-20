import { create } from 'zustand';

interface State {
  ids: Set<string>;
  toggle: (id: string) => void;
  selectAll: (ids: string[]) => void;
  clear: () => void;
  set: (next: Set<string>) => void;
}

export const useSelectedTaskIds = create<State>((set) => ({
  ids: new Set(),
  toggle: (id) =>
    set((s) => {
      const next = new Set(s.ids);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { ids: next };
    }),
  selectAll: (ids) => set({ ids: new Set(ids) }),
  clear: () => set({ ids: new Set() }),
  set: (next) => set({ ids: next }),
}));
