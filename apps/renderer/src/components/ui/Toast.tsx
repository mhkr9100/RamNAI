import React, { createContext, useCallback, useContext, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';

type ToastType = 'success' | 'error' | 'warning' | 'info';

interface Toast {
  id: string;
  type: ToastType;
  title: string;
  description?: string;
  duration?: number;
}

interface ToastContextValue {
  toasts: Toast[];
  addToast: (toast: Omit<Toast, 'id'>) => void;
  removeToast: (id: string) => void;
  success: (title: string, description?: string) => void;
  error: (title: string, description?: string) => void;
  warning: (title: string, description?: string) => void;
  info: (title: string, description?: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const MAX_VISIBLE = 5;
const DEFAULT_DURATION = 4000;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback(
    (toast: Omit<Toast, 'id'>) => {
      const id = crypto.randomUUID();
      const duration = toast.duration ?? DEFAULT_DURATION;

      setToasts((prev) => [...prev.slice(-(MAX_VISIBLE - 1)), { ...toast, id }]);

      if (duration > 0) {
        setTimeout(() => removeToast(id), duration);
      }
    },
    [removeToast],
  );

  const success = useCallback(
    (title: string, description?: string) =>
      addToast({ type: 'success', title, ...(description != null ? { description } : {}) }),
    [addToast],
  );
  const error = useCallback(
    (title: string, description?: string) =>
      addToast({ type: 'error', title, duration: 6000, ...(description != null ? { description } : {}) }),
    [addToast],
  );
  const warning = useCallback(
    (title: string, description?: string) =>
      addToast({ type: 'warning', title, ...(description != null ? { description } : {}) }),
    [addToast],
  );
  const info = useCallback(
    (title: string, description?: string) =>
      addToast({ type: 'info', title, ...(description != null ? { description } : {}) }),
    [addToast],
  );

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast, success, error, warning, info }}>
      {children}
      <ToastContainer toasts={toasts} onDismiss={removeToast} />
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}

const icons: Record<ToastType, React.ReactNode> = {
  success: <CheckCircle2 size={16} className="text-[#34d399]" />,
  error: <XCircle size={16} className="text-[#f87171]" />,
  warning: <AlertTriangle size={16} className="text-[#fbbf24]" />,
  info: <Info size={16} className="text-[#38bdf8]" />,
};

const borderColors: Record<ToastType, string> = {
  success: 'border-[#34d399]/20',
  error: 'border-[#f87171]/20',
  warning: 'border-[#fbbf24]/20',
  info: 'border-[#38bdf8]/20',
};

function ToastContainer({
  toasts,
  onDismiss,
}: {
  toasts: Toast[];
  onDismiss: (id: string) => void;
}) {
  return (
    <div className="fixed bottom-4 right-4 z-[60] flex flex-col-reverse gap-2 pointer-events-none">
      <AnimatePresence mode="popLayout">
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            layout
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.96, transition: { duration: 0.15 } }}
            transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
            className="pointer-events-auto"
          >
            <div
              className={`flex items-start gap-2.5 rounded-xl border bg-[#1a1e28]/95 backdrop-blur-xl px-3.5 py-3 shadow-[0_8px_24px_rgba(0,0,0,0.5)] min-w-[280px] max-w-[380px] ${borderColors[toast.type]}`}
            >
              <span className="mt-0.5 shrink-0">{icons[toast.type]}</span>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium text-white/90">{toast.title}</p>
                {toast.description && (
                  <p className="mt-0.5 text-xs text-white/50">{toast.description}</p>
                )}
              </div>
              <button
                onClick={() => onDismiss(toast.id)}
                className="shrink-0 rounded-md p-0.5 text-white/30 hover:text-white/60 hover:bg-white/[0.06] transition-colors"
              >
                <X size={14} />
              </button>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
