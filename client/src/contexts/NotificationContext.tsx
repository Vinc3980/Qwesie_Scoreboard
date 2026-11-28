import React, { createContext, useContext, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

export type NotificationType = 'success' | 'error' | 'info';

export interface NotificationAction {
  label: string;
  onClick: () => void;
}

export interface NotificationOptions {
  title?: string;
  action?: NotificationAction;
  durationMs?: number;
}

export interface NotificationItem {
  id: string;
  type: NotificationType;
  message: string;
  title?: string;
  action?: NotificationAction;
}

interface NotificationContextValue {
  showNotification: (type: NotificationType, message: string, opts?: NotificationOptions) => void;
  success: (message: string, opts?: NotificationOptions) => void;
  error: (message: string, opts?: NotificationOptions) => void;
  info: (message: string, opts?: NotificationOptions) => void;
}

const NotificationContext = createContext<NotificationContextValue | null>(null);

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);

  const removeNotification = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const showNotification = useCallback((type: NotificationType, message: string, opts?: NotificationOptions) => {
    const id = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    setNotifications((prev) => [...prev, { id, type, message, title: opts?.title, action: opts?.action }]);

    setTimeout(() => {
      removeNotification(id);
    }, opts?.durationMs ?? 4000);
  }, [removeNotification]);

  const success = useCallback((msg: string, opts?: NotificationOptions) => showNotification('success', msg, opts), [showNotification]);
  const error = useCallback((msg: string, opts?: NotificationOptions) => showNotification('error', msg, opts), [showNotification]);
  const info = useCallback((msg: string, opts?: NotificationOptions) => showNotification('info', msg, opts), [showNotification]);

  return (
    <NotificationContext.Provider value={{ showNotification, success, error, info }}>
      {children}
      <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none" aria-live="polite" aria-relevant="additions">
        <AnimatePresence>
          {notifications.map((n) => (
            <motion.div
              key={n.id}
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.15 } }}
              className={`pointer-events-auto flex items-start justify-between gap-3 p-3.5 rounded-lg border shadow-lg text-sm font-medium bg-surface-raised ${
                n.type === 'success'
                  ? 'border-success/40 text-fg'
                  : n.type === 'error'
                  ? 'border-danger/40 text-fg'
                  : 'border-info/40 text-fg'
              }`}
              role={n.type === 'error' ? 'alert' : 'status'}
            >
              <div className="flex items-start gap-2.5 min-w-0">
                {n.type === 'success' && <CheckCircle2 className="w-5 h-5 text-success shrink-0 mt-0.5" aria-hidden="true" />}
                {n.type === 'error' && <AlertCircle className="w-5 h-5 text-danger shrink-0 mt-0.5" aria-hidden="true" />}
                {n.type === 'info' && <Info className="w-5 h-5 text-info shrink-0 mt-0.5" aria-hidden="true" />}
                <div className="min-w-0">
                  {n.title && <div className="font-semibold text-fg">{n.title}</div>}
                  <div className="text-fg break-words">{n.message}</div>
                  {n.action && (
                    <button
                      type="button"
                      onClick={() => { n.action?.onClick(); removeNotification(n.id); }}
                      className="mt-1 text-xs font-semibold underline text-accent hover:text-accent/80"
                    >
                      {n.action.label}
                    </button>
                  )}
                </div>
              </div>
              <button
                onClick={() => removeNotification(n.id)}
                className="p-1 rounded-md text-fg-muted hover:text-fg hover:bg-surface-alt transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-focus shrink-0"
                aria-label="Dismiss notification"
              >
                <X className="w-4 h-4" />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </NotificationContext.Provider>
  );
};

export function useNotification(): NotificationContextValue {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotification must be used within a NotificationProvider');
  }
  return context;
}
