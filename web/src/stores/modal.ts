import { create } from 'zustand';

type ModalName = 'settings' | null;

interface ModalState {
  open: ModalName;
  show: (name: Exclude<ModalName, null>) => void;
  close: () => void;
}

export const useModalStore = create<ModalState>((set) => ({
  open: null,
  show(name) {
    set({ open: name });
  },
  close() {
    set({ open: null });
  },
}));
