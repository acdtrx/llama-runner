import { create } from 'zustand';

export type ToastTone = 'info' | 'error' | 'success';

export interface Toast {
  id: number;
  tone: ToastTone;
  message: string;
  detail?: string;
}

interface ToastsState {
  toasts: Toast[];
  push: (toast: Omit<Toast, 'id'> & { ttlMs?: number }) => number;
  dismiss: (id: number) => void;
}

let nextId = 1;

export const useToastsStore = create<ToastsState>((set, get) => ({
  toasts: [],
  push({ tone, message, detail, ttlMs = 5000 }) {
    const id = nextId;
    nextId += 1;
    const toast: Toast = detail ? { id, tone, message, detail } : { id, tone, message };
    set({ toasts: [...get().toasts, toast] });
    if (ttlMs > 0) {
      window.setTimeout(() => get().dismiss(id), ttlMs);
    }
    return id;
  },
  dismiss(id) {
    set({ toasts: get().toasts.filter((t) => t.id !== id) });
  },
}));
