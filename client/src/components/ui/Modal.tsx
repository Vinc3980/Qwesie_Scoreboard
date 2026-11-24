import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

export const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, children }) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
          <motion.div
            initial={{ opacity: 0, scale: 0.98, y: 6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: 6 }}
            transition={{ duration: 0.12 }}
            className="w-full max-w-lg bg-surface-raised border border-border-strong rounded-[14px] shadow-none overflow-hidden text-fg"
            role="dialog"
            aria-modal="true"
            aria-label={title}
          >
            <div className="flex items-center justify-between px-5 py-3 border-b border-border">
              <h2 className="text-xl font-bold text-fg font-display tracking-tight">{title}</h2>
              <button
                onClick={onClose}
                className="p-1.5 rounded-[10px] text-fg-muted hover:text-fg hover:bg-surface-alt transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5">{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
