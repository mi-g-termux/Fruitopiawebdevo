/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { CheckCircle, AlertCircle, Info, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'info';

export interface ToastItem {
  id: string;
  message: string;
  type: ToastType;
  visible: boolean; // for CSS enter/exit animation
}

interface ToastContextType {
  toast: (message: string, type?: ToastType) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

// Single toast item with CSS-only slide-in / fade-out animation
const ToastItem = ({ t, onRemove }: { t: ToastItem; onRemove: (id: string) => void }) => {
  let borderColor = 'border-blue-200';
  let icon = <Info className="w-5 h-5 text-blue-500" />;
  let emoji = 'ℹ️';

  if (t.type === 'success') {
    borderColor = 'border-emerald-200';
    icon = <CheckCircle className="w-5 h-5 text-emerald-600" />;
    emoji = '🎉';
  } else if (t.type === 'error') {
    borderColor = 'border-rose-200';
    icon = <AlertCircle className="w-5 h-5 text-rose-600" />;
    emoji = '⚠️';
  }

  return (
    <div
      style={{
        transition: 'opacity 0.3s ease, transform 0.3s ease',
        opacity: t.visible ? 1 : 0,
        transform: t.visible ? 'translateY(0) scale(1)' : 'translateY(12px) scale(0.95)',
      }}
      className={`pointer-events-auto flex items-center gap-3 p-3.5 rounded-xl border shadow-md bg-white ${borderColor}`}
      id={`toast-${t.id}`}
    >
      <div className="flex-shrink-0 text-base h-8 w-8 bg-slate-50 border border-slate-100 rounded-lg flex items-center justify-center select-none shadow-sm">
        {emoji}
      </div>
      <div className="flex-1">
        <p className="text-xs font-semibold text-slate-800 leading-snug">
          {t.message}
        </p>
      </div>
      <button
        type="button"
        onClick={() => onRemove(t.id)}
        className="p-1 hover:bg-slate-100/60 rounded-lg transition-colors cursor-pointer text-slate-400 hover:text-slate-700"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
};

export const ToastProvider = ({ children }: { children: React.ReactNode }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const toast = useCallback((message: string, type: ToastType = 'info') => {
    const id = Math.random().toString(36).substring(2, 9);
    // Insert as invisible first, then flip visible on next tick for CSS transition
    setToasts((prev) => [...prev, { id, message, type, visible: false }]);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setToasts((prev) => prev.map(t => t.id === id ? { ...t, visible: true } : t));
      });
    });
    // Start fade-out after 3.7s, remove after 4s
    setTimeout(() => {
      setToasts((prev) => prev.map(t => t.id === id ? { ...t, visible: false } : t));
    }, 3700);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const success = useCallback((msg: string) => toast(msg, 'success'), [toast]);
  const error = useCallback((msg: string) => toast(msg, 'error'), [toast]);
  const info = useCallback((msg: string) => toast(msg, 'info'), [toast]);

  const removeToast = (id: string) => {
    setToasts((prev) => prev.map(t => t.id === id ? { ...t, visible: false } : t));
    setTimeout(() => setToasts((prev) => prev.filter(t => t.id !== id)), 300);
  };

  return (
    <ToastContext.Provider value={{ toast, success, error, info }}>
      {children}
      <div className="fixed bottom-5 right-5 z-[200] flex flex-col-reverse gap-3 max-w-sm w-full font-sans pointer-events-none">
        {toasts.map((t) => (
          <React.Fragment key={t.id}><ToastItem t={t} onRemove={removeToast} /></React.Fragment>
        ))}
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used inside a ToastProvider context.');
  }
  return context;
};
