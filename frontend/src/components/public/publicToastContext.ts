import { createContext, useContext } from 'react';

export type ToastTone = 'success' | 'error' | 'info';

export interface ToastContextValue {
  showToast: (message: string, tone?: ToastTone) => void;
}

export const PublicToastContext = createContext<ToastContextValue | null>(null);

export function usePublicToast(): ToastContextValue {
  const ctx = useContext(PublicToastContext);
  if (!ctx) {
    return {
      showToast: () => {},
    };
  }
  return ctx;
}
