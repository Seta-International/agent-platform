import { create } from 'zustand';

interface SavingState {
  ids: Set<string>;
  add: (id: string) => void;
  remove: (id: string) => void;
}

export const useSavingIds = create<SavingState>((set) => ({
  ids: new Set(),
  add: (id) =>
    set((s) => {
      const next = new Set(s.ids);
      next.add(id);
      return { ids: next };
    }),
  remove: (id) =>
    set((s) => {
      const next = new Set(s.ids);
      next.delete(id);
      return { ids: next };
    }),
}));
