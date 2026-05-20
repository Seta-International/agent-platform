import { create } from 'zustand';

export type ConnectionStatus = 'idle' | 'connecting' | 'open' | 'reconnecting' | 'error';

interface ConnectionState {
  status: ConnectionStatus;
  set: (s: ConnectionStatus) => void;
}

export const useConnectionStatus = create<ConnectionState>((set) => ({
  status: 'idle',
  set: (s) => set({ status: s }),
}));
